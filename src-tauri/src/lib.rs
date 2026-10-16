pub mod commands;
pub mod db;
pub mod sqlite;
pub mod asr;
pub mod collab;
mod inpaint;
mod voice;

use commands::asr::{generate_subtitles, check_asr_models, download_asr_models};
use commands::export::{export_with_subtitles, burn_with_synthetic_audio};
use commands::inpaint::{remove_hard_subtitles, strip_soft_subtitles, preview_inpaint_frame};
use commands::stepfun::{generate_image, edit_image};
use commands::llm::{optimize_prompt, reverse_prompt, test_llm_connection, cancel_llm_request};
use commands::script::split_script_shots;
use commands::text_scene::generate_text_scene;
use commands::blender::{get_blender_status, build_blender_scene, reveal_blender_output};
use commands::assets::{list_project_assets, get_asset_thumbnail};
use commands::video::trim_video;
use commands::tripo::generate_3d;
use commands::timeline::render_timeline;
use commands::voice::{extract_voice_profile, synthesize_speech};
use commands::config::{get_all_config, get_config_key, set_config_key, get_platforms, save_platforms};
use commands::db::*;
use collab::{collab_start, collab_stop, collab_status, CollabState};
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
            // Reusable source assets are independent of per-job Blender outputs.
            let library = app.path().document_dir()?.join("editor-tarui/assets/3d-library");
            std::fs::create_dir_all(&library)?;
            let database = Database::new().expect("failed to init database");
            commands::config::initialize_database(&database).map_err(std::io::Error::other)?;
            app.manage(database);
            app.manage(CollabState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            generate_subtitles,
            check_asr_models,
            download_asr_models,
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
            split_script_shots,
            generate_text_scene,
            get_blender_status,
            build_blender_scene,
            reveal_blender_output,
            test_llm_connection,
            cancel_llm_request,
            list_project_assets,
            get_asset_thumbnail,
            trim_video,
            render_timeline,
            get_all_config,
            get_config_key,
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
            // 协作同步（宿主内嵌中继）
            collab_start,
            collab_stop,
            collab_status,
        ])
        .menu(|handle| {
            let settings = MenuItemBuilder::with_id("settings", "设置...").build(handle)?;
            let app_menu = SubmenuBuilder::new(handle, "app")
                .item(&settings)
                .separator()
                .quit()
                .build()?;
            // macOS WebView 的文本编辑快捷键依赖原生菜单项。
            // 自定义菜单替换默认菜单时，必须保留系统剪贴板操作。
            let edit_menu = SubmenuBuilder::new(handle, "编辑")
                .cut_with_text("剪切")
                .copy_with_text("复制")
                .paste_with_text("粘贴")
                .separator()
                .select_all_with_text("全选")
                .build()?;
            let menu = MenuBuilder::new(handle)
                .item(&app_menu)
                .item(&edit_menu)
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
