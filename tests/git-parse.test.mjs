// roundup-files' git parsers (git-parse.js): git's porcelain v2, ls-files and numstat output, read without git.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyGit, parseStatus, parseIgnored, parseForced, parseNumstat, NEW, MODIFIED, DELETED } from "../mods/roundup-files/git-parse.js";

const H = "0123456789abcdef0123456789abcdef01234567";
// One record of `git status --porcelain=v2 -z`.
const changed = (xy, path, { sub = "N...", mW = "100644" } = {}) => `1 ${xy} ${sub} 100644 100644 ${mW} ${H} ${H} ${path}`;
const unmerged = (xy, path) => `u ${xy} N... 100644 100644 100644 100644 ${H} ${H} ${H} ${path}`;
const untracked = (path) => `? ${path}`;
const out = (...records) => records.join("\0") + "\0";
const parsed = (stdout, prefix = "") => {
  const git = emptyGit(true);
  git.prefix = prefix;
  const outside = parseStatus(stdout, git);
  return Object.assign(git, { outside });
};

test("parseStatus reads the branch header: head, detached, ahead/behind, an upstream that is gone", () => {
  const b = parsed(out("# branch.oid " + H, "# branch.head main", "# branch.upstream origin/main", "# branch.ab +2 -1")).branch;
  assert.deepEqual(b, { head: "main", detached: false, upstream: "origin/main", ahead: 2, behind: 1, gone: false });
  const detached = parsed(out("# branch.oid " + H, "# branch.head (detached)")).branch;
  assert.equal(detached.head, "HEAD");
  assert.equal(detached.detached, true);
  const gone = parsed(out("# branch.head topic", "# branch.upstream origin/topic")).branch;
  assert.equal(gone.upstream, "origin/topic");
  assert.equal(gone.gone, true, "an upstream without branch.ab is gone");
  assert.equal(gone.ahead, 0);
});

test("parseStatus gives each kind of change its letter and change", () => {
  const git = parsed(out(
    untracked("new.txt"), changed("A.", "added.txt"), changed(".M", "edited.txt"), changed("D.", "staged-del.txt"),
    changed(".D", "del.txt"), unmerged("UU", "both.txt"), unmerged("AA", "aa.txt"), unmerged("DD", "dd.txt"), changed("R.", "moved.txt"),
  ));
  const row = (rel) => [git.status.get(rel), git.files.get(rel)];
  assert.deepEqual(row("new.txt"), ["?", NEW]);
  assert.deepEqual(row("added.txt"), ["A", NEW]);
  assert.deepEqual(row("edited.txt"), ["M", MODIFIED]);
  assert.deepEqual(row("staged-del.txt"), ["D", DELETED]);
  assert.deepEqual(row("del.txt"), ["D", DELETED]);
  assert.deepEqual(row("both.txt"), ["U", MODIFIED]);
  assert.deepEqual(row("aa.txt"), ["U", MODIFIED]);
  assert.deepEqual(row("dd.txt"), ["U", MODIFIED]);
  assert.deepEqual(row("moved.txt"), ["R", MODIFIED]);
});

test("parseStatus gives a folder its strongest child's letter: U > D > M/R/T > A/C > ?", () => {
  const folder = (...records) => parsed(out(...records)).status.get("d");
  assert.equal(folder(untracked("d/a"), changed("A.", "d/b")), "A");
  assert.equal(folder(changed("A.", "d/b"), changed(".M", "d/c")), "M");
  assert.equal(folder(changed(".M", "d/c"), changed(".D", "d/e")), "D");
  assert.equal(folder(changed(".D", "d/e"), unmerged("UU", "d/f")), "U");
  assert.equal(folder(unmerged("UU", "d/f"), untracked("d/a")), "U", "a weaker one after doesn't win");
  assert.equal(parsed(out(changed(".M", "d/sub/x"))).status.get("d"), "M", "two levels up");
});

test("parseStatus counts [new, modified, deleted] in every folder above a path and in the whole; records skip the header", () => {
  const git = parsed(out("# branch.head main", untracked("a/b/new"), changed(".M", "a/edit"), changed(".D", "a/b/gone"), changed(".M", "top")));
  assert.deepEqual(git.counts.get(""), [1, 2, 1]);
  assert.deepEqual(git.counts.get("a"), [1, 1, 1]);
  assert.deepEqual(git.counts.get("a/b"), [1, 0, 1]);
  assert.equal(git.counts.has("a/b/new"), false, "files aren't folders");
  assert.equal(git.records, 4);
});

test("parseStatus keeps paths with spaces and with line feeds", () => {
  const git = parsed(out(changed(".M", "with space/a b.txt"), untracked("line\nfeed.txt"), changed(".M", " lead and trail ")));
  assert.deepEqual([...git.files.keys()].sort(), [" lead and trail ", "line\nfeed.txt", "with space/a b.txt"]);
  assert.equal(git.status.get("with space"), "M");
});

test("parseStatus maps paths below the prefix and counts the ones outside", () => {
  const git = parsed(out(changed(".M", "sub/a.txt"), changed(".M", "other/b.txt")), "sub/");
  assert.deepEqual([...git.files.keys()], ["a.txt"]);
  assert.equal(git.outside, 1);
});

test("parseIgnored keeps an ignored folder as one entry, skips what is below it and stops at 5,000", () => {
  const git = emptyGit(true);
  parseIgnored(["node_modules/", "node_modules/a/b.js", "logs/", "logs/x.log", "build.log", ""].join("\0"), git);
  assert.deepEqual([...git.ignored], ["node_modules", "logs", "build.log"]);
  const many = emptyGit(true);
  parseIgnored(Array.from({ length: 6000 }, (_, i) => `f${i}.log`).join("\0"), many);
  assert.equal(many.ignored.size, 5000);
});

test("parseForced marks a forced file and every folder above it", () => {
  const git = emptyGit(true);
  parseForced("ign/deep/keep.txt\0ign/other.txt\0", git);
  assert.deepEqual([...git.forced].sort(), ["ign", "ign/deep", "ign/deep/keep.txt", "ign/other.txt"]);
});

test("parseNumstat sums lines into folders and the whole, counts binary as 0 and drops paths outside the prefix", () => {
  const git = emptyGit(true);
  git.prefix = "sub/";
  parseNumstat(["3\t1\tsub/a/x.txt", "2\t0\tsub/a/y.txt", "-\t-\tsub/a/pic.png", "9\t9\tother/z.txt", ""].join("\0"), git);
  assert.deepEqual(git.diff.get("a/x.txt"), [3, 1]);
  assert.deepEqual(git.diff.get("a"), [5, 1]);
  assert.deepEqual(git.diff.get(""), [5, 1]);
  assert.deepEqual(git.diff.get("a/pic.png"), [0, 0]);
  assert.equal(git.diff.has("other/z.txt"), false);
});
