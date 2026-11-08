// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// Runs roundup-files' folder listing in a real sh, on links made in a temporary folder.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listScript, parseListing } from "../mods/roundup-files/listing.js";

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
  // A readlink like BusyBox's: one path only.
  bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "readlink"), `#!/bin/sh\n[ "$1" = -- ] && shift\n[ $# -eq 1 ] || { echo "too many" >&2; exit 1; }\nexec /usr/bin/readlink -- "$1"\n`);
  chmodSync(join(bin, "readlink"), 0o755);
});
after(() => rmSync(root, { recursive: true, force: true }));

const shells = ["/bin/sh", "/bin/dash", "/bin/bash"].filter(existsSync);
const list = (shell, folder, env = process.env, most = 10000) => {
  const out = execFileSync(shell, ["-c", listScript(most), "roundup-files", join(root, folder)], { env, encoding: "utf8" });
  return Object.fromEntries(parseListing(out).map((e) => [e.name, e]));
};

for (const shell of shells) {
  test(`${shell}: kinds, names and targets`, () => {
    const e = list(shell, "folder");
    assert.deepEqual(Object.keys(e).sort(), [".hidden", "broken", "file.txt", "sub", "to-file", "to-sub"]);
    assert.deepEqual(e["file.txt"], { name: "file.txt", dir: false, link: null, broken: false });
    assert.deepEqual(e.sub, { name: "sub", dir: true, link: null, broken: false });
    assert.deepEqual(e["to-file"], { name: "to-file", dir: false, link: "file.txt", broken: false });
    assert.deepEqual(e["to-sub"], { name: "to-sub", dir: true, link: "sub", broken: false });
    assert.deepEqual(e.broken, { name: "broken", dir: false, link: "missing", broken: true });
  });

  test(`${shell}: a folder without links`, () => {
    assert.deepEqual(list(shell, "plain"), { a: { name: "a", dir: false, link: null, broken: false } });
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

  test(`${shell}: a missing folder fails`, () => {
    assert.throws(() => list(shell, "nowhere"));
  });
}
