// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { svgSize } from "../mods/roundup-preview/svg-size.js";

test("svgSize: stroke-width is no width", () => {
  assert.deepEqual(svgSize('<svg stroke-width="2" viewBox="0 0 24 24">'), { width: 24, height: 24 });
  assert.deepEqual(svgSize('<svg width="10px" height="20" viewBox="0 0 24 24">'), { width: 10, height: 20 });
  assert.deepEqual(svgSize("<svg>"), { width: 300, height: 150 });
});
