# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development commands

### Frontend / Tauri
- `pnpm install` — install JS dependencies
- `pnpm dev` — run the Vite frontend only
- `pnpm tauri dev` — run the desktop app with the Rust backend and frontend together
- `pnpm build` — type-check the frontend and build the Vite app
- `pnpm preview` — preview the built frontend bundle
- `pnpm exec tsc --noEmit` — frontend type-check only

### Rust backend
- `cargo check --manifest-path src-tauri/Cargo.toml` — check the Tauri/Rust backend
- `cargo test --manifest-path src-tauri/Cargo.toml` — run Rust tests
- `cargo test --manifest-path src-tauri/Cargo.toml <test_name> -- --exact` — run a single Rust test

### Notes
- There is currently no dedicated JS test runner or lint script configured in `package.json`.
- Vite is configured for Tauri dev on port `1420`, with HMR on `1421` when `TAURI_DEV_HOST` is set.

## Architecture overview

Rusterm is a Tauri desktop app with a React/TypeScript UI and a Rust backend. The core pattern is:

1. React calls typed Tauri commands in `src/lib/tauri.ts`
2. Rust command handlers mutate persisted state or interact with live SSH sessions
3. Long-lived session output/status is pushed back to the frontend through Tauri events
4. The frontend reducer in `src/state/app-state.ts` keeps the UI state in sync with those command responses and events

## Main application structure

### Frontend
- `src/App.tsx` is the main composition root. It loads config on startup, subscribes to session events, manages host/vault/workspace actions, and wires each panel to the terminal component.
- `src/state/app-state.ts` contains the central reducer for hosts, workspace tabs/panels, vault status, and the in-memory session registry.
- `src/lib/tauri.ts` is the frontend boundary to Rust: all `invoke()` calls and event subscriptions live here.
- `src/components/TerminalPanel.tsx` wraps `@xterm/xterm` and `@xterm/addon-fit`, forwarding user input and resize events to the backend while exposing a writer callback for streamed output.
- `src/types/app.ts` mirrors the Rust-side serialized models. Keep TS and Rust shapes aligned when changing command payloads or event payloads.

### Backend
- `src-tauri/src/lib.rs` builds the Tauri app, initializes shared stores/services, and registers all commands.
- `src-tauri/src/commands/` contains thin Tauri command handlers. Most commands delegate immediately into stores or the session manager.
- `src-tauri/src/models/` defines the serialized config, host, session, and vault data structures shared with the frontend.
- `src-tauri/src/services/config_store.rs` persists non-secret app state (`hosts` and `workspace`) into the app config directory as JSON.
- `src-tauri/src/services/vault_store.rs` persists secrets separately in `vault.json`, encrypted with AES-GCM using a PBKDF2-derived key.
- `src-tauri/src/services/session_manager.rs` owns the Tokio runtime plus the in-memory map of active SSH sessions, and emits `session:data`, `session:status`, and `session:closed` events back to the UI.
- `src-tauri/src/protocols/ssh.rs` is the live SSH transport built on `russh`; it authenticates, opens the shell channel, streams output, writes input, and handles PTY resize.

## Important data flow

### Config vs secrets
- Non-secret state is stored in `config.json` via `ConfigStore`.
- Secret material is stored separately in `vault.json` via `VaultStore`.
- Host records only keep a `secretRef`; the actual password/private key text is resolved from the unlocked vault at session-open time.
- If you change host fields or workspace persistence, update both the Rust models and the matching TS types/reducer logic.

### Workspace model
- The workspace is tab-based, and each tab owns a flat list of panels plus a single orientation (`horizontal` or `vertical`).
- The reducer is the source of truth for tab/panel creation, splitting, focus, and session attachment on the frontend.
- `App.tsx` persists workspace changes automatically through `save_workspace`, so reducer changes can affect on-disk state immediately.

### Session lifecycle
- Opening a connection starts in the frontend via `openSshSession(hostId, panelId)`.
- The Rust session manager resolves the host, looks up secrets from the vault, connects through `russh`, and stores a live `SshSession` by generated session ID.
- Output is streamed asynchronously from Rust to the UI through `session:data` events.
- Status/close notifications are emitted separately through `session:status` and `session:closed`.
- The frontend keeps both a reducer-managed session record and an xterm writer per panel; disconnect logic must keep both in sync.

## Implementation notes that matter
- Serialized Rust models use `#[serde(rename_all = "camelCase")]`; frontend payloads depend on that naming.
- `SessionManager` uses its own Tokio runtime instead of relying on Tauri async commands.
- SSH server keys are currently accepted unconditionally in `src-tauri/src/protocols/ssh.rs`; if you touch connection security, start there.
- `VaultStore::upsert_item` rewrites the entire encrypted payload on each secret update.
- The frontend currently has one large `App.tsx`; avoid spreading command/event logic into multiple places unless the change clearly requires it.
