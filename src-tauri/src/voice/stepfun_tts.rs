/// StepFun Voice Cloning + TTS integration.
///
/// Replaces the old `python3 voice_cli.py tts` + `python3 voice_cli.py convert` pipeline
/// (Edge TTS + OpenVoice timbre transfer) with StepFun's voice cloning preview API:
///
///   1. Upload reference audio (5-10s WAV)  →  get `file_id`
///   2. Call preview API with file_id + text  →  get cloned-voice audio (base64)
///
/// For preset voices, uses StepFun TTS API directly.
///
/// # Pricing
/// - Voice clone preview: synthesis cost only (no 9.9¥ voice creation fee)
/// - TTS: 5.8¥ / 10k characters
///
/// API docs: https://platform.stepfun.com/docs/zh/api-reference/audio/voices-preview

const STEPFUN_BASE: &str = "https://api.stepfun.com/v1";

// ── API key ──

fn get_api_key() -> Result<String, String> {
    crate::commands::config::get_api_key("stepfun")
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .connect_timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("client build failed: {}", e))
}

// ── File upload ──

/// Upload a reference audio file to StepFun for voice cloning.
/// Returns the `file_id` needed for the preview API.
///
/// Audio requirements: WAV or MP3, 5–10 seconds, max 128 MB.
pub async fn upload_reference_audio(wav_path: &str) -> Result<String, String> {
    let api_key = get_api_key()?;
    let client = build_client()?;

    let file_bytes = tokio::fs::read(wav_path)
        .await
        .map_err(|e| format!("Failed to read reference audio {}: {}", wav_path, e))?;

    let ext = std::path::Path::new(wav_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("wav");
    let mime = match ext {
        "mp3" | "mpeg" => "audio/mpeg",
        _ => "audio/wav",
    };

    let part = reqwest::multipart::Part::bytes(file_bytes)
        .file_name(format!("reference.{}", ext))
        .mime_str(mime)
        .map_err(|e| format!("build multipart: {}", e))?;

    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("purpose", "storage".to_string());

    let resp = client
        .post(format!("{}/files", STEPFUN_BASE))
        .header("Authorization", format!("Bearer {}", &api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("File upload failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("File upload HTTP {}: {}", status, resp_text));
    }

    let result: serde_json::Value = serde_json::from_str(&resp_text)
        .map_err(|e| format!("parse upload response: {}", e))?;

    result
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("No file id in response: {}", resp_text))
}

// ── Voice clone preview (cloned voice + TTS in one call) ──

/// Synthesize speech using a cloned voice from a reference audio file.
///
/// This uploads the reference audio to StepFun, then calls the voice preview API
/// which clones the voice AND synthesizes the text in a single call.
///
/// # Arguments
/// * `ref_wav` - Path to reference audio (5-10s WAV)
/// * `text` - Text to synthesize in the cloned voice
/// * `model` - TTS model: "stepaudio-2.5-tts", "step-tts-2", or "step-tts-mini"
/// * `instruction` - Optional emotion/tone instruction (only for stepaudio-2.5-tts)
/// * `wav_out` - Output WAV file path
pub async fn synthesize_cloned(
    ref_wav: &str,
    text: &str,
    model: &str,
    instruction: Option<&str>,
    wav_out: &str,
) -> Result<(), String> {
    // Step 1: Upload reference audio
    let file_id = upload_reference_audio(ref_wav).await?;

    // Step 2: Call preview API (clone + synthesize)
    synthesize_with_file_id(&file_id, text, model, instruction, wav_out).await
}

/// Synthesize speech using an already-uploaded file_id.
/// Useful when the same reference audio is used for multiple text items.
pub async fn synthesize_with_file_id(
    file_id: &str,
    text: &str,
    model: &str,
    instruction: Option<&str>,
    wav_out: &str,
) -> Result<(), String> {
    let api_key = get_api_key()?;
    let client = build_client()?;

    let mut body = serde_json::json!({
        "model": model,
        "file_id": file_id,
        "sample_text": text,
        "response_format": "wav",
    });

    if let Some(instr) = instruction {
        if !instr.is_empty() {
            body["instruction"] = serde_json::json!(instr);
        }
    }

    let resp = client
        .post(format!("{}/audio/voices/preview", STEPFUN_BASE))
        .header("Authorization", format!("Bearer {}", &api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Voice preview request failed: {}", e))?;

    let status = resp.status();
    let resp_text = resp.text().await.unwrap_or_default();

    if !status.is_success() {
        return Err(format!("Voice preview HTTP {}: {}", status, resp_text));
    }

    let result: serde_json::Value = serde_json::from_str(&resp_text)
        .map_err(|e| format!("parse preview response: {}", e))?;

    let audio_b64 = result
        .get("sample_audio")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("No sample_audio in response: {}", resp_text))?;

    // Decode base64 audio and write to file
    use base64::Engine;
    let audio_bytes = base64::engine::general_purpose::STANDARD
        .decode(audio_b64)
        .map_err(|e| format!("Failed to decode audio base64: {}", e))?;

    tokio::fs::write(wav_out, &audio_bytes)
        .await
        .map_err(|e| format!("Failed to write audio to {}: {}", wav_out, e))?;

    Ok(())
}

// ── Preset voice TTS ──

/// Synthesize speech using a StepFun preset voice.
///
/// # Arguments
/// * `text` - Text to synthesize
/// * `voice` - Preset voice ID, e.g. "cixingnansheng", "wenrounansheng", "qingchunshaonv"
/// * `model` - TTS model
/// * `wav_out` - Output WAV file path
pub async fn synthesize_preset(
    text: &str,
    voice: &str,
    model: &str,
    wav_out: &str,
) -> Result<(), String> {
    let api_key = get_api_key()?;
    let client = build_client()?;

    let body = serde_json::json!({
        "model": model,
        "input": text,
        "voice": voice,
        "response_format": "wav",
    });

    let resp = client
        .post(format!("{}/audio/speech", STEPFUN_BASE))
        .header("Authorization", format!("Bearer {}", &api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("TTS request failed: {}", e))?;

    let status = resp.status();

    if !status.is_success() {
        let resp_text = resp.text().await.unwrap_or_default();
        return Err(format!("TTS HTTP {}: {}", status, resp_text));
    }

    let audio_bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read TTS response: {}", e))?;

    tokio::fs::write(wav_out, &audio_bytes)
        .await
        .map_err(|e| format!("Failed to write TTS output {}: {}", wav_out, e))?;

    Ok(())
}

/// Check if a voice identifier is a known StepFun preset.
pub fn is_stepfun_preset(voice: &str) -> bool {
    matches!(
        voice,
        "cixingnansheng"
            | "wenrounansheng"
            | "qingchunshaonv"
            | "elegantgentle-female"
            | "livelybreezy-female"
            | "qinqienvsheng"
            | "jingdiannvsheng"
            | "zh-CN-XiaoxiaoNeural" // also route Xiaoxiao through StepFun
    )
}

/// Map common voice names to StepFun preset IDs.
pub fn map_to_stepfun_voice(voice: &str) -> &str {
    match voice {
        "zh-CN-XiaoxiaoNeural" => "qingchunshaonv",  // 清纯少女 ≈ 晓晓
        "zh-CN-YunxiNeural" => "wenrounansheng",      // 温柔男声 ≈ 云希
        "zh-CN-YunjianNeural" => "cixingnansheng",    // 磁性男声 ≈ 云健
        other => other, // pass through if already a StepFun ID
    }
}
