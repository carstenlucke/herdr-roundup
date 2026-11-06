// What the context menu and the keys do with a path: open it in its app, show it in the
// Finder, copy it, or type "@path" into the tab's agent.
//
// Adapted from cybertron288/herdr-mods `filetree` (MIT, (c) 2026 cybertron288).
// See THIRD_PARTY_NOTICES.md.
import { agents, exec, focused, notify, panes, run, window } from "herdr";
import { psQuote } from "./disk.js";

export function relTo(root, abs) {
  if (!root || !abs) return null;
  const a = abs.replace(/\\/g, "/"), r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  if (a === r) return "";
  return a.startsWith(r + "/") ? a.slice(r.length + 1) : null;
}

// This computer only.
export async function openExternal(abs) {
  const platform = window()?.platform;
  const r = platform === "macos" ? await exec("open", ["--", abs])
    : platform === "windows" ? await exec("powershell", ["-NoProfile", "-Command", `Invoke-Item -LiteralPath ${psQuote(abs)}`])
    : await exec("xdg-open", [abs]);
  if (r.code !== 0) throw new Error(r.stderr.trim() || "No app opens this file");
}

// This computer only.
export async function revealExternal(abs) {
  const platform = window()?.platform;
  if (platform === "macos") await exec("open", ["-R", "--", abs]);
  else if (platform === "windows") await exec("explorer.exe", [`/select,${abs.replace(/\//g, "\\")}`]);
  else await exec("xdg-open", [abs.replace(/\/[^/]*$/, "") || "/"]);
}

export function copy(cx, text) {
  cx.write_to_clipboard(text);
  notify({ title: "Copied", body: text, level: "info", timeout: 2000 });
}

// Types "@path " into the agent of the shown tab: through the clipboard, which is put back
// a moment later (text only). The agent's pane takes the keyboard so a question can follow.
// The path is relative to the agent's folder when it lies inside it.
export function sendToAgent(cx, abs) {
  const f = focused(), fp = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const inTab = agents().filter((a) => a.tab === f?.tab);
  const address = (fp?.status && fp.terminal) || (inTab.find((a) => a.focused) ?? inTab[0])?.address;
  if (!address) { notify({ title: "No agent in this tab", body: "Start one, then send the path again", level: "warning", timeout: 3000 }); return; }
  const cwd = panes().find((p) => p.terminal === address)?.cwd;
  const rel = relTo(cwd, abs), path = rel || abs;
  const text = `@${/\s/.test(path) ? `"${path}"` : path} `;
  const before = cx.read_from_clipboard();
  cx.write_to_clipboard(text);
  run("pane.focus", { terminal: address });
  run("terminal.paste");
  cx.timer.after(600, (cx) => { if (before !== undefined) cx.write_to_clipboard(before); });
}
