// roundup-files' git.js against real git repos in temp folders (L2: herdr stubbed, exec runs git).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, rmSync, statSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { herdr, reset } from "./support/harness.mjs";
import { tempDir, cleanup, git, write, link, repo, commit, snapshot } from "./support/git-repo.mjs";

const { readGit, listFiles, runGit } = await import("../mods/roundup-files/git.js");

beforeEach(reset);
after(cleanup);

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "diff.relative=false"];
const sorted = (iterable) => [...iterable].sort();
const letters = (g) => Object.fromEntries([...g.files.keys()].sort().map((rel) => [rel, g.status.get(rel)]));

// A repo with one of each: modified, staged, deleted, untracked, ignored, a space in a path, and an
// upstream it is 2 commits ahead of.
function busyRepo() {
  const upstream = tempDir("roundup-bare-");
  git(upstream, "init", "-q", "--bare");
  const dir = repo({ ".gitignore": "*.log\n", "mod.txt": "a\n", "del.txt": "x\n", "sub/inner.txt": "1\n", "sub/with space.txt": "s\n" });
  git(dir, "remote", "add", "origin", upstream);
  git(dir, "push", "-q", "-u", "origin", "main");
  write(dir, { "ahead1.txt": "1\n" }); commit(dir, "ahead 1");
  write(dir, { "ahead2.txt": "2\n" }); commit(dir, "ahead 2");
  write(dir, { "mod.txt": "a\nb\n", "staged.txt": "new\n", "new.txt": "?\n", "build.log": "ignored\n", "sub/with space.txt": "s\nt\n", "sub/fresh.txt": "f\n" });
  git(dir, "add", "staged.txt");
  rmSync(join(dir, "del.txt"));
  return dir;
}

// What `git status --porcelain=v1 -z` lists (path → XY), to hold readGit's entries against.
function v1(dir) {
  const out = {};
  for (const rec of git(dir, "status", "--porcelain=v1", "-z", "--untracked-files=normal", "--", ".").split("\0")) if (rec) out[rec.slice(3)] = rec.slice(0, 2);
  return out;
}

