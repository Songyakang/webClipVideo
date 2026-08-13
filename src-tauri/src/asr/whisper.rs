/// Whisper model inference via ONNX Runtime.
///
/// Loads encoder and decoder ONNX models and runs the full transcription
/// pipeline: mel spectrogram → encoder → autoregressive decoder → token IDs.
use ndarray::{Array2, Array3};
use ort::session::Session;
use ort::value::Tensor;
use std::cell::RefCell;
use std::path::Path;

use super::tokenizer::{TranscriptionTask, WhisperTokenizer};

/// Default model directory.
pub fn default_model_dir() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    std::path::PathBuf::from(home).join("Documents/editor-tarui/models")
}

/// Loaded Whisper models (encoder + decoder).
///
/// Uses `RefCell<Session>` for interior mutability because `Session::run()`
/// requires `&mut self` but we want to call it through shared references
/// in the autoregressive decode loop.
#[allow(dead_code)]
pub struct WhisperModel {
    encoder: RefCell<Session>,
    decoder: RefCell<Session>,
    /// Name of the encoder input (e.g. "mel" or "input_features").
    encoder_input_name: String,
    /// Name of the encoder output.
    encoder_output_name: String,
    /// Name of the decoder token input.
    decoder_input_ids_name: String,
    /// Name of the decoder cross-attention input (encoder hidden states).
    decoder_enc_hidden_name: String,
    /// Name of the decoder output logits.
    decoder_output_name: String,
}

impl WhisperModel {
    /// Load encoder and decoder ONNX models from the given directory.
    ///
    /// Expected files:
    /// - `whisper-encoder.onnx` (or `encoder_model.onnx`, `encoder.onnx`)
    /// - `whisper-decoder.onnx` (or `decoder_model.onnx`, `decoder.onnx`)
    pub fn load(model_dir: &Path) -> Result<Self, String> {
        let encoder_paths = [
            model_dir.join("whisper-encoder.onnx"),
            model_dir.join("encoder_model.onnx"),
            model_dir.join("encoder.onnx"),
        ];
        let decoder_paths = [
            model_dir.join("whisper-decoder.onnx"),
            model_dir.join("decoder_model.onnx"),
            model_dir.join("decoder.onnx"),
        ];

        let encoder_path = encoder_paths
            .iter()
            .find(|p| p.exists())
            .ok_or_else(|| {
                format!(
                    "Whisper encoder model not found. Looked for: {:?}.\n\
                     Download whisper ONNX models and place them in {}",
                    encoder_paths.iter().map(|p| p.file_name().unwrap()).collect::<Vec<_>>(),
                    model_dir.display()
                )
            })?;
        let decoder_path = decoder_paths
            .iter()
            .find(|p| p.exists())
            .ok_or_else(|| {
                format!(
                    "Whisper decoder model not found. Looked for: {:?}.\n\
                     Download whisper ONNX models and place them in {}",
                    decoder_paths.iter().map(|p| p.file_name().unwrap()).collect::<Vec<_>>(),
                    model_dir.display()
                )
            })?;

        let encoder = Session::builder()
            .map_err(|e| format!("Failed to create ONNX session builder: {}", e))?
            .commit_from_file(encoder_path)
            .map_err(|e| format!(
                "Failed to load encoder model {}: {}\n\
                 Make sure ONNX Runtime is installed: brew install onnxruntime",
                encoder_path.display(), e
            ))?;

        let decoder = Session::builder()
            .map_err(|e| format!("Failed to create ONNX session builder: {}", e))?
            .commit_from_file(decoder_path)
            .map_err(|e| format!(
                "Failed to load decoder model {}: {}\n\
                 Make sure ONNX Runtime is installed: brew install onnxruntime",
                decoder_path.display(), e
            ))?;

        // Auto-detect input/output names via public API
        let encoder_input_name = encoder
            .inputs()
            .first()
            .ok_or("Encoder model has no inputs")?
            .name()
            .to_string();
        let encoder_output_name = encoder
            .outputs()
            .first()
            .ok_or("Encoder model has no outputs")?
            .name()
            .to_string();

        let decoder_inputs: Vec<_> = decoder.inputs().iter().map(|i| i.name().to_string()).collect();
        let decoder_output_name = decoder
            .outputs()
            .first()
            .ok_or("Decoder model has no outputs")?
            .name()
            .to_string();

        // Decoder has two inputs: token IDs and encoder hidden states.
        // Distinguish by name: the one containing "enc" or "hidden" is the
        // cross-attention input; the other is the token/input_ids input.
        let (ids_name, enc_name) = if decoder_inputs.len() >= 2 {
            let i0_is_enc = decoder_inputs[0].to_lowercase().contains("enc")
                || decoder_inputs[0].to_lowercase().contains("hidden");
            let i1_is_enc = decoder_inputs[1].to_lowercase().contains("enc")
                || decoder_inputs[1].to_lowercase().contains("hidden");
            if i0_is_enc && !i1_is_enc {
                (decoder_inputs[1].clone(), decoder_inputs[0].clone())
            } else if i1_is_enc && !i0_is_enc {
                (decoder_inputs[0].clone(), decoder_inputs[1].clone())
            } else {
                // Can't distinguish — assume first is tokens, second is encoder
                (decoder_inputs[0].clone(), decoder_inputs[1].clone())
            }
        } else {
            return Err(format!(
                "Decoder model expected 2 inputs, got {}: {:?}",
                decoder_inputs.len(),
                decoder_inputs
            ));
        };

        Ok(Self {
            encoder: RefCell::new(encoder),
            decoder: RefCell::new(decoder),
            encoder_input_name,
            encoder_output_name,
            decoder_input_ids_name: ids_name,
            decoder_enc_hidden_name: enc_name,
            decoder_output_name,
        })
    }

