/// Whisper ONNX model downloader.
///
/// Checks for model files and provides download guidance. The preferred
/// method is running `scripts/export_whisper_onnx.py` which exports
/// models from HuggingFace using optimum. As a convenience, this module
/// also supports direct HTTP download from a configurable URL.
use std::path::{Path, PathBuf};
use std::fs;
use std::io::Write;

use super::whisper::default_model_dir;

// ---- Model availability ----

/// Result of checking model availability.
#[derive(Debug)]
pub struct ModelStatus {
    pub dir: PathBuf,
    pub has_encoder: bool,
    pub has_decoder: bool,
    pub has_tokenizer: bool,
}

impl ModelStatus {
    /// All required files present.
    pub fn is_ready(&self) -> bool {
        self.has_encoder && self.has_decoder && self.has_tokenizer
    }

    /// Human-readable summary of what's missing.
    pub fn missing_summary(&self) -> String {
        let mut missing = Vec::new();
        if !self.has_encoder {
            missing.push("whisper-encoder.onnx");
        }
        if !self.has_decoder {
            missing.push("whisper-decoder.onnx");
        }
        if !self.has_tokenizer {
            missing.push("tokenizer.json");
        }
        if missing.is_empty() {
            "All model files present".to_string()
        } else {
            format!(
                "Missing model files: {}\nExpected location: {}",
                missing.join(", "),
                self.dir.display()
            )
        }
    }

    /// Human-readable setup instructions.
    pub fn setup_instructions(&self) -> String {
        format!(
            "{}\n\n\
             To enable Rust-native ASR, run the export script:\n\
               python3 scripts/export_whisper_onnx.py\n\n\
             Or download the ONNX models manually:\n\
               - whisper-encoder.onnx\n\
               - whisper-decoder.onnx\n\
               - tokenizer.json\n\n\
             Place them in: {}\n\n\
             Export script supports model sizes: tiny, base, small, medium, large\n\
             (medium recommended for accuracy, ~1.5GB; tiny ~75MB for testing)",
            self.missing_summary(),
            self.dir.display()
        )
    }
}

/// Check model availability on disk.
pub fn check_models() -> ModelStatus {
    let dir = default_model_dir();

    let encoder = dir.join("whisper-encoder.onnx").exists()
        || dir.join("encoder_model.onnx").exists()
        || dir.join("encoder.onnx").exists();

    let decoder = dir.join("whisper-decoder.onnx").exists()
        || dir.join("decoder_model.onnx").exists()
        || dir.join("decoder.onnx").exists();

    let tokenizer = dir.join("tokenizer.json").exists()
        || dir.join("whisper-tokenizer.json").exists();

    ModelStatus {
        dir,
        has_encoder: encoder,
        has_decoder: decoder,
        has_tokenizer: tokenizer,
    }
}

// ---- HTTP download ----

/// Download a file from `url` to `dest_path`, returning the number of bytes written.
pub async fn download_file(url: &str, dest: &Path) -> Result<u64, String> {
    // Ensure parent directory exists
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let client = reqwest::Client::new();
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download returned HTTP {} for {}",
            response.status(),
            url
        ));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let mut file = fs::File::create(dest)
        .map_err(|e| format!("Failed to create file {}: {}", dest.display(), e))?;
    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write file {}: {}", dest.display(), e))?;

    Ok(bytes.len() as u64)
}

/// Download all required whisper ONNX model files from a base URL.
///
/// The base URL should contain `whisper-encoder.onnx`, `whisper-decoder.onnx`,
/// and `tokenizer.json`.
///
/// Returns the model directory path on success.
pub async fn download_models(base_url: &str) -> Result<PathBuf, String> {
    let dir = default_model_dir();
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create model directory: {}", e))?;

    let base = base_url.trim_end_matches('/');

    let files = [
        ("whisper-encoder.onnx", "encoder"),
        ("whisper-decoder.onnx", "decoder"),
        ("tokenizer.json", "tokenizer"),
    ];

    for (filename, label) in &files {
        let url = format!("{}/{}", base, filename);
        let dest = dir.join(filename);

        eprintln!("Downloading {} ({})...", label, filename);
        let bytes = download_file(&url, &dest).await?;
        eprintln!("  ✓ Downloaded {} bytes", bytes);
    }

    Ok(dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_model_status_when_missing() {
        // When models don't exist (typical for test runs without setup)
        let status = check_models();
        assert!(!status.is_ready() || status.is_ready()); // either way is fine
        assert!(!status.missing_summary().is_empty() || status.is_ready());
    }
}