test("readGit lists the same entries as git status, with the branch 2 ahead, from the root and from a subfolder", async () => {
  const dir = busyRepo();
  const g = await readGit(dir, null);
  assert.equal(g.repo, true);
  assert.equal(g.failed, false);
  assert.deepEqual(letters(g), { "del.txt": "D", "mod.txt": "M", "new.txt": "?", "staged.txt": "A", "sub/fresh.txt": "?", "sub/with space.txt": "M" });
  assert.deepEqual(sorted(g.files.keys()), sorted(Object.keys(v1(dir))));
  assert.deepEqual(sorted(g.ignored), ["build.log"]);
  assert.equal(g.records + g.ignored.size, 7);
  assert.match(git(dir, "status", "-sb").split("\n")[0], /\[ahead 2\]/);
  assert.equal(g.branch.ahead, 2);
  assert.equal(g.branch.behind, 0);
  assert.equal(g.branch.head, "main");
  assert.equal(g.branch.upstream, "origin/main");
  assert.equal(g.gone.has("del.txt"), true);

  const s = await readGit(join(dir, "sub"), null);
  assert.equal(s.prefix, "sub/");
  assert.equal(s.top, dir);
  assert.deepEqual(letters(s), { "fresh.txt": "?", "with space.txt": "M" });
  assert.deepEqual(sorted(s.files.keys()), sorted(Object.keys(v1(join(dir, "sub")))).map((p) => p.replace(/^sub\//, "")).sort());
  assert.equal(s.branch.ahead, 2);
});

test("readGit sums numstat lines into folders, binary files count 0, a user's diff.relative=true changes nothing", async () => {
  const dir = repo({ "a/x.txt": "1\n2\n3\n", "a/pic.bin": Buffer.from([0, 1, 2, 0]), "top.txt": "t\n" });
  write(dir, { "a/x.txt": "1\n3\n4\n5\n", "a/pic.bin": Buffer.from([0, 9, 9, 0, 7]), "top.txt": "t\nu\n" });
  const g = await readGit(dir, null);
  assert.deepEqual(g.diff.get("a/x.txt"), [2, 1]);
  assert.deepEqual(g.diff.get("a/pic.bin"), [0, 0]);
  assert.deepEqual(g.diff.get("a"), [2, 1]);
  assert.deepEqual(g.diff.get(""), [3, 1]);
  git(dir, "config", "diff.relative", "true");
  const sub = await readGit(join(dir, "a"), null);
  assert.deepEqual(sub.diff.get("x.txt"), [2, 1]);
  assert.deepEqual(sub.diff.get(""), [2, 1], "only lines below the shown folder");
  assert.equal(sub.diff.has("top.txt"), false);
});

test("readGit before the first commit: status loads, no lines, not failed", async () => {
  const dir = repo();
  write(dir, { "a.txt": "a\n", "b/c.txt": "c\n" });
  git(dir, "add", "a.txt");
  const g = await readGit(dir, null);
  assert.equal(g.failed, false);
  assert.deepEqual(letters(g), { "a.txt": "A", "b": "?" });
  assert.equal(g.diff.size, 0);
});

test("readGit in a folder never added (outer/deep/newdir) is rootUntracked with one record; the repo root isn't", async () => {
  const dir = repo({ "kept.txt": "k\n" });
  write(dir, { "deep/newdir/f.txt": "f\n" });
  const g = await readGit(join(dir, "deep", "newdir"), null);
  assert.equal(g.rootUntracked, true);
  assert.equal(g.records, 1);
  assert.deepEqual(g.counts.get(""), [1, 0, 0]);
  const root = await readGit(dir, null);
  assert.equal(root.rootUntracked, false);
  assert.deepEqual(letters(root), { deep: "?" });
});

test("readGit lists an untracked repo inside the repo as one untracked folder, nothing below it", async () => {
  const dir = repo({ "kept.txt": "k\n" });
  repo({ "inner.txt": "i\n" }, join(dir, "nested"));
  const g = await readGit(dir, null);
  assert.deepEqual(sorted(g.untracked), ["nested"]);
  assert.deepEqual(sorted(g.files.keys()), ["nested"]);
  assert.equal(g.status.get("nested"), "?");
});

test("readGit puts a submodule into links", async () => {
  const lib = repo({ "lib.txt": "l\n" });
  const dir = repo({ "kept.txt": "k\n" });
  git(dir, "submodule", "add", "-q", lib, "vendor/lib");
  const g = await readGit(dir, null);
  assert.equal(g.links.has("vendor/lib"), true);
  assert.equal(g.status.get("vendor/lib"), "A");
});

test("readGit after git rm --cached: letter D, not gone, two changes", async () => {
  const dir = repo({ "f.txt": "f\n", "other.txt": "o\n" });
  git(dir, "rm", "-q", "--cached", "f.txt");
  const g = await readGit(dir, null);
  assert.equal(g.status.get("f.txt"), "D");
  assert.equal(g.gone.has("f.txt"), false, "still on disk: not struck through");
  assert.equal(g.records, 2, "git lists it twice: deleted in the index, untracked on disk");
  assert.deepEqual(g.counts.get(""), [1, 0, 1]);
});

test("readGit puts a file deleted from the working tree into gone", async () => {
  const dir = repo({ "f.txt": "f\n", "d/g.txt": "g\n" });
  rmSync(join(dir, "d", "g.txt"));
  const g = await readGit(dir, null);
  assert.deepEqual(sorted(g.gone), ["d/g.txt"]);
  assert.equal(g.status.get("d"), "D");
});

test("readGit asks the disk about absent paths below an untracked folder: missing → gone, a folder → links, a failed lookup → there", async () => {
  const dir = repo({ "u/missing.txt": "m\n", "u/kept.txt": "k\n", "real/x.txt": "x\n" });
  link(dir, "u/to-real", "../real");
  commit(dir, "a link");
  // Out of the index, so u/ is untracked as a whole and git can't tell what of it is there.
  git(dir, "rm", "-q", "-r", "--cached", "u");
  rmSync(join(dir, "u", "missing.txt"));
  const g = await readGit(dir, null);
  assert.deepEqual(sorted(g.untracked), ["u"]);
  assert.deepEqual(sorted(g.gone), ["u/missing.txt"]);
  assert.equal(g.links.has("u/to-real"), true);
  assert.equal(g.gone.has("u/kept.txt"), false);

  herdr.onExec((c) => (c.command === "sh" ? new Error("cannot start sh") : undefined));
  const failed = await readGit(dir, null);
  assert.equal(failed.gone.size, 0, "unchecked paths count as there");
  assert.equal(failed.unsure.has("u/missing.txt"), true);
});

test("readGit keeps an ignored folder as one dimmed path, also a new folder of only ignored files", async () => {
  const dir = repo({ ".gitignore": "node_modules/\nlogs/*\n", "kept.txt": "k\n" });
  write(dir, { "node_modules/a/b.js": "b\n", "node_modules/c.js": "c\n", "logs/x.log": "x\n", "logs/y.log": "y\n" });
  const g = await readGit(dir, null);
  assert.deepEqual(sorted(g.ignored), ["logs", "node_modules"]);
  assert.equal(g.files.size, 0);
});

test("readGit puts a file added with -f in an ignored folder, and its folders, into forced", async () => {
  const dir = repo({ ".gitignore": "ign/\n", "kept.txt": "k\n" });
  write(dir, { "ign/deep/keep.txt": "k\n", "ign/other.txt": "o\n" });
  git(dir, "add", "-f", "ign/deep/keep.txt");
  commit(dir, "forced");
  const g = await readGit(dir, null);
  assert.deepEqual(sorted(g.forced), ["ign", "ign/deep", "ign/deep/keep.txt"]);
  assert.equal(g.ignored.has("ign/other.txt"), true);
});

test("readGit and listFiles in a folder inside an ignored one: rootIgnored, and listFiles gives null", async () => {
  const dir = repo({ ".gitignore": "ign/\n", "kept.txt": "k\n" });
  write(dir, { "ign/sub/a.txt": "a\n" });
  const root = join(dir, "ign", "sub");
  const g = await readGit(root, null);
  assert.equal(g.rootIgnored, true);
  assert.equal(await listFiles(root, null, 1000), null);
});

test("readGit takes a tracked link to a folder and an untracked one as maybeDirs, and links when they are folders", async () => {
  const dir = repo({ "real/x.txt": "x\n" });
  link(dir, "tracked-link", "real");
  link(dir, "file-link", "real/x.txt");
  git(dir, "add", "tracked-link", "file-link");
  link(dir, "new-link", "real");
  const g = await readGit(dir, null);
  assert.deepEqual(sorted(g.maybeDirs), ["file-link", "new-link", "tracked-link"]);
  assert.deepEqual(sorted(g.links), ["new-link", "tracked-link"]);
});

test("readGit with a stored base reads again without it when a repo was made in between", async () => {
  const dir = repo({ "kept.txt": "k\n" });
  write(dir, { "a/b/x.txt": "x\n" });
  const root = join(dir, "a", "b");
  const first = await readGit(root, null);
  assert.equal(first.prefix, "a/b/");
  git(join(dir, "a"), "init", "-q");
  herdr.clear();
  const again = await readGit(root, null, { top: first.top, prefix: first.prefix });
  assert.equal(again.top, join(dir, "a"));
  assert.equal(again.prefix, "b/");
  assert.equal(again.failed, false);
  assert.equal(herdr.calls("exec").filter(([, args]) => args.includes("rev-parse")).length, 1, "rev-parse once, after the base failed");
});

test("readGit with a corrupt index: failed, not clean", async () => {
  const dir = repo({ "kept.txt": "k\n" });
  writeFileSync(join(dir, ".git", "index"), "not an index");
  const g = await readGit(dir, null);
  assert.equal(g.repo, true);
  assert.equal(g.failed, true);
  assert.equal(g.files.size, 0);
});

test("readGit outside a repo: repo false, known; without git: missing", async () => {
  const dir = tempDir("roundup-plain-");
  const g = await readGit(dir, null);
  assert.equal(g.repo, false);
  assert.equal(g.known, true);
  assert.equal(g.missing, false);
  herdr.failExec(() => true);
  const none = await readGit(dir, "nogit");
  assert.equal(none.missing, true);
  assert.equal(none.repo, false);
});

test("runGit on Windows tries Git for Windows' two places and keeps the first that starts; not with on", async () => {
  const fresh = await import("../mods/roundup-files/git.js?windows");
  herdr.set({ window: { ...herdr.stub.window, platform: "windows" }, home: "C:\\Users\\me" });
  const appData = "C:\\Users\\me\\AppData\\Local\\Programs\\Git\\cmd\\git.exe";
  herdr.onExec((c) => (c.command === appData ? { code: 0, stdout: "ok\n" } : new Error(`cannot start ${c.command}: program not found`)));
  const r = await fresh.runGit(["status"], "C:\\repo", null);
  assert.equal(r.stdout, "ok\n");
  assert.deepEqual(herdr.calls("exec").map(([cmd]) => cmd), ["git", "C:\\Program Files\\Git\\cmd\\git.exe", appData]);
  herdr.clear();
  await fresh.runGit(["status"], "C:\\repo", null);
  assert.deepEqual(herdr.calls("exec").map(([cmd]) => cmd), [appData], "kept for this machine");
  herdr.clear();
  await assert.rejects(fresh.runGit(["status"], "C:\\repo", "vps"));
  assert.deepEqual(herdr.calls("exec").map(([cmd]) => cmd), ["git"], "no fallback on another machine");
});

test("readGit keeps leading and trailing spaces of folder names", async () => {
  const parent = tempDir("roundup-spaces-");
  const dir = repo({ " in /f.txt": "f\n" }, join(parent, " sp "));
  write(dir, { " in /f.txt": "g\n" });
  const g = await readGit(join(dir, " in "), null);
  assert.equal(g.top, dir);
  assert.equal(g.prefix, " in /");
  assert.deepEqual(letters(g), { "f.txt": "M" });
});

test("readGit passes the read-only flags to every git call and writes nothing under .git", async () => {
  const dir = busyRepo();
  // A tracked file touched but unchanged: a plain status would refresh the index and rewrite it.
  utimesSync(join(dir, "sub", "inner.txt"), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
  const before = snapshot(join(dir, ".git"));
  const index = statSync(join(dir, ".git", "index")).mtimeMs;
  await readGit(dir, null);
  const gitCalls = herdr.calls("exec").filter(([cmd]) => cmd === "git");
  assert.ok(gitCalls.length >= 5);
  for (const [, args] of gitCalls) assert.deepEqual(args.slice(0, READ.length), READ);
  assert.equal(statSync(join(dir, ".git", "index")).mtimeMs, index);
  assert.deepEqual(snapshot(join(dir, ".git")), before);
  git(dir, "status", "--porcelain");
  assert.notEqual(statSync(join(dir, ".git", "index")).mtimeMs, index, "the fixture: a plain status does write the index");
});

test("listFiles lists tracked and untracked files without ignored ones, a tracked link to a folder as a folder", async () => {
  const dir = repo({ ".gitignore": "*.log\n", "a/x.txt": "x\n", "real/y.txt": "y\n" });
  link(dir, "tracked-link", "real");
  commit(dir, "link");
  link(dir, "new-link", "real");
  write(dir, { "b/new.txt": "n\n", "skip.log": "l\n" });
  const r = await listFiles(dir, null, 1000);
  assert.equal(r.full, true);
  assert.deepEqual(sorted(r.files), [".gitignore", "a/x.txt", "b/new.txt", "new-link", "real/y.txt"]);
  assert.deepEqual(sorted(r.dirs), ["a", "b", "real", "tracked-link"]);
  const cut = await listFiles(dir, null, 2);
  assert.equal(cut.full, false);
  assert.deepEqual(cut.cut, ["files"]);
  assert.equal(cut.files.size, 2);
});

test("listFiles lists a conflicted file once", async () => {
  const dir = repo({ "c.txt": "base\n" });
  git(dir, "checkout", "-q", "-b", "other");
  write(dir, { "c.txt": "other\n" }); commit(dir, "other");
  git(dir, "checkout", "-q", "main");
  write(dir, { "c.txt": "main\n" }); commit(dir, "main");
  assert.throws(() => git(dir, "merge", "-q", "other"));
  const r = await listFiles(dir, null, 1000);
  assert.deepEqual(sorted(r.files), ["c.txt"]);
  const g = await readGit(dir, null);
  assert.equal(g.status.get("c.txt"), "U");
});

test("listFiles gives null outside a repo and without git", async () => {
  const dir = tempDir("roundup-plain-");
  mkdirSync(join(dir, "x"));
  assert.equal(await listFiles(dir, null, 1000), null);
  herdr.failExec(() => true);
  assert.equal(await listFiles(dir, "nogit", 1000), null);
});

test("runGit rejects when git can't start in a folder that is gone", async () => {
  await assert.rejects(runGit(["status"], join(tempDir(), "missing"), "elsewhere"));
});
