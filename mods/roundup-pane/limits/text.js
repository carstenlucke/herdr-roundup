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
// it lasts, below PACE_FROM, once reached (the rounded 100 % severity() reads, which the pill and
// the card show), or after its reset. The pace is the window's own (used by the time gone at the
// reading), counted on from the reading: none for a reading without a time.
export function pace(w, now) {
  if (!Number.isFinite(w.at) || passed(w, now) || !(w.used >= PACE_FROM) || severity(w.used) === "reached") return null;
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

// A time ahead: within a day "in 2h 02m", from a day on "Tue 08:48", but on today's weekday (six
// days and more ahead: a weekly reset soon after its start) "in 6d 22h", which "Tue 08:48" on a
// Tuesday would read as today.
export function when(ms, now) {
  if (ms - now < 1440 * MIN || new Date(ms).getDay() === new Date(now).getDay()) return `in ${duration(ms - now)}`;
  return dayClock(ms);
}
// A time ahead as a clock: within a day "20:35", from a day on "Tue 08:48". Only for the pace note
// ("runs out about …"), which with a 5-hour or weekly window never lies on today's weekday a week
// ahead: a pace needs half the window used, and that much within the week's first day runs out
// within about two. A window that could would need when()'s rule, in words that fit the note.
export const whenClock = (ms, now) => (ms - now < 1440 * MIN ? clock(ms) : dayClock(ms));

// A window read more than 15 minutes ago, or nobody knows when, is old: usage elsewhere may have
// moved it. A reading is as old as its oldest window that hasn't reset (`asOf`): it is shown dimmed
// as a whole. A window that has reset shows no number ("–"), so its age says nothing about what is
// shown; only when all have reset does their age count.
export const staleWindow = (w, now) => !Number.isFinite(w.at) || now - w.at > STALE_MS;
const counted = (reading, now) => {
  const live = reading.windows.filter((w) => !passed(w, now));
  return live.length ? live : reading.windows;
};
export const stale = (reading, now) => Boolean(reading?.windows?.length) && counted(reading, now).some((w) => staleWindow(w, now));
// When the reading is from: its oldest window's time among those counted (above), null as soon as
// one of those has no time (or there are no windows).
export function asOf(reading, now) {
  if (!reading?.windows?.length) return null;
  const ws = counted(reading, now);
  return ws.every((w) => Number.isFinite(w.at)) ? Math.min(...ws.map((w) => w.at)) : null;
}

// What of the limits the pill shows, as one string: the header draws again when it changes (a
// reading going stale, a window passing its reset), and each minute while `live` (hovered: the
// card's times).
export function shownState(reading, now, live = false) {
  if (!reading) return "";
  return [reading.rev ?? "", stale(reading, now) ? "old" : "", ...reading.windows.map((w) => (passed(w, now) ? "–" : "")), live ? Math.floor(now / MIN) : ""].join("|");
}
