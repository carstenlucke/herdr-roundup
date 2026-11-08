// Markdown: rendered, or its source with Raw. Links: web and mail ones open in
// the browser or mail app, local files open in this preview (Back returns), and
// #anchors show the document from that heading. The ToC icon lists the headings.
// Local images are drawn between the text blocks. Web images are fetched only
// after a click on the bar above the document: fetching on open would tell their
// hosts who reads it, and when.
// A heading is reached by showing the document from it, with a bar back to the
// top: Herdr scrolls only virtual lists from code, and their rows can't carry
// the link handler yet.
import { div, image } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { theme, notify } from "herdr";
import { resolveLink } from "../links.js";
import { readText, codeState, codeView } from "./text.js";
import { rawToggle, iconButton } from "./controls.js";
import { splitBlocks, imageNote } from "../markdown-blocks.js";
import { stageImage, fetchImage, pruneCache } from "../media.js";

let views = 0;

function jump(state, anchor) {
  if (state.blocks.some((b) => b.heading?.slug === anchor)) { state.from = anchor; state.raw = false; return true; }
  notify({ title: "No such heading here", body: `#${anchor}`, level: "info", timeout: 3000 });
  return false;
}

function follow(url, state, env, cx) {
  const to = resolveLink(env.file, url);
  if (to.url) cx.open_url(to.url);
  else if (to.file) env.navigate(to.file, cx, to.anchor);
  else if (to.anchor !== undefined) { if (jump(state, to.anchor)) cx.notify(); }
  else notify({ title: "Can't open this link", body: to.error, level: "warning" });
}

// Downloads the web images one after the other, redrawing as each arrives.
function loadWeb(state, cx) {
  state.web = "loading";
  cx.spawn(async (cx) => {
    for (const block of state.blocks) {
      if (!block.image?.url || block.image.picture) continue;
      block.image.picture = await fetchImage(block.image.url).catch(() => null);
      cx.notify();
    }
    state.web = "loaded";
    cx.notify();
  });
  cx.notify();
}

export default {
  id: "markdown",
  async load(file, env, previous) {
    const text = await readText(file, env.on), blocks = splitBlocks(text);
    if (blocks.some((b) => b.image)) await pruneCache(); // web images land in the local cache too
    for (const block of blocks) {
      if (!block.image) continue;
      const to = resolveLink(file, block.image.src);
      if (to.url) block.image.url = to.url;
      else if (to.file && !env.on) block.image.picture = await stageImage(to.file).catch((e) => { block.image.failed = String(e?.message ?? e); return null; });
      else if (to.error) block.image.failed = to.error;
    }
    const raw = previous?.raw ?? false;
    const state = { text, blocks, raw, editor: raw ? codeState(text, "markdown") : null, from: null,
      contents: previous?.contents ?? false, web: previous?.web === "loaded" ? "loading" : "ask", id: `roundup-preview-md-${++views}` };
    const anchor = previous?.from ?? env.anchor;
    if (anchor && state.blocks.some((b) => b.heading?.slug === anchor)) state.from = anchor;
    return state;
  },

  // Web images the person already let through come back after a reload.
  start(state, env, cx) {
    if (state.web === "loading") loadWeb(state, cx);
  },

  toolbar(state) {
    const headings = state.blocks.filter((b) => b.heading).length;
    return h_flex().gap(6).items_center()
      .when(headings > 1 && !state.raw, (el) => el.child(iconButton("toc", "toc", state.contents ? "Hide the ToC" : "Show the ToC", state.contents,
        () => { state.contents = !state.contents; })))
      .child(rawToggle(state, "Preview", "markdown"));
  },

  render(state, env) {
    if (state.raw) return codeView(state.editor, env);
    const t = theme(), column = Math.max(120, Math.min(920, env.size.width - (state.contents ? 240 : 0)) - 80);
    const start = state.from ? state.blocks.findIndex((b) => b.heading?.slug === state.from) : 0;
    const picture = (shown, i) => {
      const { alt, link, url, picture: p } = shown, target = link ?? url;
      const el = p ? image(p.path).w(Math.min(p.width, column)).h(Math.min(p.width, column) * p.height / p.width)
        : div().px(8).py(4).rounded(6).bg(t.raised).text_size(12).text_color(url ? t.accent : t.dim)
          .child(`Image: ${alt || "untitled"} (${imageNote(shown, state.web)})`);
      return div().id(`${state.id}-img-${i}`).py(6).when(Boolean(target), (d) => d.cursor_pointer().on_click((_e, cx) => follow(target, state, env, cx))).child(el);
    };
    const contents = v_flex().id(`${state.id}-contents`).w(240).h_full().flex_none().min_h(0).overflow_y_scrollbar().py(16).px(10).gap(1)
      .border_r(1).border_color(t.border).bg(t.surface).text_size(12.5)
      .child(div().px(6).pb(6).text_size(11).font_semibold().text_color(t.dim).child("Table of contents"))
      .children(state.blocks.filter((b) => b.heading).map(({ heading: h }) => {
        const on = h.slug === state.from;
        return div().id(`${state.id}-toc-${h.slug}`).pl(6 + (h.level - 1) * 12).pr(6).py(3).rounded(5).cursor_pointer().truncate()
          .text_color(on ? t.foreground : h.level === 1 ? t.foreground : t.muted).when(on, (d) => d.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { state.from = h.slug; cx.notify(); }).child(h.title);
      }));
    const web = state.blocks.filter((b) => b.image?.url && !b.image.picture).length;
    const document = v_flex().flex_1().h_full().min_w(0).min_h(0)
      .when(web > 0 && state.web === "ask", (el) => el.child(h_flex().id(`${state.id}-web`).flex_none().h(30).px(16).gap(8).items_center().border_b(1).border_color(t.border)
        .bg(t.surface).text_size(12).text_color(t.dim)
        .child(`${web} web image${web === 1 ? "" : "s"} not loaded`)
        .child(div().id(`${state.id}-web-load`).cursor_pointer().text_color(t.accent).hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => loadWeb(state, cx)).child("Load them"))))
      .when(start > 0, (el) => el.child(h_flex().id(`${state.id}-from`).flex_none().h(30).px(16).gap(8).items_center().border_b(1).border_color(t.border)
        .bg(t.surface).text_size(12).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { state.from = null; cx.notify(); })
        .child(`↑ Showing from “${state.blocks[start].heading.title}” · show the whole document`)))
      .child(v_flex().id(`${state.id}-scroll-${state.from ?? ""}`).flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().w_full().max_w(920).mx_auto().px(40).pt(28).pb(48).text_size(14.5)
          .children(state.blocks.slice(start).map((b, j) => b.image ? picture(b.image, start + j)
            // The space a heading gets inside one Markdown view, lost between two.
            : div().when(Boolean(b.heading) && j > 0, (d) => d.pt(16))
              .child(TextView.markdown(`${state.id}-${start + j}`, b.text).selectable().on_link_click((url, cx) => follow(url, state, env, cx)))))));
    return h_flex().flex_1().min_h(0).when(state.contents, (el) => el.child(contents)).child(document);
  },

  release: (state) => state.editor?.release(),
};
