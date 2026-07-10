use std::process::Command;
use std::path::PathBuf;

#[tauri::command]
pub async fn export_with_subtitles(
    video_path: String,
    ass_content: String,
    output_path: String,
) -> Result<String, String> {
    // Write ASS content to a temp file
    let tmp_dir = std::env::temp_dir();
    let ass_path: PathBuf = tmp_dir.join("editor_tarui_subtitle.ass");

    std::fs::write(&ass_path, &ass_content)
        .map_err(|e| format!("Failed to write ASS file: {}", e))?;

    let out = if output_path.is_empty() {
        let video = PathBuf::from(&video_path);
        let stem = video.file_stem().unwrap_or_default().to_string_lossy();
        let ext = video.extension().unwrap_or_default().to_string_lossy();
        let parent = video.parent().unwrap_or(&tmp_dir);
        parent
            .join(format!("{}_subtitled.{}", stem, ext))
            .to_string_lossy()
            .to_string()
    } else {
        output_path
    };

    // Run ffmpeg to burn subtitles
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video_path,
            "-vf", &format!("ass={}", ass_path.to_string_lossy()),
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "medium",
            "-c:a", "copy",
            "-movflags", "+faststart",
            &out,
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    // Clean up temp ASS file
    let _ = std::fs::remove_file(&ass_path);

    if !status.success() {
        return Err("FFmpeg encoding failed".into());
    }

    Ok(out)
}
