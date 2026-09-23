import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { useAgent, useRpc, useSettings, useWorkspace } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View } from "react-native";
import { editorPreferences } from "../shared/settings";
import { machineInfoRpc } from "../shared/machine";
import { buildEditorUri } from "./buildEditorUri";
import { allEditors, type Editor } from "./editors";
import { openEditorUri } from "./openEditorUri";

export function EditorPillContent(props: PluginButtonContentProps) {
  const { theme, close } = props;
  // The header button only carries workspaceId; the composer pill also carries agentId.
  // Hooks must run unconditionally, so call both with an empty id when not applicable.
  const agentId = props.context === "agent" ? props.agentId : "";
  const workspaceId = props.workspaceId;
  const cwdAgent = useAgent(agentId, (agent) => agent.cwd);
  const cwdWorkspace = useWorkspace(workspaceId, (workspace) => workspace.directory);
  const cwd = props.context === "agent" ? cwdAgent : cwdWorkspace;
  const getMachineInfo = useRpc(machineInfoRpc);
  const machine = useQuery({ queryKey: ["machine.info"], queryFn: () => getMachineInfo({}) });
  const settings = useSettings(editorPreferences);
  const opened = useRef(false);

  const values = settings.status === "ready" ? settings.values : null;
  const editors = useMemo(() => (values ? allEditors(values.customEditors) : []), [values]);
  const defaultEditor =
    values != null ? (editors.find((editor) => editor.id === values.defaultEditorId) ?? editors[0]) : undefined;

  const styles = useMemo(
    () => ({
      screen: { padding: 12, gap: 8, backgroundColor: theme.colors.surface0 },
      row: { padding: 10, borderRadius: 8, backgroundColor: theme.colors.surface1 },
      rowText: { color: theme.colors.foreground },
      muted: { color: theme.colors.foregroundMuted },
    }),
    [theme],
  );

  const ready = Boolean(cwd && machine.data && defaultEditor && values);

  async function openIn(editor: Editor) {
    if (!cwd || !machine.data || !values) return;
    const uri = buildEditorUri(editor, values, machine.data, cwd);
    await openEditorUri(uri);
    close();
  }

  // A configured default opens immediately; the picker below only ever shows for the
  // rare case where no default editor could be resolved (e.g. an empty catalog).
  useEffect(() => {
    if (opened.current || !ready || !defaultEditor) return;
    opened.current = true;
    void openIn(defaultEditor);
  }, [ready, defaultEditor]);

  if (!ready) {
    return (
      <View style={styles.screen}>
        <Text style={styles.muted}>
          {machine.isError ? "Could not read this machine's SSH address." : "Opening…"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {editors.map((editor) => (
        <Pressable
          key={editor.id}
          accessibilityRole="button"
          accessibilityLabel={"Open in " + editor.label}
          style={styles.row}
          onPress={() => openIn(editor)}
        >
          <Text style={styles.rowText}>{editor.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
