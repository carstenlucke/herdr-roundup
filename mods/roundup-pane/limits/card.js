// What the hover card's section "Limits" says, below the context: per window a row (its name, the
// percent, when it resets) and a bar with a tick for the share of the window's time that has gone;
// notes below. Pure, so tests/limits.test.mjs runs it.

import { clock, percentText } from "../context/text.js";
import { severity, names, passed, elapsed, pace, duration, when, whenClock, stale, asOf } from "./text.js";

// → { plan, age, old, rows: [{ label, value, sev, extra, fill, tick }], notes: [{ text, kind }] },
// or null without a reading. `fill` and `tick` are 0..100 (`tick` null for a window that has reset);
// a note's `kind` is "warn" (the pace) or "plain". `agent` is the program's name for the notes.
// A reading whose time is unknown (limits/parse.js) is old, says so instead of an age, and has no pace.
export function limitsModel(reading, now, { agent = "the agent" } = {}) {
  if (!reading?.windows?.length) return null;
  const old = stale(reading, now);
  const rows = [], notes = [];
  for (const w of reading.windows) {
    const { label } = names(w.minutes);
    if (passed(w, now)) {
      rows.push({ label, value: "–", sev: "ok", extra: "has reset since", fill: 0, tick: null });
      continue;
    }
    const sev = severity(w.used);
    rows.push({ label, value: percentText(w.used), sev, extra: `resets ${when(w.resetsAt, now)}`, fill: Math.min(100, w.used), tick: elapsed(w, now) });
    const left = pace(w, now);
    if (left !== null) notes.push({ kind: "warn", text: `At this pace the ${label.toLowerCase()} limit runs out about ${whenClock(now + left, now)}, ${duration(w.resetsAt - now - left)} before it resets` });
    if (sev === "reached") notes.push({ kind: "plain", text: `${label} limit reached: ${agent} answers again ${when(w.resetsAt, now)}` });
  }
  // As old as its oldest window that hasn't reset, null as soon as one's time is unknown (asOf).
  const at = asOf(reading, now);
  if (old) notes.push({ kind: "plain", text: at === null ? `As ${agent} last reported them: how old shows with its next answer` : `Read with the last answer of ${agent} in this window` });
  return { plan: reading.plan ?? null, age: at === null ? "age unknown" : old ? `${duration(now - at)} old` : `as of ${clock(at)}`, old, rows, notes };
}
