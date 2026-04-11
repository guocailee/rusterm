use tauri::State;

use crate::{models::config::AppConfigResponse, AppState};

#[tauri::command]
pub fn load_config(state: State<'_, AppState>) -> Result<AppConfigResponse, String> {
    let config = state
        .config
        .lock()
        .map_err(|_| "Config lock poisoned".to_string())?
        .clone();

    Ok(AppConfigResponse {
        config,
        vault: state.vault_store.status(),
    })
}
