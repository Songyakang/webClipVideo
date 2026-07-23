mod commands;

use commands::asr::generate_subtitles;
use commands::export::{export_with_subtitles, burn_with_synthetic_audio};
use commands::inpaint::{remove_hard_subtitles, strip_soft_subtitles, preview_inpaint_frame};
use commands::stepfun::{generate_image, edit_image};
use commands::llm::optimize_prompt;
use commands::assets::{list_project_assets, get_asset_thumbnail};
use commands::video::trim_video;
use commands::tripo::generate_3d;
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
            remove_hard_subtitles,
            strip_soft_subtitles,
            preview_inpaint_frame,
            generate_3d,
            generate_image,
            edit_image,
            optimize_prompt,
            list_project_assets,
            get_asset_thumbnail,
            trim_video,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
