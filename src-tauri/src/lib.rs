// Library entry point for Android and other platforms

mod commands;
mod memory_db;
mod storage;

use commands::{AttachmentStreamState, HttpAbortState, WallpaperStreamState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_dialog::init());
    builder
        .invoke_handler(tauri::generate_handler![
            commands::save_config,
            commands::load_config,
            commands::save_chat_history,
            commands::get_chat_history,
            commands::clear_chat_history,
            commands::save_world_info,
            commands::get_world_info,
            commands::save_character,
            commands::get_characters,
            commands::save_persona_card,
            commands::load_persona_card,
            commands::delete_persona_card,
            commands::save_kv,
            commands::load_kv,
            commands::list_contacts_by_scopes,
            commands::cleanup_persona_scoped_data,
            commands::chat_store_v2_read_index,
            commands::chat_store_v2_write_index,
            commands::chat_store_v2_read_part,
            commands::chat_store_v2_write_part,
            commands::chat_store_v2_delete_part,
            commands::chat_store_v2_delete_thread,
            commands::chat_store_v2_delete_session,
            commands::ensure_media_bundle,
            commands::save_wallpaper,
            commands::save_wallpaper_chunked,
            commands::save_wallpaper_stream_start,
            commands::save_wallpaper_stream_chunk,
            commands::save_wallpaper_stream_finish,
            commands::delete_wallpaper,
            commands::cleanup_wallpapers,
            commands::save_attachment,
            commands::save_attachment_bytes,
            commands::save_attachment_stream_start,
            commands::save_attachment_stream_chunk,
            commands::save_attachment_stream_finish,
            commands::delete_attachment,
            commands::export_attachment,
            commands::export_sticker_gif,
            commands::export_sticker_zip,
            commands::export_data_bundle,
            commands::import_data_bundle,
            commands::import_data_bundle_bytes,
            commands::http_request,
            commands::http_abort_request,
            commands::log_js,
            commands::save_raw_reply,
            commands::load_raw_reply,
            commands::delete_raw_reply,
            commands::read_plugin_zip,
            commands::read_zip_entries,
            commands::init_database,
            commands::create_memory,
            commands::update_memory,
            commands::delete_memory,
            commands::get_memories,
            commands::batch_create_memories,
            commands::batch_delete_memories,
            commands::save_template,
            commands::get_templates,
            commands::delete_template,
        ])
        .setup(|_app| {
            let handle = _app.handle();
            let memory_db = memory_db::MemoryDb::new(&handle)
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            _app.manage(memory_db);
            _app.manage(WallpaperStreamState::default());
            _app.manage(AttachmentStreamState::default());
            _app.manage(HttpAbortState::default());
            #[cfg(all(debug_assertions, not(any(target_os = "android", target_os = "ios"))))]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
