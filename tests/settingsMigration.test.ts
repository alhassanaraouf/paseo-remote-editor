import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { editorPreferences } from "../shared/settings";

const { migrate, schema } = editorPreferences;
if (!migrate) throw new Error("editorPreferences.migrate must be defined for this test file");

describe("editorPreferences migration", () => {
  it("fills in SSH defaults and adds placement: composer for a v1 document", async () => {
    const v1 = { defaultEditorId: "vscode", customEditors: [] };
    const migrated = await migrate(v1, 1);
    const parsed = schema.parse(migrated);
    assert.equal(parsed.sshHost, "");
    assert.equal(parsed.sshUser, "");
    assert.equal(parsed.sshPort, 22);
    assert.equal(parsed.preferLocal, false);
    assert.equal(parsed.placement, "composer");
    assert.equal(parsed.defaultEditorId, "vscode");
    assert.deepEqual(parsed.customEditors, []);
  });

  it("keeps v2 SSH values intact and adds placement: composer", async () => {
    const v2 = {
      defaultEditorId: "zed",
      customEditors: [
        { id: "cursor", label: "Cursor", uriTemplate: "cursor://{path}" },
      ],
      sshHost: "alias",
      sshUser: "ada",
      sshPort: 2222,
      preferLocal: true,
    };
    const migrated = await migrate(v2, 2);
    const parsed = schema.parse(migrated);
    assert.equal(parsed.defaultEditorId, "zed");
    assert.equal(parsed.sshHost, "alias");
    assert.equal(parsed.sshUser, "ada");
    assert.equal(parsed.sshPort, 2222);
    assert.equal(parsed.preferLocal, true);
    assert.equal(parsed.placement, "composer");
    assert.equal(parsed.customEditors.length, 1);
    assert.equal(parsed.customEditors[0]?.id, "cursor");
  });

  it("preserves an explicit placement when one is already present on a v2-style input", async () => {
    const v2WithPlacement = {
      defaultEditorId: "vscode",
      customEditors: [],
      sshHost: "alias",
      sshUser: "ada",
      sshPort: 2222,
      preferLocal: false,
      placement: "both",
    };
    const migrated = await migrate(v2WithPlacement, 2);
    const parsed = schema.parse(migrated);
    assert.equal(parsed.placement, "both");
  });

  it("rejects an unparseable document", () => {
    assert.throws(() =>
      schema.parse({ defaultEditorId: "zed", sshPort: 0 }),
    );
  });
});
