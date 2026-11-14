// Codex: the raw numbers of its rollout file, `last_token_usage.total_tokens` of
// `model_context_window`. The rollout is found one of two ways, never by folder or recency:
//
// - By the thread id in the terminal title (the integration: `tui.terminal_title` with
//   "thread-id"). Codex cuts it to 29 characters + "...", but the id is a UUIDv7: its first 12 hex
//   digits are the thread's creation time, which is the local time in the rollout's folder and name
//   (sessions/YYYY/MM/DD/rollout-YYYY-MM-DDTHH-MM-SS-<id>.jsonl). Exactly one file must match. No
//   file there (CODEX_HOME not as read: cut at a space, or no `ps -E` on Linux): the open files
//   below, but only a user rollout whose id starts with the title's; two matches there: nothing.
// - Direct mode (`codex --no-daemon`, as Herdr starts it): the one user rollout the process or one
//   of its descendants holds open (lsof), asked on every look: `/new` or a resume opens another
//   one in the same process. A shared daemon's files lie outside the process tree.

import { NO_ANSWER, foreground, processEnv, byTitle, titleIds, byOpenFile, uuid7Time, localParts, parseJson } from "../locate.js";
import { scanTail, fromEnd, NO_READING } from "../tail.js";

const ROLLOUT = /\/rollout-[^/]*\.jsonl$/;
const DAY = 24 * 60 * 60 * 1000;
const time = (iso) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) ? t : null;
};

// The thread id at the end of a rollout's name: rollout-<stamp>-<36 characters>.jsonl.
export const rolloutId = (name) => (name.startsWith("rollout-") && name.endsWith(".jsonl") ? name.slice(0, -6).slice(-36).toLowerCase() : null);

export const AMBIGUOUS = Symbol("ambiguous");

// The one rollout whose id starts with `prefix`, looked for in the folder of the id's local day
// (and the days beside it, should the zone have moved). None: null; more than one: AMBIGUOUS.
// A thread's rollout never moves: the last hit is kept in `memo` (the reader's per-terminal store)
// per home and exact prefix and used while its file is there (one stat instead of listing the
// folders); gone, it is searched for again at once. A miss or AMBIGUOUS is never kept, so a file
// written meanwhile counts on the next look; a duplicate written while the kept file is there
// isn't noticed (as Claude's findBySession: a UUIDv7 prefix of 29 characters doesn't repeat).
export async function rolloutByPrefix(io, home, prefix, memo = {}) {
  const ms = uuid7Time(prefix);
  if (ms === null) return null;
  const key = `${home}\n${prefix}`;
  if (memo.rollout?.key === key) {
    if (await io.stat(memo.rollout.path)) return memo.rollout.path;
    memo.rollout = null;
  }
  for (const at of [ms, ms - DAY, ms + DAY]) {
    const { y, mo, d } = localParts(at);
    const dir = `${home}/sessions/${y}/${mo}/${d}`;
    const names = await io.list(dir);
    if (!Array.isArray(names)) continue;
    const hits = names.filter((n) => rolloutId(n)?.startsWith(prefix));
    if (hits.length > 1) return AMBIGUOUS;
    if (hits.length === 1) {
      memo.rollout = { key, path: `${dir}/${hits[0]}` };
      return memo.rollout.path;
    }
  }
  return null;
}

// A rollout's first line, session_meta: whose thread it is ("user", "guardian_review", "subagent").
export function threadSource(head) {
  if (typeof head !== "string") return null;
  const nl = head.indexOf("\n");
  const first = parseJson(nl < 0 ? head : head.slice(0, nl));
  if (first?.type !== "session_meta") return null;
  return first.payload?.thread_source ?? null;
}

// From the end of a rollout: the last token_count with info, unless a compaction or a change of
// model came after it (then no reading until the next one). The model is the last turn_context's.
export function findRollout(lines, whole) {
  let compactedAfter = false, laterModel = null, tc = null, tcModel = null;
  for (const l of fromEnd(lines)) {
    const p = l.payload ?? {};
    if (!tc) {
      if (l.type === "compacted" || p.type === "context_compacted") compactedAfter = true;
      else if (l.type === "turn_context") { if (laterModel === null && typeof p.model === "string") laterModel = p.model; }
      else if (l.type === "event_msg" && p.type === "token_count" && p.info) {
        const used = p.info.last_token_usage?.total_tokens, window = p.info.model_context_window, at = time(l.timestamp);
        if (Number.isFinite(used) && used >= 0 && Number.isFinite(window) && window > 0 && at !== null) tc = { used, window, at };
      }
      continue;
    }
    if (l.type === "turn_context" && typeof p.model === "string") { tcModel = p.model; break; }
  }
  if (!tc) return compactedAfter || whole ? null : undefined;
  if (compactedAfter) return null;
  if (tcModel && laterModel && tcModel !== laterModel) return null;
  return { ...tc, model: laterModel ?? tcModel };
}

