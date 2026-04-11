use std::{collections::HashMap, sync::{Arc, Mutex}};

use tauri::{AppHandle, Emitter, Runtime};
use tokio::runtime::Runtime as TokioRuntime;
use uuid::Uuid;

use crate::{
    models::{
        host::HostProfile,
        session::{SessionEvent, SessionInfo, SessionStatus},
    },
    protocols::ssh::{new_runtime, SshSession},
    services::vault_store::VaultStore,
};

struct ManagedSession {
    info: SessionInfo,
    ssh: Arc<SshSession>,
}

#[derive(Clone)]
pub struct SessionManager {
    runtime: Arc<TokioRuntime>,
    sessions: Arc<Mutex<HashMap<String, ManagedSession>>>,
}

impl SessionManager {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            runtime: Arc::new(new_runtime()?),
            sessions: Arc::new(Mutex::new(HashMap::new())),
        })
    }

    pub fn open_ssh_session<R: Runtime>(
        &self,
        app_handle: AppHandle<R>,
        host: HostProfile,
        panel_id: String,
        vault_store: VaultStore,
    ) -> Result<SessionInfo, String> {
        let secret = host
            .secret_ref
            .as_deref()
            .map(|reference| vault_store.get_item(reference))
            .transpose()?
            .flatten();

        let runtime = self.runtime.clone();
        let (ssh, mut output_rx) = runtime.block_on(SshSession::connect(&host, secret))?;
        let ssh = Arc::new(ssh);

        let info = SessionInfo {
            id: format!("session-{}", Uuid::new_v4()),
            host_id: host.id.clone(),
            panel_id,
            status: SessionStatus::Ready,
            detail: Some("SSH shell connected".to_string()),
        };

        self.sessions.lock().expect("session mutex poisoned").insert(
            info.id.clone(),
            ManagedSession {
                info: info.clone(),
                ssh: ssh.clone(),
            },
        );

        let session_id = info.id.clone();
        let event_host_id = host.id.clone();
        let event_panel_id = info.panel_id.clone();
        let app = app_handle.clone();
        runtime.spawn(async move {
            while let Some(bytes) = output_rx.recv().await {
                let payload = SessionEvent {
                    session_id: session_id.clone(),
                    host_id: event_host_id.clone(),
                    panel_id: event_panel_id.clone(),
                    stream: "stdout".to_string(),
                    data: String::from_utf8_lossy(&bytes).to_string(),
                };
                let _ = app.emit("session:data", payload);
            }
        });

        Ok(info)
    }

    pub fn send_input(&self, session_id: &str, input: String) -> Result<(), String> {
        let ssh = {
            let sessions = self.sessions.lock().expect("session mutex poisoned");
            sessions
                .get(session_id)
                .map(|session| session.ssh.clone())
                .ok_or_else(|| "Session not found".to_string())?
        };

        self.runtime.block_on(ssh.write(input.as_bytes()))
    }

    pub fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<(), String> {
        let ssh = {
            let sessions = self.sessions.lock().expect("session mutex poisoned");
            sessions
                .get(session_id)
                .map(|session| session.ssh.clone())
                .ok_or_else(|| "Session not found".to_string())?
        };

        ssh.resize(cols, rows)
    }

    pub fn close_session(&self, session_id: &str) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .expect("session mutex poisoned")
            .remove(session_id)
            .ok_or_else(|| "Session not found".to_string())?;

        self.runtime.block_on(session.ssh.close())
    }

    pub fn has_session(&self, session_id: &str) -> bool {
        self.sessions
            .lock()
            .expect("session mutex poisoned")
            .contains_key(session_id)
    }
}
