// CSV and TSV as a table: a header row that stays, numbered rows drawn only
// while on screen, and sideways scrolling for wide tables. Raw shows the source.
import { div } from "gpui-kit";
import { v_flex, h_flex, v_virtual_list, Scrollbar } from "gpui-base";
import { theme, settings } from "herdr";
import { extension } from "../kinds.js";
import { delimiterOf, parseDelimited, columnWidths } from "../delimited.js";
import { readLongText, codeState, codeView } from "./text.js";
import { rawToggle } from "./controls.js";

const ROW = 26, NUMBER = 52, LIMIT = 100000;
let views = 0;

export default {
  id: "table",
  async load(file, env, previous) {
    const { text, cut } = await readLongText(file, env.on);
    const { rows, truncated } = parseDelimited(text, delimiterOf(extension(file), text), LIMIT + 1);
    const raw = previous?.raw ?? false;
    return { text, cut, header: rows[0] ?? [], body: rows.slice(1), truncated: truncated || cut, widths: columnWidths(rows),
      raw, editor: raw ? codeState(text, "text", cut) : null, id: `roundup-preview-table-${++views}` };
  },

  toolbar: (state) => h_flex().gap(8).items_center().text_size(12).text_color(theme().dim)
    .child(`${state.body.length.toLocaleString()}${state.truncated ? "+" : ""} rows × ${state.widths.length} columns`)
    .child(rawToggle(state, "Table", "text")),

  render(state, env) {
    if (state.raw) return codeView(state.editor, env);
    const t = theme(), width = NUMBER + state.widths.reduce((a, b) => a + b, 0);
    const row = (cells, i) => h_flex().h(ROW).w(width).items_center().when(i % 2 === 1, (r) => r.bg(t.surface))
      .child(div().w(NUMBER).flex_none().pr(10).text_right().text_color(t.dim).child(String(i + 1)))
      .children(state.widths.map((w, c) => div().w(w).flex_none().px(8).truncate().child(cells[c] ?? "")));
    return v_flex().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(12.5)
      .child(div().id(`${state.id}-x`).size_full().overflow_x_scrollbar()
        .child(v_flex().min_w(width).h_full()
          .child(h_flex().h(ROW + 4).w(width).flex_none().items_center().border_b(1).border_color(t.border).bg(t.chrome).font_semibold()
            .child(div().w(NUMBER).flex_none())
            .children(state.widths.map((w, c) => div().w(w).flex_none().px(8).truncate().child(state.header[c] ?? ""))))
          .child(v_virtual_list(`${state.id}-rows`, state.body.length, ROW, (i) => String(i),
            (range) => state.body.slice(range.start, range.end).map((cells, k) => row(cells, range.start + k))).flex_1().min_h(0))))
      .child(Scrollbar.vertical(`${state.id}-rows`).viewport_from_layout().absolute().inset_0());
  },

  release: (state) => state.editor?.release(),
};
