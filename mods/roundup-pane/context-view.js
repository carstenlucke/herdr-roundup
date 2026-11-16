// The meter in the pane header: a framed pill holding the agent's context (a bar of two divs: the
// track in the bar's color at low alpha, the fill on top; the percent and the tokens) and, after a
// divider, the plan limits of the account the agent runs on (limits/); a hover card with the
// details. No click.
//
// - Context: below 65 % the bar is `accent` and the number `muted`; from 65 % `working`, from 80 %
//   `blocked`, the number `foreground` with an alert mark before it, so the level never rests on
//   hue alone.
// - Limits: a window is its short name and its percent, without a bar (they are the account's, the
//   same in every pane of the agent, so quieter than the pane's own number). From 70 % the number
//   is `foreground` with the alert mark in `working`, from 90 % in `blocked`, at 100 % a "no entry"
//   mark. A reading older than 15 minutes is dimmed; a window that has reset since reads "–".
// - Narrow headers drop the context's tokens, then the looser limit (the tighter one stays from
//   70 %), then the context's bar and the limits but for a mark from 90 %; the context's percent
//   stays longest (context/text.js tier).
// - Tokens alone (Claude without a known window): no bar, no percent. A share alone (pi's footer):
//   bar and percent, no tokens. Limits without a context reading: the limits alone.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { share, percentText, severity, usedText, tokens, headerTier } from "./context/text.js";
import { cardModel } from "./context/card.js";
import { severity as limitSeverity, names, passed, worst, stale, CRITICAL } from "./limits/text.js";
import { limitsModel } from "./limits/card.js";

export const BAR_W = 30;
export const BAR_H = 4;
export const PILL_H = 20;
export const PCT_MIN_W = 26;
export const STALE_OPACITY = 0.45;

export function barColor(t, sev) {
  return sev === "critical" ? t.blocked : sev === "tight" ? t.working : t.accent;
}
// A limit's mark: none below 70 %, the alert from 70 % (`working`) and 90 % (`blocked`), "no entry"
// at 100 %.
const limitColor = (t, sev) => (sev === "tight" ? t.working : t.blocked);
const limitMark = (sev) => (sev === "reached" ? "mods/roundup-pane/ban.svg" : "mods/roundup-pane/alert.svg");

// The share of a window the bar shows, or null: a reading with a window (a percent alone draws no
// bar). 0 is a share.
function windowShare(reading) {
  if (!reading || !(Number.isFinite(reading.window) && reading.window > 0)) return null;
  const p = share(reading);
  return Number.isFinite(p) ? p : null;
}

// Whether a reading gives the pill a context part: a share of a window, or tokens alone. The
// header picks its tiers by it (main.js): limits beside a context part need the wider ones.
export function hasContext(reading) {
  return windowShare(reading) !== null || Number.isFinite(reading?.used);
}

// The context's part of the pill, as its children, or null: nothing of the context to show.
function contextPart(t, reading, tier) {
  const p = windowShare(reading);
  if (p === null) return Number.isFinite(reading?.used) ? [div().flex_none().text_color(t.muted).child(tokens(reading.used))] : null;
  const sev = severity(p);
  const color = barColor(t, sev);
  const loud = sev !== "ok";
  const kids = [];
  if (tier !== "percent") {
    const fill = Math.max(1, Math.round((BAR_W * Math.min(p, 100)) / 100));
    kids.push(div().flex_none().w(BAR_W).h(BAR_H).rounded(2).bg(color + "40")
      .child(div().h(BAR_H).w(fill).rounded(2).bg(color)));
  }
  // The number with its mark keeps a least width, so 9 % → 10 % doesn't move the tokens.
  const num = h_flex().flex_none().min_w(PCT_MIN_W).gap(3).items_center();
  if (loud) num.child(svg("mods/roundup-pane/alert.svg").size(10).flex_none().text_color(color));
  num.child(div().flex_none().text_color(loud ? t.foreground : t.muted).when(loud, (e) => e.font_medium())
    .child(`${reading.windowRounded ? "~" : ""}${percentText(p)}`));
  kids.push(num);
  // No tokens beside a share without them (pi's footer): bar and percent only.
  const words = usedText(reading);
  if (tier === "full" && words) kids.push(div().flex_none().text_color(t.dim).child(words));
  return kids;
}

// One window in the pill: "5h 78%", the mark before a number from 70 %. The number with its mark
// keeps the context number's least width, so 9 % → 10 % doesn't move what follows (a mark and
// "100%" may still be wider).
function limitWindow(t, w, now) {
  const gone = passed(w, now);
  const sev = gone ? "ok" : limitSeverity(w.used);
  const loud = sev !== "ok";
  const num = h_flex().flex_none().min_w(PCT_MIN_W).gap(3).items_center();
  if (loud) num.child(svg(limitMark(sev)).size(10).flex_none().text_color(limitColor(t, sev)));
  num.child(div().flex_none().text_color(loud ? t.foreground : t.muted).when(loud, (e) => e.font_medium()).child(gone ? "–" : percentText(w.used)));
  return h_flex().flex_none().gap(4).items_center()
    .child(div().flex_none().text_size(10.5).text_color(t.dim).child(names(w.minutes).short))
    .child(num);
}

