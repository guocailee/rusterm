use serde::{Deserialize, Serialize};

use super::host::HostProfile;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PanelState {
    pub id: String,
    pub title: String,
    pub host_id: Option<String>,
    pub session_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTab {
    pub id: String,
    pub title: String,
    pub orientation: String,
    pub panels: Vec<PanelState>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceState {
    pub tabs: Vec<WorkspaceTab>,
    pub active_tab_id: String,
    pub active_panel_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub version: u32,
    pub hosts: Vec<HostProfile>,
    pub workspace: WorkspaceState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub initialized: bool,
    pub unlocked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfigResponse {
    pub config: AppConfig,
    pub vault: VaultStatus,
}

pub fn default_workspace() -> WorkspaceState {
    let panel_id = "panel-root".to_string();
    let tab_id = "tab-root".to_string();

    WorkspaceState {
        tabs: vec![WorkspaceTab {
            id: tab_id.clone(),
            title: "Workspace 1".to_string(),
            orientation: "horizontal".to_string(),
            panels: vec![PanelState {
                id: panel_id.clone(),
                title: "Panel 1".to_string(),
                host_id: None,
                session_id: None,
            }],
        }],
        active_tab_id: tab_id,
        active_panel_id: panel_id,
    }
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            hosts: Vec::new(),
            workspace: default_workspace(),
        }
    }
}
