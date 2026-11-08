// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { delimiterOf, parseDelimited, columnWidths } from "../mods/roundup-preview/delimited.js";

test("delimiterOf: counts only delimiters outside quoted cells", () => {
  assert.equal(delimiterOf("csv", 'name,"notes; remarks; extra"\n1,2'), ",");
  assert.equal(delimiterOf("csv", 'a;"x,y,z";c\n'), ";");
  assert.equal(delimiterOf("csv", '"a""b;c;d",e\nx;y;z;w'), ",", "an escaped quote stays inside the cell");
  assert.equal(delimiterOf("csv", '"line one;\nline; two",x\n;;;;'), ",", "a quoted cell spans lines");
  assert.equal(delimiterOf("csv", "a;b;c\r\n1,2,3,4"), ";", "the first record only");
  assert.equal(delimiterOf("tsv", "a,b"), "\t");
});

test("parseDelimited: quotes, escaped quotes, line ends", () => {
  assert.deepEqual(parseDelimited('a,"b,c","d""e"\r\n1,2,3', ",").rows, [["a", "b,c", 'd"e'], ["1", "2", "3"]]);
  assert.deepEqual(parseDelimited("a\nb\nc", ",", 2), { rows: [["a"], ["b"]], truncated: true });
});

test("parseDelimited: a last record of one quoted empty cell is a row", () => {
  assert.deepEqual(parseDelimited('name\n""', ",").rows, [["name"], [""]]);
  assert.deepEqual(parseDelimited('name\n""\n', ",").rows, [["name"], [""]]);
  assert.deepEqual(parseDelimited("name\n", ",").rows, [["name"]], "a final line end adds no row");
});

test("columnWidths: a column only rows after the sample have still counts", () => {
  const rows = [["a", "b"], ["1", "2"], ["x", "y", "late"]];
  assert.equal(columnWidths(rows, { sample: 2 }).length, 3);
  assert.equal(columnWidths(rows, { sample: 2 })[2], 48);
});
