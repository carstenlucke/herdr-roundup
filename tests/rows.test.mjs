// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// roundup-files' rows: All from the disk, the search hits, Changed from git's paths, and their status.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diskRows, hitRows, changedRows, rowStatus, isIgnored, CHANGED_LIMIT } from "../mods/roundup-files/rows.js";

// What readGit answers, with only what a test sets.
const git = (over = {}) => ({
  repo: true, known: true, status: new Map(), files: new Map(), untracked: new Set(), links: new Set(),
  gone: new Set(), rootUntracked: false, ignored: new Set(), rootIgnored: false, forced: new Set(), ...over,
});
const file = (name, more = {}) => ({ name, dir: false, link: null, broken: false, blocked: false, ...more });
const dir = (name, more = {}) => ({ name, dir: true, link: null, broken: false, blocked: false, ...more });
const tree = (entries = {}, folders = [], shut = []) => ({ entries: new Map(Object.entries(entries)), folders: new Set(folders), shut: new Set(shut) });
const brief = (rows) => rows.map((r) => `${"  ".repeat(r.depth)}${r.name}${r.dir ? (r.open ? "/-" : "/+") : ""}${r.gone ? " (gone)" : ""}`);

test("All: the disk's entries, open folders below their row, links as listDir has them", () => {
  const t = tree({ "": [dir("src"), dir("docs"), file("a.md"), file("to", { link: "a.md" })], src: [file("x.js")] }, ["src"]);
  const rows = diskRows(t);
  assert.deepEqual(brief(rows), ["src/-", "  x.js", "docs/+", "a.md", "to"]);
  assert.deepEqual(rows[0], { rel: "src", name: "src", dir: true, depth: 0, open: true, gone: false, disk: true, link: null, broken: false, blocked: false });
  assert.equal(rows[1].rel, "src/x.js");
  assert.equal(rows[4].link, "a.md");
});

test("Changed lists exactly git.files as a tree, every folder open, folders first, natural order", () => {
  const files = new Map([["z.md", 1], ["src/b10.js", 1], ["src/b2.js", 0], ["src/lib/c.js", 2], ["a.md", 0]]);
  const { rows, cut } = changedRows(git({ files }), "", tree());
  assert.equal(cut, false);
  assert.deepEqual(brief(rows), ["src/-", "  lib/-", "    c.js", "  b2.js", "  b10.js", "a.md", "z.md"]);
  assert.ok(rows.every((r) => !r.disk));
});

test("Changed folds a folder git lists file by file once it is shut, and a search opens it again", () => {
  const files = new Map([["src/a.js", 1], ["src/b.js", 1]]);
  assert.deepEqual(brief(changedRows(git({ files }), "", tree({}, [], ["src"])).rows), ["src/+"]);
  assert.deepEqual(brief(changedRows(git({ files }), "a", tree({}, [], ["src"])).rows), ["src/-", "  a.js"]);
});

test("A search in Changed filters git's paths by case-insensitive substring (q comes lower case)", () => {
  const files = new Map([["src/Alpha.js", 1], ["src/beta.js", 1], ["README.md", 1]]);
  assert.deepEqual(brief(changedRows(git({ files }), "alpha", tree()).rows), ["src/-", "  Alpha.js"]);
  assert.deepEqual(changedRows(git({ files }), "nothing", tree()).rows, []);
});

test("With 2,501 changes Changed shows the first 2,000 paths plus their folders and says it cut", () => {
  const files = new Map();
  for (let i = 0; i < 2501; i++) files.set(`d${i % 10}/f${i}.txt`, 1);
  const { rows, cut } = changedRows(git({ files }), "", tree());
  assert.equal(CHANGED_LIMIT, 2000);
  assert.equal(cut, true);
  assert.equal(rows.filter((r) => !r.dir).length, 2000);
  assert.equal(rows.filter((r) => r.dir).length, 10);
  // A search down to 1,100 paths fits.
  const few = new Map([...files].slice(0, 1100));
  for (let i = 0; i < 1401; i++) few.set(`other/g${i}`, 1);
  const searched = changedRows(git({ files: few }), "/f", tree());
  assert.equal(searched.cut, false);
  assert.equal(searched.rows.filter((r) => !r.dir).length, 1100);
});

