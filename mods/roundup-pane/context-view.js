// The context meter in the pane header: a framed pill holding a bar of two divs (the track in the
// bar's color at low alpha, the fill on top), the percent and the tokens; a hover card with the
// details. No click.
//
// - Below 65 % the bar is `accent` and the number `muted`; from 65 % `working`, from 80 % `blocked`,
//   the number `foreground` with an alert mark before it, so the level never rests on hue alone.
// - Narrow headers drop the tokens, then the bar; the percent stays longest (context/text.js tier).
// - Tokens alone (Claude without a known window): no bar, no percent.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { share, percentText, severity, usedText, tokens } from "./context/text.js";
import { cardModel } from "./context/card.js";

export const BAR_W = 30;
export const BAR_H = 4;
export const PILL_H = 20;
export const PCT_MIN_W = 26;

export function barColor(t, sev) {
  return sev === "critical" ? t.blocked : sev === "tight" ? t.working : t.accent;
}

// `covered`: an overlay the card would draw above is open (the card's layer is above popups).
// `head`: { pic, name, id, font } for the card's top line, as the header shows them.
export function meter(t, { pane, reading, tier, agent, hint = null, covered = false, head = null }) {
  if (!reading || tier === "none") return null;
  const p = share(reading);
  const hasWindow = Number.isFinite(reading.window) && reading.window > 0 && Number.isFinite(p);
  const sev = hasWindow ? severity(p) : "ok";
  const color = barColor(t, sev);
  const loud = sev !== "ok";
  // The pill of the mockup (variant E): framed, 20 px high, the hover color under the pointer.
  const el = h_flex().id(`ph-ctx-${pane}`).flex_none().h(PILL_H).px(7).gap(6).items_center().rounded(5)
    .border_1().border_color(t.border).text_size(11.5).hover((s) => s.bg(t.hover));
  if (!hasWindow) {
    if (!Number.isFinite(reading.used)) return null;
    el.child(div().flex_none().text_color(t.muted).child(tokens(reading.used)));
  } else {
    if (tier === "full" || tier === "bar") {
      const fill = Math.max(1, Math.round((BAR_W * Math.min(p, 100)) / 100));
      el.child(div().flex_none().w(BAR_W).h(BAR_H).rounded(2).bg(color + "40")
        .child(div().h(BAR_H).w(fill).rounded(2).bg(color)));
    }
    // The number with its mark keeps a least width, so 9 % → 10 % doesn't move the tokens.
    const num = h_flex().flex_none().min_w(PCT_MIN_W).gap(3).items_center();
    if (loud) num.child(svg("mods/roundup-pane/alert.svg").size(10).flex_none().text_color(color));
    num.child(div().flex_none().text_color(loud ? t.foreground : t.muted).when(loud, (e) => e.font_medium())
      .child(`${reading.windowRounded ? "~" : ""}${percentText(p)}`));
    el.child(num);
    if (tier === "full") el.child(div().flex_none().text_color(t.dim).child(usedText(reading)));
  }
  return HoverCard.new(`ph-ctx-card-${pane}`).anchor("top_right").open_delay(400).close_delay(150).trigger(el)
    .content(covered ? div() : card(t, cardModel(reading, { agent, hint }), head));
}

// The card of the mockup: the pane's icon, name and id chip; the tokens in use, big, the window and
// the percent (with its mark from 65 %); rows of label, value and a dim extra; notes in `dim`.
export const CARD_W = 260;
const LABEL_W = 84, VALUE_W = 50;
function card(t, model, head) {
  const { big, rows, notes } = model;
  const loud = big.sev !== "ok";
  const markColor = barColor(t, big.sev);
  const top = h_flex().id("ph-ctx-head").gap(7).items_center().mb(6);
  if (head?.pic) top.child(head.pic);
  top.child(div().flex_none().font_semibold().text_color(t.foreground).child(head?.name ?? "Context"));
  if (head?.id) top.child(div().flex_none().px(5).rounded(4).bg(t.hover).text_color(t.dim).text_size(10.5)
    .when(Boolean(head.font), (e) => e.font_family(head.font)).child(head.id));
  const pct = h_flex().id("ph-ctx-pct").ml_auto().pl(14).gap(3).items_center().flex_none().font_semibold().text_color(t.foreground);
  if (loud) pct.child(svg("mods/roundup-pane/alert.svg").size(11).flex_none().text_color(markColor));
  pct.child(big.percent);
  const line = h_flex().id("ph-ctx-big").items_baseline().gap(5).mb(5)
    .child(div().flex_none().text_size(15).font_semibold().text_color(t.foreground).child(big.used))
    .child(div().flex_none().text_color(t.muted).child(big.of))
    .when(Boolean(big.percent), (e) => e.child(pct));
  const box = v_flex().id("ph-ctx-card").mt(4).w(CARD_W).py(9).px(11).rounded(8).border_1().border_color(t.border)
    .bg(t.popover).shadow_lg().text_size(12).child(top).child(line)
    .children(rows.map((r, i) => h_flex().id(`ph-ctx-row-${i}`).h(20).gap(8).items_center()
      .child(div().flex_none().w(LABEL_W).text_color(t.muted).child(r.label))
      .child(div().when(Boolean(r.extra), (e) => e.flex_none().w(VALUE_W)).when(!r.extra, (e) => e.flex_1().truncate())
        .font_semibold().text_color(r.kind === "warn" ? t.working : t.foreground).child(r.value))
      .when(Boolean(r.extra), (e) => e.child(div().flex_1().truncate().text_color(t.dim).child(r.extra)))));
  if (notes.length) box.child(v_flex().id("ph-ctx-notes").mt(5).gap(3).text_size(11).text_color(t.dim)
    .children(notes.map((n, i) => div().id(`ph-ctx-note-${i}`).child(n))));
  return box;
}
