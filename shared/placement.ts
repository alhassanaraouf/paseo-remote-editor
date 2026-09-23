import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { placementSchema } from "./settings";

// `contribute()` is not a React component, so there is no useSettings hook to
// read the placement from. The server exposes it through this RPC; the client
// fetches it once at load and applies applyPlacement() against the result.
export const placementRpc = defineRpc({
  name: "remote-editor.placement.get",
  input: z.object({}),
  output: z.object({ placement: placementSchema }),
});
