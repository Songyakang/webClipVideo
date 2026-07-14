use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use serde::Serialize;
use tauri::Emitter;
use tauri::Manager;

#[derive(Clone, Serialize)]
pub struct InpaintProgress {
    pub frame: i32,
    pub total: i32,
    pub percent: f64,
}

fn resolve_script_path() -> Result<PathBuf, String> {
    let cwd = std::env::current_dir().unwrap_or_default();
    let candidates = vec![
        cwd.join("scripts").join("inpaint_cli.py"),
        cwd.join("../scripts").join("inpaint_cli.py"),
        cwd.join("../../scripts").join("inpaint_cli.py"),
    ];
    for p in &candidates {
        if p.exists() {
            return Ok(p.clone());
        }
    }
    Err(format!(
        "inpaint_cli.py not found. Tried: {}",
        candidates.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join(", ")
    ))
}

#[tauri::command]
pub async fn remove_hard_subtitles(
    app: tauri::AppHandle,
    video_path: String,
    output_path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    strip_soft_subtitles: bool,
) -> Result<String, String> {
    // Resolve relative paths against the assets directory
    let video_path = if PathBuf::from(&video_path).is_absolute() {
        video_path
    } else {
        let doc_dir = app
            .path()
            .document_dir()
            .map_err(|e| format!("Cannot resolve document dir: {}", e))?;
        doc_dir
            .join("editor-tarui/assets")
            .join(&video_path)
            .to_string_lossy()
            .to_string()
    };

    let video = PathBuf::from(&video_path);
    let parent = video.parent().unwrap_or_else(|| std::path::Path::new("/tmp"));
    let stem = video.file_stem().unwrap_or_default().to_string_lossy();
    let ext = video.extension().unwrap_or_default().to_string_lossy();

    let out = if output_path.is_empty() {
        parent
            .join(format!("{}_clean.{}", stem, ext))
            .to_string_lossy()
            .to_string()
    } else {
        output_path
    };

    let frames_dir = std::env::temp_dir().join(format!("inpaint_frames_{}", stem));
    let _ = std::fs::create_dir_all(&frames_dir);

    let script_path = resolve_script_path()?;

    // Step 1: Python inpainting, outputs PNG frames to temp dir
    let mut child = Command::new("python3")
        .args([
            script_path.to_str().unwrap_or("scripts/inpaint_cli.py"),
            "process",
            &video_path,
            "--frames-dir",
            frames_dir.to_str().unwrap_or(""),
            "--x", &x.to_string(),
            "--y", &y.to_string(),
            "--w", &width.to_string(),
            "--h", &height.to_string(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start inpainting process: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let reader = std::io::BufReader::new(stdout);
    let mut done_info: Option<serde_json::Value> = None;

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Read error: {}", e))?;
        if let Ok(progress) = serde_json::from_str::<serde_json::Value>(&line) {
            if progress.get("error").is_some() {
                let _ = child.kill();
                let _ = std::fs::remove_dir_all(&frames_dir);
                return Err(progress["error"].as_str().unwrap_or("unknown error").to_string());
            }
            if progress.get("status").is_some() {
                done_info = Some(progress);
                break;
            }
            let payload = InpaintProgress {
                frame: progress["frame"].as_i64().unwrap_or(0) as i32,
                total: progress["total"].as_i64().unwrap_or(1) as i32,
                percent: progress["percent"].as_f64().unwrap_or(0.0),
            };
            let _ = app.emit("inpaint-progress", payload);
        }
    }

    let status = child.wait().map_err(|e| format!("Process error: {}", e))?;
    if !status.success() {
        let mut stderr_output = String::new();
        if let Some(mut stderr) = child.stderr {
            use std::io::Read;
            let _ = stderr.read_to_string(&mut stderr_output);
        }
        let _ = std::fs::remove_dir_all(&frames_dir);
        return Err(format!("Inpainting process failed: {}", stderr_output));
    }

    let info = done_info.ok_or("No done info from Python process")?;
    let frame_count = info["frame_count"].as_i64().unwrap_or(0);
    let fps = info["fps"].as_f64().unwrap_or(30.0);

    if frame_count == 0 {
        let _ = std::fs::remove_dir_all(&frames_dir);
        return Err("No frames processed".into());
    }

    // Step 2: FFmpeg encode PNG sequence + original audio
    let zfill = frame_count.to_string().len();
    let frame_pattern = frames_dir.join(format!("frame_%0{}d.png", zfill));

    let ffmpeg_status = Command::new("ffmpeg")
        .args([
            "-y",
            "-framerate", &fps.to_string(),
            "-i", frame_pattern.to_str().unwrap_or(""),
            "-i", &video_path,
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "medium",
            "-c:a", "copy",
            "-movflags", "+faststart",
            &out,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .map_err(|e| {
            let _ = std::fs::remove_dir_all(&frames_dir);
            format!("Failed to run ffmpeg: {}", e)
        })?;

    // Clean up frames dir
    let _ = std::fs::remove_dir_all(&frames_dir);

    if !ffmpeg_status.success() {
        return Err("FFmpeg encoding failed".into());
    }

    // Optionally strip soft subtitles
    let final_out = if strip_soft_subtitles {
        let stripped = parent
            .join(format!("{}_clean_nosub.{}", stem, ext))
            .to_string_lossy()
            .to_string();
        strip_soft_subtitles_inner(&out, &stripped)?;
        let _ = std::fs::remove_file(&out);
        stripped
    } else {
        out
    };

    Ok(final_out)
}

fn strip_soft_subtitles_inner(input: &str, output: &str) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args(["-y", "-i", input, "-sn", "-c", "copy", output])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !status.success() {
        return Err("FFmpeg soft subtitle stripping failed".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn strip_soft_subtitles(video_path: String) -> Result<String, String> {
    let video = PathBuf::from(&video_path);
    let stem = video.file_stem().unwrap_or_default().to_string_lossy();
    let ext = video.extension().unwrap_or_default().to_string_lossy();
    let parent = video.parent().unwrap_or_else(|| std::path::Path::new("/tmp"));
    let out = parent
        .join(format!("{}_nosub.{}", stem, ext))
        .to_string_lossy()
        .to_string();

    strip_soft_subtitles_inner(&video_path, &out)?;
    Ok(out)
}

#[tauri::command]
pub async fn preview_inpaint_frame(
    video_path: String,
    time_sec: f64,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let tmp_dir = std::env::temp_dir();
    let frame_path = tmp_dir.join("inpaint_preview_original.png");
    let result_path = tmp_dir.join("inpaint_preview_clean.png");

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss", &time_sec.to_string(),
            "-i", &video_path,
            "-vframes", "1",
            frame_path.to_str().unwrap_or("/tmp/inpaint_frame.png"),
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("Failed to extract frame: {}", e))?;

    if !status.success() {
        return Err("Failed to extract frame from video".into());
    }

    let script_path = resolve_script_path()?;

    let output = Command::new("python3")
        .args([
            script_path.to_str().unwrap_or("scripts/inpaint_cli.py"),
            "preview",
            frame_path.to_str().unwrap_or(""),
            result_path.to_str().unwrap_or(""),
            "--x", &x.to_string(),
            "--y", &y.to_string(),
            "--w", &width.to_string(),
            "--h", &height.to_string(),
        ])
        .output()
        .map_err(|e| format!("Failed to run preview: {}", e))?;

    if !output.status.success() {
        return Err("Preview inpainting failed".into());
    }

    Ok(result_path.to_string_lossy().to_string())
}
