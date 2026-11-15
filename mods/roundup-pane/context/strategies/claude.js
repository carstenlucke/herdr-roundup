// Claude Code: its context from its own status line (the integration, `agent-integrations.sh
// install claude`), with the transcript for what the status line doesn't tell: a compaction and
// the time of the last answer. Without the integration the window comes only from a `/context`
// snapshot of this session, model and process; without one there is no window, tokens only.
//
// terminal → `hc get` foreground pid → ~/.claude/sessions/<pid>.json (sessionId, cwd, startedAt)
//   → status line file ~/.cache/herdr-roundup/context/claude/<t>.json, if its pid and session match
//   → transcript: the status line's transcript_path, else projects/<cwd slug>/<sessionId>.jsonl

import { NO_ANSWER, foreground, processEnv, observeJsonFile, observeTerminalFile, parseJson } from "../locate.js";
import { scanTail, fromEnd, NO_READING } from "../tail.js";
import { fromClaude } from "../../limits/parse.js";

export const IDLE_COMPACT_MS = 55 * 60 * 1000; // observed on this machine, see RECIPE
export const IDLE_COMPACT_FROM = 200_000;
const SNAPSHOT = "## Context Usage";
const SNAPSHOT_MAX_LINE = 64 * 1024; // the real line is ~2 KB; copies inside api-request-blob lines are far longer
const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;
// A raw-line filter for snapshot candidates, not a proof (parseSnapshot decides): a line with an
// unescaped `"isMeta": true` somewhere. A copy of one inside a JSON string (a Read result, a pasted
// /context, a quoted reply) has its quotes escaped (\"isMeta\") and never matches.
export const SNAPSHOT_META = '"isMeta"[[:space:]]*:[[:space:]]*true';
// How many candidates, newest first, are checked: a bounded fallback. Should more than this many
// filtered lines that are no snapshot follow the last one, the window stays unknown (tokens only).
export const SNAPSHOT_CANDIDATES = 8;
const COMPACT_ENV = ["CLAUDE_CODE_AUTO_COMPACT_WINDOW", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"];
export const ACCOUNT_FILES = 60; // how many terminals' files accountLimits reads at most

// The process doesn't run on the plan: it is told to use Bedrock, Vertex or Foundry (switched on
// as Claude Code reads such a switch), or another endpoint. An API key or a token in the
// environment decides nothing (Claude Code may still use the subscription): such a pane shows its
// account's limits until its own first answer says otherwise (noLimits, below).
const ON = new Set(["1", "true", "yes", "on"]);
const OFF_PLAN = ["CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY"];
export const offPlan = (env) => Boolean(env) && (OFF_PLAN.some((k) => ON.has(String(env[k] ?? "").trim().toLowerCase())) || Boolean(String(env.ANTHROPIC_BASE_URL ?? "").trim()));

// A folder as Claude Code names its project folder: every character not a letter or digit is "-".
export const slug = (cwd) => cwd.replace(/[^a-zA-Z0-9]/g, "-");

const count = (n) => (Number.isFinite(n) && n >= 0 ? n : null);
const time = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
};

// The session file of a pid, if it is an interactive session started in this terminal's life.
export function checkSession(s, fg) {
  if (!s || typeof s.sessionId !== "string" || !s.sessionId) return null;
  if (s.kind !== undefined && s.kind !== "interactive") return null;
  if (s.pid !== undefined && s.pid !== fg.pid) return null;
  if (Number.isFinite(s.startedAt) && Number.isFinite(fg.created) && s.startedAt < fg.created - 2000) return null;
  return s;
}

// The tokens of one answer's usage: input, both caches and the output (Claude Code counts the
// output too: a compaction's preTokens is that sum). With server tools the top level adds up
// every request of the turn, so the last of `iterations` counts.
export function usageTokens(usage) {
  if (!usage || typeof usage !== "object") return null;
  const u = Array.isArray(usage.iterations) && usage.iterations.length ? usage.iterations[usage.iterations.length - 1] : usage;
  const parts = [u.input_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens, u.output_tokens].map((n) => n ?? 0);
  if (!parts.every((n) => Number.isFinite(n) && n >= 0)) return null;
  return parts.reduce((a, b) => a + b, 0);
}

// The status line's stdin, as the integration kept it, for this session: { window, used, model }.
// `used` is null at the start of a session (current_usage null) and right after /compact (all
// four numbers 0): no reading, the transcript's postTokens stands then.
export function fromStatus(file, session) {
  const c = file?.claude;
  if (!c || c.session_id !== session) return null;
  const cw = c.context_window ?? {};
  const window = Number.isFinite(cw.context_window_size) && cw.context_window_size > 0 ? cw.context_window_size : null;
  const cu = cw.current_usage;
  let used = null;
  if (cu && typeof cu === "object") {
    const n = usageTokens(cu);
    if (n !== null && n > 0) used = n;
  }
  return { window, used, model: typeof c.model?.id === "string" ? c.model.id : null };
}

