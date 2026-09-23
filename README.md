# Remote Editor

Adds an **Editor** affordance you can put either in each agent's composer
("Editor" pill on the track bar) or on the workspace header ("Open in editor"
button on the right side of the header, where Paseo's own editor button lives).
The header button opens the default editor directly; the composer pill keeps
the picker so you fall back to it when no default editor is set. Both open
the relevant path directly in VS Code, Cursor, or Zed — over SSH when the
Paseo daemon runs on another machine, or as a local folder when it runs on
yours. The composer pill opens the agent's working directory; the header
button opens the workspace's directory.

Both surfaces only appear on desktop (not iOS/Android), since opening a local
editor via a deep link only makes sense from a desktop OS.

## Install

```bash
paseo plugin install npm:@alhassanaraouf/paseo-remote-editor
```

Or paste `npm:@alhassanaraouf/paseo-remote-editor` into **Settings → Plugins → Plugin source**
and select **Install plugin**.

## Settings (Remote Editor)

- **Open in** — default editor (VS Code, Cursor, Zed, or a custom editor).
- **Show button in** — where to surface the affordance: **Composer** (one pill
  per agent, default, matches the original behaviour), **Workspace header**
  (one button per workspace, placed before the built-in actions on the header's
  right side), or **Both**. The change applies immediately on the client
  where you make it; other clients of the same host pick it up after an app
  reload.
- **SSH host / user** — blank falls back to what the daemon reports
  (`os.hostname()` / `os.userInfo().username`). Set these when the daemon's hostname
  doesn't resolve locally: a Tailscale name, LAN name, or an `~/.ssh/config` alias.
- **SSH port** — appended as `:port` in Zed and custom URIs. VS Code-style URIs carry
  no port, so a non-standard port there needs an `~/.ssh/config` alias entered as the
  SSH host instead.
- **Open local paths directly** — enable when the daemon runs on this machine, so the
  editor opens the folder (`vscode://file/...`, `zed://file://...`) instead of SSH.
- **Custom editors** — add your own via URI templates using `{user}`, `{host}`,
  `{port}`, and `{path}`.

## How it works

- VS Code / Cursor: `vscode://vscode-remote/ssh-remote+<user>@<host>/<path>`
  (or `vscode://file/<path>` in local mode)
- Zed: `zed://ssh/<user>@<host>[:<port>]/<path>`
  (or `zed://file://<path>` in local mode)

`<path>` is the agent's working directory (composer pill) or the workspace's
directory (header button), percent-encoded per segment so spaces and special
characters survive the deep link.

## Limitations

- Requires the editor's remote/SSH support to already be set up, including a working
  `ssh <user>@<host>` connection from your machine.
- Not shown on iOS or Android.
