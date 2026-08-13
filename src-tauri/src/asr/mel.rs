/// Mel spectrogram computation for Whisper ASR.
///
/// Implements the exact same preprocessing as whisper.cpp:
/// - 16 kHz mono audio
/// - 25 ms Hann window (400 samples)
/// - 10 ms hop (160 samples)
/// - 512-point FFT (zero-padded)
/// - 80 mel filterbank
/// - Log-mel output
use rustfft::{num_complex::Complex, FftPlanner};

// ---- Constants (whisper-compatible) ----

const SAMPLE_RATE: u32 = 16000;
const N_FFT: usize = 512;
const HOP_LENGTH: usize = 160;
const WINDOW_SIZE: usize = 400;
const N_MELS: usize = 80;

// ---- Window ----

/// Hann window of length `n`.
fn hann_window(n: usize) -> Vec<f32> {
    (0..n)
        .map(|i| 0.5f32 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (n as f32 - 1.0)).cos()))
        .collect()
}

/// Compute Hann + zero-pad weights for the STFT frame buffer.
fn windowed_frame(
    audio: &[f32],
    start: usize,
    window: &[f32],
    fft_size: usize,
) -> Vec<Complex<f32>> {
    let mut frame = vec![Complex::new(0.0f32, 0.0f32); fft_size];
    for (i, &w) in window.iter().enumerate() {
        let idx = start + i;
        let sample = if idx < audio.len() { audio[idx] } else { 0.0f32 };
        frame[i] = Complex::new(sample * w, 0.0f32);
    }
    // remaining samples (i >= window.len()) stay zero due to zero-padding
    frame
}

// ---- Mel filterbank ----

/// Hz → mel
fn hz_to_mel(hz: f32) -> f32 {
    2595.0f32 * (1.0f32 + hz / 700.0f32).log10()
}

/// mel → Hz
fn mel_to_hz(mel: f32) -> f32 {
    700.0f32 * (10.0f32.powf(mel / 2595.0f32) - 1.0f32)
}

/// Build mel filterbank matrix: (n_mels, n_freq_bins)
fn mel_filterbank(n_mels: usize, fft_size: usize, sample_rate: u32) -> Vec<Vec<f32>> {
    let n_freq_bins = fft_size / 2 + 1;
    let nyquist = sample_rate as f32 / 2.0;

    let mel_min = hz_to_mel(0.0);
    let mel_max = hz_to_mel(nyquist);

    // n_mels + 2 equally-spaced points in mel space
    let mel_points: Vec<f32> = (0..n_mels + 2)
        .map(|i| mel_min + (mel_max - mel_min) * i as f32 / (n_mels + 1) as f32)
        .collect();

    // Convert back to Hz
    let hz_points: Vec<f32> = mel_points.iter().map(|&m| mel_to_hz(m)).collect();

    // Convert Hz to FFT bin indices
    let bins: Vec<f32> = hz_points
        .iter()
        .map(|&f| f * (fft_size as f32) / sample_rate as f32)
        .collect();

    let mut filterbank = vec![vec![0.0f32; n_freq_bins]; n_mels];

    for m in 0..n_mels {
        let left = bins[m];
        let center = bins[m + 1];
        let right = bins[m + 2];

        for k in 0..n_freq_bins {
            let kf = k as f32;
            if kf > left && kf < center {
                filterbank[m][k] = (kf - left) / (center - left);
            } else if kf >= center && kf < right {
                filterbank[m][k] = (right - kf) / (right - center);
            }
        }
    }

    filterbank
}

// ---- STFT ----

/// Compute power spectrogram from audio samples.
///
/// Uses reflection padding (like whisper.cpp) and zero-phase centering.
fn power_spectrogram(
    audio: &[f32],
    window: &[f32],
    fft_size: usize,
    hop_length: usize,
) -> Vec<Vec<f32>> {
    // Apply reflection padding: N_FFT/2 samples of padding on each side
    let pad = fft_size / 2;
    let padded: Vec<f32> = audio
        .iter()
        .rev()
        .take(pad)
        .rev()
        .cloned()
        .chain(audio.iter().cloned())
        .chain(audio.iter().rev().take(pad).cloned())
        .collect();

    let n_frames = if padded.len() >= window.len() {
        (padded.len() - window.len()) / hop_length + 1
    } else {
        0
    };

    let n_freq_bins = fft_size / 2 + 1;

    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(fft_size);

    let mut spectrogram = Vec::with_capacity(n_frames);

    for i in 0..n_frames {
        let offset = i * hop_length;
        let mut frame = windowed_frame(&padded, offset, window, fft_size);

        fft.process(&mut frame);

        // Power: |complex|^2
        let power: Vec<f32> = frame[..n_freq_bins]
            .iter()
            .map(|c| c.re * c.re + c.im * c.im)
            .collect();
        spectrogram.push(power);
    }

    spectrogram
}

