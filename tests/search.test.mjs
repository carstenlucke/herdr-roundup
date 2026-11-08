// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// roundup-files' search: matching, the cursor after it, the index's age, and the folder watch's batches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { match, cursorAfter, outdated, gitMeta, unseen, placeable, unindexed, classify, applyRecheck, FIND_LIMIT, STALE_AGE, DIRTY_AGE, INDEX_AGE, CHECK_PATHS } from "../mods/roundup-files/search.js";

const git = (over = {}) => ({
  repo: true, known: true, status: new Map(), files: new Map(), untracked: new Set(), links: new Set(),
  gone: new Set(), rootUntracked: false, ignored: new Set(), rootIgnored: false, forced: new Set(), ...over,
});
// An index as ensureIndex builds it.
const index = (all, dirs = [], over = {}) => ({
  dirs: new Set(dirs), all: [...all], lower: all.map((r) => r.toLowerCase()), full: true, cut: [], files: all.length - dirs.length,
  source: "git", from: "git", known: new Set(all), added: new Set(), pending: new Set(), checking: false, at: 0, stale: false, held: false, dirty: false, ...over,
});

test("Matching is case-insensitive, name matches before path-only matches, no duplicates", () => {
  const i = index(["readme/x.txt", "src/README.md", "docs/Readme.md", "docs/readme.md", "other.txt"]);
  assert.deepEqual(match(i, "readme"), ["src/README.md", "docs/Readme.md", "docs/readme.md", "readme/x.txt"]);
  assert.deepEqual(match(i, "nothing"), []);
});

test("At most 200 matches", () => {
  const all = Array.from({ length: 450 }, (_, n) => `dir/file${n}.txt`);
  const hits = match(index(all, []), "file");
  assert.equal(FIND_LIMIT, 200);
  assert.equal(hits.length, 200);
  assert.equal(new Set(hits).size, 200);
});

test("After a search the cursor stays on a hit or a folder above one, else goes to the first hit", () => {
  const hits = ["src/a.js", "src/lib/b.js"];
  assert.deepEqual(cursorAfter(hits, "src/a.js", false), { cursor: "src/a.js", scroll: true });
  assert.deepEqual(cursorAfter(hits, "src", false), { cursor: "src", scroll: true });
  assert.deepEqual(cursorAfter(hits, "src/lib", true), { cursor: "src/lib", scroll: false });
  assert.deepEqual(cursorAfter(hits, "sr", false), { cursor: "src/a.js", scroll: true });
  assert.deepEqual(cursorAfter(hits, "", true), { cursor: "src/a.js", scroll: true });
  assert.deepEqual(cursorAfter([], "x", true), { cursor: "", scroll: true });
  assert.deepEqual(cursorAfter([], "", true), { cursor: "", scroll: false });
});

test("A quiet rerun scrolls only when the cursor changed", () => {
  assert.equal(cursorAfter(["a"], "a", true).scroll, false);
  assert.equal(cursorAfter(["b"], "a", true).scroll, true);
});

test("outdated: stale and ≥ 3 s, or ≥ 5 min, or dirty and ≥ 30 s", () => {
  assert.deepEqual([STALE_AGE, DIRTY_AGE, INDEX_AGE], [3000, 30000, 300000]);
  const at = 1_000_000, o = (flags, now) => Boolean(outdated({ at, stale: false, dirty: false, ...flags }, now));
  assert.equal(o({ stale: true }, at + 2999), false);
  assert.equal(o({ stale: true }, at + 3000), true);
  assert.equal(o({ dirty: true }, at + 29999), false);
  assert.equal(o({ dirty: true }, at + 30000), true);
  assert.equal(o({}, at + 299999), false);
  assert.equal(o({}, at + 300000), true);
});

test("gitMeta: excludes and config make it stale, the index dirty, other .git paths nothing", () => {
  assert.equal(gitMeta(".git/info/exclude"), "stale");
  assert.equal(gitMeta(".git/config"), "stale");
  assert.equal(gitMeta(".git/index"), "dirty");
  assert.equal(gitMeta(".git/HEAD"), null);
  assert.equal(gitMeta("src/.git/config"), null);
});

test("unseen: an ignored path outside open folders doesn't refresh; forced files and open folders do", () => {
  const g = git({ ignored: new Set(["node_modules"]), forced: new Set(["node_modules/keep.js"]), status: new Map([["node_modules/st.js", "M"]]) });
  const folders = new Set();
  assert.equal(unseen("node_modules/x/y.js", g, folders), true);
  assert.equal(unseen("node_modules/keep.js", g, folders), false);
  assert.equal(unseen("node_modules/st.js", g, folders), false);
  assert.equal(unseen("node_modules/x/y.js", g, new Set(["node_modules/x"])), false);
  // At the top level there is no closed folder to hide it.
  assert.equal(unseen("node_modules", g, folders), false);
  assert.equal(unseen("src/a.js", g, folders), false);
});

