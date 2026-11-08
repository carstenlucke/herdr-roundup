// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// Runs roundup-files' folder listing in a real sh, on links made in a temporary folder.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listScript, parseListing, BLOCKED_AT_MOST } from "../mods/roundup-files/listing.js";

let root, bin;
before(() => {
  root = mkdtempSync(join(tmpdir(), "roundup-listing-"));
  const dir = join(root, "folder");
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "file.txt"), "");
  writeFileSync(join(dir, ".hidden"), "");
  symlinkSync("file.txt", join(dir, "to-file"));
  symlinkSync("sub", join(dir, "to-sub"));
  symlinkSync("missing", join(dir, "broken"));
  mkdirSync(join(root, "plain"));
  writeFileSync(join(root, "plain", "a"), "");
  mkdirSync(join(root, "odd"));
  symlinkSync("line\nfeed", join(root, "odd", "nl"));
  symlinkSync("ok", join(root, "odd", "ok"));
  // For the byte budget: one dangling link with a 100-byte target, short names, a long one.
  mkdirSync(join(root, "one"));
  symlinkSync("a".repeat(96) + "äö", join(root, "one", "l"));
  mkdirSync(join(root, "many"));
  for (let n = 1; n <= 9; n++) writeFileSync(join(root, "many", `f${n}`), "");
  mkdirSync(join(root, "wide"));
  writeFileSync(join(root, "wide", "äää"), "");
  // Links past a folder one may not search (EACCES), beside broken ones and a loop.
  mkdirSync(join(root, "locked", "inner"), { recursive: true });
  writeFileSync(join(root, "locked", "inner", "x"), "");
  mkdirSync(join(root, "reach"));
  symlinkSync("../locked/inner/x", join(root, "reach", "denied"));
  symlinkSync(join(root, "locked", "inner", "x"), join(root, "reach", "denied-abs"));
  symlinkSync("../nowhere", join(root, "reach", "missing"));
  symlinkSync("../reach/nope/deeper", join(root, "reach", "missing-deep"));
  symlinkSync("loop", join(root, "reach", "loop"));
  symlinkSync("../reach", join(root, "reach", "fine"));
  // Past another link: one into the locked folder, one to a link into it.
  symlinkSync("../locked/inner", join(root, "reach", "via"));
  symlinkSync("via/x", join(root, "reach", "via-file"));
  symlinkSync("denied", join(root, "reach", "to-denied"));
  // Past another link that points nowhere, and a loop of two.
  symlinkSync("missing/x", join(root, "reach", "to-missing"));
  symlinkSync("loop-b", join(root, "reach", "loop-a"));
  symlinkSync("loop-a", join(root, "reach", "loop-b"));
  // A chain a1 -> ... -> a9 -> the locked folder: from "1-long" it takes HOPS + 1 links, from
  // "2-short" (walked after it) two; HOPS cutting the first walk short must not stick to a8.
  mkdirSync(join(root, "chain"));
  for (let n = 1; n <= 8; n++) symlinkSync(`a${n + 1}`, join(root, "chain", `a${n}`));
  symlinkSync("../locked/inner/file", join(root, "chain", "a9"));
  symlinkSync("a1", join(root, "chain", "1-long"));
  symlinkSync("a8", join(root, "chain", "2-short"));
  // Many links through one blocked link: it is read once, each still blocked.
  mkdirSync(join(root, "shared"));
  for (let n = 1; n <= 30; n++) symlinkSync(`../reach/via/${n}`, join(root, "shared", `s${n}`));
  chmodSync(join(root, "locked"), 0o000);
  // More broken links than are walked back.
  mkdirSync(join(root, "lots"));
  for (let n = 1; n <= BLOCKED_AT_MOST + 5; n++) symlinkSync(`../locked/inner/${n}`, join(root, "lots", `l${String(n).padStart(3, "0")}`));
  // A readlink like BusyBox's: one path only.
  bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "readlink"), `#!/bin/sh\n[ "$1" = -- ] && shift\n[ $# -eq 1 ] || { echo "too many" >&2; exit 1; }\nexec /usr/bin/readlink -- "$1"\n`);
  chmodSync(join(bin, "readlink"), 0o755);
});
after(() => { chmodSync(join(root, "locked"), 0o755); rmSync(root, { recursive: true, force: true }); });
// root ignores permissions: there nothing is blocked.
const asRoot = process.getuid?.() === 0;

