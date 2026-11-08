// roundup-files' disk.js with herdr stubbed: listDir, kinds and buildIndex on real temp folders (L2),
// and their PowerShell paths through exec hooks.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { herdr, reset } from "./support/harness.mjs";
import { tempDir, cleanup, write, link } from "./support/git-repo.mjs";

const disk = await import("../mods/roundup-files/disk.js");
const { listDir, kinds, buildIndex, PER_FOLDER, INDEX_DIRS, INDEX_PATHS } = disk;

beforeEach(reset);
after(cleanup);

const sorted = (iterable) => [...iterable].sort();
const NO_SH = () => new Error("cannot start sh: program not found");

test("listDir reads every entry of a large folder, folders first, and cuts to 500 with more", async () => {
  const dir = tempDir("roundup-big-");
  for (let i = 0; i < 1200; i++) writeFileSync(join(dir, `f${String(i).padStart(4, "0")}`), "");
  mkdirSync(join(dir, "zz-late"));
  writeFileSync(join(dir, ".hidden"), "");
  const r = await listDir(dir, null);
  assert.equal(r.entries.length, PER_FOLDER);
  assert.equal(r.more, true);
  assert.deepEqual(r.entries[0], { name: "zz-late", dir: true, link: null, broken: false, blocked: false }, "a folder made last comes first");
  assert.equal(r.entries[1].name, ".hidden", "a dotfile isn't dropped");
  assert.equal(r.entries[2].name, "f0000");
  const small = tempDir("roundup-small-");
  write(small, { "b.txt": "", "a/x": "" });
  assert.deepEqual(await listDir(small, null), {
    entries: [{ name: "a", dir: true, link: null, broken: false, blocked: false }, { name: "b.txt", dir: false, link: null, broken: false, blocked: false }],
    more: false,
  });
});

test("a machine without sh: listDir and kinds ask PowerShell, buildIndex says search can't read the disk", async () => {
  herdr.onExec((c) => (c.command === "sh" ? NO_SH() : undefined));
  herdr.onExec((c) => {
    if (c.command !== "powershell") return undefined;
    const script = c.args.at(-1);
    if (script.includes("Get-ChildItem")) return { stdout: JSON.stringify({ e: { name: "docs", dir: true, link: null, broken: false, blocked: false }, cut: false }) };
    return { stdout: "ddocs\r\nfREADME.md\r\n" };
  });
  const r = await listDir("C:\\work", "win");
  assert.deepEqual(r.entries, [{ name: "docs", dir: true, link: null, broken: false, blocked: false }], "one entry: ConvertTo-Json gives an object, not a list");
  assert.deepEqual([...await kinds("C:\\work", ["docs", "README.md", "gone"], "win")], [["docs", "d"], ["README.md", "f"]]);
  assert.deepEqual(herdr.calls("exec").filter(([cmd]) => cmd === "powershell").map(([, , o]) => o.on), ["win", "win"]);
  await assert.rejects(buildIndex("C:\\work", "win"), (e) => e.noIndex === true && e.message === "Search can't read the disk without sh");
});

test("kinds goes in pieces of at most 100,000 characters, one after another; missing paths are left out, a broken link is f", async () => {
  const dir = tempDir("roundup-kinds-");
  const name = (i) => `${"n".repeat(60)}-${i}`;
  for (let i = 0; i < 2000; i++) writeFileSync(join(dir, name(i)), "");
  mkdirSync(join(dir, "folder"));
  symlinkSync(join(dir, "nowhere"), join(dir, "broken"));
  const rels = [...Array.from({ length: 2000 }, (_, i) => name(i)), "folder", "broken", "missing"];
  // Each call holds a moment before it runs: calls started together would overlap there.
  let running = 0, most = 0;
  herdr.onExec(() => async () => { running++; most = Math.max(most, running); await new Promise((r) => setTimeout(r, 5)); running--; });
  const found = await kinds(dir, rels, null);
  assert.equal(most, 1, "one at a time");
  const pieces = herdr.calls("exec").map(([, args]) => args.slice(4));
  assert.ok(pieces.length >= 2, `${pieces.length} pieces`);
  for (const piece of pieces) assert.ok(piece.reduce((n, a) => n + a.length + 1, 0) <= 100000);
  assert.deepEqual(pieces.flat(), rels, "every path once, in order");
  assert.equal(found.size, 2002);
  assert.equal(found.get("folder"), "d");
  assert.equal(found.get("broken"), "f");
  assert.equal(found.has("missing"), false);

  herdr.clear();
  herdr.set({ window: { ...herdr.stub.window, platform: "windows" } });
  herdr.onExec((c) => (c.command === "powershell" ? { stdout: "" } : undefined));
  await kinds("C:\\w", rels, null);
  const ps = herdr.calls("exec").map(([, args]) => args.at(-1));
  assert.ok(ps.length >= 6, `${ps.length} PowerShell pieces`);
  for (const script of ps) assert.ok(/@\((.*)\)\) \{/s.exec(script)[1].length <= 24000);
});

