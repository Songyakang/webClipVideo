use std::process::Command;
use std::path::Path;

fn voice_cli_script() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    format!("{}/Desktop/奇思妙想/webVideoClip/scripts/voice_cli.py", home)
}

/// Synthesize text to speech by calling voice_cli.py
pub fn synthesize(text: &str, voice: &str, wav_out: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Text is empty".into());
    }

    let script = voice_cli_script();
    let status = Command::new("python3")
        .args([&script, "tts", text, wav_out, "--voice", voice])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .status()
        .map_err(|e| format!("Failed to run voice_cli.py tts: {}", e))?;

    if !status.success() {
        return Err("TTS synthesis failed".into());
    }

    Ok(())
}

/// Apply tone color conversion to match target speaker (Phase 2)
pub fn convert_timbre(src_wav: &str, ref_wav: &str, output_wav: &str) -> Result<(), String> {
    if !Path::new(ref_wav).exists() {
        return Err("Reference audio not found. Run voice extraction first.".into());
    }

    let script = voice_cli_script();
    let status = Command::new("python3")
        .args([&script, "convert", src_wav, ref_wav, output_wav])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .status()
        .map_err(|e| format!("Failed to run voice_cli.py convert: {}", e))?;

    if !status.success() {
        return Err("Voice conversion failed".into());
    }

    Ok(())
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
    // Split ratio into multiple atempo filters if needed
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