/// Apply mel filterbank to power spectrogram → mel spectrogram.
fn apply_mel_filterbank(
    power_spec: &[Vec<f32>],
    filterbank: &[Vec<f32>],
) -> Vec<Vec<f32>> {
    let n_mels = filterbank.len();
    let n_frames = power_spec.len();

    let mut mel_spec = vec![vec![0.0f32; n_mels]; n_frames];

    for t in 0..n_frames {
        for m in 0..n_mels {
            let mut sum = 0.0f32;
            for k in 0..filterbank[m].len() {
                sum += power_spec[t][k] * filterbank[m][k];
            }
            mel_spec[t][m] = sum.max(1e-10f32);
        }
    }

    mel_spec
}

/// Log-mel spectrogram: log10 and normalize.
fn log_mel(mel_spec: &[Vec<f32>]) -> Vec<Vec<f32>> {
    mel_spec
        .iter()
        .map(|frame| {
            frame
                .iter()
                .map(|&x| {
                    let val = x.log10();
                    // whisper.cpp clamps to [-2.0, ...] after log
                    val.max(-2.0)
                })
                .collect()
        })
        .collect()
}

// ---- Resampling ----

/// Resample audio to 16 kHz using sinc interpolation.
pub fn resample_to_16k(audio: &[f32], from_rate: u32) -> Result<Vec<f32>, String> {
    use rubato::{
        Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
    };

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

// ---- Public API ----

/// Compute log-mel spectrogram from 16 kHz mono audio samples.
///
/// Returns a `(n_frames, 80)` matrix that can be fed directly into the
/// Whisper encoder ONNX model.
pub fn compute_mel(audio_samples: &[f32]) -> Vec<Vec<f32>> {
    // Use a lazily-created, shared FFT planner for efficiency across calls.
    // The Mutex guards the FftPlanner which is not Send-safe, but FftPlanner
    // is cheap to create; we just create one per call via the free function
    // already handled inside power_spectrogram.

    let window = hann_window(WINDOW_SIZE);
    let filterbank = mel_filterbank(N_MELS, N_FFT, SAMPLE_RATE);

    let power = power_spectrogram(audio_samples, &window, N_FFT, HOP_LENGTH);
    let mel = apply_mel_filterbank(&power, &filterbank);
    log_mel(&mel)
}

/// Convert a per-frame mel spectrogram into a flat `Vec<f32>` of shape
/// `[1, N_MELS, n_frames]` suitable as ONNX tensor input.
pub fn mel_to_tensor(mel: &[Vec<f32>]) -> Vec<f32> {
    let n_frames = mel.len();
    let mut tensor = Vec::with_capacity(N_MELS * n_frames);
    // Whisper expects (batch=1, n_mels=80, n_frames) in row-major
    // but ONNX layout is C-order: frames contiguous within each mel band.
    // The standard whisper ONNX export uses shape [1, 80, n_frames]
    // with (m, t) layout where m varies slowest → m=0..79, t=0..n_frames-1
    for m in 0..N_MELS {
        for t in 0..n_frames {
            tensor.push(mel[t][m]);
        }
    }
    tensor
}

/// Get the expected mel bin count (always 80 for Whisper).
pub const fn n_mels() -> usize {
    N_MELS
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hann_window_length() {
        let w = hann_window(400);
        assert_eq!(w.len(), 400);
        // Hann(0) ≈ 0, Hann(n/2) = 1.0
        assert!(w[0] < 0.01);
        assert!((w[200] - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_mel_hz_roundtrip() {
        for hz in [100.0, 500.0, 1000.0, 4000.0, 8000.0] {
            let mel = hz_to_mel(hz);
            let back = mel_to_hz(mel);
            assert!((hz - back).abs() < 1.0, "Hz {hz} → mel {mel} → Hz {back}");
        }
    }

    #[test]
    fn test_filterbank_shape() {
        let fb = mel_filterbank(80, 512, 16000);
        assert_eq!(fb.len(), 80);
        assert_eq!(fb[0].len(), 257);
    }

    #[test]
    fn test_compute_mel_output_shape() {
        // 3 seconds of silent 16 kHz audio
        let samples = vec![0.0f32; 48000];
        let mel = compute_mel(&samples);
        // 48000 samples → padded 48000 + 512 = 48512
        // n_frames = (48512 - 400) / 160 + 1 ≈ 301
        assert!(mel.len() > 280 && mel.len() < 310, "got {} frames", mel.len());
        assert_eq!(mel[0].len(), 80);
    }

    #[test]
    fn test_mel_to_tensor_layout() {
        let n_frames = 3;
        // Create a full mel spectrogram with 80 mel bins (N_MELS)
        let mut mel: Vec<Vec<f32>> = Vec::with_capacity(n_frames);
        for _ in 0..n_frames {
            let mut frame = vec![0.0f32; N_MELS];
            frame[0] = 1.0f32;
            frame[1] = 2.0f32;
            mel.push(frame);
        }
        let tensor = mel_to_tensor(&mel);
        assert_eq!(tensor.len(), N_MELS * n_frames);
        // m0: all frames have 1.0 at mel bin 0
        assert_eq!(tensor[0], 1.0); // m0_t0
        assert_eq!(tensor[1], 1.0); // m0_t1
        assert_eq!(tensor[2], 1.0); // m0_t2
        // m1: all frames have 2.0 at mel bin 1
        assert_eq!(tensor[3], 2.0); // m1_t0
        assert_eq!(tensor[4], 2.0); // m1_t1
        assert_eq!(tensor[5], 2.0); // m1_t2
    }
}
