mod commands;
mod db;
mod inpaint;
mod voice;

use commands::asr::generate_subtitles;
use commands::export::{export_with_subtitles, burn_with_synthetic_audio};
use commands::inpaint::{remove_hard_subtitles, strip_soft_subtitles, preview_inpaint_frame};
use commands::stepfun::{generate_image, edit_image};
use commands::llm::{optimize_prompt, reverse_prompt};
use commands::assets::{list_project_assets, get_asset_thumbnail};
use commands::video::trim_video;
use commands::tripo::generate_3d;
use commands::timeline::render_timeline;
use commands::voice::{extract_voice_profile, synthesize_speech};
use commands::config::{get_all_config, set_config_key, get_platforms, save_platforms};
use commands::db::*;
use db::Database;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::Emitter;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let database = Database::new().expect("failed to init database");
            app.manage(database);
            Ok(())
        })
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
            reverse_prompt,
            optimize_prompt,
            list_project_assets,
            get_asset_thumbnail,
            trim_video,
            render_timeline,
            get_all_config,
            set_config_key,
            get_platforms,
            save_platforms,
            // SQLite database commands
            db_save_canvas,
            db_load_canvas,
            db_clear_canvas,
            db_upsert_canvas_nodes,
            db_delete_canvas_nodes,
            db_upsert_canvas_edges,
            db_delete_canvas_edges,
            db_get_all_clips,
            db_get_clip_by_id,
            db_add_clip,
            db_update_clip,
            db_delete_clip,
            db_search_clips,
            db_save_subtitle,
            db_load_subtitle,
            db_save_timeline,
            db_load_timeline,
            db_delete_timeline,
        ])
        .menu(|handle| {
            let settings = MenuItemBuilder::with_id("settings", "设置...").build(handle)?;
            let app_menu = SubmenuBuilder::new(handle, "app")
                .item(&settings)
                .separator()
                .quit()
                .build()?;
            let menu = MenuBuilder::new(handle)
                .item(&app_menu)
                .build()?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id().0 == "settings" {
                let _ = app.emit("open-settings", ());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
