use serde::Deserialize;
use std::process::Command;

#[derive(Deserialize)]
pub struct ExtractedEmbedding {
    pub embedding: Vec<f32>,
    // pub dim: i32,
    // pub created_at: String,
}

/// Extract 192-dim speaker embedding from a WAV file by calling voice_cli.py
pub fn extract_embedding(wav_path: &str) -> Result<Vec<f32>, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let script = format!("{}/Desktop/奇思妙想/webVideoClip/scripts/voice_cli.py", home);

    let output = Command::new("python3")
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
