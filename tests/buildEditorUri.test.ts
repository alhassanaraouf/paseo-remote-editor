import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildEditorUri, type EditorValues } from "../client/buildEditorUri";
import { allEditors } from "../client/editors";

const machine = { username: "daemon-user", hostname: "daemon-host" };

const values: EditorValues = {
  defaultEditorId: "vscode",
  customEditors: [],
  sshHost: "",
  sshUser: "",
  sshPort: 22,
  preferLocal: false,
};

const [vscode] = allEditors([]).filter((e) => e.id === "vscode");
const [zed] = allEditors([]).filter((e) => e.id === "zed");

describe("buildEditorUri", () => {
  it("builds a remote URI with daemon-reported host and user", () => {
    assert.equal(
      buildEditorUri(vscode, values, machine, "/home/ada/work"),
      "vscode://vscode-remote/ssh-remote+daemon-user@daemon-host/home/ada/work",
    );
  });

  it("uses sshHost / sshUser overrides when set", () => {
    assert.equal(
      buildEditorUri(
        vscode,
        { ...values, sshHost: "alias", sshUser: "me" },
        machine,
        "/home/ada/work",
      ),
      "vscode://vscode-remote/ssh-remote+me@alias/home/ada/work",
    );
  });

  it("forwards the configured SSH port to Zed-style URIs", () => {
    assert.equal(
      buildEditorUri(zed, { ...values, sshPort: 2222 }, machine, "/home/ada/work"),
      "zed://ssh/daemon-user@daemon-host:2222/home/ada/work",
    );
  });

  it("returns the local URI when preferLocal is set, regardless of host", () => {
    assert.equal(
      buildEditorUri(
        vscode,
        { ...values, preferLocal: true, sshHost: "alias", sshUser: "me" },
        machine,
        "/home/ada/work",
      ),
      "vscode://file/home/ada/work",
    );
    assert.equal(
      buildEditorUri(
        zed,
        { ...values, preferLocal: true, sshPort: 2222 },
        machine,
        "/home/ada/work",
      ),
      "zed://file://home/ada/work",
    );
  });

  it("percent-encodes path segments in both modes", () => {
    assert.equal(
      buildEditorUri(vscode, values, machine, "/home/ada/my work"),
      "vscode://vscode-remote/ssh-remote+daemon-user@daemon-host/home/ada/my%20work",
    );
    assert.equal(
      buildEditorUri(vscode, { ...values, preferLocal: true }, machine, "/home/ada/my work"),
      "vscode://file/home/ada/my%20work",
    );
  });
});
