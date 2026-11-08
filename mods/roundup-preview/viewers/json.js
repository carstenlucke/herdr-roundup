// JSON as a collapsible tree: a click on an object or array opens or closes it,
// alt-click opens or closes everything under it, and the toolbar icon expands or
// collapses the whole tree. The root and its first level start open. Invalid JSON
// shows its source and why.
import { div } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { theme, settings } from "herdr";
import { flatten, containers, toggleDeep } from "../json-tree.js";
import { readText, codeState, codeView } from "./text.js";
import { rawToggle, iconButton } from "./controls.js";

const ROW = 24;
let views = 0;

const refresh = (state) => { state.rows = flatten(state.value, state.expanded); };

export default {
  id: "json",
  async load(file, env, previous) {
    const text = await readText(file, env.on);
    let value, error = null;
    try { value = JSON.parse(text); } catch (e) { error = String(e?.message ?? e); }
    const raw = Boolean(error) || (previous?.raw ?? false);
    const state = { text, value, error, raw, editor: raw ? codeState(text, "json") : null, all: error ? new Set() : containers(value),
      expanded: previous?.expanded ?? (error ? new Set() : containers(value, 1)), alt: false, id: `roundup-preview-json-${++views}` };
    if (!error) refresh(state);
    return state;
  },

  toolbar(state) {
    const t = theme();
    if (state.error) return div().max_w(420).truncate().text_size(12).text_color(t.ansi1).child(`Invalid JSON: ${state.error}`);
    const open = [...state.all].every((p) => state.expanded.has(p));
    return h_flex().gap(6).items_center()
      .when(!state.raw && state.all.size > 1, (el) => el.child(iconButton("fold", open ? "collapse" : "expand",
        open ? "Collapse all (alt-click a row: just its branch)" : "Expand all (alt-click a row: just its branch)", false,
        () => { state.expanded = open ? new Set([""]) : new Set(state.all); refresh(state); })))
      .child(rawToggle(state, "Tree", "json"));
  },

  render(state, env) {
    if (state.raw) return codeView(state.editor, env);
    const t = theme();
    const color = { string: t.ansi2, number: t.ansi1, boolean: t.ansi6, null: t.ansi6, object: t.dim, array: t.dim };
    const row = (r) => h_flex().h(ROW).pl(14 + r.depth * 18).pr(14).gap(6).items_center()
      .child(div().w(10).flex_none().text_color(t.dim).child(r.kind === "object" || r.kind === "array" ? (r.open ? "▾" : "▸") : ""))
      .when(r.key !== null, (el) => el.child(div().flex_none().text_color(typeof r.key === "number" ? t.dim : t.ansi4).child(typeof r.key === "number" ? `${r.key}:` : `${JSON.stringify(r.key)}:`)))
      .child(div().flex_1().min_w(0).truncate().text_color(color[r.kind]).child(r.text));
    // The press carries the modifiers; the list's click that follows doesn't.
    return v_flex().id(`${state.id}-tree`).flex_1().min_h(0).relative().py(6).on_mouse_down("left", (e) => { state.alt = Boolean(e.modifiers?.alt); }).font_family(settings().font_family ?? "JetBrains Mono").text_size(12.5)
      .child(v_virtual_list(state.id, state.rows.length, ROW, (i) => state.rows[i].path, (range) => state.rows.slice(range.start, range.end).map(row))
        .size_full().on_item_click((path, cx) => {
          if (state.alt) state.expanded = toggleDeep(state.value, state.expanded, path);
          else if (state.expanded.has(path)) state.expanded.delete(path); else state.expanded.add(path);
          refresh(state); cx.notify();
        }))
      .child(Scrollbar.vertical(state.id).viewport_from_layout().absolute().inset_0());
  },

  release: (state) => state.editor?.release(),
};
