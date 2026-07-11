use std::process::Command;
use std::path::PathBuf;

fn whisper_cli_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join("whisper.cpp/build/bin/whisper-cli")
}

fn model_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!("{}/whisper.cpp/models/ggml-medium.bin", home)
}

#[tauri::command]
pub async fn generate_subtitles(
    video_path: String,
    language: String,
) -> Result<String, String> {
    let output_dir = std::env::temp_dir();
    let audio_path = output_dir.join("editor_tarui_audio.wav");
    let srt_path = output_dir.join("editor_tarui_output");

    // Step 1: extract audio with ffmpeg
    let ffmpeg_status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video_path,
            "-vn",
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            audio_path.to_str().unwrap_or("/tmp/audio.wav"),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !ffmpeg_status.success() {
        return Err("Failed to extract audio from video".into());
    }

    // Step 2: run whisper.cpp
    let lang_flag = if language == "auto" {
        "auto".to_string()
    } else {
        language.clone()
    };

    let whisper = whisper_cli_path();
    let model = model_path();

    let whisper_status = Command::new(&whisper)
        .args([
            "-m", &model,
            "-f", audio_path.to_str().unwrap_or("/tmp/audio.wav"),
            "-l", &lang_flag,
            "-osrt",
            "-of", srt_path.to_str().unwrap_or("/tmp/output"),
            "-t", "4",
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run whisper-cli: {}", e))?;

    // Clean up audio file
    let _ = std::fs::remove_file(&audio_path);

    if !whisper_status.success() {
        return Err("Speech recognition failed".into());
    }

    // Step 3: read the generated SRT file
    let srt_file = srt_path.with_extension("srt");
    let srt_content = std::fs::read_to_string(&srt_file)
        .map_err(|e| format!("Failed to read SRT output: {}", e))?;

    // Clean up SRT file
    let _ = std::fs::remove_file(&srt_file);

    Ok(srt_content)
}
