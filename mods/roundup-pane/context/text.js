// What the context meter writes: token counts, the percent, how tight it is, and how much of the
// meter fits a header of a given width. Pure, so tests/context-text.test.mjs runs it in node.

// 940, 9.4k, 97.6k, 200k, 475k, 1M, 1.2M: one decimal below 100k and below 10M, none above,
// a trailing ".0" left out.
export function tokens(n) {
  if (!Number.isFinite(n) || n < 0) return "";
  const one = (v, unit) => `${(Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "")}${unit}`;
  if (n < 1000) return String(Math.round(n));
  if (n < 100_000) return one(n / 1000, "k");
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  if (n < 10_000_000) return one(n / 1_000_000, "M");
  return `${Math.round(n / 1_000_000)}M`;
}

// The share of the window in use, 0..100 and more (a window can be overrun), or null.
export function share(reading) {
  if (!reading) return null;
  if (Number.isFinite(reading.used) && Number.isFinite(reading.window) && reading.window > 0) return (reading.used / reading.window) * 100;
  return Number.isFinite(reading.percent) ? reading.percent : null;
}

// "49%"; above 0 and below 1 "<1%", so a used window never reads as empty.
export function percentText(p) {
  if (!Number.isFinite(p)) return "";
  if (p > 0 && p < 1) return "<1%";
  return `${Math.round(p)}%`;
}

export const TIGHT = 65;
export const CRITICAL = 80;

// "ok" below 65 %, "tight" from 65, "critical" from 80 (the rounded percent the person reads).
export function severity(p) {
  if (!Number.isFinite(p)) return "ok";
  const r = Math.round(p);
  return r >= CRITICAL ? "critical" : r >= TIGHT ? "tight" : "ok";
}

// How much of the meter a header of this width shows: "full" (bar, percent, tokens), "bar" (bar
// and percent), "percent", or "none". The tokens go first, then the bar; the percent stays longest.
// Widths are the whole header's, in the mod's px (headerTier converts on_size_change's).
export const TIERS = { full: 560, bar: 420, percent: 300 };
// With the plan limits beside the context (limits/) the pill is wider, and there is a step more:
// "full" (all), "bar" (without the context's tokens), "narrow" (the context's bar and percent, and
// only the tighter limit, from 70 %), "percent" (the context's percent, a mark for a limit from 90 %).
// Set so the folder keeps about the room it has at the context's own thresholds.
export const LIMIT_TIERS = { full: 660, bar: 540, narrow: 430, percent: 300 };
export function tier(width, limits = false) {
  if (!Number.isFinite(width)) return "full"; // before the first layout: as wide as it can be
  const at = limits ? LIMIT_TIERS : TIERS;
  if (width >= at.full) return "full";
  if (width >= at.bar) return "bar";
  if (limits && width >= at.narrow) return "narrow";
  if (width >= at.percent) return "percent";
  return "none";
}
// The tier of a width as on_size_change measures it: in the window's pixels, which Herdr's zoom
// makes larger than the mod's (Herdr's picker divides the same way). No width yet stays "full".
export function headerTier(width, zoom, limits = false) {
  return tier(Number.isFinite(width) ? width / (Number(zoom) || 1) : null, limits);
}

// The meter's words beside the bar: "97.6k / 200k", or tokens alone without a window ("265k").
export function usedText(reading) {
  if (!reading || !Number.isFinite(reading.used)) return "";
  return Number.isFinite(reading.window) && reading.window > 0 ? `${tokens(reading.used)} / ${tokens(reading.window)}` : tokens(reading.used);
}

// A clock time for the hover card, in the machine's own zone: "14:32".
export function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
