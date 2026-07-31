/// Voice TTS and timbre conversion commands.
///
/// TTS pipeline (in priority order):
///   1. StepFun voice cloning + TTS — for "original" voice (clones reference audio)
///   2. StepFun preset TTS — for known preset voices
///   3. Edge TTS (pure-Rust WebSocket) — fallback for other voices
///
/// Timbre conversion is now handled by StepFun's voice preview API,
/// which clones + synthesizes in one shot. No more Python/OpenVoice.

use std::path::Path;
use std::process::Command;

/// Synthesize text to speech. Routes to the best available TTS backend.
pub fn synthesize(text: &str, voice: &str, wav_out: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Text is empty".into());
    }

    // Route to StepFun preset TTS if the voice matches a known preset
    if crate::voice::stepfun_tts::is_stepfun_preset(voice) {
        return synthesize_stepfun(text, voice, wav_out);
    }

    // Otherwise use Edge TTS (pure Rust WebSocket)
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))?;

    rt.block_on(crate::voice::tts::synthesize(text, voice, wav_out))
}

/// Synthesize using StepFun preset voice.
fn synthesize_stepfun(text: &str, voice: &str, wav_out: &str) -> Result<(), String> {
    let stepfun_voice = crate::voice::stepfun_tts::map_to_stepfun_voice(voice);
    let model = "step-tts-mini";

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))?;

    rt.block_on(crate::voice::stepfun_tts::synthesize_preset(
        text,
        stepfun_voice,
        model,
        wav_out,
    ))
}

/// Apply timbre conversion: clones the reference speaker's voice and
/// synthesizes the text in that voice using StepFun's voice preview API.
///
/// Replaces the old `python3 voice_cli.py convert` (OpenVoice).
///
/// # Arguments
/// * `ref_wav` - Reference audio with target speaker's voice (5-10s WAV)
/// * `text` - Text to synthesize in the cloned voice
/// * `wav_out` - Output WAV file path
pub fn convert_timbre(ref_wav: &str, text: &str, wav_out: &str) -> Result<(), String> {
    if !Path::new(ref_wav).exists() {
        return Err("Reference audio not found. Run voice extraction first.".into());
    }

    if text.trim().is_empty() {
        return Err("Text is empty".into());
    }

    let model = "stepaudio-2.5-tts";

    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|e| format!("Failed to create tokio runtime: {}", e))?;

    rt.block_on(crate::voice::stepfun_tts::synthesize_cloned(
        ref_wav,
        text,
        model,
        None, // no special instruction by default
        wav_out,
    ))
}

/// Adjust playback speed of a WAV file to match target duration using ffmpeg atempo.
/// Chains multiple atempo filters if needed (each supports 0.5-2.0 range).
pub fn adjust_speed(input: &str, output: &str, target_duration_secs: f64) -> Result<(), String> {
    if target_duration_secs <= 0.0 {
        return Err("Target duration must be positive".into());
    }

    // Get current duration via ffprobe
    let probe = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            input,
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    let stdout = String::from_utf8_lossy(&probe.stdout);
    let current_dur: f64 = stdout
        .trim()
        .parse()
        .map_err(|e| format!("Failed to parse audio duration '{}': {}", stdout.trim(), e))?;

    if current_dur <= 0.0 {
        return Err("Audio duration is zero".into());
    }

    let speed_ratio = current_dur / target_duration_secs;

    // If within 5% of target, no adjustment needed
    if (speed_ratio - 1.0).abs() < 0.05 {
        std::fs::copy(input, output)
            .map_err(|e| format!("Failed to copy audio: {}", e))?;
        return Ok(());
    }

    // Build atempo chain: each atempo supports [0.5, 2.0]
    let mut parts = Vec::new();
    let mut remaining = speed_ratio;

    while (remaining - 1.0).abs() > 0.005 {
        let step = remaining.clamp(0.5, 2.0);
        parts.push(format!("atempo={:.3}", step));
        remaining /= step;
    }

    if parts.is_empty() {
        parts.push("atempo=1.000".to_string());
    }

    let atempo_chain = parts.join(",");

    let status = Command::new("ffmpeg")
        .args([
            "-y", "-i", input,
            "-filter:a", &atempo_chain,
            "-c:a", "pcm_s16le",
            output,
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg atempo: {}", e))?;

    if !status.success() {
        return Err("Speed adjustment failed".into());
    }

    Ok(())
}
