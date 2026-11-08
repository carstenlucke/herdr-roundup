// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalize, pathKey, samePath, changedFile, dirname, localPath, native, relativePath } from "../mods/roundup-preview/paths.js";

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

test("changedFile: the file, its folder, or the same through a resolved link", () => {
  assert.ok(changedFile(["/tmp/p/a.md"], "/tmp/p/a.md"));
  assert.ok(changedFile(["/tmp/p"], "/tmp/p/a.md"), "the folder: too many changes to list");
  assert.ok(!changedFile(["/private/tmp/p/a.md"], "/tmp/p/a.md"));
  assert.ok(changedFile(["/private/tmp/p/a.md"], "/tmp/p/a.md", "/private/tmp/p/a.md"));
  assert.ok(!changedFile(["/private/tmp/p/b.md"], "/tmp/p/a.md", "/private/tmp/p/a.md"));
  assert.ok(!changedFile(["/tmp/p/b.md"], "/tmp/p/a.md", null));
});

// PTH-02
test("localPath, native and dirname: each system's own form", () => {
  assert.equal(localPath("//etc/x", "macos"), "/etc/x", "a panel at / joined root and path");
  assert.equal(localPath("///etc/x", "linux"), "/etc/x");
  assert.equal(localPath("//srv/share/x", "windows"), "//srv/share/x", "a share on Windows");
  assert.equal(native("C:/a/b.md", "windows"), "C:\\a\\b.md");
  assert.equal(native("/a/b.md", "macos"), "/a/b.md");
  assert.equal(native("/a/x\\y.md", "linux"), "/a/x\\y.md");
  assert.equal(dirname("/a"), "/");
  assert.equal(dirname("/"), "/");
  assert.equal(dirname("C:/a"), "C:/");
  assert.equal(dirname("C:\\a\\b.md"), "C:/a");
  assert.equal(dirname("//srv/share/x.md"), "//srv/share");
});

// MNU-06 (L1)
test("relativePath: from the repo root when it holds the file, else ~/…, else absolute", () => {
  assert.equal(relativePath("/r/a/b.md", "/r", "/Users/x"), "a/b.md");
  assert.equal(relativePath("/r/a.md", "/r/", "/Users/x"), "a.md");
  assert.equal(relativePath("/Users/x/n.md", null, "/Users/x"), "~/n.md");
  assert.equal(relativePath("/Users/x/r/a.md", "/elsewhere", "/Users/x"), "~/r/a.md");
  assert.equal(relativePath("/etc/hosts", "/r", "/Users/x"), "/etc/hosts");
  assert.equal(relativePath("/rr/a.md", "/r", null), "/rr/a.md", "a sibling with the root's name as its start");
  assert.equal(relativePath("/r/./x/../a.md", "/r", null), "a.md");
});

test("relativePath: case and slashes count on POSIX only", () => {
  assert.equal(relativePath("/R/a.md", "/r", null), "/R/a.md");
  assert.equal(relativePath("C:\\Repo\\Sub\\A.md", "c:/repo", "C:/Users/x"), "Sub/A.md");
  assert.equal(relativePath("C:/Users/X/n.md", null, "c:\\users\\x"), "~/n.md");
  assert.equal(relativePath("D:/x.md", "c:/repo", "C:/Users/x"), "D:/x.md");
});
