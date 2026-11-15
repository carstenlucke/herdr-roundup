// pi's context for Herdr Roundup's pane header, switched on by
// `scripts/agent-integrations.sh install pi` (a link to this file in ~/.pi/agent/extensions/).
// It runs in pi's own process, with the terminal's environment, and keeps pi's own number per
// Herdr terminal:
//
//   ~/.cache/herdr-roundup/context/pi/<HC_TERMINAL_ID>.json
//     { "v": 1, "terminal": "t7", "pid": <pi's pid>, "at": <ms>, "session", "model",
//       "used", "window", "percent" }
//
// `used`, `window` and `percent` are ctx.getContextUsage(), the numbers pi's footer shows unrounded
// (`used` and `percent` null right after a compaction, until pi's next answer). Written atomically
// (a temp file, then rename), only when something changed, on session start, at the end of each
// turn and when the agent settles, after a compaction, a model change or a move in the session
// tree; not per token (message_update) nor at message_end (pi calls extensions before it saves
// the message there, so the usage lags). Removed whenever its session ends (quit, /reload, /new,
// /resume, /fork): an extension still loaded writes it again at the next session start, while one
// uninstalled or broken by a /reload leaves no file that would stand frozen. Outside a Herdr
// terminal, and in pi's headless modes (print, json, rpc), nothing is written.
//
// Plain JavaScript with node's own modules, nothing of pi's imported, so pi loads it as it is and
// tests/context-pi.test.mjs runs it in node. Nothing here throws into pi.

import { mkdirSync, writeFileSync, renameSync, unlinkSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TERMINAL = /^[A-Za-z0-9_-]+$/;
const EVENTS = ["turn_end", "agent_settled", "session_compact", "model_select", "session_tree"];

export const contextDir = (env = process.env) => join(env.HOME || homedir(), ".cache", "herdr-roundup", "context", "pi");

const count = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
const text = (f) => {
  try {
    const v = f();
    return typeof v === "string" && v ? v : null;
  } catch {
    return null;
  }
};

// The file's content for this moment of pi: its session, model and context usage.
export function record(ctx, { terminal, pid, now }) {
  let usage;
  try { usage = ctx?.getContextUsage?.(); } catch { usage = undefined; }
  const window = Number.isFinite(usage?.contextWindow) && usage.contextWindow > 0 ? usage.contextWindow : null;
  return {
    v: 1,
    terminal,
    pid,
    at: now,
    session: text(() => ctx?.sessionManager?.getSessionId?.()),
    model: text(() => ctx?.model?.id),
    used: count(usage?.tokens),
    window,
    percent: count(usage?.percent),
  };
}

// Writes `content` as <dir>/<terminal>.json through a temp file `.<terminal>.<pid>` (the name the
// pane header's sweep knows). True when written.
// writeAtomic, removeOwn and TERMINAL are copied into opencode/tui.js, on purpose: pi's loader (jiti,
// transforming) resolves a relative import from the symlink's path in pi's extensions folder, so it
// wouldn't reach a shared helper beside this file. A test keeps the copies the same.
export function writeAtomic(dir, content) {
  const tmp = join(dir, `.${content.terminal}.${content.pid}`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(content) + "\n");
    renameSync(tmp, join(dir, `${content.terminal}.json`));
    return true;
  } catch {
    try { unlinkSync(tmp); } catch {}
    return false;
  }
}

// Removes the terminal's file if this process wrote it (a pi started there since keeps its own).
export function removeOwn(dir, terminal, pid) {
  const path = join(dir, `${terminal}.json`);
  try {
    if (JSON.parse(readFileSync(path, "utf8"))?.pid === pid) unlinkSync(path);
  } catch {}
}

export default function roundupContext(pi, { env = process.env, pid = process.pid, now = () => Date.now() } = {}) {
  const terminal = env.HC_TERMINAL_ID;
  if (typeof terminal !== "string" || !TERMINAL.test(terminal)) return;
  const dir = contextDir(env);
  let tui = false;
  let last = null; // what was written last, without its time
  const write = (ctx) => {
    try {
      if (!tui) return;
      const content = record(ctx, { terminal, pid, now: now() });
      const key = JSON.stringify({ ...content, at: 0 });
      if (key !== last && writeAtomic(dir, content)) last = key;
    } catch {}
  };
  const on = (event, handler) => {
    try { pi.on(event, handler); } catch {}
  };
  // /new, /resume, /fork and /reload end the old session and start the next in the same process.
  on("session_start", (_event, ctx) => {
    tui = ctx?.mode === "tui";
    last = null;
    write(ctx);
  });
  for (const event of EVENTS) on(event, (_event, ctx) => write(ctx));
  on("session_shutdown", () => {
    if (tui) removeOwn(dir, terminal, pid);
    last = null;
  });
}
