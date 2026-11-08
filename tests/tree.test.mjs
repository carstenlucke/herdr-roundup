// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// roundup-files' paths relative to the shown folder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirOf, baseOf, ancestors, within, relTo, join } from "../mods/roundup-files/tree.js";

test("dirOf, baseOf and ancestors split a relative path at its slashes", () => {
  assert.equal(dirOf("a/b/c.txt"), "a/b");
  assert.equal(dirOf("c.txt"), "");
  assert.equal(baseOf("a/b/c.txt"), "c.txt");
  assert.equal(baseOf("c.txt"), "c.txt");
  assert.deepEqual(ancestors("a/b/c.txt"), ["a/b", "a"]);
  assert.deepEqual(ancestors("c.txt"), []);
});

test("within is true for a path in the set or below one of its folders", () => {
  const set = new Set(["node_modules", "a/b"]);
  assert.ok(within(set, "node_modules"));
  assert.ok(within(set, "node_modules/x/y.js"));
  assert.ok(within(set, "a/b/c"));
  assert.ok(!within(set, "a"));
  assert.ok(!within(set, "a/bc"));
  assert.ok(!within(new Set(), "a"));
});

test("relTo: rel under the root, \"\" for the root, null outside, \\ normalized, a trailing slash ignored", () => {
  assert.equal(relTo("/r", "/r/a/b.md"), "a/b.md");
  assert.equal(relTo("/r", "/r"), "");
  assert.equal(relTo("/r/", "/r/a"), "a");
  assert.equal(relTo("/r//", "/r"), "");
  assert.equal(relTo("/r", "/rx/a"), null);
  assert.equal(relTo("/r", "/other"), null);
  assert.equal(relTo("C:\\repo", "C:\\repo\\src\\a.js"), "src/a.js");
  assert.equal(relTo("C:\\repo\\", "C:/repo/src"), "src");
  assert.equal(relTo(null, "/r/a"), null);
  assert.equal(relTo("/r", null), null);
});

test("join uses \\ under C:\\ or \\\\server roots and / otherwise", () => {
  assert.equal(join("/r", "a/b.md"), "/r/a/b.md");
  assert.equal(join("/r/", "a/b.md"), "/r/a/b.md");
  assert.equal(join("/", "a"), "/a");
  assert.equal(join("/r", ""), "/r");
  assert.equal(join("C:\\repo", "src/a.js"), "C:\\repo\\src\\a.js");
  assert.equal(join("C:\\", "a/b"), "C:\\a\\b");
  assert.equal(join("\\\\srv\\share", "a/b"), "\\\\srv\\share\\a\\b");
  // A root spelled with / on Windows keeps /: only C:\ and \\ roots switch.
  assert.equal(join("C:/repo", "src/a.js"), "C:/repo/src/a.js");
});
