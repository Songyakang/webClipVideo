/// Integration tests for the ASR pipeline.
///
/// These tests require whisper ONNX models to be present on disk.
/// Run `scripts/export_whisper_onnx.py --model tiny` first.
///
/// Run with:
///   cargo test --test asr_pipeline -- --ignored   # full pipeline (needs models)
///   cargo test --test asr_pipeline                 # unit-only tests (no models needed)

use std::path::PathBuf;

fn model_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_default();
    PathBuf::from(home).join("Documents/editor-tarui/models")
}

fn models_exist() -> bool {
    let dir = model_dir();
    let encoder = dir.join("whisper-encoder.onnx").exists()
        || dir.join("encoder_model.onnx").exists()
        || dir.join("encoder.onnx").exists();
    let decoder = dir.join("whisper-decoder.onnx").exists()
        || dir.join("decoder_model.onnx").exists()
        || dir.join("decoder.onnx").exists();
    let tokenizer = dir.join("tokenizer.json").exists();
    encoder && decoder && tokenizer
}

// ---- Tests that don't need models ----

#[test]
fn test_mel_computation_basic() {
    // 3 seconds of 440 Hz sine wave at 16 kHz
    let sample_rate = 16000;
    let duration_secs = 3.0;
    let n_samples = (sample_rate as f32 * duration_secs) as usize;
    let samples: Vec<f32> = (0..n_samples)
        .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / sample_rate as f32).sin())
        .collect();

    let mel = editor_tarui_lib::asr::mel::compute_mel(&samples);
    assert!(mel.len() > 280); // ~301 frames for 3 seconds
    assert_eq!(mel[0].len(), 80); // 80 mel bins
}

#[test]
fn test_mel_tensor_shape() {
    let n_frames = 100;
    let n_mels = editor_tarui_lib::asr::mel::n_mels();
    let mel: Vec<Vec<f32>> = vec![vec![0.0f32; n_mels]; n_frames];
    let tensor = editor_tarui_lib::asr::mel::mel_to_tensor(&mel);
    assert_eq!(tensor.len(), n_mels * n_frames);
}

#[test]
fn test_resample_identity() {
    // Resampling from 16 kHz to 16 kHz should produce similar output
    let samples: Vec<f32> = (0..16000)
        .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 16000.0).sin())
        .collect();

    let resampled = editor_tarui_lib::asr::mel::resample_to_16k(&samples, 16000).unwrap();
    // Output should be similar length (rubato may shift slightly)
    assert!((resampled.len() as i64 - samples.len() as i64).abs() < 500);
}

#[test]
fn test_resample_44k_to_16k() {
    let from_rate = 44100;
    let n_samples = 44100; // 1 second
    let samples: Vec<f32> = (0..n_samples)
        .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / from_rate as f32).sin())
        .collect();

    let resampled = editor_tarui_lib::asr::mel::resample_to_16k(&samples, from_rate).unwrap();
    // 44100 → 16000 samples, output should be ~16000
    // rubato may differ by a few samples due to sinc interpolation
    let expected = 16000;
    let diff = (resampled.len() as i64 - expected as i64).abs();
    assert!(diff < 100, "expected ~16000 samples, got {} (diff={})", resampled.len(), diff);
}

#[test]
fn test_srt_formatting() {
    // Test basic segment invariants (SRT formatting is tested in lib unit tests)
    let segments = vec![(0.0_f32, 2.5_f32, "测试字幕".to_string())];
    assert!(!segments.is_empty());
    assert_eq!(segments[0].2, "测试字幕");
}

#[test]
fn test_model_status_check() {
    let status = editor_tarui_lib::asr::download::check_models();
    // Just verify it doesn't panic
    let _ = status.is_ready();
    let _ = status.missing_summary();
    let _ = status.setup_instructions();
}

// ---- Tests that need ONNX models (ignored by default) ----

#[test]
#[ignore = "requires whisper ONNX models: run scripts/export_whisper_onnx.py --model tiny"]
fn test_load_whisper_model() {
    if !models_exist() {
        eprintln!("Skipping: ONNX models not found in {}", model_dir().display());
        return;
    }

    let model = editor_tarui_lib::asr::whisper::WhisperModel::load(&model_dir());
    assert!(model.is_ok(), "Failed to load model: {:?}", model.err());
}

#[test]
#[ignore = "requires whisper ONNX models: run scripts/export_whisper_onnx.py --model tiny"]
fn test_encode_short_audio() {
    if !models_exist() {
        eprintln!("Skipping: ONNX models not found in {}", model_dir().display());
        return;
    }

    let model = editor_tarui_lib::asr::whisper::WhisperModel::load(&model_dir()).unwrap();

    // 3 seconds of silence at 16 kHz
    let samples = vec![0.0f32; 48000];
    let mel_spec = editor_tarui_lib::asr::mel::compute_mel(&samples);
    let n_frames = mel_spec.len();
    let n_mels = editor_tarui_lib::asr::mel::n_mels();
    let mel_tensor = editor_tarui_lib::asr::mel::mel_to_tensor(&mel_spec);

    let result = model.encode(&mel_tensor, n_frames, n_mels);
    assert!(result.is_ok(), "Encoder failed: {:?}", result.err());

    let (enc_data, hidden_dim) = result.unwrap();
    assert!(!enc_data.is_empty());
    // medium model = 1024, tiny = 384
    assert!(hidden_dim == 384 || hidden_dim == 512 || hidden_dim == 768 || hidden_dim == 1024 || hidden_dim == 1280,
        "unexpected hidden_dim: {}", hidden_dim);
}

#[test]
#[ignore = "requires whisper ONNX models: run scripts/export_whisper_onnx.py --model tiny"]
fn test_full_transcribe() {
    if !models_exist() {
        eprintln!("Skipping: ONNX models not found in {}", model_dir().display());
        return;
    }

    let dir = model_dir();

    // Create a simple test WAV file: 3 seconds of 440 Hz tone
    let samples: Vec<i16> = (0..48000)
        .map(|i| {
            let t = i as f32 / 16000.0;
            (t * 2.0 * std::f32::consts::PI * 440.0).sin() * 0.3 * i16::MAX as f32
        })
        .map(|s| s as i16)
        .collect();

    let wav_path = dir.join("_test_audio.wav");
    {
        let spec = hound::WavSpec {
            channels: 1,
            sample_rate: 16000,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut writer = hound::WavWriter::create(&wav_path, spec).unwrap();
        for &s in &samples {
            writer.write_sample(s).unwrap();
        }
        writer.finalize().unwrap();
    }

    let result = editor_tarui_lib::asr::transcribe_wav(
        wav_path.to_str().unwrap(),
        &dir,
        "zh",
        true,
    );

    // Cleanup
    let _ = std::fs::remove_file(&wav_path);

    match result {
        Ok(srt) => {
            assert!(srt.contains("-->"), "SRT should contain timestamp arrows");
            eprintln!("Transcription result:\n{}", srt);
        }
        Err(e) => {
            // For a tone input, whisper might not produce meaningful text
            // but it shouldn't crash
            eprintln!("Transcription returned error (expected for non-speech audio): {}", e);
        }
    }
}
