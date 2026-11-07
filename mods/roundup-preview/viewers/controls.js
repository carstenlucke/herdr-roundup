// Header controls the viewers share.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";
import { codeState } from "./text.js";

/** Options side by side, one of them on: [[id, label, on, action]]. */
export function segmented(options) {
  const t = theme();
  return h_flex().gap(2).p(2).rounded(7).bg(t.chrome).text_size(12).children(options.map(([id, label, on, action]) =>
    div().id(`roundup-preview-${id}`).px(10).py(3).rounded(5).cursor_pointer()
      .bg(on ? t.raised : t.chrome).text_color(on ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { action(); cx.notify(); }).child(label)));
}

/** "<view> | Raw": state.raw switches to the file's source, made once into state.editor. */
export const rawToggle = (state, view, language) => segmented([
  ["view", view, !state.raw, () => { state.raw = false; }],
  ["raw", "Raw", state.raw, () => { state.raw = true; if (!state.editor) state.editor = codeState(state.text, language); }],
]);

/** A 28px icon button from this mod's folder; `on` draws it pressed. */
export function iconButton(id, icon, tip, on, run) {
  const t = theme();
  return div().id(`roundup-preview-${id}`).size(28).flex().items_center().justify_center().rounded(7).cursor_pointer()
    .bg(on ? t.raised : t.chrome).text_color(on ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground))
    .tooltip(tip).on_click((_e, cx) => { run(); cx.notify(); }).child(svg(`mods/roundup-preview/${icon}.svg`).size(14));
}
