import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppConfigResponse,
  HostDraft,
  HostProfile,
  SessionEvent,
  SessionInfo,
  SessionStatusEvent,
  VaultStatus,
  WorkspaceState,
} from "../types/app";

export const loadConfig = () => invoke<AppConfigResponse>("load_config");

export const saveHost = (host: HostDraft & { id?: string }) =>
  invoke<HostProfile>("save_host", { host });

export const deleteHost = (hostId: string) =>
  invoke<void>("delete_host", { hostId });

export const saveWorkspace = (workspace: WorkspaceState) =>
  invoke<void>("save_workspace", { workspace });

export const initVault = (password: string) =>
  invoke<VaultStatus>("init_vault", { password });

export const unlockVault = (password: string) =>
  invoke<VaultStatus>("unlock_vault", { password });

export const lockVault = () => invoke<VaultStatus>("lock_vault");

export const upsertVaultItem = (reference: string | null, value: string) =>
  invoke<string>("upsert_vault_item", { reference, value });

export const openSshSession = (hostId: string, panelId: string) =>
  invoke<SessionInfo>("open_ssh_session", { hostId, panelId });

export const sendSessionInput = (sessionId: string, input: string) =>
  invoke<void>("send_session_input", { sessionId, input });

export const resizeSession = (sessionId: string, cols: number, rows: number) =>
  invoke<void>("resize_session", { sessionId, cols, rows });

export const closeSession = (sessionId: string) =>
  invoke<void>("close_session", { sessionId });

export const listenToSessionData = (handler: (event: SessionEvent) => void): Promise<UnlistenFn> =>
  listen<SessionEvent>("session:data", (event) => {
    handler(event.payload);
  });

export const listenToSessionStatus = (handler: (event: SessionStatusEvent) => void): Promise<UnlistenFn> =>
  listen<SessionStatusEvent>("session:status", (event) => {
    handler(event.payload);
  });

export const listenToSessionClosed = (handler: (event: SessionStatusEvent) => void): Promise<UnlistenFn> =>
  listen<SessionStatusEvent>("session:closed", (event) => {
    handler(event.payload);
  });
