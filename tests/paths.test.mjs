// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize, pathKey, samePath, changedFile, dirname } from "../mods/roundup-preview/paths.js";

test("roundup-files' paths.js is a copy of roundup-preview's", () => {
  const read = (m) => readFileSync(new URL(`../mods/${m}/paths.js`, import.meta.url), "utf8");
  assert.equal(read("roundup-files"), read("roundup-preview"));
});

test("Windows paths: \\ and /, case, . and .. are one path", () => {
  assert.ok(samePath("C:\\repo\\b.md", "C:/repo/b.md"));
  assert.ok(samePath("c:/REPO/./x/../b.md", "C:\\repo\\b.md"));
  assert.ok(samePath("\\\\?\\C:\\repo\\b.md", "C:\\repo\\b.md"));
  assert.ok(samePath("\\\\srv\\share\\b.md", "//srv/share/b.md"));
  assert.equal(pathKey("C:\\Repo\\B.md"), "c:/repo/b.md");
});

test("POSIX paths keep case and a backslash in a name", () => {
  assert.ok(!samePath("/a/B.md", "/a/b.md"));
  assert.ok(!samePath("/a/x\\y.md", "/a/x/y.md"));
  assert.ok(samePath("/a//./b.md", "/a/b.md"));
  assert.equal(normalize("/a/x/../b.md"), "/a/b.md");
  assert.equal(dirname("/a/b.md"), "/a");
});

test("changedFile: the file, or its folder when the list overflowed", () => {
  assert.ok(changedFile(["/a/b.md"], "/a/b.md"));
  assert.ok(changedFile(["/a"], "/a/b.md"));
  assert.ok(!changedFile(["/a/c.md"], "/a/b.md"));
  assert.ok(changedFile(["\\\\?\\C:\\Repo\\b.md"], "C:/repo/B.md"));
});
