// PDF: every page, one under the other, in a virtual list (the one view Herdr
// scrolls from code), so ‹ › and "Go to" can jump to a page. Pages render in
// batches, starting from the one jumped to; a page not drawn yet holds its place.
// Files on this computer only: they render here.
import { div, image } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, Scrollbar, VirtualListScrollHandle, InputState, Input } from "gpui-base";
import { theme } from "herdr";
import { zoomControl } from "./zoom.js";
import { renderPages } from "../pdf-render.js";
import { pruneCache } from "../media.js";

const BATCH = 6, MAX = 500, GAP = 16;
let views = 0;

function jump(state, n) {
  n = Math.max(1, Math.min(state.pages.length, n));
  state.want = n;
  state.visible = n - 1;
  state.scroll.scroll_to_item(n - 1, "top");
}

export default {
  id: "pdf",
  async load(file, env, previous) {
    if (env.on) throw new Error("PDF previews work for files on this computer only");
    const first = await renderPages(file, 1, BATCH);
    if (!first.pages.length) throw new Error("This PDF has no pages");
    pruneCache();
    const pages = new Array(Math.min(first.count, MAX)).fill(null);
    for (const p of first.pages) pages[p.n - 1] = p;
    const state = { count: first.count, pages, ratio: first.pages[0].height / first.pages[0].width, zoom: previous?.zoom ?? null,
      visible: 0, want: null, stopped: false, error: null, id: `roundup-preview-pdf-${++views}`,
      scroll: VirtualListScrollHandle.new(), goto: InputState.new({ placeholder: "Go to" }) };
    state.goto.on("submit", (_e, cx) => {
      const n = parseInt(state.goto.value(), 10);
      if (n > 0) jump(state, n);
      state.goto.set_value("");
      cx.notify();
    });
    return state;
  },

  // The pages still missing, a batch at a time, from the one last jumped to.
  start(state, env, cx) {
    cx.spawn(async (cx) => {
      while (!state.stopped) {
        const missing = state.pages.findIndex((p, i) => !p && i + 1 >= (state.want ?? 1));
        const from = (missing >= 0 ? missing : state.pages.indexOf(null)) + 1;
        if (from === 0) break;
        try {
          const r = await renderPages(env.file, from, from + BATCH - 1);
          if (state.stopped) return;
          for (const p of r.pages) state.pages[p.n - 1] = p;
        } catch (e) { state.error = String(e?.message ?? e); break; }
        cx.notify();
      }
    });
  },

  toolbar(state) {
    const t = theme(), page = state.visible + 1, last = state.pages.length;
    const step = (id, label, n) => div().id(`pdf-${id}`).w(24).h(22).flex().items_center().justify_center().rounded(5)
      .text_color(n >= 1 && n <= last ? t.muted : t.dim)
      .when(n >= 1 && n <= last, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click((_e, cx) => { jump(state, n); cx.notify(); }))
      .child(label);
    return h_flex().gap(8).items_center().text_size(12)
      .child(h_flex().gap(2).p(2).rounded(7).bg(t.chrome).items_center()
        .child(step("prev", "‹", page - 1))
        .child(div().min_w(64).text_center().text_color(t.foreground).child(`${page} / ${state.count}`))
        .child(step("next", "›", page + 1)))
      .child(div().w(64).h(26).px(6).flex().items_center().rounded(6).border_1().border_color(t.border).bg(t.background)
        .child(Input.new(state.goto).text_size(12)))
      .child(zoomControl(state, state.zoom ?? 1));
  },

  // Fit is the page at the pane's width (up to 1200px); zoom scales from there.
  render(state, env) {
    const t = theme(), width = Math.max(160, (Math.min(env.size.width, 1200) - 48) * (state.zoom ?? 1));
    const height = (p) => width * (p ? p.height / p.width : state.ratio);
    const page = (i) => {
      const p = state.pages[i];
      return div().h(height(p) + GAP).w_full().flex().justify_center().pt(GAP)
        .child(p ? image(p.path).w(width).h(height(p)).flex_none().rounded(3).shadow_md()
          : div().w(width).h(height(p)).flex_none().rounded(3).bg(t.surface).flex().items_center().justify_center().text_color(t.dim).child(`Page ${i + 1}`));
    };
    return v_flex().id(`${state.id}-view`).flex_1().min_h(0).relative().bg(t.canvas)
      // The list tells which page is on top as it lays out; a wheel turn redraws the counter.
      .on_scroll_wheel((_e, cx) => cx.notify())
      .child(div().id(`${state.id}-x`).size_full().overflow_x_scrollbar()
        .child(v_flex().min_w(width + 48).h_full()
          .child(v_virtual_list(state.id, state.pages.length, state.pages.map((p) => height(p) + GAP), (i) => `p${i}`,
            (range) => { state.visible = range.start; return Array.from({ length: range.end - range.start }, (_, k) => page(range.start + k)); })
            .track_scroll(state.scroll).flex_1().min_h(0))
          .when(state.count > MAX, (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child(`Showing the first ${MAX} of ${state.count} pages`)))
          .when(Boolean(state.error), (el) => el.child(div().p(8).text_size(12).text_color(t.ansi1).child(state.error)))))
      .child(Scrollbar.vertical(state.id).viewport_from_layout().absolute().inset_0());
  },

  release(state) { state.stopped = true; state.scroll?.release(); state.goto?.release(); },
};
