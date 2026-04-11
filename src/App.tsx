import { FormEvent, useEffect, useMemo, useReducer, useRef, useState } from "react";
import "./App.css";
import {
  closeSession,
  deleteHost,
  initVault,
  listenToSessionData,
  loadConfig,
  lockVault,
  openSshSession,
  resizeSession,
  saveHost,
  saveWorkspace,
  sendSessionInput,
  unlockVault,
  upsertVaultItem,
} from "./lib/tauri";
import { appReducer, createInitialState } from "./state/app-state";
import type { HostDraft, HostProfile, PanelState } from "./types/app";
import { TerminalPanel } from "./components/TerminalPanel";

const defaultDraft: HostDraft = {
  label: "",
  hostname: "",
  port: 22,
  username: "",
  authMethod: "password",
  protocol: "ssh",
  tags: [],
  secretRef: null,
};

function App() {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialState);
  const [draft, setDraft] = useState<HostDraft>(defaultDraft);
  const [editingHostId, setEditingHostId] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState("");
  const [vaultPassword, setVaultPassword] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready");
  const [busy, setBusy] = useState(false);
  const terminalWriters = useRef<Record<string, (chunk: string) => void>>({});

  useEffect(() => {
    void (async () => {
      try {
        const response = await loadConfig();
        dispatch({
          type: "replace-config",
          hosts: response.config.hosts,
          workspace: response.config.workspace,
          vault: response.vault,
        });
      } catch (error) {
        setStatusMessage(String(error));
      }
    })();

    let unlisten: (() => void) | undefined;
    void listenToSessionData((event) => {
      terminalWriters.current[event.panelId]?.(event.data);
      dispatch({ type: "append-session-output", event });
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    void saveWorkspace(state.workspace).catch((error) => {
      setStatusMessage(String(error));
    });
  }, [state.workspace]);

  const activeTab = useMemo(
    () => state.workspace.tabs.find((tab) => tab.id === state.workspace.activeTabId) ?? state.workspace.tabs[0],
    [state.workspace],
  );

  const activePanel = useMemo(
    () => activeTab?.panels.find((panel) => panel.id === state.workspace.activePanelId) ?? activeTab?.panels[0],
    [activeTab, state.workspace.activePanelId],
  );

  const hostMap = useMemo(
    () => new Map(state.hosts.map((host) => [host.id, host])),
    [state.hosts],
  );

  const session = activePanel?.sessionId ? state.sessions[activePanel.sessionId] : undefined;

  const resetDraft = () => {
    setDraft(defaultDraft);
    setEditingHostId(null);
    setSecretValue("");
  };

  const persistHost = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);

    try {
      let secretRef = draft.secretRef ?? null;
      if (secretValue.trim()) {
        if (!state.vault.unlocked) {
          throw new Error("Vault is locked. Unlock or initialize it before saving secrets.");
        }
        secretRef = await upsertVaultItem(secretRef, secretValue.trim());
      }

      const saved = await saveHost({ ...draft, id: editingHostId ?? undefined, secretRef });
      const hosts = editingHostId
        ? state.hosts.map((host) => (host.id === saved.id ? saved : host))
        : [...state.hosts, saved];

      dispatch({ type: "set-hosts", hosts });
      setStatusMessage(`Saved host ${saved.label}`);
      resetDraft();
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const editHost = (host: HostProfile) => {
    setEditingHostId(host.id);
    setDraft({
      label: host.label,
      hostname: host.hostname,
      port: host.port,
      username: host.username,
      authMethod: host.authMethod,
      protocol: host.protocol,
      tags: host.tags,
      secretRef: host.secretRef ?? null,
    });
    setSecretValue("");
  };

  const removeHost = async (hostId: string) => {
    setBusy(true);
    try {
      await deleteHost(hostId);
      dispatch({
        type: "set-hosts",
        hosts: state.hosts.filter((host) => host.id !== hostId),
      });
      setStatusMessage("Host deleted");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleVaultAction = async () => {
    if (!vaultPassword.trim()) {
      setStatusMessage("Enter a vault password first");
      return;
    }

    setBusy(true);
    try {
      const vault = state.vault.initialized
        ? await unlockVault(vaultPassword)
        : await initVault(vaultPassword);
      dispatch({ type: "set-vault", vault });
      setStatusMessage(vault.initialized ? "Vault ready" : "Vault initialized");
      setVaultPassword("");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleVaultLock = async () => {
    setBusy(true);
    try {
      const vault = await lockVault();
      dispatch({ type: "set-vault", vault });
      setStatusMessage("Vault locked");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const attachHostToPanel = (panelId: string, hostId: string) => {
    dispatch({ type: "assign-host", panelId, hostId: hostId || null });
  };

  const connectPanel = async (panel: PanelState) => {
    if (!panel.hostId) {
      setStatusMessage("Choose a host for this panel first");
      return;
    }

    setBusy(true);
    try {
      const sessionInfo = await openSshSession(panel.hostId, panel.id);
      dispatch({ type: "attach-session", panelId: panel.id, session: sessionInfo });
      setStatusMessage(`Opened SSH session for ${hostMap.get(panel.hostId)?.label ?? panel.hostId}`);
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const disconnectPanel = async (panel: PanelState) => {
    if (!panel.sessionId) return;

    setBusy(true);
    try {
      await closeSession(panel.sessionId);
      dispatch({ type: "clear-session", panelId: panel.id, sessionId: panel.sessionId });
      delete terminalWriters.current[panel.id];
      setStatusMessage("Session closed");
    } catch (error) {
      setStatusMessage(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleTerminalInput = (panel: PanelState, input: string) => {
    if (!panel.sessionId) return;
    void sendSessionInput(panel.sessionId, input).catch((error) => {
      setStatusMessage(String(error));
    });
  };

  const handleTerminalResize = (panel: PanelState, cols: number, rows: number) => {
    if (!panel.sessionId) return;
    void resizeSession(panel.sessionId, cols, rows).catch((error) => {
      setStatusMessage(String(error));
    });
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="section-header">
            <h1>rusterm</h1>
            <span className="section-badge">MVP</span>
          </div>
          <p className="section-copy">SSH + multi-panel foundation with local config and encrypted vault scaffold.</p>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <h2>Vault</h2>
            <span className={state.vault.unlocked ? "status-pill ready" : "status-pill idle"}>
              {state.vault.unlocked ? "Unlocked" : state.vault.initialized ? "Locked" : "Not initialized"}
            </span>
          </div>
          <div className="vault-controls">
            <input
              type="password"
              value={vaultPassword}
              onChange={(event) => setVaultPassword(event.currentTarget.value)}
              placeholder={state.vault.initialized ? "Unlock vault password" : "Set vault password"}
            />
            <div className="button-row">
              <button onClick={handleVaultAction} disabled={busy}>
                {state.vault.initialized ? "Unlock" : "Initialize"}
              </button>
              <button className="secondary" onClick={handleVaultLock} disabled={busy || !state.vault.unlocked}>
                Lock
              </button>
            </div>
          </div>
        </div>

        <div className="sidebar-section grow">
          <div className="section-header">
            <h2>Hosts</h2>
            <span className="section-badge">{state.hosts.length}</span>
          </div>
          <div className="host-list">
            {state.hosts.length === 0 ? (
              <div className="empty-state">No hosts yet.</div>
            ) : (
              state.hosts.map((host) => (
                <button key={host.id} className="host-card" onClick={() => editHost(host)}>
                  <strong>{host.label}</strong>
                  <span>{host.username}@{host.hostname}:{host.port}</span>
                  <span>{host.protocol.toUpperCase()} · {host.authMethod}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <form className="sidebar-section host-form" onSubmit={persistHost}>
          <div className="section-header">
            <h2>{editingHostId ? "Edit host" : "New host"}</h2>
          </div>
          <input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.currentTarget.value })} placeholder="Label" required />
          <input value={draft.hostname} onChange={(event) => setDraft({ ...draft, hostname: event.currentTarget.value })} placeholder="Hostname" required />
          <div className="inline-grid">
            <input
              value={draft.username}
              onChange={(event) => setDraft({ ...draft, username: event.currentTarget.value })}
              placeholder="Username"
              required
            />
            <input
              type="number"
              value={draft.port}
              onChange={(event) => setDraft({ ...draft, port: Number(event.currentTarget.value) || 22 })}
              placeholder="Port"
              required
            />
          </div>
          <div className="inline-grid">
            <select
              value={draft.protocol}
              onChange={(event) => setDraft({ ...draft, protocol: event.currentTarget.value as HostDraft["protocol"] })}
            >
              <option value="ssh">SSH</option>
              <option value="sftp">SFTP</option>
              <option value="ftp">FTP</option>
            </select>
            <select
              value={draft.authMethod}
              onChange={(event) => setDraft({ ...draft, authMethod: event.currentTarget.value as HostDraft["authMethod"] })}
            >
              <option value="password">Password</option>
              <option value="privateKey">Private Key</option>
            </select>
          </div>
          <input
            value={draft.tags.join(",")}
            onChange={(event) =>
              setDraft({
                ...draft,
                tags: event.currentTarget.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Tags, comma-separated"
          />
          <textarea
            value={secretValue}
            onChange={(event) => setSecretValue(event.currentTarget.value)}
            placeholder={draft.authMethod === "privateKey" ? "Private key or passphrase" : "Password"}
            rows={3}
          />
          <div className="button-row">
            <button type="submit" disabled={busy}>{editingHostId ? "Save" : "Add host"}</button>
            <button type="button" className="secondary" onClick={resetDraft}>Reset</button>
            {editingHostId ? (
              <button type="button" className="danger" onClick={() => void removeHost(editingHostId)} disabled={busy}>
                Delete
              </button>
            ) : null}
          </div>
        </form>
      </aside>

      <section className="workspace-shell">
        <header className="toolbar">
          <div>
            <strong>Workspace</strong>
            <p>{statusMessage}</p>
          </div>
          <div className="button-row">
            <button onClick={() => dispatch({ type: "add-tab" })}>New tab</button>
            <button className="secondary" onClick={() => dispatch({ type: "split-panel", orientation: "horizontal" })}>
              Split horizontal
            </button>
            <button className="secondary" onClick={() => dispatch({ type: "split-panel", orientation: "vertical" })}>
              Split vertical
            </button>
          </div>
        </header>

        <nav className="tab-strip">
          {state.workspace.tabs.map((tab) => (
            <button
              key={tab.id}
              className={tab.id === state.workspace.activeTabId ? "tab active" : "tab"}
              onClick={() => dispatch({ type: "set-active-tab", tabId: tab.id })}
            >
              {tab.title}
            </button>
          ))}
        </nav>

        <div className={activeTab?.orientation === "vertical" ? "panel-grid vertical" : "panel-grid horizontal"}>
          {activeTab?.panels.map((panel) => {
            const attachedHost = panel.hostId ? hostMap.get(panel.hostId) : undefined;
            const panelSession = panel.sessionId ? state.sessions[panel.sessionId] : undefined;

            return (
              <article
                key={panel.id}
                className={panel.id === state.workspace.activePanelId ? "panel active" : "panel"}
                onClick={() => dispatch({ type: "set-active-panel", panelId: panel.id })}
              >
                <div className="panel-header">
                  <div>
                    <strong>{panel.title}</strong>
                    <span>{attachedHost ? `${attachedHost.label} · ${attachedHost.protocol.toUpperCase()}` : "Unassigned"}</span>
                  </div>
                  <div className="button-row compact">
                    <select
                      value={panel.hostId ?? ""}
                      onChange={(event) => attachHostToPanel(panel.id, event.currentTarget.value)}
                    >
                      <option value="">Choose host</option>
                      {state.hosts.map((host) => (
                        <option key={host.id} value={host.id}>
                          {host.label}
                        </option>
                      ))}
                    </select>
                    <button onClick={() => void connectPanel(panel)} disabled={busy || !panel.hostId}>Connect</button>
                    <button className="secondary" onClick={() => void disconnectPanel(panel)} disabled={busy || !panel.sessionId}>
                      Close
                    </button>
                    <button
                      className="secondary"
                      onClick={() => dispatch({ type: "close-panel", panelId: panel.id })}
                      disabled={activeTab.panels.length === 1}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="terminal-placeholder">
                  <div className="terminal-status">{panelSession ? `Session ${panelSession.status}` : "Idle"}</div>
                  <TerminalPanel
                    connected={Boolean(panel.sessionId)}
                    initialText={
                      panelSession?.detail ??
                      (attachedHost
                        ? `Ready to connect to ${attachedHost.username}@${attachedHost.hostname}:${attachedHost.port}\n`
                        : "Assign a host to start a terminal session.\n")
                    }
                    onData={(value) => handleTerminalInput(panel, value)}
                    onResize={(cols, rows) => handleTerminalResize(panel, cols, rows)}
                    registerWriter={(writer) => {
                      terminalWriters.current[panel.id] = writer;
                    }}
                  />
                </div>
              </article>
            );
          })}
        </div>

        <footer className="workspace-footer">
          <span>Active panel: {activePanel?.title ?? "N/A"}</span>
          <span>Session: {session?.status ?? "idle"}</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