test("unseen: outside a repo closed folders don't refresh, except .git/ (git init)", () => {
  const g = git({ repo: false });
  assert.equal(unseen("src/a.js", g, new Set()), true);
  assert.equal(unseen("src/a.js", g, new Set(["src"])), false);
  assert.equal(unseen(".git/HEAD", g, new Set()), false);
  // Before git answered, or for the root, it can't tell.
  assert.equal(unseen("src/a.js", git({ known: false }), new Set()), false);
  assert.equal(unseen("", g, new Set()), false);
});

test("placeable: not into a cut-short index; from the disk only into a folder it holds", () => {
  assert.equal(placeable(index([], [], { full: false }), "a"), false);
  assert.equal(placeable(index([], []), "deep/new/a"), true);
  const disk = index(["src"], ["src"], { from: "disk" });
  assert.equal(placeable(disk, "src/a"), true);
  assert.equal(placeable(disk, "a"), true);
  assert.equal(placeable(disk, "other/a"), false);
});

test("unindexed: .git always; from git what it ignores; from the disk pruned folders and what lies too deep", () => {
  const g = git({ ignored: new Set(["logs"]) }), home = "/Users/a";
  assert.equal(unindexed("", true, g, "/r", home), false);
  assert.equal(unindexed(".git/HEAD", true, g, "/r", home), true);
  assert.equal(unindexed("sub/.git", false, g, "/r", home), true);
  assert.equal(unindexed("logs/a.log", true, g, "/r", home), true);
  assert.equal(unindexed("logs/a.log", false, g, "/r", home), false);
  assert.equal(unindexed("node_modules/x.js", false, g, "/r", home), true);
  assert.equal(unindexed("node_modules", false, g, "/r", home), false);
  const deep = Array.from({ length: 13 }, (_, n) => `d${n}`).join("/");
  assert.equal(unindexed(deep, false, g, "/r", home), true);
  assert.equal(unindexed(deep.split("/").slice(0, 12).join("/"), false, g, "/r", home), false);
  // At home only 5 levels.
  assert.equal(unindexed("a/b/c/d/e/f", false, g, home, home), true);
  assert.equal(unindexed("a/b/c/d/e", false, g, home, home), false);
});

// A batch of the folder watch in /r.
const batch = (paths, s) => classify(paths.map((p) => (p.startsWith("/") ? p : `/r/${p}`)), { root: "/r", real: null, home: "/Users/a", git: git(), folders: new Set(), index: null, job: null, ...s });

test("classify: an empty batch or a path it can't place refreshes the tree", () => {
  assert.equal(classify([], { root: "/r", real: null, home: "", git: git(), folders: new Set(), index: null, job: null }).shown, true);
  assert.equal(batch(["/elsewhere/a"], {}).shown, true);
  // Reported through the resolved root (/tmp is /private/tmp), it places.
  const g = git({ ignored: new Set(["target"]) });
  assert.equal(batch(["/private/r/target/a.o"], { git: g }).shown, true);
  assert.equal(batch(["/private/r/target/a.o"], { git: g, real: "/private/r" }).shown, false);
});

test("classify: a batch touching only ignored paths outside open folders doesn't refresh; .git itself counts as a drop", () => {
  const g = git({ ignored: new Set(["target"]) });
  assert.deepEqual(batch(["target/debug/a.o", "target/debug/b.o"], { git: g }), { shown: false, drops: 0, recheck: [] });
  assert.equal(batch(["target/debug/a.o", "src/main.rs"], { git: g }).shown, true);
  assert.equal(batch([".git"], { git: g }).drops, 1);
});

test("classify: the root or a known folder makes the index stale; a known file dirty", () => {
  let i = index(["src", "src/a.js"], ["src"]);
  batch(["src"], { index: i });
  assert.equal(i.stale, true);
  i = index(["src", "src/a.js"], ["src"]);
  batch(["/r"], { index: i });
  assert.equal(i.stale, true);
  i = index(["src", "src/a.js"], ["src"]);
  assert.deepEqual(batch(["src/a.js"], { index: i }).recheck, []);
  assert.deepEqual([i.stale, i.dirty], [false, true]);
});

test("classify: new paths are rechecked one by one, more than 100 make the index stale", () => {
  let i = index(["src"], ["src"]);
  assert.deepEqual(batch(["src/new.js", "top.js"], { index: i }).recheck, ["src/new.js", "top.js"]);
  assert.equal(i.stale, false);
  i = index(["src"], ["src"]);
  const many = Array.from({ length: CHECK_PATHS + 1 }, (_, n) => `src/n${n}.js`);
  assert.deepEqual(batch(many, { index: i }).recheck, []);
  assert.equal(i.stale, true);
  i = index(["src"], ["src"]);
  assert.equal(batch(many.slice(0, CHECK_PATHS), { index: i }).recheck.length, CHECK_PATHS);
  // One recheck took in and changes again is checked again.
  i = index(["src", "src/t.js"], ["src"]);
  i.added.add("src/t.js");
  assert.deepEqual(batch(["src/t.js"], { index: i }).recheck, ["src/t.js"]);
});

