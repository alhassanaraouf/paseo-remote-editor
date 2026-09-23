import { resolveSshTarget, type Editor } from "./editors";

// Shape kept framework-free so this function can run inside `client.rpc(...)`
// handlers, the picker popover, and the header button's action: same
// arguments in all three places. The host machine is whatever
// `machine.info.reply` gives us.
export interface EditorValues {
  defaultEditorId: string;
  customEditors: ReadonlyArray<{
    id: string;
    label: string;
    uriTemplate: string;
    localUriTemplate?: string;
  }>;
  sshHost: string;
  sshUser: string;
  sshPort: number;
  preferLocal: boolean;
}

export interface EditorHost {
  username: string;
  hostname: string;
}

export function buildEditorUri(editor: Editor, values: EditorValues, machine: EditorHost, path: string): string {
  if (values.preferLocal) return editor.buildLocal(path);
  return editor.buildRemote(
    resolveSshTarget(machine, {
      sshHost: values.sshHost,
      sshUser: values.sshUser,
      sshPort: values.sshPort,
    }),
    path,
  );
}