const shells = ["/bin/sh", "/bin/dash", "/bin/bash"].filter(existsSync);
const raw = (shell, folder, env = process.env, most = 10000, budget = 7 * 1024 * 1024) =>
  execFileSync(shell, ["-c", listScript(most, budget), "roundup-files", join(root, folder)], { env });
const read = (...a) => parseListing(raw(...a).toString("utf8"));
const list = (...a) => Object.fromEntries(read(...a).entries.map((e) => [e.name, e]));
const oneArg = () => ({ ...process.env, PATH: `${bin}:${process.env.PATH}` });

for (const shell of shells) {
  test(`${shell}: kinds, names and targets`, () => {
    const e = list(shell, "folder");
    assert.deepEqual(Object.keys(e).sort(), [".hidden", "broken", "file.txt", "sub", "to-file", "to-sub"]);
    assert.deepEqual(e["file.txt"], { name: "file.txt", dir: false, link: null, broken: false, blocked: false });
    assert.deepEqual(e.sub, { name: "sub", dir: true, link: null, broken: false, blocked: false });
    assert.deepEqual(e["to-file"], { name: "to-file", dir: false, link: "file.txt", broken: false, blocked: false });
    assert.deepEqual(e["to-sub"], { name: "to-sub", dir: true, link: "sub", broken: false, blocked: false });
    assert.deepEqual(e.broken, { name: "broken", dir: false, link: "missing", broken: true, blocked: false });
  });

  test(`${shell}: a folder without links`, () => {
    assert.deepEqual(list(shell, "plain"), { a: { name: "a", dir: false, link: null, broken: false, blocked: false } });
  });

  test(`${shell}: a line feed inside a target stays`, () => {
    const e = list(shell, "odd");
    assert.equal(e.nl.link, "line\nfeed");
    assert.equal(e.ok.link, "ok");
  });

  test(`${shell}: a readlink taking one path still gives every target`, () => {
    const e = list(shell, "folder", { ...process.env, PATH: `${bin}:${process.env.PATH}` });
    assert.equal(e["to-file"].link, "file.txt");
    assert.equal(e["to-sub"].link, "sub");
    assert.equal(e.broken.link, "missing");
  });

  test(`${shell}: the cut keeps links and targets together`, () => {
    const e = list(shell, "folder", process.env, 3);
    assert.equal(Object.keys(e).length, 3);
    for (const x of Object.values(e)) if (x.link != null) assert.notEqual(x.link, "");
  });

  test(`${shell}: a link mark in the environment moves no target`, () => {
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
    for (let n = 1; n <= 8; n++) env[`L${n}`] = "1";
    for (const e of [list(shell, "folder", env), list(shell, "folder", { ...env, PATH: process.env.PATH })]) {
      assert.equal(e["to-file"].link, "file.txt");
      assert.equal(e["to-sub"].link, "sub");
      assert.equal(e.broken.link, "missing");
      assert.equal(e["file.txt"].link, null);
    }
  });

  test(`${shell}: a target is shown whole up to the exact byte, else left out`, () => {
    // "B\0l\0", the target's NUL and "1\0" (its number, should it be blocked) are held back,
    // then 100 bytes of target; 4 for the frame.
    for (const env of [process.env, oneArg()]) {
      const fits = read(shell, "one", env, 10000, 111), short = read(shell, "one", env, 10000, 110);
      assert.deepEqual(fits, { entries: [{ name: "l", dir: false, link: "a".repeat(96) + "äö", broken: true, blocked: false }], cut: false });
      assert.deepEqual(short, { entries: [{ name: "l", dir: false, link: "", broken: true, blocked: false }], cut: false });
    }
  });

  test(`${shell}: the budget ends the entries whole, and says so`, () => {
    // 4 for the frame, 5 bytes per entry ("f\0f1\0").
    for (const [budget, n] of [[19, 3], [18, 2], [4, 0]]) {
      assert.ok(raw(shell, "many", process.env, 10000, budget).length <= budget);
      const r = read(shell, "many", process.env, 10000, budget);
      assert.equal(r.entries.length, n);
      assert.equal(r.cut, true);
      for (const e of r.entries) assert.match(e.name, /^f\d$/);
    }
    assert.equal(read(shell, "many", process.env, 10000, 49).cut, false);
  });

  test(`${shell}: names count in bytes`, () => {
    // "äää" is 6 bytes: 9 with its kind and NULs.
    assert.deepEqual(read(shell, "wide", process.env, 10000, 13), { entries: [{ name: "äää", dir: false, link: null, broken: false, blocked: false }], cut: false });
    assert.equal(read(shell, "wide", process.env, 10000, 12).entries.length, 0);
  });

  test(`${shell}: under any budget the output fits and nothing moves`, () => {
    for (const folder of ["folder", "odd"]) {
      const full = read(shell, folder).entries;
      for (let budget = 4; budget <= 90; budget++) { // "folder" prints 77 bytes in full
        const runs = [process.env, oneArg()].map((env) => {
          const out = raw(shell, folder, env, 10000, budget);
          assert.ok(out.length <= budget, `${folder} at ${budget}: ${out.length} bytes`);
          return parseListing(out.toString("utf8"));
        });
        // One readlink for all, or one per link: the same result.
        assert.deepEqual(runs[0], runs[1]);
        const { entries, cut } = runs[0];
        assert.equal(cut, entries.length < full.length);
        entries.forEach((e, k) => {
          const f = full[k];
          assert.deepEqual({ ...e, link: null }, { ...f, link: null });
          if (f.link == null) assert.equal(e.link, null);
          else assert.ok(e.link === f.link || e.link === "", `${e.name}: ${JSON.stringify(e.link)}`);
        });
      }
    }
  });

  test(`${shell}: a link past a folder one may not search is blocked, not broken`, { skip: asRoot }, () => {
    for (const env of [process.env, oneArg()]) {
      const e = list(shell, "reach", env);
      for (const n of ["denied", "denied-abs", "via", "via-file", "to-denied"]) assert.deepEqual([n, e[n].broken, e[n].blocked], [n, false, true]);
      for (const n of ["missing", "missing-deep", "loop", "to-missing", "loop-a", "loop-b"]) assert.deepEqual([n, e[n].broken, e[n].blocked], [n, true, false]);
      assert.deepEqual(e.fine, { name: "fine", dir: true, link: "../reach", broken: false, blocked: false });
      assert.equal(e.denied.link, "../locked/inner/x");
    }
  });

  test(`${shell}: a walk cut short by HOPS leaves the links on it to their own walk`, { skip: asRoot }, () => {
    for (const env of [process.env, oneArg()]) {
      const e = list(shell, "chain", env);
      assert.deepEqual([e["1-long"].broken, e["1-long"].blocked], [true, false]);
      for (const n of ["2-short", "a1", "a5", "a8", "a9"]) assert.deepEqual([n, e[n].broken, e[n].blocked], [n, false, true]);
    }
  });

  test(`${shell}: links through one blocked link are all blocked`, { skip: asRoot }, () => {
    for (const env of [process.env, oneArg()]) {
      const { entries } = read(shell, "shared", env);
      assert.equal(entries.length, 30);
      assert.ok(entries.every((x) => x.blocked && !x.broken));
    }
  });

  test(`${shell}: a blocked link stays blocked when its target doesn't fit`, { skip: asRoot }, () => {
    // Its kind and number are held back with the entry; the target is left out.
    for (const env of [process.env, oneArg()]) {
      const { entries } = read(shell, "reach", env, 10000, 80);
      const denied = entries.find((x) => x.name === "denied");
      if (denied) assert.equal(denied.blocked, true);
      for (const x of entries) assert.ok(!(x.broken && x.blocked));
    }
  });

  test(`${shell}: only the first ${BLOCKED_AT_MOST} broken links are walked back`, { skip: asRoot }, () => {
    for (const env of [process.env, oneArg()]) {
      const { entries } = read(shell, "lots", env);
      assert.equal(entries.length, BLOCKED_AT_MOST + 5);
      assert.equal(entries.filter((x) => x.blocked).length, BLOCKED_AT_MOST);
      assert.equal(entries.filter((x) => x.broken).length, 5);
    }
  });

  test(`${shell}: a walk mark in the environment walks no link past the ${BLOCKED_AT_MOST}`, { skip: asRoot }, () => {
    const env = { ...process.env };
    for (let n = BLOCKED_AT_MOST + 1; n <= BLOCKED_AT_MOST + 5; n++) env[`K${n}`] = "1";
    for (const e of [env, { ...env, PATH: `${bin}:${process.env.PATH}` }])
      assert.equal(read(shell, "lots", e).entries.filter((x) => x.blocked).length, BLOCKED_AT_MOST);
  });

  test(`${shell}: a missing folder fails`, () => {
    assert.throws(() => list(shell, "nowhere"));
  });
}
