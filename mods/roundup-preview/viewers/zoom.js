// The −/100%/+ control the PDF and image viewers share. state.zoom is null
// for Fit (a click on the percentage returns there), else a scale.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme } from "herdr";

export const ZOOMS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/** `current`: the scale shown now, which Fit also has. */
export function zoomControl(state, current) {
  const t = theme();
  const next = (up) => up ? ZOOMS.find((z) => z > current + 0.001) ?? ZOOMS.at(-1) : [...ZOOMS].reverse().find((z) => z < current - 0.001) ?? ZOOMS[0];
  const step = (id, label, up) => div().id(`zoom-${id}`).w(24).h(22).flex().items_center().justify_center().rounded(5).cursor_pointer()
    .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
    .on_click((_e, cx) => { state.zoom = next(up); cx.notify(); }).child(label);
  return h_flex().gap(2).p(2).rounded(7).bg(t.chrome).items_center().text_size(12)
    .child(step("out", "−", false))
    .child(div().id("zoom-fit").min_w(44).text_center().cursor_pointer().text_color(t.foreground).tooltip("Fit")
      .on_click((_e, cx) => { state.zoom = null; cx.notify(); }).child(state.zoom === null ? "Fit" : `${Math.round(current * 100)}%`))
    .child(step("in", "+", true));
}
