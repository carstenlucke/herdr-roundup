// Pictures: fitted to the pane, or zoomed. Files on this computer only.
import { image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme } from "herdr";
import { stageImage, pruneCache } from "../media.js";
import { zoomControl } from "./zoom.js";

const fit = (picture, size) => Math.min(1, (size.width - 48) / picture.width, (size.height - 48) / picture.height);

export default {
  id: "image",
  async load(file, env, previous) {
    if (env.on) throw new Error("Image previews work for files on this computer only");
    const picture = await stageImage(file);
    pruneCache();
    return { picture, zoom: previous?.zoom ?? null };
  },

  toolbar: (state, env) => h_flex().gap(8).items_center().text_size(12).text_color(theme().dim)
    .child(`${state.picture.width} × ${state.picture.height}`)
    .child(zoomControl(state, state.zoom ?? fit(state.picture, env.size))),

  render(state, env) {
    const p = state.picture, scale = Math.max(0.01, state.zoom ?? fit(p, env.size));
    return v_flex().id("image-scroll").flex_1().min_h(0).overflow_scrollbar().bg(theme().canvas)
      .child(v_flex().min_w_full().min_h_full().items_center().justify_center().p(24)
        .child(image(p.path).w(p.width * scale).h(p.height * scale).flex_none()));
  },
};