export default {
  id: "codex",
  matches: ["codex"],
  // A rollout read without a number (a compaction or model change after the last count) stays
  // so until the file changes: the reader keeps its stats then, and reads it again only then.
  keepsNoReading: true,

  // After the read, from the same `hc get` that checks the pid: a title that now names another
  // thread (`/new`, a resume in the same process), or two ids, drops the late answer. A title
  // without an id (starting, another title item for a moment) says nothing: the answer stands.
  // The title's id is checked against the rollout's whole id (`thread`), not the title's earlier
  // cut: the same thread shown longer or shorter stands, a longer id with the same start doesn't.
  stillSame(source, fg) {
    if (!source.titlePrefix) return true;
    const ids = titleIds(fg.title);
    return ids.length === 0 || (ids.length === 1 && Boolean(source.thread?.startsWith(ids[0])));
  },

  // `memo`: the reader's per-terminal store (empty again for another terminal or program).
  async locate(agent, io, memo = {}) {
    const fg = await foreground(io, agent.terminal);
    if (!fg || fg === NO_ANSWER) return fg;
    const env = await processEnv(io, fg.pid, memo);
    if (env?.HC_TERMINAL_ID && env.HC_TERMINAL_ID !== agent.terminal) return null;
    const home = env?.CODEX_HOME || `${io.home}/.codex`;
    const base = { id: "codex", terminal: agent.terminal, pid: fg.pid };
    // A thread id in the title names the thread: then only its rollout counts. `titlePrefix` is
    // what the title said, for the reader's check after the read (the title still says it).
    const prefix = byTitle(fg.title);
    if (prefix) {
      const file = await rolloutByPrefix(io, home, prefix, memo);
      if (file === AMBIGUOUS) return null;
      // The thread: the rollout's whole id, however the title cut it.
      if (file) return { ...base, file, thread: rolloutId(file.slice(file.lastIndexOf("/") + 1)), titlePrefix: prefix, how: "title", files: [file] };
    }
    const open = await byOpenFile(io, fg.pid, ROLLOUT);
    // Whose thread a rollout is never changes (its first line): kept per path while the process
    // holds it open and the file is there, so a look doesn't read 256 KiB of each again. Only an
    // answer is kept: a failed head or a first line still being written is asked again next time.
    // A failed lsof (null) proves nothing and forgets nothing; an empty list forgets all.
    const known = memo.threadSources instanceof Map ? memo.threadSources : (memo.threadSources = new Map());
    if (Array.isArray(open)) for (const f of [...known.keys()]) if (!open.includes(f)) known.delete(f);
    if (!open?.length) return null;
    // With a title, only its thread's rollouts: two open user threads can be told apart by it.
    const name = (f) => f.slice(f.lastIndexOf("/") + 1);
    const candidates = prefix ? open.filter((f) => rolloutId(name(f))?.startsWith(prefix)) : open;
    const users = [];
    for (const f of candidates) {
      let source = known.get(f);
      if (source !== undefined && !(await io.stat(f))) { known.delete(f); source = undefined; }
      if (source === undefined) {
        source = threadSource(await io.head(f, 256 * 1024));
        if (source !== null) known.set(f, source);
      }
      if (source === "user") users.push(f);
    }
    if (users.length !== 1) return null; // none, or two user threads in one process: ambiguous
    const thread = rolloutId(name(users[0]));
    return { ...base, file: users[0], thread, titlePrefix: prefix, how: prefix ? "title+open-file" : "open-file", files: [users[0]] };
  },

  async read(source, io) {
    const r = await scanTail(io, source.file, findRollout);
    if (r === NO_READING) return NO_READING;
    if (!r) return null;
    return {
      used: r.used,
      window: r.window,
      percent: (r.used / r.window) * 100,
      model: r.model,
      at: r.at,
      source: "rollout",
      exact: true,
      session: source.thread,
    };
  },
};