// The transcript's end, from the last line backwards: the last answer's usage of the main chain
// and the newest compaction. Lines of side chains and `<synthetic>` answers are skipped.
// undefined while neither is in the lines read (read more), unless the whole file was read.
export function findTranscript(lines, whole) {
  let usage = null, compaction = null;
  for (const l of fromEnd(lines)) {
    if (l.isSidechain === true) continue;
    if (!compaction && l.type === "system" && l.subtype === "compact_boundary") {
      const m = l.compactMetadata ?? {};
      const post = count(m.postTokens), at = time(l.timestamp);
      if (post !== null && at !== null) compaction = { pre: count(m.preTokens), post, at, trigger: m.trigger ?? null };
      continue;
    }
    if (!usage && l.type === "assistant" && l.message?.usage && l.message.model !== "<synthetic>") {
      const used = usageTokens(l.message.usage), at = time(l.timestamp);
      if (used !== null && at !== null) usage = { used, at, model: typeof l.message.model === "string" ? l.message.model : null };
    }
    if (usage && compaction) break;
  }
  if (!usage && !compaction && !whole) return undefined;
  return { usage, compaction };
}

// "1m" → 1000000, "200k" → 200000, "33k" → 33000, "749" → 749.
export function displayTokens(s) {
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*([kKmM]?)\s*$/.exec(s ?? "");
  if (!m) return null;
  const n = parseFloat(m[1]) * ({ k: 1e3, m: 1e6 }[m[2].toLowerCase()] ?? 1);
  return Math.round(n);
}

// A `/context` snapshot line: a meta user line whose text starts "## Context Usage", with
// `**Model:** <id>` and `**Tokens:** 48.1k / 1m (5%)`. Its window holds for this session and model;
// the used tokens were the moment's, so they don't count. Anything else: null.
export function parseSnapshot(line) {
  const l = parseJson(line);
  if (!l || l.type !== "user" || l.isMeta !== true || l.isSidechain === true) return null;
  const c = l.message?.content;
  const text = typeof c === "string" ? c : Array.isArray(c) ? c.find((p) => p?.type === "text")?.text : null;
  if (typeof text !== "string" || !text.startsWith(SNAPSHOT)) return null;
  const model = /\*\*Model:\*\*\s*(\S+)/.exec(text)?.[1] ?? null;
  const tok = /\*\*Tokens:\*\*\s*([0-9.]+[kKmM]?)\s*\/\s*([0-9.]+[kKmM]?)/.exec(text);
  const window = tok ? displayTokens(tok[2]) : null;
  const buffer = displayTokens(/\|\s*Autocompact buffer\s*\|\s*([0-9.]+[kKmM]?)\s*\|/.exec(text)?.[1]);
  const at = time(l.timestamp);
  if (!model || !window || window <= 0 || at === null) return null;
  return { model, window, buffer, at, session: l.sessionId ?? null };
}

