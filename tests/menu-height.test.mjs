// node --test 'tests/*.test.mjs'
// The right-click popups are opened at a fixed height: it must hold every row the menu can
// have, or the last one (the pane menu's ninth, "Send back to …") is cut off. menu.js is loaded
// with herdr stubbed (L2), so the test reads its heights and the sizes its render draws with.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reset, walk, byText } from "./support/harness.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = read("mods/roundup-pane/menu.js");
const M = await import("../mods/roundup-pane/menu.js");
const { PAD, ROW, LINE, HEAD } = M;

beforeEach(reset);
const MODES = (read("mods/roundup-pane/close.js").match(/export const MODES = \[([\s\S]*?)\];/)?.[1].match(/\[\s*"/g) ?? []).length;

// The rows a menu can show at most: each `{ label: … }` of its list, a ternary's two choices
// counting once, then the three choices of when closing asks.
function rows(source, from) {
  const list = source.slice(source.indexOf(from)).match(/\[\s*\n([\s\S]*?)\n\s*\]/)[1];
  const items = (list.match(/\{ label:/g) ?? []).length - (list.match(/^\s*: \{ label:/gm) ?? []).length;
  return { rows: items + MODES, seps: (list.match(/sep: true/g) ?? []).length };
}
// The menu's height: padding, rows, a line above each `sep` row, and the heading over the choices.
const height = ({ rows, seps }) => 2 * PAD + rows * ROW + seps * LINE + HEAD;

test("the menu draws with the heights it exports", () => {
  assert.equal(read("mods/roundup-tabs/menu.js"), menu, "roundup-tabs' menu.js is a copy of roundup-pane's");
  assert.equal(LINE, M.SEP_M + M.SEP_H + M.SEP_M);
  assert.equal(HEAD, LINE + M.HEAD_PT + M.HEAD_LINE + M.HEAD_PB);
  const act = () => {};
  const tree = M.menuView({ at: 0, handle: {} }, [{ label: "One", icon: "x", act }, { label: "Two", icon: "x", sep: true, act }], "pane");
  assert.deepEqual(tree.style("p"), [PAD], "the padding");
  const rows = [...walk(tree)].filter((e) => /^mi-\d+$/.test(e.elementId ?? ""));
  assert.equal(rows.length, 2 + MODES);
  for (const r of rows) assert.deepEqual(r.style("h"), [ROW], `row ${r.elementId}`);
  // The separators: one above the `sep` row, one over the heading.
  const lines = [...walk(tree)].filter((e) => e.has("my"));
  assert.equal(lines.length, 2);
  for (const l of lines) assert.deepEqual([l.style("my"), l.style("h")], [[M.SEP_M], [M.SEP_H]], "a separator: SEP_M + SEP_H + SEP_M = LINE");
  const head = byText(tree, "Ask before closing a pane");
  assert.deepEqual([head.style("pt"), head.style("pb"), head.style("text_size")], [[M.HEAD_PT], [M.HEAD_PB], [M.HEAD_FONT]],
    "the heading: LINE + HEAD_PT + HEAD_LINE + HEAD_PB = HEAD");
  assert.equal(MODES, 3);
});

test("the pane's terminal menu fits its popup with all nine rows", () => {
  const pane = rows(read("mods/roundup-pane/main.js"), "function menuRows(");
  assert.deepEqual(pane, { rows: 9, seps: 1 });
  const popup = JSON.parse(read("mods/roundup-pane/mod.json")).overlay.height;
  assert.equal(height(pane), 326);
  assert.ok(popup >= height(pane), `mods/roundup-pane/mod.json: overlay.height ${popup} < ${height(pane)} for ${pane.rows} rows`);
});

test("the tab's menu fits its popup with all six rows", () => {
  const main = read("mods/roundup-tabs/main.js");
  const tab = rows(main, "return menuView(this, [");
  assert.deepEqual(tab, { rows: 6, seps: 1 });
  const popup = Number(main.match(/openOverlay\(\{ mod: "roundup-tabs", kind: "popup", width: \d+, height: (\d+)/)?.[1]);
  assert.equal(height(tab), 233);
  assert.ok(popup >= height(tab), `mods/roundup-tabs/main.js: popup height ${popup} < ${height(tab)} for ${tab.rows} rows`);
});
