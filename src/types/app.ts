export type ProtocolType = "ssh" | "sftp" | "ftp";
export type AuthMethod = "password" | "privateKey";
export type SessionStatus = "idle" | "connecting" | "ready" | "closed" | "error" | "notImplemented";

export interface SessionEvent {
  sessionId: string;
  hostId: string;
  panelId: string;
  stream: string;
  data: string;
}

export interface HostProfile {
  id: string;
  label: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  protocol: ProtocolType;
  tags: string[];
  secretRef?: string | null;
}

export interface PanelState {
  id: string;
  title: string;
  hostId?: string | null;
  sessionId?: string | null;
}

export interface WorkspaceTab {
  id: string;
  title: string;
  orientation: "horizontal" | "vertical";
  panels: PanelState[];
}

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string;
  activePanelId: string;
}

export interface VaultStatus {
  initialized: boolean;
  unlocked: boolean;
}

export interface AppConfig {
  version: number;
  hosts: HostProfile[];
  workspace: WorkspaceState;
}

export interface AppConfigResponse {
  config: AppConfig;
  vault: VaultStatus;
}

export interface SessionInfo {
  id: string;
  hostId: string;
  panelId: string;
  status: SessionStatus;
  detail?: string | null;
}

export interface AppState {
  hosts: HostProfile[];
  workspace: WorkspaceState;
  sessions: Record<string, SessionInfo>;
  vault: VaultStatus;
}

export interface HostDraft {
  label: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  protocol: ProtocolType;
  tags: string[];
  secretRef?: string | null;
}