export default {
  id: "claude",
  matches: ["claude", "claude-code"],
  // No number may also mean the status line file couldn't be read this time (readText gives null
  // for both): the reader reads again on every look then, without a backoff, but keeps no stats.
  keepsNoReading: false,

  // `memo`: the reader's per-terminal store (empty again for another terminal or program).
  async locate(agent, io, memo = {}) {
    const fg = await foreground(io, agent.terminal);
    if (!fg || fg === NO_ANSWER) return fg;
    const env = await processEnv(io, fg.pid, memo);
    // The process's environment names its terminal: another one's means another terminal's agent.
    if (env?.HC_TERMINAL_ID && env.HC_TERMINAL_ID !== agent.terminal) return null;
    const home = env?.CLAUDE_CONFIG_DIR || `${io.home}/.claude`;
    // The account for the plan limits (limits/store.js): the config folder, known before a session is.
    memo.account = `claude:${home}`;
    memo.home = home;
    // Whether this pane shows them is its own matter (`memo.noLimits`, which the reader heeds): the
    // account stays the other panes'. Kept from look to look for the same process: by its
    // environment here, by what its own session says below.
    if (memo.noLimits && memo.noLimits.pid !== fg.pid) memo.noLimits = null;
    const byEnv = offPlan(env);
    if (byEnv) memo.noLimits = { pid: fg.pid, env: true };
    else if (memo.noLimits?.env) memo.noLimits = null;
    // Each file of the source is observed once per look, here, its stat before its content
    // (locate.js, observeJsonFile): the reader takes these stats (`observed`) and asks none again,
    // so no stat can be newer than what was read. The session file, then the status line file,
    // whose content read() takes from the source.
    const sessionFile = await observeJsonFile(io, `${home}/sessions/${fg.pid}.json`);
    const session = checkSession(sessionFile.json, fg);
    if (!session) return null;
    const status = await observeTerminalFile(io, "claude", agent.terminal, fg.pid);
    // The status line's stdin carries the account's plan limits too: offered to the store all
    // headers share (`io.limits`; the file is this terminal's and this process's, so this account's).
    if (status.file && !byEnv) io.limits?.offer(memo.account, fromClaude(status.file));
    // This session's own word: it has answered (its API time counts) and its status has no limits,
    // so it doesn't run on the plan. Only the file of this very session says so; without it (not
    // written yet, not readable this time) what the session said before stands.
    if (!byEnv) {
      const own = status.file?.claude?.session_id === session.sessionId ? status.file.claude : null;
      const was = memo.noLimits?.session === session.sessionId;
      const none = own ? own.cost?.total_api_duration_ms > 0 && !(own.rate_limits && typeof own.rate_limits === "object") : was;
      memo.noLimits = none ? { pid: fg.pid, session: session.sessionId } : null;
    }
    const path = status.file?.claude?.session_id === session.sessionId ? status.file.claude.transcript_path : null;
    // The status line's path first, then the slug's: both asked on every look, the folder search
    // (held after a miss) only when neither is there.
    const given = typeof path === "string" && path.endsWith(`${session.sessionId}.jsonl`) ? path : null;
    const bySlug = typeof session.cwd === "string" ? `${home}/projects/${slug(session.cwd)}/${session.sessionId}.jsonl` : null;
    const candidates = [...new Set([given, bySlug].filter(Boolean))];
    // The transcript as { path, stat }: the stat that found it, taken before read() tails it.
    let transcript = null;
    for (const c of candidates) {
      const stat = await io.stat(c);
      if (stat) { transcript = { path: c, stat }; break; }
    }
    if (!transcript && candidates.length) transcript = await findBySession(io, home, session.sessionId, memo);
    const setting = COMPACT_ENV.filter((k) => env?.[k]).map((k) => `${k}=${env[k]}`);
    return {
      id: "claude",
      terminal: agent.terminal,
      pid: fg.pid,
      session: session.sessionId,
      started: Number.isFinite(session.startedAt) ? session.startedAt : null,
      status: { file: status.file, mtime: status.stat?.mtime ?? null },
      transcript: transcript?.path ?? null,
      setting: setting.length ? setting.join(" ") : null,
      files: [sessionFile.path, status.path, transcript?.path].filter(Boolean),
      observed: { [sessionFile.path]: sessionFile.stat, [status.path]: status.stat, ...(transcript && { [transcript.path]: transcript.stat }) },
    };
  },

  // The account's limits as the integration kept them for other terminals (the reader asks once
  // when Claude starts in a pane: a session before its first answer has none of its own). A file
  // counts when its session's transcript lies under this config folder: the same account. Files
  // of ended terminals count too, until the sweep removes them: the store keeps what is newest.
  async accountLimits(io, memo) {
    if (!memo.home || !memo.account) return;
    const dir = `${io.home}/.cache/herdr-roundup/context/claude`;
    const names = ((await io.list(dir)) ?? []).filter((n) => /^[A-Za-z0-9_-]+\.json$/.test(n)).slice(0, ACCOUNT_FILES);
    for (const name of names) {
      const f = parseJson(await io.readText(`${dir}/${name}`));
      const path = f?.claude?.transcript_path;
      if (f?.v !== 1 || typeof path !== "string" || !path.startsWith(`${memo.home}/projects/`)) continue;
      io.limits.offer(memo.account, fromClaude(f));
    }
  },

  // `memo` is the reader's per-terminal store: the snapshot search runs once per session and then
  // at most every few minutes, not on every answer.
  async read(source, io, memo = {}) {
    // The status line file as locate() saw it: not read again here.
    const statusFile = source.status?.file ?? null;
    const st = fromStatus(statusFile, source.session);
    const stAt = st ? Math.max(statusFile.at, source.status.mtime ?? 0) : null;
    const scan = source.transcript ? await scanTail(io, source.transcript, findTranscript) : null;
    const tr = scan && scan !== NO_READING ? scan : null;
    const failed = Boolean(source.transcript) && scan === null; // the tail failed: an error

    let window = st?.window ?? null, windowFrom = window ? "status-line" : null;
    if (!window && source.transcript) {
      const snap = await snapshot(source, io, memo);
      const model = st?.model ?? tr?.usage?.model ?? null;
      if (snap && snap.model === model && (source.started === null || snap.at >= source.started)) {
        window = snap.window;
        windowFrom = "snapshot";
      }
    }

    // Of the readings, the newest wins: the status line's, the last answer's, a compaction after it.
    const cands = [];
    if (st?.used != null) cands.push({ used: st.used, at: stAt, source: "status-line" });
    if (tr?.usage) cands.push({ used: tr.usage.used, at: tr.usage.at, source: "transcript" });
    if (tr?.compaction && (!tr.usage || tr.compaction.at > tr.usage.at)) cands.push({ used: tr.compaction.post, at: tr.compaction.at, source: "compaction" });
    // Nothing to show: read, no number (no answer yet, no transcript yet), unless the tail failed.
    if (!cands.length) return failed ? null : NO_READING;
    const best = cands.reduce((a, b) => (b.at > a.at ? b : a));

    const reading = {
      used: best.used,
      window,
      percent: window ? (best.used / window) * 100 : null,
      model: st?.model ?? tr?.usage?.model ?? null,
      at: best.at,
      source: best.source,
      exact: windowFrom !== "snapshot",
      windowRounded: windowFrom === "snapshot",
      session: source.session,
    };
    if (tr?.compaction) reading.compaction = tr.compaction;
    if (source.setting) reading.setting = source.setting;
    // An idle session above 200k is compacted about 55 min after its last answer (observed, not
    // published): when, if the reading is the last answer's and nothing compacted since.
    if (tr?.usage && best.source !== "compaction" && best.used > IDLE_COMPACT_FROM) reading.idleCompactAt = tr.usage.at + IDLE_COMPACT_MS;
    return reading;
  },
};

