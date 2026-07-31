/// Voice embedding extraction using ONNX Runtime.
///
/// Replaces `voice_cli.py extract` — loads campp.onnx and runs inference
/// to produce a 192-dim speaker embedding from a WAV file.
///
/// # Prerequisites
///
/// 1. Export the CAM++ ONNX model (one-time):
///    ```bash
///    python3 scripts/export_campp_onnx.py
///    ```
///    Output: `~/whisper.cpp/models/campp.onnx`
///
/// 2. Install ONNX Runtime:
///    ```bash
///    brew install onnxruntime
///    ```

use ndarray::Array1;
use ort::session::Session;
use ort::value::Tensor;
use ort::value::TensorValueType;
use rubato::{Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction};

/// Default path to the CAM++ ONNX model.
fn default_model_path() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!("{}/whisper.cpp/models/campp.onnx", home)
}

/// Extract a 192-dim speaker embedding from a WAV file.
pub fn extract_embedding(wav_path: &str, model_path: Option<&str>) -> Result<Vec<f32>, String> {
    let default_path;
    let model_path = if let Some(p) = model_path {
        p
    } else {
        default_path = default_model_path();
        &default_path
    };

    // 1. Read WAV audio
    let audio = read_wav_mono_f32(wav_path)?;

    // 2. Resample to 16 kHz if needed
    let sample_rate = read_wav_sample_rate(wav_path)?;
    let audio = if sample_rate != 16000 {
        resample_to_16k(&audio, sample_rate)?
    } else {
        audio
    };

    // 3. Normalize
    let max_val = audio
        .iter()
        .map(|x| x.abs())
        .fold(0.0f32, f32::max);
    let eps = 1e-8f32;
    let audio: Vec<f32> = audio.iter().map(|x| x / (max_val + eps)).collect();

    // 4. Pad or truncate to 48000 samples (~3 seconds)
    let audio = pad_or_truncate(&audio, 48000);

    // 5. ONNX inference
    let mut session = Session::builder()
        .map_err(|e| format!("Failed to create ONNX session builder: {}", e))?
        .commit_from_file(model_path)
        .map_err(|e| format!(
            "Failed to load ONNX model from {}: {}\n\
             Make sure you have:\n\
             1. Run: python3 scripts/export_campp_onnx.py\n\
             2. Installed ONNX Runtime: brew install onnxruntime",
            model_path, e
        ))?;

    // Build input tensor [1, 48000] from ndarray
    let input_array = Array1::from_vec(audio)
        .into_shape_with_order((1, 48000))
        .map_err(|e| format!("Shape error: {}", e))?;

    let input = Tensor::from_array(input_array)
        .map_err(|e| format!("Failed to create input tensor: {}", e))?;

    let outputs = session
        .run(ort::inputs![input])
        .map_err(|e| format!("ONNX inference failed: {}", e))?;

    // Extract output tensor: downcast DynValue → TensorRef<f32> → extract data
    let output = &outputs[0];
    let tensor_ref = output
        .downcast_ref::<TensorValueType<f32>>()
        .map_err(|e| format!("Failed to downcast output: {}", e))?;
    let (_shape, data) = tensor_ref.extract_tensor();

    let emb = data.to_vec();

    // 6. L2 normalize
    let norm = (emb.iter().map(|x| x * x).sum::<f32>()).sqrt();
    let emb: Vec<f32> = if norm > 0.0 {
        emb.iter().map(|x| x / norm).collect()
    } else {
        emb
    };

    Ok(emb)
}

/// Read a mono WAV as f32 samples.
fn read_wav_mono_f32(path: &str) -> Result<Vec<f32>, String> {
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

    // Convert to mono: take first channel
    if spec.channels > 1 {
        Ok(samples
            .iter()
            .step_by(spec.channels as usize)
            .copied()
            .collect())
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

/// Resample audio to 16 kHz using sinc interpolation (matching librosa quality).
fn resample_to_16k(audio: &[f32], from_rate: u32) -> Result<Vec<f32>, String> {
    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let mut resampler = SincFixedIn::<f32>::new(
        16000.0 / from_rate as f64,
        2.0,
        params,
        audio.len(),
        1, // single channel
    )
    .map_err(|e| format!("Failed to create resampler: {}", e))?;

    let input = vec![audio.to_vec()];
    let output = resampler
        .process(&input, None)
        .map_err(|e| format!("Resampling failed: {}", e))?;

    let mut result = output.into_iter().next().unwrap_or_default();
    result.shrink_to_fit();
    Ok(result)
}

/// Pad or truncate audio to a fixed length.
fn pad_or_truncate(audio: &[f32], target_len: usize) -> Vec<f32> {
    if audio.len() < target_len {
        let mut padded = audio.to_vec();
        padded.resize(target_len, 0.0f32);
        padded
    } else {
        audio[..target_len].to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pad_or_truncate_short() {
        let result = pad_or_truncate(&[0.5, -0.3], 5);
        assert_eq!(result.len(), 5);
        assert_eq!(result[0], 0.5);
        assert_eq!(result[1], -0.3);
        assert_eq!(result[2], 0.0);
    }

    #[test]
    fn test_pad_or_truncate_long() {
        let result = pad_or_truncate(&[1.0, 2.0, 3.0, 4.0, 5.0, 6.0], 3);
        assert_eq!(result.len(), 3);
        assert_eq!(result, vec![1.0, 2.0, 3.0]);
    }
}
