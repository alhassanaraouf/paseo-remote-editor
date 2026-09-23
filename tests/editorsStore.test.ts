import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { setCustomEditors, subscribeCustomEditors, getCustomEditors } from "../client/editorsStore";
import type { CustomEditor } from "../shared/settings";

beforeEach(() => {
  setCustomEditors([]);
});

describe("editorsStore", () => {
  it("notifies subscribers with the new custom editor list", () => {
    const received: (readonly CustomEditor[])[] = [];
    const unsubscribe = subscribeCustomEditors((value) => received.push(value));
    const cursor: CustomEditor = { id: "cursor2", label: "Cursor 2", uriTemplate: "x://{path}" };
    setCustomEditors([cursor]);
    unsubscribe();
    assert.deepEqual(received, [[cursor]]);
  });

  it("stops notifying after unsubscribe", () => {
    const calls: unknown[] = [];
    const unsubscribe = subscribeCustomEditors((value) => calls.push(value));
    unsubscribe();
    setCustomEditors([{ id: "a", label: "A", uriTemplate: "a://{path}" }]);
    assert.deepEqual(calls, []);
  });

  it("keeps the most recent value readable via getCustomEditors", () => {
    assert.deepEqual(getCustomEditors(), []);
    const editor: CustomEditor = { id: "a", label: "A", uriTemplate: "a://{path}" };
    setCustomEditors([editor]);
    assert.deepEqual(getCustomEditors(), [editor]);
  });
});
