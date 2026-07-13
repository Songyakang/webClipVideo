mod commands;

use commands::asr::generate_subtitles;
use commands::export::{export_with_subtitles, burn_with_synthetic_audio};
use commands::voice::{extract_voice_profile, synthesize_speech};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            generate_subtitles,
            export_with_subtitles,
            burn_with_synthetic_audio,
            extract_voice_profile,
            synthesize_speech,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
