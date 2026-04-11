use tauri::{AppHandle, Runtime, State};

use crate::{models::session::SessionInfo, AppState};

#[tauri::command]
pub fn open_ssh_session<R: Runtime>(
    app_handle: AppHandle<R>,
    state: State<'_, AppState>,
    host_id: String,
    panel_id: String,
) -> Result<SessionInfo, String> {
    let config = state
        .config
        .lock()
        .map_err(|_| "Config lock poisoned".to_string())?;

    let host = config
        .hosts
        .iter()
        .find(|host| host.id == host_id)
        .cloned()
        .ok_or_else(|| "Host not found".to_string())?;

    drop(config);

    state
        .session_manager
        .open_ssh_session(app_handle, host, panel_id, state.vault_store.clone())
}

#[tauri::command]
pub fn send_session_input(
    state: State<'_, AppState>,
    session_id: String,
    input: String,
) -> Result<(), String> {
    state.session_manager.send_input(&session_id, input)
}

#[tauri::command]
pub fn resize_session(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.session_manager.resize(&session_id, cols as u32, rows as u32)
}

#[tauri::command]
pub fn close_session(state: State<'_, AppState>, session_id: String) -> Result<(), String> {
    state.session_manager.close_session(&session_id)
}
