import type { PluginClientContext, PluginHeaderButtonContribution } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { buildEditorUri, type EditorValues } from "./client/buildEditorUri";
import { EditorPillContent } from "./client/EditorPillContent";
import { EditorSettingsScreen } from "./client/EditorSettingsScreen";
import { allEditors } from "./client/editors";
import { getCustomEditors, subscribeCustomEditors } from "./client/editorsStore";
import { openEditorUri } from "./client/openEditorUri";
import { setPlacement, subscribePlacement } from "./client/placementStore";
import { machineInfoRpc } from "./shared/machine";
import { placementRpc } from "./shared/placement";
import { preferencesRpc } from "./shared/preferences";
import type { Placement } from "./shared/settings";

interface AgentRef {
  readonly id: string;
  readonly workspaceId?: string | null;
}
interface WorkspaceRef {
  readonly id: string;
  readonly directory: string;
}
interface OwnedSubscription {
  release(): Promise<void>;
}

export default function contribute(client: PluginClientContext) {
  const removeSettingsScreen = client.addSettingsScreen({
    id: "editors",
    title: "Remote Editor",
    icon: "Code",
    Component: EditorSettingsScreen,
  });

  // Deep-linking into a local editor only makes sense from a desktop OS, never mobile.
  if (Platform.OS === "ios" || Platform.OS === "android") return removeSettingsScreen;

  let disposed = false;
  let placement: Placement = "composer";
  let lastAgents: readonly AgentRef[] = [];
  let lastWorkspaces: readonly WorkspaceRef[] = [];

  const pills = new Map<string, () => void>();
  const headerButtons = new Map<string, () => void>();
  // Tracks workspaces whose header button is currently resolving an open. Stops
  // a second rapid press from launching a second editor window while the first
  // is still in flight.
  const headerInFlight = new Set<string>();

  function ensurePill(agentId: string, workspaceId: string): void {
    if (pills.has(agentId)) return;
    const registration = client.addComposerPill({
      id: "open-in-editor",
      workspaceId,
      agentId,
      button: {
        title: "Open in editor",
        icon: "Code",
        label: "Editor",
        behavior: { kind: "popover", Content: EditorPillContent },
      },
    });
    pills.set(agentId, () => registration.remove());
  }

  function removePill(agentId: string): void {
    const remove = pills.get(agentId);
    if (!remove) return;
    pills.delete(agentId);
    remove();
  }

  function makeHeaderButton(workspaceId: string, capturedDirectory: string): PluginHeaderButtonContribution["button"] {
    return {
      title: "Open in editor",
      icon: "Code",
      label: "Editor",
      behavior: {
        kind: "action",
        async onPress() {
          if (headerInFlight.has(workspaceId)) return;
          headerInFlight.add(workspaceId);
          // Resolve at press time so a workspace upsert that changes the
          // directory (e.g. worktree rename) opens the latest folder; the
          // captured value is only the fallback path when the workspace has
          // fallen out of the current list.
          const directory = lastWorkspaces.find((w) => w.id === workspaceId)?.directory ?? capturedDirectory;
          try {
            await openInEditor(directory);
          } catch (error: unknown) {
            // openWorkspaceEditor handles recoverable errors; this catches
            // truly unexpected throws so the action never surfaces to Paseo.
            console.warn("[remote-editor] header button threw:", error);
          } finally {
            headerInFlight.delete(workspaceId);
          }
        },
      },
    };
  }

  function ensureHeaderButton(workspaceId: string, directory: string): void {
    if (headerButtons.has(workspaceId)) return;
    const registration = client.addHeaderButton({
      id: "open-in-editor",
      workspaceId,
      button: makeHeaderButton(workspaceId, directory),
    });
    headerButtons.set(workspaceId, () => registration.remove());
  }

  function removeHeaderButton(workspaceId: string): void {
    const remove = headerButtons.get(workspaceId);
    if (!remove) return;
    headerButtons.delete(workspaceId);
    remove();
  }

  // Reconcile so that the on-screen state matches the placement. Called from
  // the initial list, every subscription snapshot, agent/workspace upserts,
  // and after the user toggles the placement setting.
  function applyPlacement(): void {
    const wantPill = placement === "composer" || placement === "both";
    const wantHeader = placement === "header" || placement === "both";

    if (wantPill) {
      const present = new Set<string>();
      for (const agent of lastAgents) {
        if (!agent.workspaceId) continue;
        present.add(agent.id);
        ensurePill(agent.id, agent.workspaceId);
      }
      for (const agentId of [...pills.keys()]) {
        if (!present.has(agentId)) removePill(agentId);
      }
    } else {
      for (const agentId of [...pills.keys()]) removePill(agentId);
    }

    if (wantHeader) {
      const present = new Set<string>();
      for (const workspace of lastWorkspaces) {
        present.add(workspace.id);
        ensureHeaderButton(workspace.id, workspace.directory);
      }
      for (const workspaceId of [...headerButtons.keys()]) {
        if (!present.has(workspaceId)) removeHeaderButton(workspaceId);
      }
    } else {
      for (const workspaceId of [...headerButtons.keys()]) removeHeaderButton(workspaceId);
    }
  }

  function setWorkspaceList(next: readonly WorkspaceRef[]): void {
    lastWorkspaces = next;
    applyPlacement();
  }

  function toWorkspaceRef<T extends { id: string; workspaceDirectory?: string; projectRootPath: string; archivingAt?: string | null }>(
    entry: T,
  ): WorkspaceRef | null {
    if (entry.archivingAt) return null;
    // workspaceDirectory is optional on the wire but useWorkspace maps it to a
    // non-nullable `directory`; fall back to the project's root path so the
    // header button always has somewhere to send the editor.
    return { id: entry.id, directory: entry.workspaceDirectory ?? entry.projectRootPath };
  }

  function readAndApplyPlacement(): void {
    void client
      .rpc(placementRpc, {})
      .then((result) => {
        if (disposed) return;
        placement = result.placement;
        setPlacement(result.placement);
        applyPlacement();
      })
      .catch((error: unknown) => {
        console.warn("[remote-editor] failed to read placement setting:", error);
      });
  }

  // editorId picks a specific editor (Command Center per-editor items); omitted, it
  // falls back to the user's configured default (header button, default item).
  async function openInEditor(directory: string, editorId?: string): Promise<void> {
    let values: EditorValues;
    let machine: { username: string; hostname: string };
    try {
      const result = await Promise.all([client.rpc(preferencesRpc, {}), client.rpc(machineInfoRpc, {})]);
      values = result[0];
      machine = result[1];
    } catch (error: unknown) {
      console.warn("[remote-editor] could not read preferences or machine info:", error);
      client.openSettings("editors");
      return;
    }
    const editors = allEditors(values.customEditors);
    const editor = editors.find((candidate) => candidate.id === (editorId ?? values.defaultEditorId)) ?? editors[0];
    if (!editor) {
      client.openSettings("editors");
      return;
    }
    const uri = buildEditorUri(editor, values, machine, directory);
    try {
      await openEditorUri(uri);
    } catch (error: unknown) {
      console.warn("[remote-editor] could not open editor:", error);
      client.openSettings("editors");
    }
  }

  // ----- Command Center -----
  // One remover per editor id, covering both its workspace- and agent-context
  // items. Reconciled against the custom editor list so items appear and
  // disappear live as the user edits them in settings, without a plugin reload.
  const editorCommandItems = new Map<string, () => void>();

  function addEditorCommandItem(id: string, label: string, editorId?: string): () => void {
    const workspaceItem = client.addCommandCenterItem({
      id: `${id}-workspace`,
      title: label,
      icon: "Code",
      context: "workspace",
      async onSelect({ workspace }) {
        await openInEditor(workspace.directory, editorId);
      },
    });
    const agentItem = client.addCommandCenterItem({
      id: `${id}-agent`,
      title: label,
      icon: "Code",
      context: "agent",
      async onSelect({ agent }) {
        await openInEditor(agent.cwd, editorId);
      },
    });
    return () => {
      void workspaceItem();
      void agentItem();
    };
  }

  function applyEditorCommandItems(customEditors: Parameters<typeof allEditors>[0]): void {
    const editors = allEditors(customEditors);
    const present = new Set(editors.map((editor) => editor.id));
    for (const editor of editors) {
      if (editorCommandItems.has(editor.id)) continue;
      editorCommandItems.set(editor.id, addEditorCommandItem(`open-in-${editor.id}`, `Open in ${editor.label}`, editor.id));
    }
    for (const [id, remove] of [...editorCommandItems]) {
      if (!present.has(id)) {
        remove();
        editorCommandItems.delete(id);
      }
    }
  }

  const removeDefaultEditorItem = addEditorCommandItem("open-in-editor", "Open in editor");
  applyEditorCommandItems(getCustomEditors());
  const unsubscribeCustomEditors = subscribeCustomEditors((customEditors) => {
    if (disposed) return;
    applyEditorCommandItems(customEditors);
  });
  void client
    .rpc(preferencesRpc, {})
    .then((result) => {
      if (disposed) return;
      applyEditorCommandItems(result.customEditors);
    })
    .catch((error: unknown) => {
      console.warn("[remote-editor] failed to read editor preferences:", error);
    });

  const unsubscribePlacement = subscribePlacement((value) => {
    if (disposed) return;
    placement = value;
    applyPlacement();
  });

  // ----- Agents -----
  let unsubscribeAgentObserver: (() => void) | null = null;
  let agentSubscription: OwnedSubscription | null = null;

  const unsubscribeAgentListener = client.paseo.agents.subscribe((update) => {
    if (disposed) return;
    if (update.kind === "remove") {
      removePill(update.agentId);
      lastAgents = lastAgents.filter((agent) => agent.id !== update.agentId);
      return;
    }
    if (!update.agent.workspaceId) return;
    const next: AgentRef = { id: update.agent.id, workspaceId: update.agent.workspaceId };
    const without = lastAgents.filter((agent) => agent.id !== next.id);
    lastAgents = [...without, next];
    if (placement === "composer" || placement === "both") ensurePill(next.id, next.workspaceId ?? "");
  });

  void client.paseo.agents
    .list({ subscribe: {} })
    .then((result) => {
      if (disposed) {
        void result.subscription?.release();
        return;
      }
      lastAgents = result.entries.map((entry) => entry.agent);
      applyPlacement();
      const owned = result.subscription;
      if (owned) {
        agentSubscription = owned;
        unsubscribeAgentObserver = owned.subscribe({
          snapshot: (snapshot) => {
            if (disposed) return;
            lastAgents = snapshot.entries.map((entry) => entry.agent);
            applyPlacement();
          },
          update: () => {},
        });
      }
    })
    .catch((error: unknown) => {
      console.warn("[remote-editor] failed to subscribe to agent directory:", error);
    });

  // ----- Workspaces -----
  let unsubscribeWorkspaceObserver: (() => void) | null = null;
  let workspaceSubscription: OwnedSubscription | null = null;

  const unsubscribeWorkspaceListener = client.paseo.workspaces.subscribe((update) => {
    if (disposed) return;
    if (update.kind === "remove") {
      removeHeaderButton(update.id);
      lastWorkspaces = lastWorkspaces.filter((workspace) => workspace.id !== update.id);
      return;
    }
    const next = toWorkspaceRef(update.workspace);
    if (!next) {
      removeHeaderButton(update.workspace.id);
      lastWorkspaces = lastWorkspaces.filter((workspace) => workspace.id !== update.workspace.id);
      return;
    }
    const without = lastWorkspaces.filter((workspace) => workspace.id !== next.id);
    lastWorkspaces = [...without, next];
    if (placement === "header" || placement === "both") ensureHeaderButton(next.id, next.directory);
  });

  void client.paseo.workspaces
    .list({ subscribe: {} })
    .then((result) => {
      if (disposed) {
        void result.subscription?.release();
        return;
      }
      // Tolerate a missing subscription handle: still reconcile the initial snapshot.
      const initial = result.entries
        .map(toWorkspaceRef)
        .filter((value): value is WorkspaceRef => value !== null);
      setWorkspaceList(initial);
      const owned = result.subscription;
      if (owned) {
        workspaceSubscription = owned;
        unsubscribeWorkspaceObserver = owned.subscribe({
          snapshot: (snapshot) => {
            if (disposed) return;
            setWorkspaceList(
              snapshot.entries
                .map(toWorkspaceRef)
                .filter((value): value is WorkspaceRef => value !== null),
            );
          },
          update: () => {},
        });
      }
    })
    .catch((error: unknown) => {
      console.warn("[remote-editor] failed to subscribe to workspace directory:", error);
    });

  readAndApplyPlacement();

  return () => {
    disposed = true;
    unsubscribeAgentListener();
    unsubscribeWorkspaceListener();
    unsubscribeAgentObserver?.();
    unsubscribeAgentObserver = null;
    unsubscribeWorkspaceObserver?.();
    unsubscribeWorkspaceObserver = null;
    unsubscribePlacement();
    unsubscribeCustomEditors();
    void agentSubscription?.release();
    agentSubscription = null;
    void workspaceSubscription?.release();
    workspaceSubscription = null;
    headerInFlight.clear();
    for (const remove of pills.values()) remove();
    pills.clear();
    for (const remove of headerButtons.values()) remove();
    headerButtons.clear();
    removeDefaultEditorItem();
    for (const remove of editorCommandItems.values()) remove();
    editorCommandItems.clear();
    removeSettingsScreen();
  };
}
