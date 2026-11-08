// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
// roundup-pane's header: the folder, the id chip, a saved name.
import { test } from "node:test";
import assert from "node:assert/strict";
import { folder, paneId, cutName, MAX_NAME } from "../mods/roundup-pane/header-text.js";

test("folder: home is ~, below home ~/…, a sibling that only starts like home stays, null is \"\"", () => {
  assert.equal(folder("/Users/a", "/Users/a"), "~");
  assert.equal(folder("/Users/a/src/x", "/Users/a"), "~/src/x");
  assert.equal(folder("/Users/ab", "/Users/a"), "/Users/ab");
  assert.equal(folder("/tmp", "/Users/a"), "/tmp");
  assert.equal(folder(null, "/Users/a"), "");
  assert.equal(folder("", "/Users/a"), "");
});

test("paneId: a terminal shows and copies its address", () => {
  assert.deepEqual(paneId({ terminal: "t7", pane: "p1234567abc" }), { shown: "t7", copied: "t7" });
  assert.deepEqual(paneId({ terminal: "m/t7", pane: "m/p1234567abc" }), { shown: "m/t7", copied: "m/t7" });
});

test("paneId: a mod pane p + 7 or more hex shows p + 6 hex + …, a machine prefix kept, and copies the full id", () => {
  assert.deepEqual(paneId({ terminal: null, pane: "p0123456789abcdef" }), { shown: "p012345…", copied: "p0123456789abcdef" });
  assert.deepEqual(paneId({ terminal: null, pane: "p0123456" }), { shown: "p012345…", copied: "p0123456" });
  assert.deepEqual(paneId({ terminal: null, pane: "box/p0123456789" }), { shown: "box/p012345…", copied: "box/p0123456789" });
  // Six hex or fewer, or not hex: shown whole.
  assert.deepEqual(paneId({ terminal: null, pane: "p012345" }), { shown: "p012345", copied: "p012345" });
  assert.deepEqual(paneId({ terminal: null, pane: "pane-x" }), { shown: "pane-x", copied: "pane-x" });
});

test("A saved name is trimmed and cut at 48 code points, never inside an emoji", () => {
  assert.equal(MAX_NAME, 48);
  assert.equal(cutName("  build  "), "build");
  assert.equal(cutName(""), "");
  assert.equal(cutName("   "), "");
  const emoji = "😀".repeat(60);
  assert.equal(Array.from(cutName(emoji)).length, 48);
  assert.equal(cutName(emoji), "😀".repeat(48));
  // A cut that ends on a space is trimmed again.
  assert.equal(cutName("a".repeat(47) + " b"), "a".repeat(47));
});
