use std::process::Command;

use crate::asr;

// ---- Legacy whisper.cpp CLI paths (kept as fallback) ----

fn whisper_cli_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home).join("whisper.cpp/build/bin/whisper-cli")
}

fn legacy_model_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!("{}/whisper.cpp/models/ggml-medium.bin", home)
}

// ---- Model management commands ----

/// Check ASR model status and return setup instructions if models are missing.
#[tauri::command]
pub fn check_asr_models() -> Result<serde_json::Value, String> {
    let status = asr::download::check_models();
    Ok(serde_json::json!({
        "ready": status.is_ready(),
        "has_encoder": status.has_encoder,
        "has_decoder": status.has_decoder,
        "has_tokenizer": status.has_tokenizer,
        "model_dir": status.dir.to_string_lossy(),
        "setup_instructions": if status.is_ready() {
            "ONNX models are ready. Rust-native ASR is enabled.".to_string()
        } else {
            status.setup_instructions()
        }
    }))
}

/// Download whisper ONNX models from a base URL.
#[tauri::command]
pub async fn download_asr_models(base_url: String) -> Result<String, String> {
    let dir = asr::download::download_models(&base_url).await?;
    Ok(format!("Models downloaded to {}", dir.display()))
}

// ---- Main command ----

#[tauri::command]
pub async fn generate_subtitles(
    video_path: String,
    language: String,
) -> Result<String, String> {
    let output_dir = std::env::temp_dir();
    let audio_path = output_dir.join("editor_tarui_audio.wav");

    // Step 1: extract audio with ffmpeg (always needed)
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

    let audio_str = audio_path.to_str().unwrap_or("/tmp/audio.wav");

    // Step 2: try Rust-native ONNX inference first
    let model_status = asr::download::check_models();

    if model_status.is_ready() {
        match asr::transcribe_wav(audio_str, &model_status.dir, &language, true) {
            Ok(srt) => {
                let _ = std::fs::remove_file(&audio_path);
                return Ok(srt);
            }
            Err(e) => {
                eprintln!(
                    "Rust-native ASR failed, falling back to whisper.cpp CLI: {}",
                    e
                );
                // Fall through to legacy
            }
        }
    }

    // Step 2b: legacy whisper.cpp CLI fallback
    legacy_whisper(audio_str, &audio_path, &language).await
}

async fn legacy_whisper(
    audio_path: &str,
    audio_file: &std::path::Path,
    language: &str,
) -> Result<String, String> {
    let output_dir = std::env::temp_dir();
    let srt_path = output_dir.join("editor_tarui_output");

    let lang_flag = if language == "auto" {
        "auto".to_string()
    } else {
        language.to_string()
    };

    let whisper = whisper_cli_path();
    let model = legacy_model_path();

    let whisper_status = Command::new(&whisper)
        .args([
            "-m", &model,
            "-f", audio_path,
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
    let _ = std::fs::remove_file(audio_file);

    if !whisper_status.success() {
        return Err("Speech recognition failed".into());
    }

    let srt_file = srt_path.with_extension("srt");
    let srt_content = std::fs::read_to_string(&srt_file)
        .map_err(|e| format!("Failed to read SRT output: {}", e))?;

    let _ = std::fs::remove_file(&srt_file);

    Ok(srt_content)
}
