// node --test tests/
// A file's size as the preview's header shows it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatSize } from "../mods/roundup-preview/size.js";

// VW-25
test("formatSize: bytes, then KB, MB and GB with one decimal below ten", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(1023), "1023 B");
  assert.equal(formatSize(1024), "1 KB");
  assert.equal(formatSize(1536), "1.5 KB");
  assert.equal(formatSize(10240), "10 KB");
  assert.equal(formatSize(10 * 1024 - 1), "10 KB");
  assert.equal(formatSize(5.25 * 1024 ** 2), "5.3 MB");
  assert.equal(formatSize(3 * 1024 ** 3), "3 GB");
  assert.equal(formatSize(2048 * 1024 ** 3), "2048 GB", "stops at GB");
});

test("formatSize: no size for what isn't a size", () => {
  for (const v of [undefined, null, "12", NaN, -1, {}]) assert.equal(formatSize(v), "", String(v));
});
