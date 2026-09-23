import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { editorPreferences } from "./settings";

// The header button lives in contribute() and therefore outside a React tree:
// useSettings / useRpc are not available there. This RPC exposes the editor
// preferences through the existing client.rpc channel so the action can read
// the same values the picker reads.
export const preferencesRpc = defineRpc({
  name: "remote-editor.preferences.get",
  input: z.object({}),
  output: editorPreferences.schema,
});