// What the limits' part of the pill shows at a tier: { windows } (each as "5h 78%"), { mark } (the
// tighter window as a mark and its short name), or null: no reading, or nothing of it fits.
// `alone`: no context part beside it (a session before its first answer). The tier is then the
// context's own (TIERS, no "narrow"), and its narrowest step still has room for one window: the
// tighter one, whatever it stands at, or the first when all have reset, so the pill and its card
// are there. Beside a context part: all from "bar" (where one hasn't reset: windows that all have
// would draw only "–", and the context would give its tokens for them), the tighter from 70 % at
// "narrow", a mark from 90 % at "percent" (the rounded percent, as severity() reads it).
export function limitChoice(limits, tier, now, alone = false) {
  if (!limits?.windows?.length || tier === "none") return null;
  const w = worst(limits.windows, now);
  if (!alone && !w) return null;
  if (tier === "full" || tier === "bar") return { windows: limits.windows };
  if (alone) return { windows: [w ?? limits.windows[0]] };
  if (tier === "narrow" && limitSeverity(w.used) !== "ok") return { windows: [w] };
  if (tier === "percent" && Math.round(w.used) >= CRITICAL) return { mark: w };
  return null;
}

// What a header of this width draws: { context, limits }, the context part's tier and the limit
// part's (null: none in the pill; the card still has them). Limits beside a context part take the
// wider thresholds (LIMIT_TIERS) only where they draw something there: where the tighter limit is
// too low for the narrow steps, the context keeps its own tiers (TIERS) and the pill no limits, so
// its bar doesn't go for nothing. Limits alone take the context's own tiers (limitChoice).
// `width` as on_size_change measures it, `zoom` Herdr's (headerTier).
export function headerTiers(width, zoom, { limits = null, reading = null, now = Date.now() } = {}) {
  const own = headerTier(width, zoom, false);
  if (!limits?.windows?.length) return { context: own, limits: null };
  if (!hasContext(reading)) return { context: own, limits: limitChoice(limits, own, now, true) ? own : null };
  const wide = headerTier(width, zoom, true);
  return limitChoice(limits, wide, now) ? { context: wide, limits: wide } : { context: own, limits: null };
}
export const sameTiers = (a, b) => a?.context === b?.context && a?.limits === b?.limits;

// The limits' part of the pill at its tier, or null.
function limitPart(t, pane, limits, tier, now, alone = false) {
  const choice = limitChoice(limits, tier, now, alone);
  if (!choice) return null;
  const kids = choice.mark
    ? [svg(limitMark(limitSeverity(choice.mark.used))).size(10).flex_none().text_color(limitColor(t, limitSeverity(choice.mark.used))),
      div().flex_none().text_size(10.5).text_color(t.dim).child(names(choice.mark.minutes).short)]
    : choice.windows.map((w) => limitWindow(t, w, now));
  return h_flex().id(`ph-lim-${pane}`).flex_none().gap(tier === "percent" ? 3 : 8).items_center()
    .when(stale(limits, now), (e) => e.opacity(STALE_OPACITY)).children(kids);
}

// `covered`: an overlay the card would draw above is open (the card's layer is above popups).
// `head`: { pic, name, id, font } for the card's top line, as the header shows them.
// `limits`: the account's plan limits (limits/store.js), `now` for their times, `program` the
// agent program's name for the card's notes.
// `tier`: headerTiers()'s { context, limits }, or one tier for both.
export function meter(t, { pane, reading, tier, agent, hint = null, covered = false, head = null, limits = null, now = Date.now(), program = null }) {
  const tiers = typeof tier === "string" ? { context: tier, limits: tier } : tier;
  if (tiers.context === "none") return null;
  const ctx = contextPart(t, reading, tiers.context);
  const lim = tiers.limits ? limitPart(t, pane, limits, tiers.limits, now, !ctx) : null;
  if (!ctx && !lim) return null;
  // The pill of the mockup (variant E): framed, 20 px high, the hover color under the pointer.
  const el = h_flex().id(`ph-ctx-${pane}`).flex_none().h(PILL_H).px(7).gap(6).items_center().rounded(5)
    .border_1().border_color(t.border).text_size(11.5).hover((s) => s.bg(t.hover));
  if (ctx) el.children(ctx);
  if (ctx && lim) el.child(div().id(`ph-lim-sep-${pane}`).flex_none().w(1).h(10).mx(1).bg(t.border));
  if (lim) el.child(lim);
  return HoverCard.new(`ph-ctx-card-${pane}`).anchor("top_right").open_delay(400).close_delay(150).trigger(el)
    .content(covered ? div() : card(t, ctx ? cardModel(reading, { agent, hint }) : null, head, limitsModel(limits, now, { agent: program ?? "the agent" })));
}