test("An untracked folder opens from disk and lists its entries plus git's paths below it that aren't there, as gone", () => {
  const g = git({ files: new Map([["new", 0], ["new/old.txt", 2]]), untracked: new Set(["new"]), gone: new Set(["new/old.txt"]) });
  const shut = changedRows(g, "", tree());
  assert.deepEqual(brief(shut.rows), ["new/+"]);
  assert.equal(shut.rows[0].disk, true);
  const t = tree({ new: [dir("sub"), file("a.txt"), file("ln", { link: "a.txt" })] }, ["new"]);
  const rows = changedRows(g, "", t).rows;
  assert.deepEqual(brief(rows), ["new/-", "  sub/+", "  a.txt", "  ln", "  old.txt (gone)"]);
  // Rows read from disk carry a link field; the gone one, only git's, a null link.
  assert.equal(rows.find((r) => r.name === "ln").link, "a.txt");
  assert.equal(rows.find((r) => r.name === "a.txt").link, null);
  assert.equal(rows.find((r) => r.name === "sub").disk, true);
});

test("A submodule row opens from disk too", () => {
  const g = git({ files: new Map([["mod", 1]]), links: new Set(["mod"]) });
  const rows = changedRows(g, "", tree({ mod: [file("x")] }, ["mod"])).rows;
  assert.deepEqual(brief(rows), ["mod/-", "  x"]);
  assert.equal(rows[0].disk, true);
});

test("hitRows: hits as a tree, folders open and first; a path with hits below it is a folder past the index's folders", () => {
  const hits = ["src/zeta.js", "src/lib/a.js", "b.md"];
  const rows = hitRows(hits, new Set(), new Set());
  assert.deepEqual(brief(rows), ["src/-", "  lib/-", "    a.js", "  zeta.js", "b.md"]);
  // A hit that is a folder the index knows, with nothing below it.
  assert.equal(hitRows(["docs"], new Set(["docs"]), new Set())[0].dir, true);
  assert.equal(hitRows(["docs"], new Set(), new Set())[0].dir, false);
});

test("A gone hit is struck through, and hits carry no link", () => {
  const rows = hitRows(["a.md", "b.md"], new Set(), new Set(["b.md"]));
  assert.deepEqual(rows.map((r) => r.gone), [false, true]);
  assert.ok(rows.every((r) => !("link" in r)));
});

test("Rows Changed takes from git's list alone carry no link", () => {
  const rows = changedRows(git({ files: new Map([["src/a.js", 1]]) }), "", tree()).rows;
  assert.ok(rows.every((r) => !("link" in r)));
});

test("An ignored path below an untracked folder is dimmed with no ?", () => {
  const g = git({ untracked: new Set(["newdir"]), ignored: new Set(["newdir/node_modules"]) });
  assert.deepEqual(rowStatus(g, "newdir/node_modules"), { status: null, ignored: true });
  assert.deepEqual(rowStatus(g, "newdir/node_modules/x.js"), { status: null, ignored: true });
  assert.deepEqual(rowStatus(g, "newdir/a.js"), { status: "?", ignored: false });
});

test("When the shown folder is new to git, every row gets ?", () => {
  const g = git({ rootUntracked: true });
  assert.deepEqual(rowStatus(g, "a.js"), { status: "?", ignored: false });
  assert.deepEqual(rowStatus(g, "deep/b/c"), { status: "?", ignored: false });
});

test("A row's own status wins; a file added with -f is not ignored", () => {
  const g = git({ status: new Map([["logs/keep.log", "A"]]), ignored: new Set(["logs"]), forced: new Set(["logs/keep.log", "logs"]) });
  assert.deepEqual(rowStatus(g, "logs/keep.log"), { status: "A", ignored: false });
  assert.ok(!isIgnored(g, "logs/keep.log"));
  assert.ok(!isIgnored(g, "logs"));
  assert.ok(isIgnored(g, "logs/other.log"));
  assert.ok(isIgnored(git({ rootIgnored: true }), "anything"));
});
