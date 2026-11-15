// The plan limits as two agents report them, each to the same form:
//   { at, plan, source, windows: [{ minutes, used, resetsAt }] }   (times in ms, shortest window first)
// or null: no limits in it (an API key has no windows, a session before its first answer has none
// yet). Pure. Both sources are the agents' own, undocumented beyond what is said here: anything
// that isn't a sane number gives no window, never a guess.
//
// `at` is about when the numbers are from, or null: unknown. Neither agent says when it measured:
// - Claude Code: the time its status line script saw an answer (`limitsAt`, see the script), not
//   the time the file was written: a mode change writes it again with the last answer's numbers.
// - Codex: the time of the `token_count` line. Codex writes that line with the limits it last
//   kept, and not only right after a response: after its pending tools (a question to the person
//   among them, so possibly long after), and after a compaction or another recount of the
//   context. So a line can be newer than its numbers. Taken as it is (limits/store.js says what
//   that costs); an "unchanged since" walk would make a busy session at a constant percent look old.

const window = (minutes, used, resetsAt) =>
  Number.isFinite(minutes) && minutes > 0 && Number.isFinite(used) && used >= 0 && Number.isFinite(resetsAt) && resetsAt > 0
    ? { minutes, used, resetsAt }
    : null;
const reading = (at, plan, source, windows) => {
  const ws = windows.filter(Boolean).sort((a, b) => a.minutes - b.minutes);
  return ws.length ? { at: Number.isFinite(at) && at > 0 ? at : null, plan, source, windows: ws } : null;
};

// Claude Code: the file its status line integration keeps for a terminal,
// { at, limitsAt, claude: <stdin> }. The stdin's `rate_limits` has `five_hour` and `seven_day`,
// each { used_percentage, resets_at } (seconds); only for a subscription, only after a session's
// first answer, and without a window that has expired. It names no plan. A file of the script
// before `limitsAt`, or one whose time the script couldn't tell, gives a reading without a time.
export function fromClaude(file) {
  const rl = file?.claude?.rate_limits;
  if (!rl || typeof rl !== "object") return null;
  const w = (v, minutes) => (v && typeof v === "object" ? window(minutes, v.used_percentage, v.resets_at * 1000) : null);
  return reading(file.limitsAt, null, "status-line", [w(rl.five_hour, 300), w(rl.seven_day, 10080)]);
}

// Codex has written a window's length a minute off (299, 10079, 10081: its own tests name them,
// and its own labels allow for it): a length within a minute of a known one is that one, so the
// window keeps its name and its place in the store. Any other length stays as it is.
export const KNOWN_MINUTES = [300, 1440, 10080];
export const snapMinutes = (m) => KNOWN_MINUTES.find((k) => Math.abs(m - k) <= 1) ?? m;

// The limits Codex counts a plan's ordinary use against: `limit_id` "codex", or none (older
// lines). Another id is another bucket (a model or a feature metered by itself): it is not the
// account's pool, and which bucket a pane's model draws on its rollout doesn't say.
const defaultPool = (rl) => rl.limit_id == null || rl.limit_id === "codex";

// Codex: a `token_count` line of its rollout file. `payload.rate_limits` has `primary` and
// `secondary`, each { used_percent, window_minutes, resets_at } (seconds; older versions
// `resets_in_seconds` from the line's time), and `plan_type`. Null where Codex has none (an API
// key; a session it has no snapshot for yet), and for another bucket than the default pool.
export function fromCodex(line) {
  if (line?.type !== "event_msg" || line.payload?.type !== "token_count") return null;
  const rl = line.payload.rate_limits;
  if (!rl || typeof rl !== "object" || !defaultPool(rl)) return null;
  const at = Date.parse(line.timestamp ?? "");
  const w = (v) => {
    if (!v || typeof v !== "object") return null;
    const resetsAt = Number.isFinite(v.resets_at) ? v.resets_at * 1000 : Number.isFinite(v.resets_in_seconds) ? at + v.resets_in_seconds * 1000 : null;
    return window(Number.isFinite(v.window_minutes) ? snapMinutes(v.window_minutes) : v.window_minutes, v.used_percent, resetsAt);
  };
  return reading(at, typeof rl.plan_type === "string" && rl.plan_type ? rl.plan_type : null, "rollout", [w(rl.primary), w(rl.secondary)]);
}

// How many token_count events the walk below looks at: the newest ones say what the session has.
export const CODEX_EVENTS = 8;

// The limits at the end of a rollout: `lines` are its raw lines, oldest first (tail.js,
// completeLines). → { events, reading }: how many token_count events were looked at (from the
// end, at most CODEX_EVENTS), and the newest default-pool limits among them, or null.
// - Only lines that name a token_count are parsed: the others (answers, tool output) are the bulk
//   of a tail, and say nothing here.
// - A newer event without limits, or with another bucket's, is passed over: Codex keeps one
//   snapshot for all buckets, so one such event doesn't say the session is off the pool.
// - `events > 0` without a reading: this session reports no default-pool limits (an API key, a
//   model on a bucket of its own). `events === 0`: nothing to go by (no answer yet, or none in
//   this end of the file). The cut at CODEX_EVENTS means limits older than that count as none.
export function codexLimits(lines) {
  let events = 0;
  for (let i = lines.length - 1; i >= 0 && events < CODEX_EVENTS; i--) {
    const l = lines[i];
    if (!l || !l.includes('"token_count"')) continue;
    let v;
    try { v = JSON.parse(l); } catch { continue; }
    if (v?.type !== "event_msg" || v.payload?.type !== "token_count") continue;
    events++;
    const r = fromCodex(v);
    if (r) return { events, reading: r };
  }
  return { events, reading: null };
}