// The card of the mockup: the pane's icon, name and id chip; the tokens in use, big, the window and
// the percent (with its mark from 65 %); rows of label, value and a dim extra; notes in `dim`. Then
// the limits: a rule, "Limits" with the plan and the reading's time, and per window a row and a bar
// with a tick where the window's time stands.
export const CARD_W = 260;
export const CARD_W_LIMITS = 280; // room for "resets Tue 08:48" in the extra column
const LABEL_W = 84, VALUE_W = 50, PAD_X = 11;
const chip = (t, text, font) => div().flex_none().px(5).rounded(4).bg(t.hover).text_color(t.dim).text_size(10.5)
  .when(Boolean(font), (e) => e.font_family(font)).child(text);
const row = (t, id, r, valueColor, mark = null) => h_flex().id(id).h(20).gap(8).items_center()
  .child(div().flex_none().w(LABEL_W).text_color(t.muted).child(r.label))
  .child(h_flex().gap(3).items_center().when(Boolean(r.extra), (e) => e.flex_none().w(VALUE_W)).when(!r.extra, (e) => e.flex_1().min_w(0))
    .when(Boolean(mark), (e) => e.child(mark))
    .child(div().when(!r.extra, (e) => e.flex_1().truncate()).font_semibold().text_color(valueColor).child(r.value)))
  .when(Boolean(r.extra), (e) => e.child(div().flex_1().truncate().text_color(t.dim).child(r.extra)));

function card(t, model, head, limits) {
  const width = limits ? CARD_W_LIMITS : CARD_W;
  const top = h_flex().id("ph-ctx-head").gap(7).items_center().mb(6);
  if (head?.pic) top.child(head.pic);
  top.child(div().flex_none().font_semibold().text_color(t.foreground).child(head?.name ?? "Context"));
  if (head?.id) top.child(chip(t, head.id, head.font));
  const box = v_flex().id("ph-ctx-card").mt(4).w(width).py(9).px(PAD_X).rounded(8).border_1().border_color(t.border)
    .bg(t.popover).shadow_lg().text_size(12).child(top);
  if (model) {
    const { big, rows, notes } = model;
    const loud = big.sev !== "ok";
    const pct = h_flex().id("ph-ctx-pct").ml_auto().pl(14).gap(3).items_center().flex_none().font_semibold().text_color(t.foreground);
    if (loud) pct.child(svg("mods/roundup-pane/alert.svg").size(11).flex_none().text_color(barColor(t, big.sev)));
    pct.child(big.percent);
    box.child(h_flex().id("ph-ctx-big").items_baseline().gap(5).mb(5)
      .child(div().flex_none().text_size(15).font_semibold().text_color(t.foreground).child(big.used))
      .child(div().flex_none().text_color(t.muted).child(big.of))
      .when(Boolean(big.percent), (e) => e.child(pct)))
      .children(rows.map((r, i) => row(t, `ph-ctx-row-${i}`, r, r.kind === "warn" ? t.working : t.foreground)));
    if (notes.length) box.child(v_flex().id("ph-ctx-notes").mt(5).gap(3).text_size(11).text_color(t.dim)
      .children(notes.map((n, i) => div().id(`ph-ctx-note-${i}`).child(n))));
  }
  if (limits) {
    const inner = width - 2 * PAD_X - 2; // the box's padding and its border
    if (model) box.child(div().id("ph-lim-rule").h(1).mt(7).mb(5).bg(t.border));
    const sec = v_flex().id("ph-lim-card")
      .child(h_flex().id("ph-lim-head").h(20).gap(6).items_center()
        .child(div().flex_none().font_semibold().text_color(t.foreground).child("Limits"))
        .when(Boolean(limits.plan), (e) => e.child(chip(t, limits.plan)))
        .child(div().id("ph-lim-age").ml_auto().flex_none().text_size(11).text_color(limits.old ? t.working : t.dim).child(limits.age)));
    limits.rows.forEach((r, i) => {
      const loud = r.sev !== "ok";
      const color = loud ? limitColor(t, r.sev) : t.accent;
      const mark = loud ? svg(limitMark(r.sev)).size(11).flex_none().text_color(color) : null;
      const fill = r.fill > 0 ? Math.max(1, Math.round((inner * r.fill) / 100)) : 0;
      sec.child(row(t, `ph-lim-row-${i}`, r, r.value === "–" ? t.muted : t.foreground, mark).when(limits.old, (e) => e.opacity(0.6)))
        .child(div().id(`ph-lim-bar-${i}`).relative().w(inner).h(BAR_H).mb(5).rounded(2).bg(color + "40").when(limits.old, (e) => e.opacity(0.5))
          .child(div().h(BAR_H).w(fill).rounded(2).bg(color))
          .when(r.tick !== null, (e) => e.child(div().id(`ph-lim-tick-${i}`).absolute().top(-2).left(Math.min(inner - 2, Math.round((inner * r.tick) / 100))).w(1.5).h(8).rounded(1).bg(t.foreground).opacity(0.6))));
    });
    if (limits.notes.length) sec.child(v_flex().id("ph-lim-notes").mt(1).gap(3).text_size(11)
      .children(limits.notes.map((n, i) => div().id(`ph-lim-note-${i}`).text_color(n.kind === "warn" ? t.working : t.dim).child(n.text))));
    box.child(sec);
  }
  return box;
}