test("buildIndex skips folders like node_modules, dist, build, vendor but not files of those names, never .git, and takes a link to a folder as one", async () => {
  const dir = tempDir("roundup-index-");
  write(dir, {
    "src/a.js": "", "node_modules/m/i.js": "", "dist/out.js": "", "deep/build/o.js": "", "vendor/v.go": "",
    "notes/build": "", "notes/vendor": "", ".git/HEAD": "", "sub/.git": "gitdir: ../.git/worktrees/sub\n", "sub/s.txt": "",
    "real/r.txt": "",
  });
  link(dir, "to-real", "real");
  link(dir, "to-file", "real/r.txt");
  const r = await buildIndex(dir, null);
  assert.equal(r.full, true);
  assert.deepEqual(r.cut, []);
  assert.deepEqual(sorted(r.dirs), ["deep", "notes", "real", "src", "sub", "to-real"]);
  assert.deepEqual(sorted(r.all.filter((p) => !r.dirs.has(p))), ["notes/build", "notes/vendor", "real/r.txt", "src/a.js", "sub/s.txt", "to-file"]);
  assert.equal(r.all.some((p) => p.startsWith("to-real/")), false, "the link isn't followed");
});

test("buildIndex at home skips Library, AppData and .Trash at the top only and reads 5 levels; elsewhere 12", async () => {
  const home = tempDir("roundup-home-");
  herdr.set({ home });
  write(home, { "Library/x": "", "AppData/y": "", ".Trash/z": "", "proj/Library/kept": "", "a/b/c/d/e5": "", "a/b/c/d/e/f6": "" });
  const r = await buildIndex(home, null);
  assert.equal(r.all.some((p) => /^(Library|AppData|\.Trash)(\/|$)/.test(p)), false);
  assert.ok(r.all.includes("proj/Library/kept"));
  assert.ok(r.dirs.has("proj/Library"));
  assert.ok(r.all.includes("a/b/c/d/e5"));
  assert.equal(r.all.includes("a/b/c/d/e/f6"), false, "deeper than 5 at home");
  const deep = await buildIndex(join(home, "a"), null);
  assert.ok(deep.all.includes("b/c/d/e/f6"), "12 levels elsewhere");
  assert.equal(disk.indexDepth(home, null), 5);
  assert.equal(disk.indexDepth("/", null), 5);
  assert.equal(disk.indexDepth(join(home, "a"), null), 12);
});

test("buildIndex at / prunes Library, AppData and .Trash at any depth, 5 levels deep", async () => {
  herdr.onExec((c) => (c.command === "sh" && c.args.at(-1) === "/" ? { code: 0, stdout: "./Users\0//\0./etc/hosts\0" } : undefined));
  const r = await buildIndex("/", null);
  const script = herdr.calls("exec").at(-1)[1][1];
  for (const n of ["Library", "AppData", ".Trash"]) assert.ok(script.includes(`-name '${n}'`), `prunes ${n} by name`);
  assert.equal(script.includes("-path './Library'"), false);
  assert.match(script, /-maxdepth 5 /);
  assert.deepEqual(r.all, ["Users", "etc/hosts"]);
});

test("buildIndex on another machine learns its home once", async () => {
  const dir = tempDir("roundup-remote-");
  write(dir, { "a.txt": "" });
  await buildIndex(dir, "vps-once");
  await buildIndex(dir, "vps-once");
  const asks = herdr.calls("exec").filter(([, args]) => args[1] === 'printf %s "$HOME"');
  assert.equal(asks.length, 1);
  assert.deepEqual(asks[0][2], { on: "vps-once" });
});

test("buildIndex cuts past 20,000 folders and past 40,000 files, and says which", { timeout: 120000 }, async () => {
  const dirs = tempDir("roundup-manydirs-");
  for (let i = 0; i <= INDEX_DIRS; i++) mkdirSync(join(dirs, `d${i}`));
  const d = await buildIndex(dirs, null);
  assert.deepEqual(d.cut, ["dirs"]);
  assert.equal(d.full, false);
  assert.equal(d.dirs.size, INDEX_DIRS);
  const files = tempDir("roundup-manyfiles-");
  for (let i = 0; i <= INDEX_PATHS; i++) writeFileSync(join(files, `f${i}`), "");
  const f = await buildIndex(files, null);
  assert.deepEqual(f.cut, ["files"]);
  assert.equal(f.all.length, INDEX_PATHS);
});

test("buildIndex keeps a name with a line feed as one entry", async () => {
  const dir = tempDir("roundup-nl-");
  write(dir, { "two\nlines.txt": "", "dir\nname/inner": "" });
  const r = await buildIndex(dir, null);
  assert.deepEqual(sorted(r.all), ["dir\nname", "dir\nname/inner", "two\nlines.txt"]);
  assert.deepEqual(sorted(r.dirs), ["dir\nname"]);
});

test("buildIndex on a missing folder can't open it; on Windows it can't read the disk yet", async () => {
  await assert.rejects(buildIndex(join(tempDir(), "missing"), null), { message: "Cannot open this folder" });
  herdr.set({ window: { ...herdr.stub.window, platform: "windows" } });
  await assert.rejects(buildIndex("C:\\work", null), (e) => e.noIndex === true && e.message === "Search can't read the disk on Windows yet");
  assert.equal(disk.diskSearch(null), false);
  assert.equal(disk.diskSearch("vps"), true);
});
