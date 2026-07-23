use std::process::Command;
use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub async fn trim_video(
    app: AppHandle,
    asset_path: String,
    start_seconds: f64,
    end_seconds: f64,
) -> Result<String, String> {
    let doc_dir = app
        .path()
        .document_dir()
        .map_err(|e| format!("document dir error: {}", e))?;
    let source = doc_dir.join("editor-tarui").join("assets").join(&asset_path);

    if !source.exists() {
        return Err(format!("source video not found: {}", source.display()));
    }

    let duration = end_seconds - start_seconds;
    if duration <= 0.0 {
        return Err("end time must be greater than start time".to_string());
    }

    let ext = source.extension().and_then(|e| e.to_str()).unwrap_or("mp4");
    let parent = source.parent().ok_or("no parent dir")?;
    let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("trimmed");
    let out_name = format!("trimmed_{:.1}_{:.1}_{}.{}", start_seconds, end_seconds, stem, ext);
    let dest = parent.join(&out_name);

    let dest_for_ret = dest.clone();
    let source_str = source.to_string_lossy().to_string();
    let dest_str = dest.to_string_lossy().to_string();
    let start_str = start_seconds.to_string();
    let dur_str = duration.to_string();

    let output = tokio::task::spawn_blocking(move || {
        Command::new("ffmpeg")
            .args([
                "-ss", &start_str,
                "-i", &source_str,
                "-t", &dur_str,
                "-c:v", "libx264",
                "-crf", "18",
                "-preset", "fast",
                "-c:a", "aac",
                "-b:a", "192k",
                "-movflags", "+faststart",
                "-y",
                &dest_str,
            ])
            .output()
    })
    .await
    .map_err(|e| format!("spawn_blocking: {}", e))?;

    match output {
        Ok(out) if out.status.success() => {
            let assets_root = doc_dir.join("editor-tarui").join("assets");
            let rel = dest_for_ret
                .strip_prefix(&assets_root)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| out_name.clone());
            Ok(rel)
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            Err(format!("ffmpeg failed: {}", stderr))
        }
        Err(e) => Err(format!("ffmpeg not found: {}", e)),
    }
}
