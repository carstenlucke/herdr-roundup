// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
// roundup-pane's header: the folder, the id chip, a name from before pane.rename.
import { test } from "node:test";
import assert from "node:assert/strict";
import { folder, paneId, paneFrame, oldName, OLD_LABEL, OLD_NAMES } from "../mods/roundup-pane/header-text.js";

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

test("PAN-122: an old name is given to a pane without a name, dropped once the pane has one or when it is blank", () => {
  assert.equal(OLD_LABEL, "roundup-pane.name");
  assert.equal(OLD_NAMES, "roundup-pane.names");
  const term = { pane: "p1", terminal: "t1", name: null }, mod = { pane: "m1", terminal: null, name: null };
  assert.equal(oldName(term, {}, { p1: "not a terminal's" }), null);
  assert.equal(oldName(term, undefined, null), null);
  assert.equal(oldName(mod, { [OLD_LABEL]: "not a mod pane's" }, { m2: "Other" }), null);
  assert.deepEqual(oldName(term, { [OLD_LABEL]: " Build " }, null), { name: "Build", step: "give" });
  assert.deepEqual(oldName({ ...term, name: "Server" }, { [OLD_LABEL]: "Build" }, null), { name: "Build", step: "drop" }, "the pane's name wins");
  assert.deepEqual(oldName(term, { [OLD_LABEL]: "  " }, null), { name: "", step: "drop" }, "blank: nothing to give");
  assert.deepEqual(oldName(mod, null, { m1: "Docs" }), { name: "Docs", step: "give" });
  assert.deepEqual(oldName({ ...mod, name: "Docs" }, null, { m1: "Docs" }), { name: "Docs", step: "drop" });
});

test("PAN-123: paneFrame is the layout's first visible tab frame, a stack's active child counting, hidden blocks not", () => {
  const frame = (position) => ({ id: "f", content: { tab: "active", pane: { header: { position } } } });
  assert.equal(paneFrame(null), null);
  assert.equal(paneFrame({ id: "root", children: [{ id: "side", content: { mod: "x" } }] }), null);
  assert.deepEqual(paneFrame({ id: "root", children: [{ id: "side" }, frame("bottom")] }).header.position, "bottom");
  assert.equal(paneFrame({ id: "root", children: [{ ...frame("bottom"), hidden: true }] }), null);
  const stack = { id: "s", type: "stack", active: "f", children: [{ id: "other", content: { mod: "x" } }, frame("top")] };
  assert.deepEqual(paneFrame(stack).header.position, "top", "the stack's active child");
  assert.equal(paneFrame({ ...stack, active: "other" }), null, "a frame behind the stack's shown child doesn't count");
  assert.deepEqual(paneFrame({ ...stack, active: "gone" })?.header, undefined, "no active child: the first visible one");
});
