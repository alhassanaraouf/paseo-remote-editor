import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text } from "react-native";
import { editorPreferences, type Placement, placementSchema } from "../shared/settings";
import { setPlacement } from "./placementStore";
import { allEditors } from "./editors";
import type { z } from "zod";

type Values = z.output<(typeof editorPreferences)["schema"]>;

const PLACEMENT_OPTIONS: readonly { label: string; value: Placement }[] = [
  { label: "Composer", value: "composer" },
  { label: "Workspace header", value: "header" },
  { label: "Both", value: "both" },
];

function ConnectionSection({ values, revision, save }: { values: Values; revision: string; save: (v: Values, r: string) => Promise<boolean> }) {
  const [sshHost, setSshHost] = useState(values.sshHost);
  const [sshUser, setSshUser] = useState(values.sshUser);
  const [sshPort, setSshPort] = useState(String(values.sshPort));
  const [error, setError] = useState<string | null>(null);

  async function saveConnection() {
    setError(null);
    const port = Number.parseInt(sshPort.trim(), 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setError("Port must be a number from 1 to 65535.");
      return;
    }
    const ok = await save(
      { ...values, sshHost: sshHost.trim(), sshUser: sshUser.trim(), sshPort: port },
      revision,
    );
    if (!ok) setError("Could not save. Try again.");
  }

  return (
    <SettingsSection
      title="SSH connection"
      info="Blank host/user fall back to what the daemon reports. The host can be an ~/.ssh/config alias."
    >
      <SettingsCard>
        <SettingsInput label="SSH host" placeholder="(daemon hostname)" initialValue={sshHost} onChangeText={setSshHost} />
        <SettingsInput label="SSH user" placeholder="(daemon user)" initialValue={sshUser} onChangeText={setSshUser} />
        <SettingsInput label="SSH port" placeholder="22" initialValue={sshPort} onChangeText={setSshPort} />
        <SettingsSwitch
          label="Open local paths directly"
          hint="Enable when the daemon runs on this machine, so the editor opens the folder instead of connecting over SSH."
          value={values.preferLocal}
          onValueChange={(preferLocal) => save({ ...values, preferLocal }, revision)}
        />
        <SettingsAction
          label="Connection"
          actionLabel="Save"
          error={error ?? undefined}
          onPress={saveConnection}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export function EditorSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(editorPreferences);
  const [draftId, setDraftId] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftTemplate, setDraftTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (settings.status !== "ready") {
    return (
      <Text style={{ color: theme.colors.foregroundMuted }}>
        {settings.status === "loading" ? "Loading…" : "Could not read settings."}
      </Text>
    );
  }

  const { values, revision, save } = settings;
  const editors = allEditors(values.customEditors);

  async function addCustomEditor() {
    setError(null);
    const id = draftId.trim();
    const label = draftLabel.trim();
    const uriTemplate = draftTemplate.trim();
    if (!id || !label || !uriTemplate) {
      setError("Fill in id, label, and URI template.");
      return;
    }
    if (editors.some((editor) => editor.id === id)) {
      setError("An editor with this id already exists.");
      return;
    }
    const ok = await save(
      { ...values, customEditors: [...values.customEditors, { id, label, uriTemplate }] },
      revision,
    );
    if (ok) {
      setDraftId("");
      setDraftLabel("");
      setDraftTemplate("");
    } else {
      setError("Could not save. Try again.");
    }
  }

  async function removeCustomEditor(id: string) {
    const customEditors = values.customEditors.filter((editor) => editor.id !== id);
    const defaultEditorId = values.defaultEditorId === id ? "vscode" : values.defaultEditorId;
    await save({ ...values, customEditors, defaultEditorId }, revision);
  }

  return (
    <>
      <SettingsSection title="Default editor">
        <SettingsCard>
          <SettingsSelect
            label="Open in"
            value={values.defaultEditorId}
            options={editors.map((editor) => ({ label: editor.label, value: editor.id }))}
            onValueChange={(defaultEditorId) => save({ ...values, defaultEditorId }, revision)}
          />
          <SettingsSelect
            label="Show button in"
            hint="Composer adds a pill to each agent's composer and opens the agent's working directory. Workspace header adds one button per workspace and opens the workspace folder."
            value={values.placement}
            options={PLACEMENT_OPTIONS}
            onValueChange={async (placement) => {
              const parsed = placementSchema.parse(placement);
              const ok = await save({ ...values, placement: parsed }, revision);
              if (ok) setPlacement(parsed);
            }}
          />
        </SettingsCard>
      </SettingsSection>
      <ConnectionSection values={values} revision={revision} save={save} />
      <SettingsSection title="Custom editors" info="Use {user}, {host}, {port}, and {path} in the URI template.">
        <SettingsCard>
          {values.customEditors.map((editor) => (
            <SettingsRow key={editor.id} label={editor.label} hint={editor.uriTemplate}>
              <SettingsAction label={editor.label} actionLabel="Remove" onPress={() => removeCustomEditor(editor.id)} />
            </SettingsRow>
          ))}
          <SettingsInput label="Id" placeholder="cursor" onChangeText={setDraftId} />
          <SettingsInput label="Label" placeholder="Cursor" onChangeText={setDraftLabel} />
          <SettingsInput
            label="URI template"
            hint="Use {user}, {host}, {port}, and {path}, e.g. cursor://ssh/{user}@{host}{path}"
            placeholder="cursor://ssh/{user}@{host}{path}"
            onChangeText={setDraftTemplate}
          />
          <SettingsAction
            label="Add editor"
            actionLabel="Add"
            error={error ?? undefined}
            onPress={addCustomEditor}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