test("classify: a cut-short index can't place a new path: stale when full, else dirty", () => {
  let i = index(["src"], ["src"], { from: "disk", source: "disk" });
  batch(["other/new.js"], { index: i });
  assert.equal(i.stale, true); // full, but from the disk only into folders it holds
  i = index(["src"], ["src"], { full: false, cut: ["files"] });
  assert.deepEqual(batch(["src/new.js"], { index: i }).recheck, []);
  assert.deepEqual([i.stale, i.dirty], [false, true]);
});

test("classify: from git, .gitignore, .git/info/exclude and .git/config make it stale, .git/index dirty, other .git paths nothing", () => {
  for (const p of [".gitignore", "src/.gitignore", ".git/info/exclude", ".git/config"]) {
    const i = index(["src"], ["src"]);
    batch([p], { index: i });
    assert.equal(i.stale, true, p);
  }
  let i = index(["src"], ["src"]);
  batch([".git/index"], { index: i });
  assert.deepEqual([i.stale, i.dirty], [false, true]);
  i = index(["src"], ["src"]);
  assert.deepEqual(batch([".git/HEAD", ".git/refs/heads/main"], { index: i }).recheck, []);
  assert.deepEqual([i.stale, i.dirty], [false, false]);
});

test("classify: from git ignored paths, from the disk pruned and too deep ones leave the index alone", () => {
  let i = index(["src"], ["src"]);
  batch(["logs/a.log"], { index: i, git: git({ ignored: new Set(["logs"]) }) });
  assert.deepEqual([i.stale, i.dirty], [false, false]);
  i = index(["src"], ["src"], { from: "disk", source: "disk" });
  assert.deepEqual(batch(["node_modules/x/y.js", Array.from({ length: 13 }, (_, n) => `d${n}`).join("/")], { index: i }).recheck, []);
  assert.deepEqual([i.stale, i.dirty], [false, false]);
});

test("classify: from the disk a new path named like a pruned folder is rechecked where it can be placed, else left out", () => {
  let i = index(["src"], ["src"], { from: "disk", source: "disk" });
  assert.deepEqual(batch(["dist"], { index: i }).recheck, ["dist"]);
  i = index(["src"], ["src"], { from: "disk", source: "disk" });
  assert.deepEqual(batch(["other/dist"], { index: i }).recheck, []);
  assert.deepEqual([i.stale, i.dirty], [false, false]);
});

test("classify marks a running build's job: changedGit and changedDisk by each source's rules", () => {
  const g = git({ ignored: new Set(["logs"]) });
  let job = {};
  batch(["src/a.js"], { job, git: g });
  assert.deepEqual(job, { changedGit: true, changedDisk: true });
  job = {};
  batch(["logs/a.log"], { job, git: g });
  assert.deepEqual(job, { changedDisk: true });
  job = {};
  batch(["node_modules/a.js"], { job, git: g });
  assert.deepEqual(job, { changedGit: true });
  job = {};
  batch([".git/index"], { job, git: g });
  assert.deepEqual(job, { changedGit: true });
  job = {};
  batch([".git/HEAD"], { job, git: g });
  assert.deepEqual(job, {});
});

test("applyRecheck keeps index.lower parallel to index.all through adds and drops", () => {
  const i = index(["src", "src/A.js"], ["src"]);
  assert.equal(applyRecheck(i, ["src/New.js", "Fresh"], ["src/New.js", "Fresh/B.txt"], ["Fresh"]), "moved");
  assert.deepEqual(i.all, ["src", "src/A.js", "Fresh", "src/New.js", "Fresh/B.txt"]);
  assert.deepEqual(i.lower, i.all.map((r) => r.toLowerCase()));
  assert.equal(i.files, 3);
  assert.ok(i.dirs.has("Fresh"));
  // Fresh is gone again: it goes with what was taken in below it; src/A.js stays.
  assert.equal(applyRecheck(i, ["Fresh"], [], []), "moved");
  assert.deepEqual(i.all, ["src", "src/A.js", "src/New.js"]);
  assert.deepEqual(i.lower, ["src", "src/a.js", "src/new.js"]);
  assert.equal(i.files, 2);
  assert.ok(!i.dirs.has("Fresh"));
  assert.deepEqual([...i.added], ["src/New.js"]);
  // Nothing new and nothing gone.
  assert.equal(applyRecheck(i, ["src/New.js"], ["src/New.js"], []), "same");
});

test("applyRecheck: past the index's limits it answers stale and takes nothing in", () => {
  const i = index(["a"], [], { files: 40000 });
  assert.equal(applyRecheck(i, ["b"], ["b"], []), "stale");
  assert.deepEqual(i.all, ["a"]);
  const d = index([], [], { from: "disk" });
  d.dirs = new Set(Array.from({ length: 20000 }, (_, n) => `d${n}`));
  assert.equal(applyRecheck(d, ["x"], [], ["x"]), "stale");
  // From git, folders don't count against INDEX_DIRS.
  const g = index([], []);
  g.dirs = new Set(Array.from({ length: 20000 }, (_, n) => `d${n}`));
  assert.equal(applyRecheck(g, ["x"], [], ["x"]), "moved");
});
