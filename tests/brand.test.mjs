// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// roundup-workspace-chrome's brand: click or drag, its texts, and the menu popup's height.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pressOf, pressMoved, isClick, herdrVersion, subLine, when, headHeight, popupHeight } from "../mods/roundup-workspace-chrome/brand.js";

const at = (x, y, more = {}) => ({ position: { x, y }, click_count: 1, ...more });
const press = (moves) => {
  const p = pressOf(at(100, 50));
  for (const [x, y] of moves) pressMoved(p, at(x, y));
  return p;
};

test("The menu opens only for a press that moved < 3 px (x+y summed) in < 10 moves, clicked once", () => {
  assert.ok(isClick(press([]), at(100, 50)));
  assert.ok(isClick(press([[101, 51]]), at(101, 51)));
  assert.ok(!isClick(press([[102, 51]]), at(102, 51))); // 2 + 1 = 3 px
  assert.ok(!isClick(press([[103, 50], [100, 50]]), at(100, 50))); // went 3 px and came back
  assert.ok(isClick(press(Array(9).fill([100, 50])), at(100, 50)));
  assert.ok(!isClick(press(Array(10).fill([100, 50])), at(100, 50)));
});

test("A double-click, or a release without a press, opens nothing", () => {
  assert.ok(!isClick(press([]), at(100, 50, { click_count: 2 })));
  assert.ok(!isClick(null, at(100, 50)));
  assert.ok(isClick(press([]), { position: { x: 100, y: 50 } }));
  // A move without a press is ignored.
  assert.doesNotThrow(() => pressMoved(null, at(1, 1)));
});

test("\"Based on Herdr <v>\" only for a layout cloned from main", () => {
  assert.equal(herdrVersion({ cloned_from: { name: "main", version: "0.1.13" } }), "0.1.13");
  assert.equal(herdrVersion({ cloned_from: { name: "Other", version: "1.0.0" } }), null);
  assert.equal(herdrVersion({}), null);
  assert.equal(herdrVersion(null), null);
});

test("The sub line: none without a version, an offered release, checking, else the version", () => {
  assert.equal(subLine(undefined, null, false), null);
  assert.equal(subLine("0.8.1", { version: "0.9.0" }, true), "0.9.0 available");
  assert.equal(subLine("0.8.1", null, true), "0.8.1 · checking…");
  assert.equal(subLine("0.8.1", null, false), "0.8.1");
});

test("when(): today HH:MM, yesterday HH:MM, else Mon D HH:MM, zero-padded", () => {
  const now = new Date(2026, 10, 8, 15, 30).getTime();
  assert.equal(when(new Date(2026, 10, 8, 9, 5).getTime(), now), "today 09:05");
  assert.equal(when(new Date(2026, 10, 7, 23, 59).getTime(), now), "yesterday 23:59");
  assert.equal(when(new Date(2026, 10, 7, 0, 0).getTime(), now), "yesterday 00:00");
  assert.equal(when(new Date(2026, 10, 3, 9, 12).getTime(), now), "Nov 3 09:12");
  assert.equal(when(new Date(2026, 0, 1, 7, 0).getTime(), now), "Jan 1 07:00");
});

test("The head is 19 + 18 a fact, + 22 for a status line, + 15 more for an error's second line", () => {
  assert.equal(headHeight({ herdr: null, checking: false, error: null }), 19 + 3 * 18);
  assert.equal(headHeight({ herdr: "0.1.13", checking: false, error: null }), 19 + 4 * 18);
  assert.equal(headHeight({ herdr: "0.1.13", checking: true, error: "x" }), 19 + 4 * 18 + 22);
  assert.equal(headHeight({ herdr: "0.1.13", checking: false, error: "x" }), 19 + 4 * 18 + 22 + 15);
});

test("The popup is 31 a row, 19 a heading, 9 a divider, around the head with padding and a divider", () => {
  const rows = [{}, { head: true, sep: true }, {}, { sep: true }];
  assert.equal(popupHeight(rows, 73), 10 + 12 + 73 + 9 + 4 * 31 + 19 + 2 * 9);
  assert.equal(popupHeight([], 73), 10 + 12 + 73 + 9);
});
