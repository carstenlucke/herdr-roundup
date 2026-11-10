// A right-click menu as Herdr's `menu` draws it, ending in the choice of when closing asks.
// Copied as-is into roundup-tabs and roundup-pane, like close.js.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, keys, shared, props, closeOverlay } from "herdr";
import { MODES, confirmMode, setConfirmMode } from "./close.js";

// The key for the first of these actions bound here: this layout's own section first, then global.
export function shortcut(actions) {
  const own = `layout:${shared("layout")}`, all = keys();
  for (const action of actions)
    for (const section of [own, "global"]) {
      const k = all.find(b => b.section === section && b.action === action);
      if (k) return k.keys;
    }
  return "";
}

// The menu's heights in px, so its popup can be sized to fit (tests/menu-height.test.mjs):
// the padding at top and bottom, a row, a separator line with its margin, and the heading
// over the three choices (its line, then HEAD_FONT px text with HEAD_PT above and HEAD_PB
// below). The render draws with these parts; HEAD_LINE, the text's line height, is assumed.
export const PAD = 5, ROW = 31, SEP_M = 4, SEP_H = 1, HEAD_PT = 3, HEAD_PB = 2, HEAD_FONT = 11, HEAD_LINE = 14;
export const LINE = SEP_M + SEP_H + SEP_M, HEAD = LINE + HEAD_PT + HEAD_LINE + HEAD_PB;

// Rows are { label, icon, act, keys?, sep? }. The three choices for `kind` ("tab" or "pane") follow
// under "Ask before closing a tab/pane", a check where the commands carry their icon; with kind null
// (a menu that closes nothing) they stay out.
// ↑/↓ move, Enter runs, Esc closes. `view.at` is the highlighted row, `view.handle` the menu's focus.
export function menuView(view, rows, kind) {
  const t = theme(), mode = kind ? confirmMode(kind) : null;
  const list = [...rows, ...(kind ? MODES.map(([m, label], i) => ({ label, mode: m, head: i === 0, act: () => setConfirmMode(kind, m) })) : [])];
  const choose = (i) => { closeOverlay(props().overlay); list[i]?.act(); };
  const line = () => div().mx(7).my(SEP_M).h(SEP_H).bg(t.border);
  return v_flex().id("menu").track_focus(view.handle).w_full().min_h(0).p(PAD).bg(t.popover).text_size(12.8)
    .on_key_down((e, cx) => {
      if (e.key === "escape") return closeOverlay(props().overlay);
      if (!list.length) return;
      if (e.key === "down") view.at = (view.at + 1) % list.length;
      else if (e.key === "up") view.at = (view.at + list.length - 1) % list.length;
      else if (e.key === "enter") return choose(view.at);
      else return;
      cx.notify();
    })
    .children(list.map((it, i) => v_flex()
      .when(Boolean(it.sep), el => el.child(line()))
      .when(Boolean(it.head), el => el.child(line()).child(div().px(8).pt(HEAD_PT).pb(HEAD_PB).text_size(HEAD_FONT).text_color(t.dim).child(`Ask before closing a ${kind}`)))
      .child(h_flex().id(`mi-${i}`).h(ROW).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
        .when(i === view.at, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_click(() => choose(i))
        .child(it.mode
          ? div().size(14).flex_none().when(it.mode === mode, el => el.child(svg("mods/workspace-chrome/check.svg").size(14).text_color(t.accent)))
          : svg(`mods/workspace-chrome/${it.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(it.label))
        .child(div().text_size(11).text_color(t.dim).child(it.keys ?? "")))));
}
