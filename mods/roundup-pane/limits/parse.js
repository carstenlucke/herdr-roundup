// The plan limits as two agents report them, each to the same form:
//   { at, plan, source, windows: [{ minutes, used, resetsAt }] }   (times in ms, shortest window first)
// or null: no limits in it (an API key has no windows, a session before its first answer has none
// yet). Pure. Both sources are the agents' own, undocumented beyond what is said here: anything
// that isn't a sane number gives no window, never a guess.

const window = (minutes, used, resetsAt) =>
  Number.isFinite(minutes) && minutes > 0 && Number.isFinite(used) && used >= 0 && Number.isFinite(resetsAt) && resetsAt > 0
    ? { minutes, used, resetsAt }
    : null;
const reading = (at, plan, source, windows) => {
  const ws = windows.filter(Boolean).sort((a, b) => a.minutes - b.minutes);
  return Number.isFinite(at) && ws.length ? { at, plan, source, windows: ws } : null;
};

// Claude Code: the file its status line integration keeps for a terminal, { at, claude: <stdin> }.
// The stdin's `rate_limits` has `five_hour` and `seven_day`, each { used_percentage, resets_at }
// (seconds); only for a subscription, only after a session's first answer, and without a window
// that has expired. It names no plan.
export function fromClaude(file) {
  const rl = file?.claude?.rate_limits;
  if (!rl || typeof rl !== "object") return null;
  const w = (v, minutes) => (v && typeof v === "object" ? window(minutes, v.used_percentage, v.resets_at * 1000) : null);
  return reading(file.at, null, "status-line", [w(rl.five_hour, 300), w(rl.seven_day, 10080)]);
}

// Codex: a `token_count` line of its rollout file. `payload.rate_limits` has `primary` and
// `secondary`, each { used_percent, window_minutes, resets_at } (seconds; older versions
// `resets_in_seconds` from the line's time), and `plan_type`. Null with an API key.
export function fromCodex(line) {
  if (line?.type !== "event_msg" || line.payload?.type !== "token_count") return null;
  const rl = line.payload.rate_limits;
  if (!rl || typeof rl !== "object") return null;
  const at = Date.parse(line.timestamp ?? "");
  const w = (v) => {
    if (!v || typeof v !== "object") return null;
    const resetsAt = Number.isFinite(v.resets_at) ? v.resets_at * 1000 : Number.isFinite(v.resets_in_seconds) ? at + v.resets_in_seconds * 1000 : null;
    return window(v.window_minutes, v.used_percent, resetsAt);
  };
  return reading(at, typeof rl.plan_type === "string" && rl.plan_type ? rl.plan_type : null, "rollout", [w(rl.primary), w(rl.secondary)]);
}

// The newest limits among parsed lines given newest first (tail.js, fromEnd), or null.
export function newestCodex(linesFromEnd) {
  for (const l of linesFromEnd) {
    const r = fromCodex(l);
    if (r) return r;
  }
  return null;
}