    /// Run encoder on mel spectrogram.
    ///
    /// `mel_tensor` is a flat `Vec<f32>` of shape `[1, n_mels, n_frames]`
    /// in C-order (mels vary slowest, frames fastest).
    ///
    /// Returns encoder hidden states as flat Vec + hidden_dim.
    pub fn encode(&self, mel_tensor: &[f32], n_frames: usize, n_mels: usize) -> Result<(Vec<f32>, usize), String> {
        let mel_arr = Array3::from_shape_vec((1, n_mels, n_frames), mel_tensor.to_vec())
            .map_err(|e| format!("Failed to reshape mel: {}", e))?;

        let input = Tensor::from_array(mel_arr)
            .map_err(|e| format!("Failed to create encoder input tensor: {}", e))?;

        let mut encoder = self.encoder.borrow_mut();
        let outputs = encoder
            .run(ort::inputs![&self.encoder_input_name => input])
            .map_err(|e| format!("Encoder inference failed: {}", e))?;

        let output = &outputs[0];
        let tensor_ref = output
            .downcast_ref::<ort::value::TensorValueType<f32>>()
            .map_err(|e| format!("Failed to downcast encoder output: {}", e))?;
        let (shape, data) = tensor_ref.extract_tensor();

        // shape is [1, n_frames, hidden_dim]
        let hidden_dim: usize = if shape.len() >= 3 {
            shape[2] as usize
        } else {
            shape[1] as usize
        };
        Ok((data.to_vec(), hidden_dim))
    }

    /// Run one decoder step: given current token sequence and encoder hidden
    /// states, return logits for the last position.
    pub fn decode_step(
        &self,
        tokens: &[i64],
        encoder_hidden: &[f32],
        n_frames: usize,
        hidden_dim: usize,
    ) -> Result<Vec<f32>, String> {
        let seq_len = tokens.len();

        let tokens_arr = Array2::from_shape_vec((1, seq_len), tokens.to_vec())
            .map_err(|e| format!("Token shape error: {}", e))?;
        let enc_arr = Array3::from_shape_vec((1, n_frames, hidden_dim), encoder_hidden.to_vec())
            .map_err(|e| format!("Encoder hidden shape error: {}", e))?;

        let tokens_tensor = Tensor::from_array(tokens_arr)
            .map_err(|e| format!("Failed to create token tensor: {}", e))?;
        let enc_tensor = Tensor::from_array(enc_arr)
            .map_err(|e| format!("Failed to create encoder tensor: {}", e))?;

        let mut decoder = self.decoder.borrow_mut();
        let outputs = decoder
            .run(ort::inputs![
                &self.decoder_input_ids_name => tokens_tensor,
                &self.decoder_enc_hidden_name => enc_tensor,
            ])
            .map_err(|e| format!("Decoder inference failed: {}", e))?;

        let output = &outputs[0];
        let tensor_ref = output
            .downcast_ref::<ort::value::TensorValueType<f32>>()
            .map_err(|e| format!("Failed to downcast decoder output: {}", e))?;
        let (_shape, data) = tensor_ref.extract_tensor();

        // logits shape: [1, seq_len, vocab_size]
        // Extract last position's logits
        let vocab_size = data.len() / seq_len;
        let start = (seq_len - 1) * vocab_size;
        let end = start + vocab_size;

        Ok(data[start..end].to_vec())
    }

    /// Full transcription: run encoder once, then autoregressive decoder loop.
    ///
    /// Returns the full token sequence including prompt and generated tokens.
    pub fn transcribe(
        &self,
        mel_tensor: &[f32],
        n_frames: usize,
        n_mels: usize,
        tokenizer: &WhisperTokenizer,
        language: &str,
        task: TranscriptionTask,
        with_timestamps: bool,
    ) -> Result<Vec<u32>, String> {
        // 1. Encode
        let (enc_data, hidden_dim) = self.encode(mel_tensor, n_frames, n_mels)?;

        // 2. Build initial prompt
        let prompt = tokenizer.build_prompt(language, task, with_timestamps)?;
        let mut tokens: Vec<i64> = prompt.iter().map(|&x| x as i64).collect();
        let eot_id = tokenizer.eot_id() as i64;
        let max_tokens: usize = if with_timestamps { 448 } else { 224 };

        // 3. Autoregressive decode
        loop {
            let logits = self.decode_step(&tokens, &enc_data, n_frames, hidden_dim)?;

            // Greedy: argmax
            let next_token = argmax(&logits) as i64;

            tokens.push(next_token);

            if next_token == eot_id || tokens.len() >= max_tokens {
                break;
            }
        }

        Ok(tokens.iter().map(|&x| x as u32).collect())
    }
}

/// Argmax over a slice of f32.
fn argmax(data: &[f32]) -> usize {
    data.iter()
        .enumerate()
        .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Less))
        .map(|(i, _)| i)
        .unwrap_or(0)
}
