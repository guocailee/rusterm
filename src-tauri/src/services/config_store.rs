use std::{fs, path::PathBuf};

use tauri::{Manager, Runtime};

use crate::models::config::AppConfig;

const CONFIG_FILE_NAME: &str = "config.json";

#[derive(Clone)]
pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn new<R: Runtime>(app_handle: &tauri::AppHandle<R>) -> Result<Self, String> {
        let base_dir = app_handle
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?;

        fs::create_dir_all(&base_dir).map_err(|error| error.to_string())?;

        Ok(Self {
            path: base_dir.join(CONFIG_FILE_NAME),
        })
    }

    pub fn load(&self) -> Result<AppConfig, String> {
        if !self.path.exists() {
            return Ok(AppConfig::default());
        }

        let content = fs::read_to_string(&self.path).map_err(|error| error.to_string())?;
        serde_json::from_str(&content).map_err(|error| error.to_string())
    }

    pub fn save(&self, config: &AppConfig) -> Result<(), String> {
        let content = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
        fs::write(&self.path, content).map_err(|error| error.to_string())
    }
}
