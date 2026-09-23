import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getMachineInfo } from "./server/machine";
import { machineInfoRpc } from "./shared/machine";
import { placementRpc } from "./shared/placement";
import { preferencesRpc } from "./shared/preferences";
import { editorPreferences, type Placement } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  server.handle(machineInfoRpc, getMachineInfo);
  // The settings handle owns the persisted values; keep it for the queries
  // that depend on it (placement RPC, preferences RPC).
  const settings = server.registerSettings(editorPreferences);
  server.handle(placementRpc, async (): Promise<{ placement: Placement }> => {
    const state = await settings.read();
    if (state.status !== "ready") return { placement: "composer" };
    return { placement: state.values.placement };
  });
  server.handle(preferencesRpc, async () => {
    const state = await settings.read();
    if (state.status !== "ready") {
      throw new Error("Editor preferences are not ready: " + state.status);
    }
    return state.values;
  });
  return () => {};
}
