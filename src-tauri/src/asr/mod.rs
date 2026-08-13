//! Rust-native Whisper ASR module.
//!
//! Replaces the external `whisper.cpp` CLI call with direct ONNX Runtime
//! inference. The pipeline is:
//!
//! ```text
//! WAV audio → mel spectrogram → whisper encoder → autoregressive decoder
//! → token IDs → SRT subtitles
//! ```

pub mod download;
pub mod mel;
pub mod tokenizer;
pub mod whisper;

use std::path::Path;
use tokenizer::{TranscriptionTask, WhisperTokenizer};

/// Transcribe a 16 kHz mono WAV file to SRT subtitles.
///
/// # Arguments
/// * `wav_path` - Path to 16 kHz mono PCM WAV file
/// * `model_dir` - Directory containing ONNX models and tokenizer.json
/// * `language` - Language code ("auto", "zh", "en", "ja", etc.)
/// * `with_timestamps` - Whether to include timing information in output
///
/// # Returns
/// SRT-formatted subtitle string.
pub fn transcribe_wav(
    wav_path: &str,
    model_dir: &Path,
    language: &str,
    with_timestamps: bool,
) -> Result<String, String> {
    // 0. Load tokenizer
    let tokenizer_path = find_tokenizer(model_dir)?;
    let tokenizer = WhisperTokenizer::load(&tokenizer_path)?;

    // 1. Read audio
    let audio = read_wav_mono_f32(wav_path)?;

    // 2. Resample to 16 kHz if needed
    let sample_rate = read_wav_sample_rate(wav_path)?;
    let audio = if sample_rate != 16000 {
        mel::resample_to_16k(&audio, sample_rate)?
    } else {
        audio
    };

    // 3. Compute mel spectrogram
    let mel_spec = mel::compute_mel(&audio);
    let n_frames = mel_spec.len();
    let n_mels = mel::n_mels();
    let mel_tensor = mel::mel_to_tensor(&mel_spec);

    // 4. Load model
    let model = whisper::WhisperModel::load(model_dir)?;

    // 5. Determine language for prompt
    let lang = resolve_language(language);

    // 6. Transcribe
    let token_ids = model.transcribe(
        &mel_tensor,
        n_frames,
        n_mels,
        &tokenizer,
        lang,
        TranscriptionTask::Transcribe,
        with_timestamps,
    )?;

    // 7. Decode to text/segments
    let srt = if with_timestamps {
        let segments = tokenizer.decode_with_timestamps(&token_ids);
        segments_to_srt(&segments)
    } else {
        let text = tokenizer.decode(&token_ids);
        text_to_srt(&text)
    };

    Ok(srt)
}

// ---- Helpers ----

/// Find tokenizer.json in the model directory.
fn find_tokenizer(model_dir: &Path) -> Result<std::path::PathBuf, String> {
    let candidates = [
        model_dir.join("tokenizer.json"),
        model_dir.join("whisper-tokenizer.json"),
    ];
    candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .ok_or_else(|| {
            format!(
                "Tokenizer not found. Expected tokenizer.json in {}.\n\
                 Download it from HuggingFace (openai/whisper-medium)",
                model_dir.display()
            )
        })
}

/// Resolve language: map "auto" → "zh" (or detect from audio — TODO).
fn resolve_language(language: &str) -> &str {
    if language == "auto" {
        "zh" // default for our primary user base; V2: actual detection
    } else {
        language
    }
}

/// Convert timestamped segments to SRT format.
fn segments_to_srt(segments: &[(f32, f32, String)]) -> String {
    let mut srt = String::new();
    for (i, (start, end, text)) in segments.iter().enumerate() {
        srt.push_str(&format!("{}\n", i + 1));
        srt.push_str(&format!(
            "{} --> {}\n",
            seconds_to_srt_time(*start),
            seconds_to_srt_time(*end)
        ));
        srt.push_str(&format!("{}\n\n", text));
    }
    srt
}

/// Fallback: wrap plain text as a single SRT segment.
fn text_to_srt(text: &str) -> String {
    if text.is_empty() {
        return "1\n00:00:00,000 --> 00:00:01,000\n\n".to_string();
    }
    // Estimate duration: ~3 chars per second for Chinese, ~12 for English
    let estimated_secs = (text.len() as f32 / 3.0).max(1.0);
    format!(
        "1\n00:00:00,000 --> {}\n{}\n\n",
        seconds_to_srt_time(estimated_secs),
        text
    )
}

/// Format seconds as SRT timestamp "HH:MM:SS,mmm".
fn seconds_to_srt_time(seconds: f32) -> String {
    let total_ms = (seconds * 1000.0) as u32;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let s = total_s % 60;
    let total_m = total_s / 60;
    let m = total_m % 60;
    let h = total_m / 60;
    format!("{:02}:{:02}:{:02},{:03}", h, m, s, ms)
}

/// Read a mono WAV as f32 samples.
pub fn read_wav_mono_f32(path: &str) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::open(path)
        .map_err(|e| format!("Failed to open WAV {}: {}", path, e))?;

    let spec = reader.spec();

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .filter_map(|s| s.ok())
            .collect(),
        hound::SampleFormat::Int => {
            let bits = spec.bits_per_sample;
            match bits {
                16 => reader
                    .samples::<i16>()
                    .filter_map(|s| s.ok())
                    .map(|s| s as f32 / i16::MAX as f32)
                    .collect(),
                24 | 32 => reader
                    .samples::<i32>()
                    .filter_map(|s| s.ok())
                    .map(|s| s as f32 / i32::MAX as f32)
                    .collect(),
                _ => reader
                    .samples::<i16>()
                    .filter_map(|s| s.ok())
                    .map(|s| s as f32 / i16::MAX as f32)
                    .collect(),
            }
        }
    };

    // Convert multi-channel to mono by averaging channels
    if spec.channels > 1 {
        let mono: Vec<f32> = samples
            .chunks(spec.channels as usize)
            .map(|chunk| chunk.iter().sum::<f32>() / spec.channels as f32)
            .collect();
        Ok(mono)
    } else {
        Ok(samples)
    }
}

/// Read sample rate from a WAV file.
fn read_wav_sample_rate(path: &str) -> Result<u32, String> {
    let reader = hound::WavReader::open(path)
        .map_err(|e| format!("Failed to open WAV {}: {}", path, e))?;
    Ok(reader.spec().sample_rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_seconds_to_srt_time() {
        assert_eq!(seconds_to_srt_time(0.0), "00:00:00,000");
        assert_eq!(seconds_to_srt_time(1.5), "00:00:01,500");
        assert_eq!(seconds_to_srt_time(62.0), "00:01:02,000");
        assert_eq!(seconds_to_srt_time(3661.0), "01:01:01,000");
    }

    #[test]
    fn test_segments_to_srt() {
        let segments = vec![
            (0.0, 1.5, "Hello".to_string()),
            (1.5, 3.0, "World".to_string()),
        ];
        let srt = segments_to_srt(&segments);
        assert!(srt.contains("00:00:00,000 --> 00:00:01,500"));
        assert!(srt.contains("Hello"));
        assert!(srt.contains("00:00:01,500 --> 00:00:03,000"));
        assert!(srt.contains("World"));
    }
}
