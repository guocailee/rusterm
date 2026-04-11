use tauri::State;
use uuid::Uuid;

use crate::{
    models::{
        config::WorkspaceState,
        host::{HostInput, HostProfile},
    },
    AppState,
};

#[tauri::command]
pub fn save_host(state: State<'_, AppState>, host: HostInput) -> Result<HostProfile, String> {
    let mut config = state.config.lock().map_err(|_| "Config lock poisoned".to_string())?;

    let profile = HostProfile {
        id: host.id.unwrap_or_else(|| format!("host-{}", Uuid::new_v4())),
        label: host.label,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        auth_method: host.auth_method,
        protocol: host.protocol,
        tags: host.tags,
        secret_ref: host.secret_ref,
    };

    if let Some(index) = config.hosts.iter().position(|item| item.id == profile.id) {
        config.hosts[index] = profile.clone();
    } else {
        config.hosts.push(profile.clone());
    }

    let snapshot = config.clone();
    drop(config);
    state.config_store.save(&snapshot)?;

    Ok(profile)
}

#[tauri::command]
pub fn delete_host(state: State<'_, AppState>, host_id: String) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|_| "Config lock poisoned".to_string())?;
    config.hosts.retain(|host| host.id != host_id);

    for tab in &mut config.workspace.tabs {
        for panel in &mut tab.panels {
            if panel.host_id.as_deref() == Some(host_id.as_str()) {
                panel.host_id = None;
                panel.session_id = None;
            }
        }
    }

    let snapshot = config.clone();
    drop(config);
    state.config_store.save(&snapshot)
}

#[tauri::command]
pub fn save_workspace(state: State<'_, AppState>, workspace: WorkspaceState) -> Result<(), String> {
    let mut config = state.config.lock().map_err(|_| "Config lock poisoned".to_string())?;
    config.workspace = workspace;

    let snapshot = config.clone();
    drop(config);
    state.config_store.save(&snapshot)
}
