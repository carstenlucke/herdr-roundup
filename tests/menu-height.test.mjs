// node --test tests/
// The right-click popups are opened at a fixed height: it must hold every row the menu can
// have, or the last one (the pane menu's ninth, "Send back to …") is cut off. menu.js imports
// Herdr, so its heights are read from its source rather than imported.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const menu = read("mods/roundup-pane/menu.js");

// PAD, ROW, LINE, HEAD from `export const PAD = …, ROW = …;`.
function heights(source) {
  const decl = source.match(/^export const PAD = [^;]+;/m)?.[0];
  assert.ok(decl, "mods/roundup-pane/menu.js: no `export const PAD = …, ROW = …, LINE = …, HEAD = …;`");
  assert.match(decl, /^export const [\w\s=+,\d]+;$/, `menu.js: heights are sums of numbers, got ${decl}`);
  return new Function(`${decl.replace(/^export /, "")} return { PAD, ROW, LINE, HEAD };`)();
}
const { PAD, ROW, LINE, HEAD } = heights(menu);
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
  assert.match(menu, /\.p\(PAD\)/);
  assert.match(menu, /\.h\(ROW\)/);
  assert.match(menu, /\.my\(4\)\.h\(1\)/, "a separator: 4 + 1 + 4 = LINE");
  assert.match(menu, /\.pt\(3\)\.pb\(2\)\.text_size\(11\)/, "the heading: LINE + 3 + 14 + 2 = HEAD");
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
