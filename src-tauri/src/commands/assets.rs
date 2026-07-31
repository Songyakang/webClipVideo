use serde::Serialize;
use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Serialize, Clone)]
pub struct AssetInfo {
    pub relative_path: String,
    pub filename: String,
    pub asset_type: String,
    pub size: u64,
    pub node_id: String,
}

fn classify(ext: &str) -> Option<&'static str> {
    match ext {
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" => Some("image"),
        "mp4" | "mov" | "avi" | "webm" | "mkv" | "flv" | "wmv" => Some("video"),
        _ => None,
    }
}

fn is_video_ext(ext: &str) -> bool {
    matches!(ext, "mp4" | "mov" | "avi" | "webm" | "mkv" | "flv" | "wmv")
}

#[tauri::command]
pub async fn list_project_assets(app: AppHandle) -> Result<Vec<AssetInfo>, String> {
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("document dir error: {}", e))?;
    let root = doc_dir.join("editor-tarui").join("assets");

    if !root.exists() {
        return Ok(Vec::new());
    }

    let mut assets: Vec<AssetInfo> = Vec::new();
    let mut dirs = vec![root.clone()];

    while let Some(dir) = dirs.pop() {
        let mut entries = tokio::fs::read_dir(&dir)
            .await
            .map_err(|e| format!("read_dir error: {}", e))?;

        while let Ok(Some(entry)) = entries.next_entry().await {
            let path = entry.path();
            let ft = entry
                .file_type()
                .await
                .map_err(|e| format!("file_type error: {}", e))?;

            if ft.is_dir() {
                dirs.push(path);
                continue;
            }

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            let asset_type = match classify(&ext) {
                Some(t) => t.to_string(),
                None => continue,
            };

            let filename = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let size = entry
                .metadata()
                .await
                .map(|m| m.len())
                .unwrap_or(0);

            let relative_path = path
                .strip_prefix(&root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| filename.clone());

            // Filename format: {nodeId}-{timestamp}.{ext}
            let node_id = filename
                .split('-')
                .next()
                .unwrap_or("unknown")
                .to_string();

            assets.push(AssetInfo {
                relative_path,
                filename,
                asset_type,
                size,
                node_id,
            });
        }
    }

    assets.sort_by(|a, b| b.filename.cmp(&a.filename));

    Ok(assets)
}

#[tauri::command]
pub async fn get_asset_thumbnail(app: AppHandle, relative_path: String) -> Result<String, String> {
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("document dir error: {}", e))?;
    let base = doc_dir.join("editor-tarui");
    let assets_root = base.join("assets");
    let source = assets_root.join(&relative_path);

    let thumb_dir = base.join(".thumbnails");
    let thumb_path = {
        let mut p = thumb_dir.join(&relative_path);
        p.set_extension("jpg");
        p
    };

    // Return path relative to editor-tarui/ base
    if thumb_path.exists() {
        let rel = thumb_path.strip_prefix(&base).unwrap_or(&thumb_path);
        return Ok(rel.to_string_lossy().to_string());
    }

    if let Some(parent) = thumb_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir error: {}", e))?;
    }

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // FFmpeg handles both: for images it's a simple scale, for videos it extracts frame + scales
    let mut args: Vec<String> = vec![
        "-i".into(),
        source.to_string_lossy().to_string(),
        "-vf".into(),
        "scale=200:-1".into(),
        "-q:v".into(),
        "2".into(),
        "-y".into(),
        thumb_path.to_string_lossy().to_string(),
    ];

    if is_video_ext(&ext) {
        // Extract frame at 1s mark
        args.insert(0, "1".into());
        args.insert(0, "-ss".into());
        args.insert(0, "1".into());
        args.insert(0, "-vframes".into());
    }

    let output = tokio::task::spawn_blocking(move || {
        Command::new("ffmpeg")
            .args(&args)
            .output()
    })
    .await
    .map_err(|e| format!("spawn_blocking: {}", e))?;

    match output {
        Ok(out) if out.status.success() => {
            let rel = thumb_path.strip_prefix(&base).unwrap_or(&thumb_path);
            Ok(rel.to_string_lossy().to_string())
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Err(format!("ffmpeg failed: {}", stderr))
        }
        Err(e) => {
            Err(format!("ffmpeg not found: {}", e))
        }
    }
}
