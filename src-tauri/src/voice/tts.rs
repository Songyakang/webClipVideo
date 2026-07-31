/// Edge TTS client — pure Rust replacement for `edge-tts` Python library.
///
/// Communicates with Microsoft Edge TTS WebSocket API to synthesize speech.
/// No Python required.

use futures_util::StreamExt;
use futures_util::SinkExt;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

/// Default Edge TTS endpoint and authentication token.
/// The token is a constant used by Microsoft's web client.
const EDGE_TTS_URL: &str =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud";
const EDGE_TRUSTED_TOKEN: &str =
    "6A5AA1D9EA6266DDD1C41C1A9D3A6C6A6A6A5A5A5A5A6A6A6A5A5A5A5A5A5A5A5A5A";

/// Format string for the SSML message sent to Edge TTS.
const SSML_TEMPLATE: &str = concat!(
    "X-RequestId:{request_id}\r\n",
    "Content-Type:application/ssml+xml\r\n",
    "X-Timestamp:{timestamp}\r\n",
    "Path:ssml\r\n\r\n",
    "<speak version=\"1.0\" xmlns=\"http://www.w3.org/2001/10/synthesis\" ",
    "xmlns:mstts=\"https://www.w3.org/2001/mstts\" xml:lang=\"zh-CN\">",
    "<voice name=\"{voice}\"><prosody rate=\"0%\" pitch=\"0%\">{text}</prosody></voice>",
    "</speak>",
);

/// Synthesize text to speech using Microsoft Edge TTS.
///
/// # Arguments
/// * `text` - The text to synthesize (supports SSML-free plain text)
/// * `voice` - Voice name, e.g. "zh-CN-XiaoxiaoNeural"
/// * `wav_out` - Output WAV file path
pub async fn synthesize(text: &str, voice: &str, wav_out: &str) -> Result<(), String> {
    if text.trim().is_empty() {
        return Err("Text is empty".into());
    }

    let url = format!("{}?TrustedClientToken={}", EDGE_TTS_URL, EDGE_TRUSTED_TOKEN);

    let (ws_stream, _) = connect_async(&url)
        .await
        .map_err(|e| format!("Edge TTS WebSocket connect failed: {}", e))?;

    let (mut write, mut read) = ws_stream.split();

    // Build and send the SSML configuration message
    let request_id = uuid_v4();
    let timestamp = timestamp_now();
    let ssml_message = SSML_TEMPLATE
        .replace("{request_id}", &request_id)
        .replace("{timestamp}", &timestamp)
        .replace("{voice}", voice)
        .replace("{text}", &escape_xml(text));

    write
        .send(Message::Text(ssml_message))
        .await
        .map_err(|e| format!("Edge TTS send failed: {}", e))?;

    // Receive audio data
    let mut audio_data: Vec<u8> = Vec::new();

    while let Some(msg) = read.next().await {
        match msg.map_err(|e| format!("Edge TTS read error: {}", e))? {
            Message::Binary(data) => {
                audio_data.extend(&data);
            }
            Message::Text(txt) => {
                // Edge TTS sends text messages with headers before audio starts.
                // After the "Path:audio" header, binary audio data follows.
                // Some messages may contain status info — check for end-of-stream.
                if txt.contains("Path:turn.end") {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => continue,
        }
    }

    if audio_data.is_empty() {
        return Err("Edge TTS returned no audio data".into());
    }

    // Edge TTS returns raw audio in RIFF WAV format — write directly
    tokio::fs::write(wav_out, &audio_data)
        .await
        .map_err(|e| format!("Failed to write TTS output {}: {}", wav_out, e))?;

    Ok(())
}

/// Escape special XML characters in text for SSML.
fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Generate a simple UUID v4-like string for the request ID.
fn uuid_v4() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let nanos = t.as_nanos();
    format!(
        "{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        (nanos >> 96) as u32,
        (nanos >> 80) as u16 & 0xffff,
        (nanos >> 64) as u16 & 0xffff | 0x4000,
        (nanos >> 48) as u16 & 0xffff | 0x8000,
        nanos & 0xffffffffffff,
    )
}

/// Generate an ISO-ish timestamp for the request header.
fn timestamp_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = t.as_secs();
    // Simple UTC timestamp: "2026-07-28T12:34:56.789Z"
    let days_since_epoch = secs / 86400;
    let time_of_day = secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;
    let millis = t.subsec_millis();

    // Convert days since epoch to year/month/day
    let (year, month, day) = days_to_date(days_since_epoch as i64);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        year, month, day, hours, minutes, seconds, millis
    )
}

fn days_to_date(days: i64) -> (i64, u32, u32) {
    let mut y = 1970i64;
    let mut d = days;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if d < days_in_year {
            break;
        }
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
        if d < md as i64 {
            m = i as u32 + 1;
            break;
        }
        d -= md as i64;
    }
    (y, m, (d + 1) as u32)
}

fn is_leap(y: i64) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}
