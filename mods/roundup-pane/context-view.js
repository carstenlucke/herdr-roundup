// The context meter in the pane header: a bar of two divs (the track in the bar's color at low
// alpha, the fill on top), the percent and the tokens; a hover card with the details. No click.
//
// - Below 65 % the bar is `accent` and the number `muted`; from 65 % `working`, from 80 % `blocked`,
//   the number `foreground` with an alert mark before it, so the level never rests on hue alone.
// - Narrow headers drop the tokens, then the bar; the percent stays longest (context/text.js tier).
// - Tokens alone (Claude without a known window): no bar, no percent.

import { div, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { share, percentText, severity, usedText, tokens } from "./context/text.js";
import { cardRows } from "./context/card.js";

export const BAR_W = 30;
export const BAR_H = 4;

export function barColor(t, sev) {
  return sev === "critical" ? t.blocked : sev === "tight" ? t.working : t.accent;
}

// `covered`: an overlay the card would draw above is open (the card's layer is above popups).
export function meter(t, { pane, reading, tier, agent, hint = null, covered = false }) {
  if (!reading || tier === "none") return null;
  const p = share(reading);
  const hasWindow = Number.isFinite(reading.window) && reading.window > 0 && Number.isFinite(p);
  const sev = hasWindow ? severity(p) : "ok";
  const color = barColor(t, sev);
  const loud = sev !== "ok";
  const el = h_flex().id(`ph-ctx-${pane}`).flex_none().gap(5).items_center().text_size(11);
  if (!hasWindow) {
    if (!Number.isFinite(reading.used)) return null;
    el.child(div().flex_none().text_color(t.muted).child(tokens(reading.used)));
  } else {
    if (tier === "full" || tier === "bar") {
      const fill = Math.max(1, Math.round((BAR_W * Math.min(p, 100)) / 100));
      el.child(div().flex_none().w(BAR_W).h(BAR_H).rounded(2).bg(color + "40")
        .child(div().h(BAR_H).w(fill).rounded(2).bg(color)));
    }
    if (loud) el.child(svg("mods/roundup-pane/alert.svg").size(11).flex_none().text_color(color));
    el.child(div().flex_none().text_color(loud ? t.foreground : t.muted).when(loud, (e) => e.font_medium())
      .child(`${reading.windowRounded ? "~" : ""}${percentText(p)}`));
    if (tier === "full") el.child(div().flex_none().text_color(t.dim).child(usedText(reading)));
  }
  return HoverCard.new(`ph-ctx-card-${pane}`).anchor("top_right").open_delay(400).close_delay(150).trigger(el)
    .content(covered ? div() : card(t, cardRows(reading, { agent, hint })));
}

function card(t, rows) {
  const tone = { title: t.dim, main: t.foreground, plain: t.muted, note: t.dim, warn: t.working };
  return v_flex().id("ph-ctx-card").mt(4).w(280).p(10).gap(4).rounded(10).border(1).border_color(t.border).bg(t.popover).shadow_lg().text_size(11.5)
    .children(rows.map((r, i) => div().id(`ph-ctx-row-${i}`).text_color(tone[r.kind] ?? t.muted)
      .when(r.kind === "title", (e) => e.text_size(10.5).font_semibold())
      .when(r.kind === "main", (e) => e.text_size(13).font_medium())
      .child(r.text)));
}