// The newest valid `/context` snapshot of the session among the last SNAPSHOT_CANDIDATES filtered
// lines, searched for once and then again only when the transcript has grown and a few minutes
// have passed.
async function snapshot(source, io, memo) {
  const now = io.now();
  const size = (await io.stat(source.transcript))?.size ?? null;
  const m = memo.snapshot;
  if (m && m.session === source.session && (m.size === size || now - m.checked < SNAPSHOT_EVERY_MS)) return m.value;
  const lines = await io.lastLinesWith(source.transcript, SNAPSHOT, SNAPSHOT_META, SNAPSHOT_MAX_LINE, SNAPSHOT_CANDIDATES);
  let value = null;
  for (const line of lines ?? []) {
    const s = parseSnapshot(line);
    if (s && (s.session === null || s.session === source.session)) { value = s; break; }
  }
  memo.snapshot = { session: source.session, size, checked: now, value };
  return value;
}

// Should the slug ever not match: each session id is in exactly one project folder.
// How long a search that found nothing holds before the next: a fresh session has no transcript
// yet, and the folders are many (one stat each).
export const FIND_AGAIN_MS = 2 * 60_000;
// The transcript by its session id in any project folder, when it isn't where the cwd's slug puts
// it, as { path, stat } with the stat that found it this time. Only one match counts. Kept per
// Claude home and session in `memo` (the path, not its stat): a hit while its file is there (gone:
// searched again at once), a miss for FIND_AGAIN_MS. The slug path and the status line's path are
// still asked on every look, before this, so a transcript written there is found at once; one
// written elsewhere can wait that long.
async function findBySession(io, home, id, memo = {}) {
  const found = memo.transcripts instanceof Map ? memo.transcripts : (memo.transcripts = new Map());
  const key = `${home}\n${id}`;
  const last = found.get(key);
  if (last?.path) {
    const stat = await io.stat(last.path);
    if (stat) return { path: last.path, stat };
    found.delete(key);
  } else if (last && io.now() - last.at < FIND_AGAIN_MS) return null;
  const dirs = await io.list(`${home}/projects`);
  const hits = [];
  for (let i = 0; Array.isArray(dirs) && i < dirs.length; i += 8) {
    const paths = dirs.slice(i, i + 8).map((d) => `${home}/projects/${d}/${id}.jsonl`);
    const stats = await Promise.all(paths.map((p) => io.stat(p)));
    paths.forEach((path, k) => { if (stats[k]) hits.push({ path, stat: stats[k] }); });
  }
  const hit = hits.length === 1 ? hits[0] : null;
  found.set(key, { path: hit?.path ?? null, at: io.now() });
  return hit;
}
