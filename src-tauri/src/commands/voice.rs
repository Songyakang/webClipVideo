use serde::Serialize;
use crate::commands::voice_encoder;
use crate::commands::voice_tts;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VoiceProfile {
    pub embedding: Vec<f32>,
    pub created_at: String,
}

#[tauri::command]
pub async fn extract_voice_profile(
    video_path: String,
    node_id: String,
) -> Result<VoiceProfile, String> {
    let temp_dir = std::env::temp_dir();
    let audio_path = temp_dir.join(format!("voice_extract_{}.wav", node_id));

    let ffmpeg_status = std::process::Command::new("ffmpeg")
        .args([
            "-y",
            "-i", &video_path,
            "-vn",
            "-ar", "16000",
            "-ac", "1",
            "-c:a", "pcm_s16le",
            audio_path.to_str().unwrap_or("/tmp/voice.wav"),
        ])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !ffmpeg_status.success() {
        return Err("Failed to extract audio from video".into());
    }

    let embedding = voice_encoder::extract_embedding(
        audio_path.to_str().unwrap_or(""),
    )?;

    // Keep reference audio for later tone conversion (Phase 2)
    let ref_path = temp_dir.join(format!("voice_ref_{}.wav", node_id));
    let _ = std::fs::copy(&audio_path, &ref_path);
    let _ = std::fs::remove_file(&audio_path);

    Ok(VoiceProfile {
        embedding,
        created_at: chrono_like_now(),
    })
}

#[tauri::command]
pub async fn synthesize_speech(
    node_id: String,
    item_id: String,
    text: String,
    target_duration: f64,
    voice: String,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let raw_filename = format!("tts_raw_{}_{}.wav", node_id, item_id);
    let converted_filename = format!("tts_cvt_{}_{}.wav", node_id, item_id);
    let final_filename = format!("tts_{}_{}.wav", node_id, item_id);
    let raw_path = temp_dir.join(&raw_filename);
    let converted_path = temp_dir.join(&converted_filename);
    let final_path = temp_dir.join(&final_filename);

    // Step 1: TTS synthesis with selected voice
    voice_tts::synthesize(
        &text,
        &voice,
        raw_path.to_str().unwrap_or("/tmp/tts_raw.wav"),
    )?;

    // Step 2: Tone conversion (only for "original" voice)
    let use_original = voice == "original";
    let ref_wav = temp_dir.join(format!("voice_ref_{}.wav", node_id));

    let after_tts = if use_original && ref_wav.exists() {
        voice_tts::convert_timbre(
            raw_path.to_str().unwrap_or(""),
            ref_wav.to_str().unwrap_or(""),
            converted_path.to_str().unwrap_or(""),
        )?;
        let _ = std::fs::remove_file(&raw_path);
        converted_path
    } else {
        raw_path
    };

    // Step 3: Speed adjustment to match original duration
    voice_tts::adjust_speed(
        after_tts.to_str().unwrap_or(""),
        final_path.to_str().unwrap_or(""),
        target_duration,
    )?;

    if use_original && ref_wav.exists() {
        let _ = std::fs::remove_file(&after_tts);
    }

    Ok(final_path.to_string_lossy().to_string())
}

fn chrono_like_now() -> String {
    use std::time::SystemTime;
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    let (year, month, day) = days_to_date(days_since_epoch as i64);
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", year, month, day, hours, minutes, seconds)
}

fn days_to_date(days: i64) -> (i64, u32, u32) {
    let mut y = 1970i64;
    let mut d = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if d < days_in_year { break; }
        d -= days_in_year;
        y += 1;
    }
    let month_days = if is_leap(y) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0u32;
    for (i, &md) in month_days.iter().enumerate() {
        if d < md as i64 { m = i as u32 + 1; break; }
        d -= md as i64;
    }
    (y, m, (d + 1) as u32)
}

fn is_leap(y: i64) -> bool { (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 }
