import type {
  AppState,
  HostProfile,
  SessionEvent,
  SessionInfo,
  SessionStatusEvent,
  VaultStatus,
  WorkspaceState,
} from "../types/app";

export const createPanelId = () => `panel-${crypto.randomUUID()}`;
export const createTabId = () => `tab-${crypto.randomUUID()}`;

export const createInitialWorkspace = (): WorkspaceState => {
  const panelId = createPanelId();
  const tabId = createTabId();

  return {
    tabs: [
      {
        id: tabId,
        title: "Workspace 1",
        orientation: "horizontal",
        panels: [{ id: panelId, title: "Panel 1", hostId: null, sessionId: null }],
      },
    ],
    activeTabId: tabId,
    activePanelId: panelId,
  };
};

export const createInitialState = (): AppState => ({
  hosts: [],
  workspace: createInitialWorkspace(),
  sessions: {},
  vault: { initialized: false, unlocked: false },
});

type Action =
  | { type: "replace-config"; hosts: HostProfile[]; workspace: WorkspaceState; vault: VaultStatus }
  | { type: "set-hosts"; hosts: HostProfile[] }
  | { type: "set-vault"; vault: VaultStatus }
  | { type: "add-tab" }
  | { type: "set-active-tab"; tabId: string }
  | { type: "set-active-panel"; panelId: string }
  | { type: "split-panel"; orientation: "horizontal" | "vertical" }
  | { type: "close-panel"; panelId: string }
  | { type: "assign-host"; panelId: string; hostId: string | null }
  | { type: "attach-session"; panelId: string; session: SessionInfo }
  | { type: "update-session-status"; event: SessionStatusEvent }
  | { type: "append-session-output"; event: SessionEvent }
  | { type: "clear-session"; panelId: string; sessionId?: string | null };

const nextPanelTitle = (count: number) => `Panel ${count + 1}`;
const nextTabTitle = (count: number) => `Workspace ${count + 1}`;

export function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "replace-config":
      return {
        ...state,
        hosts: action.hosts,
        workspace: action.workspace,
        vault: action.vault,
      };
    case "set-hosts":
      return { ...state, hosts: action.hosts };
    case "set-vault":
      return { ...state, vault: action.vault };
    case "add-tab": {
      const panelId = createPanelId();
      const tabId = createTabId();
      const tab = {
        id: tabId,
        title: nextTabTitle(state.workspace.tabs.length),
        orientation: "horizontal" as const,
        panels: [{ id: panelId, title: "Panel 1", hostId: null, sessionId: null }],
      };

      return {
        ...state,
        workspace: {
          ...state.workspace,
          tabs: [...state.workspace.tabs, tab],
          activeTabId: tabId,
          activePanelId: panelId,
        },
      };
    }
    case "set-active-tab": {
      const tab = state.workspace.tabs.find((item) => item.id === action.tabId);
      if (!tab) return state;

      return {
        ...state,
        workspace: {
          ...state.workspace,
          activeTabId: action.tabId,
          activePanelId: tab.panels[0]?.id ?? state.workspace.activePanelId,
        },
      };
    }
    case "set-active-panel":
      return {
        ...state,
        workspace: { ...state.workspace, activePanelId: action.panelId },
      };
    case "split-panel": {
      const tabs = state.workspace.tabs.map((tab) => {
        if (tab.id !== state.workspace.activeTabId) return tab;

        const panel = {
          id: createPanelId(),
          title: nextPanelTitle(tab.panels.length),
          hostId: null,
          sessionId: null,
        };

        return {
          ...tab,
          orientation: action.orientation,
          panels: [...tab.panels, panel],
        };
      });

      const activeTab = tabs.find((tab) => tab.id === state.workspace.activeTabId);
      const activePanelId =
        activeTab && activeTab.panels.length > 0
          ? activeTab.panels[activeTab.panels.length - 1].id
          : state.workspace.activePanelId;

      return {
        ...state,
        workspace: {
          ...state.workspace,
          tabs,
          activePanelId,
        },
      };
    }
    case "close-panel": {
      const tabs = state.workspace.tabs.map((tab) => {
        if (tab.id !== state.workspace.activeTabId || tab.panels.length === 1) return tab;

        return {
          ...tab,
          panels: tab.panels.filter((panel) => panel.id !== action.panelId),
        };
      });

      const activeTab = tabs.find((tab) => tab.id === state.workspace.activeTabId);
      const fallbackPanelId = activeTab?.panels[0]?.id ?? state.workspace.activePanelId;
      const sessions = { ...state.sessions };
      const closingPanel = state.workspace.tabs
        .find((tab) => tab.id === state.workspace.activeTabId)
        ?.panels.find((panel) => panel.id === action.panelId);

      if (closingPanel?.sessionId) {
        delete sessions[closingPanel.sessionId];
      }

      return {
        ...state,
        sessions,
        workspace: {
          ...state.workspace,
          tabs,
          activePanelId:
            state.workspace.activePanelId === action.panelId ? fallbackPanelId : state.workspace.activePanelId,
        },
      };
    }
    case "assign-host": {
      return {
        ...state,
        workspace: {
          ...state.workspace,
          tabs: state.workspace.tabs.map((tab) => ({
            ...tab,
            panels: tab.panels.map((panel) =>
              panel.id === action.panelId
                ? { ...panel, hostId: action.hostId, sessionId: action.hostId ? panel.sessionId : null }
                : panel,
            ),
          })),
        },
      };
    }
    case "attach-session": {
      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.session.id]: action.session,
        },
        workspace: {
          ...state.workspace,
          tabs: state.workspace.tabs.map((tab) => ({
            ...tab,
            panels: tab.panels.map((panel) =>
              panel.id === action.panelId
                ? { ...panel, sessionId: action.session.id, hostId: action.session.hostId }
                : panel,
            ),
          })),
        },
      };
    }
    case "update-session-status": {
      const session = state.sessions[action.event.sessionId];
      if (!session) return state;

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.event.sessionId]: {
            ...session,
            status: action.event.status,
            detail: action.event.detail ?? session.detail,
          },
        },
      };
    }
    case "append-session-output": {
      const session = state.sessions[action.event.sessionId];
      if (!session) return state;

      return {
        ...state,
        sessions: {
          ...state.sessions,
          [action.event.sessionId]: {
            ...session,
            detail: `${session.detail ?? ""}${action.event.data}`,
          },
        },
      };
    }
    case "clear-session": {
      const sessions = { ...state.sessions };
      if (action.sessionId) {
        delete sessions[action.sessionId];
      }

      return {
        ...state,
        sessions,
        workspace: {
          ...state.workspace,
          tabs: state.workspace.tabs.map((tab) => ({
            ...tab,
            panels: tab.panels.map((panel) =>
              panel.id === action.panelId ? { ...panel, sessionId: null } : panel,
            ),
          })),
        },
      };
    }
    default:
      return state;
  }
}
