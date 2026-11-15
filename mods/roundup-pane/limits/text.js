// What the limit part of the meter writes: how tight a window is, its names, whether it has reset
// since the reading, the pace, and the times. Pure, so tests/limits.test.mjs runs it in node.
//
// A window: { minutes, used, resetsAt, at }: its length, the percent used (0..100 and more), when
// it resets and about when that is from (ms since the epoch; `at` null: unknown, limits/parse.js).

import { clock } from "../context/text.js";

export const TIGHT = 70;
export const CRITICAL = 90;
export const STALE_MS = 15 * 60_000;
// The pace note waits for half the window: an early burst says little about the rest.
export const PACE_FROM = 50;

const MIN = 60_000;

// "ok" below 70 %, "tight" from 70, "critical" from 90, "reached" at 100 (the rounded percent the
// person reads).
export function severity(used) {
  if (!Number.isFinite(used)) return "ok";
  const r = Math.round(used);
  return r >= 100 ? "reached" : r >= CRITICAL ? "critical" : r >= TIGHT ? "tight" : "ok";
}

// A window's names from its length: 300 → 5h / "5-hour", 10080 → wk / "Weekly", 1440 → 1d /
// "Daily", else whole days, hours or minutes.
export function names(minutes) {
  if (minutes === 10080) return { short: "wk", label: "Weekly" };
  if (minutes === 1440) return { short: "1d", label: "Daily" };
  if (minutes % 1440 === 0) return { short: `${minutes / 1440}d`, label: `${minutes / 1440}-day` };
  if (minutes % 60 === 0) return { short: `${minutes / 60}h`, label: `${minutes / 60}-hour` };
  return { short: `${minutes}m`, label: `${minutes}-minute` };
}

// The window has reset since it was read: what it says now is unknown, not its old number.
export const passed = (w, now) => w.resetsAt <= now;

// The tightest window that hasn't reset, or null.
export function worst(windows, now) {
  let best = null;
  for (const w of windows ?? []) if (!passed(w, now) && (!best || w.used > best.used)) best = w;
  return best;
}

// The share of the window's time that has gone, 0..100.
export function elapsed(w, now) {
  const length = w.minutes * MIN;
  return Math.max(0, Math.min(100, ((now - (w.resetsAt - length)) / length) * 100));
}

// At the pace so far the window is empty before it resets: in how many ms from `now`. Null when
// it lasts, below PACE_FROM, at 100 %, or after its reset. The pace is the window's own (used by
// the time gone at the reading), counted on from the reading: none for a reading without a time.
export function pace(w, now) {
  if (!Number.isFinite(w.at) || passed(w, now) || !(w.used >= PACE_FROM) || w.used >= 100) return null;
  const gone = w.at - (w.resetsAt - w.minutes * MIN);
  if (!(gone > 0)) return null;
  const emptyAt = w.at + ((100 - w.used) / w.used) * gone;
  return emptyAt < w.resetsAt ? Math.max(0, emptyAt - now) : null;
}

// "<1m", "47m", "2h 02m", "1d 13h".
export function duration(ms) {
  if (!Number.isFinite(ms) || ms < MIN) return "<1m";
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// "Tue 08:48", in the machine's own zone.
export const dayClock = (ms) => `${DAYS[new Date(ms).getDay()]} ${clock(ms)}`;

// A time ahead: within a day "in 2h 02m", from a day on "Tue 08:48".
export function when(ms, now) {
  return ms - now < 1440 * MIN ? `in ${duration(ms - now)}` : dayClock(ms);
}
// A time ahead as a clock: within a day "20:35", from a day on "Tue 08:48".
export const whenClock = (ms, now) => (ms - now < 1440 * MIN ? clock(ms) : dayClock(ms));

// A window read more than 15 minutes ago, or nobody knows when, is old: usage elsewhere may have
// moved it. A reading is as old as its oldest window: it is shown dimmed as a whole.
export const staleWindow = (w, now) => !Number.isFinite(w.at) || now - w.at > STALE_MS;
export const stale = (reading, now) => Boolean(reading?.windows?.length) && reading.windows.some((w) => staleWindow(w, now));
// When the reading is from: its oldest window's time, or null as soon as one is unknown.
export function readAt(reading) {
  const ats = (reading?.windows ?? []).map((w) => (Number.isFinite(w.at) ? w.at : null));
  return !ats.length || ats.includes(null) ? null : Math.min(...ats);
}

// What of the limits the pill shows, as one string: the header draws again when it changes (a
// reading going stale, a window passing its reset), and each minute while `live` (hovered: the
// card's times).
export function shownState(reading, now, live = false) {
  if (!reading) return "";
  return [reading.rev ?? "", stale(reading, now) ? "old" : "", ...reading.windows.map((w) => (passed(w, now) ? "–" : "")), live ? Math.floor(now / MIN) : ""].join("|");
}
