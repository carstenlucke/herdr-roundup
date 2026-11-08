// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
// open-file.js's rules for the floating window's FLOAT record and a preview copy's start.
import { test } from "node:test";
import assert from "node:assert/strict";
import { floatShows, floatMoved, releasesFloat, startFile } from "../mods/roundup-preview/open-file.js";
// roundup-files' copy is the same file: tests/open-file.test.mjs compares them.

test("After the window follows a link or goes Back, FLOAT.file is the shown file while it holds its token", () => {
  const f = { id: "ov1", file: "/r/a.md", on: null, token: "w1", copy: "c1" };
  assert.deepEqual(floatMoved(f, "w1", "/r/b.md"), { ...f, file: "/r/b.md" });
  // Another window took FLOAT: it is left alone.
  assert.equal(floatMoved({ ...f, token: "w2" }, "w1", "/r/b.md"), null);
  assert.equal(floatMoved(null, "w1", "/r/b.md"), null);
});

test("floatShows: the file FLOAT names, on the same machine, however the path is written", () => {
  const f = { file: "C:/repo/docs/b.md", on: null, token: "w1" };
  assert.ok(floatShows(f, "C:\\repo\\docs\\b.md", null));
  assert.ok(floatShows(f, "C:\\repo\\docs\\b.md", undefined));
  assert.ok(!floatShows(f, "C:\\repo\\docs\\c.md", null));
  assert.ok(!floatShows(f, "C:\\repo\\docs\\b.md", "m"));
  assert.ok(floatShows({ file: "/r/a.md", on: "m" }, "/r/a.md", "m"));
  // An unanswered probe: the window may be gone, nothing follows.
  assert.ok(!floatShows({ ...f, probe: "p" }, "C:\\repo\\docs\\b.md", null));
  assert.ok(floatShows({ ...f, probe: "p", alive: "p" }, "C:\\repo\\docs\\b.md", null));
  assert.ok(!floatShows(null, "/r/a.md", null));
  assert.ok(!floatShows({ token: "w1" }, "/r/a.md", null));
});

test("The window's close() clears FLOAT only while it holds its token and copy", () => {
  const f = { file: "/r/a.md", token: "w1", copy: "c1" };
  assert.equal(releasesFloat(f, "w1", "c1"), true);
  assert.equal(releasesFloat(f, "w1", "c0"), false); // a later copy of this window took it
  assert.equal(releasesFloat(f, "w2", "c1"), false); // another window opened in its place
  assert.equal(releasesFloat({ file: "/r/a.md", token: "w1" }, "w1", "c1"), true); // no copy written yet
  assert.equal(releasesFloat(null, "w1", "c1"), false);
  assert.equal(releasesFloat(f, null, "c1"), false); // a tab or split, not the window
});

test("A tab copy that starts again shows its token's MOVED file, a window copy FLOAT.file when FLOAT holds its token", () => {
  const moved = { t1: "/r/b.md" };
  assert.equal(startFile({ file: "/r/a.md", token: "t1" }, null, moved), "/r/b.md");
  assert.equal(startFile({ file: "/r/a.md", token: "t2" }, null, moved), "/r/a.md");
  assert.equal(startFile({ file: "/r/a.md" }, null, moved), "/r/a.md");
  assert.equal(startFile({ file: "/r/a.md", token: "t1" }, null, null), "/r/a.md");
  const f = { file: "/r/c.md", token: "w1" };
  assert.equal(startFile({ file: "/r/a.md", float: "w1" }, f, moved), "/r/c.md");
  assert.equal(startFile({ file: "/r/a.md", float: "w2" }, f, moved), "/r/a.md");
  // The window ignores MOVED, even under a token.
  assert.equal(startFile({ file: "/r/a.md", float: "w2", token: "t1" }, f, moved), "/r/a.md");
  assert.equal(startFile({ file: "/r/a.md", float: "w1" }, null, moved), "/r/a.md");
});
