mod commands;
mod models;
mod protocols;
mod services;

use std::sync::Mutex;

use tauri::Manager;

use commands::{
    config::load_config,
    hosts::{delete_host, save_host, save_workspace},
    sessions::{close_session, open_ssh_session, resize_session, send_session_input},
    vault::{init_vault, lock_vault, unlock_vault, upsert_vault_item},
};
use models::config::AppConfig;
use services::{
    config_store::ConfigStore,
    session_manager::SessionManager,
    vault_store::VaultStore,
};

pub struct AppState {
    config: Mutex<AppConfig>,
    config_store: ConfigStore,
    session_manager: SessionManager,
    vault_store: VaultStore,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let config_store = ConfigStore::new(app.handle())?;
            let config = config_store.load()?;
            let vault_store = VaultStore::new(app.handle())?;

            app.manage(AppState {
                config: Mutex::new(config),
                config_store,
                session_manager: SessionManager::new()?,
                vault_store,
            });

            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_host,
            delete_host,
            save_workspace,
            init_vault,
            unlock_vault,
            lock_vault,
            upsert_vault_item,
            open_ssh_session,
            send_session_input,
            resize_session,
            close_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
