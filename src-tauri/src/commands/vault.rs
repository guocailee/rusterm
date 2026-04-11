use tauri::State;

use crate::{models::config::VaultStatus, AppState};

#[tauri::command]
pub fn init_vault(state: State<'_, AppState>, password: String) -> Result<VaultStatus, String> {
    state.vault_store.init(&password)
}

#[tauri::command]
pub fn unlock_vault(state: State<'_, AppState>, password: String) -> Result<VaultStatus, String> {
    state.vault_store.unlock(&password)
}

#[tauri::command]
pub fn lock_vault(state: State<'_, AppState>) -> Result<VaultStatus, String> {
    Ok(state.vault_store.lock())
}

#[tauri::command]
pub fn upsert_vault_item(
    state: State<'_, AppState>,
    reference: Option<String>,
    value: String,
) -> Result<String, String> {
    state.vault_store.upsert_item(reference, value)
}
