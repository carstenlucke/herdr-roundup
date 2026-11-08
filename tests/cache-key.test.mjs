// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// roundup-preview's names for cached pages and pictures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { key, downloadKey } from "../mods/roundup-preview/cache-key.js";

test("key (FNV-1a, base 36) is stable per path and differs for two", () => {
  assert.equal(key("/r/a.pdf"), key("/r/a.pdf"));
  assert.notEqual(key("/r/a.pdf"), key("/r/b.pdf"));
  assert.match(key("/r/a.pdf"), /^[0-9a-z]+$/);
  // FNV-1a's offset basis for the empty text.
  assert.equal(key(""), (2166136261).toString(36));
});

test("Each download of the same URL gets a name of its own", () => {
  const url = "https://example.com/a.png";
  const a = downloadKey(url, 1_700_000_000_000, 0.123456789), b = downloadKey(url, 1_700_000_000_000, 0.987654321);
  assert.notEqual(a, b);
  assert.ok(a.startsWith(`${key(url)}-${(1_700_000_000_000).toString(36)}`));
  assert.notEqual(downloadKey(url, 1, 0.5), downloadKey(url, 2, 0.5));
  assert.match(a, /^[0-9a-z]+-[0-9a-z]+$/);
});
