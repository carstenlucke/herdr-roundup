// opencode's context for Herdr Roundup's pane header, switched on by
// `scripts/agent-integrations.sh install opencode` (a link to this folder in
// ~/.config/opencode/plugins/). A TUI plugin of opencode 2's plugin API: the TUI runs in the
// terminal's own process, with its environment, while opencode's server is a shared service with
// another terminal's pid. It keeps the numbers of the session the TUI shows, per Herdr terminal:
//
//   ~/.cache/herdr-roundup/context/opencode/<HC_TERMINAL_ID>.json
//     { "v": 1, "terminal": "t7", "pid": <the TUI's pid>, "at": <ms>, "session", "model",
//       "used", "window", "footerWindow", "percent" }
//
// `used` as opencode's own footer and sidebar count it (tui/src/util/session.ts, contextUsage): the
// last answer with tokens after the last completed compaction, before a revert point, input +
// output + reasoning + cache read + cache write. `window` is the prompt's room, the one opencode
// compacts against (core/src/session/compaction.ts, inputWindow): min(limit.input, limit.context)
// of the answer's model, or the one of them it has (0: unknown). Its footer divides by
// `limit.context`, which also holds the answer: logged in with ChatGPT, gpt-6.1-sol's input is
// capped at 500k and its context is 500k + 128k of output, 628k. `footerWindow` is that
// `limit.context` when it is larger than `window` (else null), for the hover card to say so.
// On the home screen, or before a first answer, the numbers are null. Written atomically (a temp
// file, then rename), only when something changed, a moment after opencode's events (they come
// for every session of the shared server) and once a second for the route (it sends none).
// Removed when the TUI ends. Outside a Herdr terminal nothing is written.
//
// Plain JavaScript with node's own modules, nothing of opencode's imported, so it loads as it is
// and tests/context-opencode.test.mjs runs it in node. Nothing here throws into opencode.

import { mkdirSync, writeFileSync, renameSync, unlinkSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TERMINAL = /^[A-Za-z0-9_-]+$/;
export const SETTLE_MS = 300;
export const ROUTE_MS = 1000;

export const contextDir = (env = process.env) => join(env.HOME || homedir(), ".cache", "herdr-roundup", "context", "opencode");

const count = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

const positive = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

// The prompt's room as opencode's compaction takes it: min(input, context), or the one it has.
// → { window, footerWindow } (null when unknown; footerWindow only when the footer's is larger).
export function windowOf(limit) {
  const input = positive(limit?.input), context = positive(limit?.context);
  const window = input && context ? Math.min(input, context) : input || context;
  return { window: window || null, footerWindow: context > window ? context : null };
}

// opencode's contextUsage, in its own terms: → { used, window, footerWindow, model, at } or null.
export function usageOf(messages, models, boundary) {
  if (!Array.isArray(messages)) return null;
  const boundaryIndex = boundary ? messages.findIndex((m) => m?.id === boundary) : -1;
  if (boundary && boundaryIndex === -1) return null;
  const end = boundaryIndex === -1 ? messages.length : boundaryIndex;
  let compaction = -1;
  for (let i = end - 1; i >= 0; i--) if (messages[i]?.type === "compaction" && messages[i].status === "completed") { compaction = i; break; }
  let last = null;
  for (let i = end - 1; i > compaction; i--) if (messages[i]?.type === "assistant" && messages[i].tokens) { last = messages[i]; break; }
  if (!last) return null;
  const t = last.tokens;
  const used = count(t.input) + count(t.output) + count(t.reasoning) + count(t.cache?.read) + count(t.cache?.write);
  if (!(used > 0)) return null;
  const ref = last.model ?? {};
  const model = Array.isArray(models) ? models.find((m) => m?.providerID === ref.providerID && m?.id === ref.id) : undefined;
  const at = last.time?.completed ?? last.time?.created;
  return {
    used,
    ...windowOf(model?.limit),
    model: typeof ref.id === "string" && ref.id ? ref.id : null,
    at: Number.isFinite(at) ? at : null,
  };
}

// The file's content for what the TUI shows now. The models of the session's location, else of the
// TUI's current one (`context.location`, as opencode's own session route does with
// `session.location ?? location.ref`): a session whose info isn't loaded yet; neither of them, and
// the model list falls back to the default location itself.
export function record(context, { terminal, pid, now }) {
  const route = context.ui.router.current();
  const session = route?.type === "session" && typeof route.sessionID === "string" ? route.sessionID : null;
  let u = null;
  if (session) {
    const info = context.data.session.get(session);
    let current;
    try { current = context.location; } catch { current = undefined; }
    u = usageOf(context.data.session.message.list(session), context.data.location.model.list(info?.location ?? current), info?.revert?.messageID);
  }
  return {
    v: 1,
    terminal,
    pid,
    at: u?.at ?? now,
    session,
    model: u?.model ?? null,
    used: u?.used ?? null,
    window: u?.window ?? null,
    footerWindow: u?.footerWindow ?? null,
    percent: u && u.window ? (u.used / u.window) * 100 : null,
  };
}

// writeAtomic, removeOwn and TERMINAL are copies of pi-context.js's, on purpose: pi's loader (jiti,
// transforming) resolves a relative import from the symlink's path in pi's extensions folder, so it
// wouldn't reach a shared helper beside the link's target. A test keeps the copies the same.
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

export function removeOwn(dir, terminal, pid) {
  const path = join(dir, `${terminal}.json`);
  try {
    if (JSON.parse(readFileSync(path, "utf8"))?.pid === pid) unlinkSync(path);
  } catch {}
}

export function setup(context, { env = process.env, pid = process.pid, now = () => Date.now() } = {}) {
  const terminal = env.HC_TERMINAL_ID;
  if (typeof terminal !== "string" || !TERMINAL.test(terminal)) return;
  const dir = contextDir(env);
  let disposed = false, timer = null, last = null;
  const flush = () => {
    timer = null;
    if (disposed) return;
    try {
      const content = record(context, { terminal, pid, now: now() });
      // The time alone (home screen, no answer: now) is no change.
      const key = JSON.stringify({ ...content, at: content.used === null ? 0 : content.at });
      if (key !== last && writeAtomic(dir, content)) last = key;
    } catch {}
  };
  const soon = () => {
    if (timer || disposed) return;
    timer = setTimeout(flush, SETTLE_MS);
    timer.unref?.();
  };
  let unlisten = null;
  try { unlisten = context.data.listen(soon); } catch {}
  const poll = setInterval(soon, ROUTE_MS);
  poll.unref?.();
  flush();
  return () => {
    disposed = true;
    clearTimeout(timer);
    clearInterval(poll);
    try { unlisten?.(); } catch {}
    removeOwn(dir, terminal, pid);
  };
}

export default { id: "herdr-roundup.context", setup };
