use std::{sync::Arc, time::Duration};

use russh::{
    client::{self, Handle},
    keys::{decode_secret_key, PrivateKeyWithHashAlg},
    ChannelMsg,
};
use tokio::{
    io::AsyncWriteExt,
    runtime::Runtime,
    sync::{mpsc, Mutex},
};

use crate::models::host::{AuthMethod, HostProfile};

#[derive(Clone, Default)]
pub struct ClientHandler;

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::ssh_key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

pub struct SshSession {
    handle: Handle<ClientHandler>,
    writer: Arc<Mutex<Box<dyn tokio::io::AsyncWrite + Send + Unpin>>>,
    resize_tx: mpsc::UnboundedSender<(u32, u32)>,
}

impl SshSession {
    pub async fn connect(
        host: &HostProfile,
        secret: Option<String>,
    ) -> Result<(Self, mpsc::UnboundedReceiver<Vec<u8>>), String> {
        let config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(300)),
            ..<_>::default()
        });

        let address = format!("{}:{}", host.hostname, host.port);
        let mut session = client::connect(config, address, ClientHandler)
            .await
            .map_err(|error| error.to_string())?;

        match host.auth_method {
            AuthMethod::Password => {
                let password = secret.ok_or_else(|| "Password is required for this host".to_string())?;
                let auth_res = session
                    .authenticate_password(host.username.clone(), password)
                    .await
                    .map_err(|error| error.to_string())?;
                if !auth_res.success() {
                    return Err("SSH authentication failed".to_string());
                }
            }
            AuthMethod::PrivateKey => {
                let key_data = secret.ok_or_else(|| "Private key is required for this host".to_string())?;
                let key_pair = decode_secret_key(&key_data, None).map_err(|error| error.to_string())?;
                let auth_res = session
                    .authenticate_publickey(
                        host.username.clone(),
                        PrivateKeyWithHashAlg::new(
                            Arc::new(key_pair),
                            session.best_supported_rsa_hash().await.map_err(|error| error.to_string())?.flatten(),
                        ),
                    )
                    .await
                    .map_err(|error| error.to_string())?;
                if !auth_res.success() {
                    return Err("SSH public key authentication failed".to_string());
                }
            }
        }

        let channel = session
            .channel_open_session()
            .await
            .map_err(|error| error.to_string())?;

        channel
            .request_pty(true, "xterm-256color", 120, 40, 0, 0, &[])
            .await
            .map_err(|error| error.to_string())?;
        channel
            .request_shell(true)
            .await
            .map_err(|error| error.to_string())?;

        let (mut reader, writer_half) = channel.split();
        let writer: Box<dyn tokio::io::AsyncWrite + Send + Unpin> = Box::new(writer_half.make_writer());
        let writer = Arc::new(Mutex::new(writer));
        let (output_tx, output_rx) = mpsc::unbounded_channel();
        let (resize_tx, mut resize_rx) = mpsc::unbounded_channel();
        let resize_channel = writer_half;

        tokio::spawn(async move {
            while let Some((cols, rows)) = resize_rx.recv().await {
                let _ = resize_channel.window_change(cols, rows, 0, 0).await;
            }
        });

        tokio::spawn(async move {
            while let Some(message) = reader.wait().await {
                match message {
                    ChannelMsg::Data { data } | ChannelMsg::ExtendedData { data, .. } => {
                        let _ = output_tx.send(data.to_vec());
                    }
                    ChannelMsg::Eof | ChannelMsg::Close => break,
                    _ => {}
                }
            }
        });

        Ok((
            Self {
                handle: session,
                writer,
                resize_tx,
            },
            output_rx,
        ))
    }

    pub async fn write(&self, input: &[u8]) -> Result<(), String> {
        let mut writer = self.writer.lock().await;
        writer.write_all(input).await.map_err(|error| error.to_string())?;
        writer.flush().await.map_err(|error| error.to_string())
    }

    pub fn resize(&self, cols: u32, rows: u32) -> Result<(), String> {
        self.resize_tx
            .send((cols, rows))
            .map_err(|_| "SSH resize channel is closed".to_string())
    }

    pub async fn close(&self) -> Result<(), String> {
        self.handle
            .disconnect(russh::Disconnect::ByApplication, "closed", "en")
            .await
            .map_err(|error| error.to_string())
    }
}

pub fn new_runtime() -> Result<Runtime, String> {
    Runtime::new().map_err(|error| error.to_string())
}
