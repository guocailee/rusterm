use std::{
    collections::BTreeMap,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};

use aes_gcm::{
    aead::{generic_array::GenericArray, Aead, KeyInit},
    Aes256Gcm,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use sha2::Sha256;
use tauri::{Manager, Runtime};
use uuid::Uuid;

use crate::models::{
    config::VaultStatus,
    vault::{VaultFile, VaultPayload},
};

const VAULT_FILE_NAME: &str = "vault.json";
const PBKDF2_ITERATIONS: u32 = 100_000;

#[derive(Default)]
struct VaultRuntimeState {
    unlocked: bool,
    key: Option<[u8; 32]>,
    payload: VaultPayload,
}

#[derive(Clone)]
pub struct VaultStore {
    path: PathBuf,
    state: Arc<Mutex<VaultRuntimeState>>,
}

impl VaultStore {
    pub fn new<R: Runtime>(app_handle: &tauri::AppHandle<R>) -> Result<Self, String> {
        let base_dir = app_handle
            .path()
            .app_config_dir()
            .map_err(|error| error.to_string())?;

        fs::create_dir_all(&base_dir).map_err(|error| error.to_string())?;

        Ok(Self {
            path: base_dir.join(VAULT_FILE_NAME),
            state: Arc::new(Mutex::new(VaultRuntimeState::default())),
        })
    }

    pub fn status(&self) -> VaultStatus {
        let state = self.state.lock().expect("vault mutex poisoned");
        VaultStatus {
            initialized: self.path.exists(),
            unlocked: state.unlocked,
        }
    }

    pub fn init(&self, password: &str) -> Result<VaultStatus, String> {
        if self.path.exists() {
            return self.unlock(password);
        }

        let mut salt = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut salt);
        let key = derive_key(password, &salt);
        let payload = VaultPayload::default();
        let file = encrypt_payload(&payload, &key, &salt)?;

        write_vault_file(&self.path, &file)?;

        let mut state = self.state.lock().expect("vault mutex poisoned");
        state.unlocked = true;
        state.key = Some(key);
        state.payload = payload;

        Ok(VaultStatus {
            initialized: true,
            unlocked: true,
        })
    }

    pub fn unlock(&self, password: &str) -> Result<VaultStatus, String> {
        let file = read_vault_file(&self.path)?;
        let salt = decode_fixed::<16>(&file.salt)?;
        let key = derive_key(password, &salt);
        let payload = decrypt_payload(&file, &key)?;

        let mut state = self.state.lock().expect("vault mutex poisoned");
        state.unlocked = true;
        state.key = Some(key);
        state.payload = payload;

        Ok(VaultStatus {
            initialized: true,
            unlocked: true,
        })
    }

    pub fn lock(&self) -> VaultStatus {
        let mut state = self.state.lock().expect("vault mutex poisoned");
        state.unlocked = false;
        state.key = None;
        state.payload = VaultPayload::default();

        VaultStatus {
            initialized: self.path.exists(),
            unlocked: false,
        }
    }

    pub fn upsert_item(&self, reference: Option<String>, value: String) -> Result<String, String> {
        let mut state = self.state.lock().expect("vault mutex poisoned");
        if !state.unlocked {
            return Err("Vault is locked".to_string());
        }

        let reference = reference.unwrap_or_else(|| format!("secret-{}", Uuid::new_v4()));
        state.payload.items.insert(reference.clone(), value);

        let key = state
            .key
            .ok_or_else(|| "Vault key missing".to_string())?;

        let mut salt = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut salt);
        let file = encrypt_payload(&state.payload, &key, &salt)?;
        write_vault_file(&self.path, &file)?;

        Ok(reference)
    }

    pub fn get_item(&self, reference: &str) -> Result<Option<String>, String> {
        let state = self.state.lock().expect("vault mutex poisoned");
        if !state.unlocked {
            return Err("Vault is locked".to_string());
        }

        Ok(state.payload.items.get(reference).cloned())
    }
}

fn derive_key(password: &str, salt: &[u8; 16]) -> [u8; 32] {
    let mut key = [0u8; 32];
    pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, PBKDF2_ITERATIONS, &mut key);
    key
}

fn encrypt_payload(payload: &VaultPayload, key: &[u8; 32], salt: &[u8; 16]) -> Result<VaultFile, String> {
    let plaintext = serde_json::to_vec(payload).map_err(|error| error.to_string())?;
    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);

    let ciphertext = cipher
        .encrypt(GenericArray::from_slice(&nonce_bytes), plaintext.as_ref())
        .map_err(|error| error.to_string())?;

    Ok(VaultFile {
        version: 1,
        salt: STANDARD.encode(salt),
        nonce: STANDARD.encode(nonce_bytes),
        ciphertext: STANDARD.encode(ciphertext),
    })
}

fn decrypt_payload(file: &VaultFile, key: &[u8; 32]) -> Result<VaultPayload, String> {
    let nonce = decode_fixed::<12>(&file.nonce)?;
    let ciphertext = STANDARD
        .decode(&file.ciphertext)
        .map_err(|error| error.to_string())?;
    let cipher = Aes256Gcm::new(GenericArray::from_slice(key));

    let plaintext = cipher
        .decrypt(GenericArray::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "Invalid vault password".to_string())?;

    serde_json::from_slice(&plaintext).map_err(|error| error.to_string())
}

fn read_vault_file(path: &PathBuf) -> Result<VaultFile, String> {
    if !path.exists() {
        return Err("Vault has not been initialized".to_string());
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn write_vault_file(path: &PathBuf, file: &VaultFile) -> Result<(), String> {
    let content = serde_json::to_string_pretty(file).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn decode_fixed<const N: usize>(value: &str) -> Result<[u8; N], String> {
    let decoded = STANDARD.decode(value).map_err(|error| error.to_string())?;
    decoded
        .try_into()
        .map_err(|_: Vec<u8>| format!("Expected {N} bytes"))
}

pub fn redact_secret_map(payload: &BTreeMap<String, String>) -> usize {
    payload.len()
}
