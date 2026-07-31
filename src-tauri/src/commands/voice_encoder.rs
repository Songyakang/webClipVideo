/// Voice embedding extraction using ONNX Runtime.
///
/// Replaces `python3 voice_cli.py extract` with direct Rust ONNX inference
/// via the `crate::voice::extract` module.

use serde::Deserialize;

#[derive(Deserialize)]
pub struct ExtractedEmbedding {
    pub embedding: Vec<f32>,
}

/// Extract 192-dim speaker embedding from a WAV file.
///
/// Uses the CAM++ ONNX model at `~/whisper.cpp/models/campp.onnx`.
/// If the ONNX model is not found, falls back to the Python script.
pub fn extract_embedding(wav_path: &str) -> Result<Vec<f32>, String> {
    let model_path = {
        let home = std::env::var("HOME").unwrap_or_default();
        format!("{}/whisper.cpp/models/campp.onnx", home)
    };

    // Try Rust ONNX inference first
    match crate::voice::extract::extract_embedding(wav_path, Some(&model_path)) {
        Ok(embedding) => {
            if embedding.is_empty() {
                return Err("Empty embedding returned".into());
            }
            return Ok(embedding);
        }
        Err(rust_err) => {
            // Fallback to Python voice_cli.py if ONNX model not available or
            // ONNX Runtime library not installed
            eprintln!(
                "Rust ONNX inference failed ({}), falling back to Python voice_cli.py",
                rust_err
            );
            extract_embedding_python_fallback(wav_path)
        }
    }
}

/// Fallback: extract embedding using the Python voice_cli.py script.
fn extract_embedding_python_fallback(wav_path: &str) -> Result<Vec<f32>, String> {
    let script = voice_cli_script();

    let output = std::process::Command::new("python3")
        .args([&script, "extract", wav_path])
        .output()
        .map_err(|e| format!("Failed to run voice_cli.py: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Voice extraction failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let result: ExtractedEmbedding =
        serde_json::from_str(&stdout).map_err(|e| format!("Failed to parse embedding JSON: {}", e))?;

    if result.embedding.is_empty() {
        return Err("Empty embedding returned".into());
    }

    Ok(result.embedding)
}

fn voice_cli_script() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!("{}/Desktop/奇思妙想/webVideoClip/scripts/voice_cli.py", home)
}
