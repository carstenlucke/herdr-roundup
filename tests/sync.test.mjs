// node --test 'tests/*.test.mjs' (Node 22.15 or later).
// scripts/sync.sh runs for real, but into a temp folder that is both HERDR_APP_HOME and HOME, with a
// herdr-app stub first on PATH: the person's Herdr App is never touched and the real herdr-app never runs.
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, cpSync, rmSync, existsSync,
  readdirSync, statSync, chmodSync, realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, delimiter, basename } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const name = "Herdr-Roundup";
const section = `layout:${name}`;
// What sync.sh leaves out of a mod: files Herdr generates into a mod folder.
const generated = new Set(["gpui-kit.d.ts", "jsconfig.json", ".gitkeep"]);
const tmpRoot = realpathSync(tmpdir());

// PATH without any folder that holds a herdr-app: the stub is the only one the script can find.
const hasHerdrApp = (dir) => {
  try { return statSync(join(dir, "herdr-app")).isFile(); } catch { return false; }
};
const basePath = (process.env.PATH ?? "").split(delimiter).filter((d) => d && !hasHerdrApp(d));

// The tools sync.sh calls besides the shell's own: missing ones fail every test with their names.
const needed = ["cmp", "cp", "mkdir", "mv", "rsync", "jq", "dirname", "basename"];
const which = (tool) => spawnSync("sh", ["-c", `command -v ${tool}`], { env: { PATH: basePath.join(delimiter) }, encoding: "utf8" });
const missing = process.platform === "win32" ? [] : needed.filter((t) => which(t).status !== 0);

const STUB = `#!/bin/sh
# herdr-app stub for tests/sync.test.mjs: logs its arguments, fails on request.
printf '%s\\n' "$*" >> "$HERDR_STUB_LOG"
if [ -n "\${HERDR_STUB_FAIL:-}" ]; then
  case "$*" in *"$HERDR_STUB_FAIL"*) exit "\${HERDR_STUB_CODE:-1}" ;; esac
fi
none='{"errors":[]}'
[ "$1" = status ] && printf '%s\\n' "\${HERDR_STUB_STATUS:-$none}"
exit 0
`;

let tmp, home, app, stubDir, log;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpRoot, "roundup-sync-"));
  home = join(tmp, "home");
  app = join(home, "app");
  stubDir = join(tmp, "bin");
  log = join(tmp, "herdr-app.log");
  mkdirSync(home);
  mkdirSync(stubDir);
  writeFileSync(join(stubDir, "herdr-app"), STUB);
  chmodSync(join(stubDir, "herdr-app"), 0o755);
  writeFileSync(log, "");
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

// Runs <src>/scripts/sync.sh with the temp home; refuses to run unless herdr-app is the stub
// and HERDR_APP_HOME lies in the temp folder.
function sync(src = repo, stub = {}) {
  if (missing.length) assert.fail(`sync.sh needs ${missing.join(", ")} on PATH, which this machine lacks`);
  const env = {
    PATH: [stubDir, ...basePath].join(delimiter),
    HOME: home,
    HERDR_APP_HOME: app,
    HERDR_STUB_LOG: log,
    ...(stub.fail ? { HERDR_STUB_FAIL: stub.fail, HERDR_STUB_CODE: String(stub.code ?? 1) } : {}),
    ...(stub.status ? { HERDR_STUB_STATUS: stub.status } : {}),
  };
  assert.ok(app.startsWith(tmp + "/"), "HERDR_APP_HOME is a temp folder");
  const found = spawnSync("sh", ["-c", "command -v herdr-app"], { env, encoding: "utf8" }).stdout.trim();
  assert.equal(found, join(stubDir, "herdr-app"), "the herdr-app sync.sh would run is the stub");
  return spawnSync("sh", [join(src, "scripts", "sync.sh")], { env, encoding: "utf8" });
}

const calls = () => readFileSync(log, "utf8").split("\n").filter(Boolean);
const json = (file) => JSON.parse(readFileSync(file, "utf8"));
const write = (file, text) => { mkdirSync(join(file, ".."), { recursive: true }); writeFileSync(file, text); };

// Every file below dir, relative, sorted.
function files(dir, prefix = "") {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]).sort();
}
const repoMods = (src = repo) => readdirSync(join(src, "mods")).filter((m) => m.startsWith("roundup-")).sort();
const shipped = (src, mod) => files(join(src, "mods", mod)).filter((f) => !generated.has(basename(f)));

// A copy of what sync.sh reads, to change without touching the worktree.
function copyRepo() {
  const src = join(tmp, "repo");
  for (const p of ["scripts/sync.sh", "layouts", "mods", "themes", "keys.json"]) {
    cpSync(join(repo, p), join(src, p), { recursive: true });
  }
  return src;
}

const ok = (r) => assert.equal(r.status, 0, `sync.sh failed (${r.status}):\n${r.stderr}`);

describe("scripts/sync.sh", { skip: process.platform === "win32" && "sync.sh is a POSIX shell script" }, () => {
  test("LAY-13: with HERDR_APP_HOME set, sync.sh installs there and writes nothing under $HOME/.config/herdr-app", () => {
    ok(sync());
    assert.deepEqual(readdirSync(home), ["app"], "nothing beside the app home in HOME");
    assert.ok(!existsSync(join(home, ".config")));
    assert.deepEqual(readdirSync(app).sort(), ["keys.json", "layouts", "mods", "themes"]);
    for (const ext of ["json", "svg"]) {
      const f = `layouts/${name}.${ext}`;
      assert.ok(readFileSync(join(app, f)).equals(readFileSync(join(repo, f))), f);
    }
    assert.deepEqual(readdirSync(join(app, "mods")).sort(), repoMods());
  });

  test("LAY-14: each roundup mod is mirrored, a stale file in it goes, other mods and layouts/.state stay", () => {
    write(join(app, "mods/roundup-tabs/stale.js"), "old");
    write(join(app, "mods/roundup-tabs/old/icon.svg"), "<svg/>");
    write(join(app, "mods/pane/main.js"), "Herdr's own");
    write(join(app, "layouts/.state/Herdr-Roundup.json"), '{"sidebar":{"size":{"px":300}}}');
    write(join(app, "layouts/main.json"), "{}");
    ok(sync());
    for (const mod of repoMods()) {
      assert.deepEqual(files(join(app, "mods", mod)), shipped(repo, mod), mod);
    }
    assert.equal(readFileSync(join(app, "mods/pane/main.js"), "utf8"), "Herdr's own");
    assert.equal(readFileSync(join(app, "layouts/.state/Herdr-Roundup.json"), "utf8"), '{"sidebar":{"size":{"px":300}}}');
    assert.equal(readFileSync(join(app, "layouts/main.json"), "utf8"), "{}");
  });

  test("LAY-14: gpui-kit.d.ts, jsconfig.json and .gitkeep aren't copied, and the ones Herdr made in the install stay", () => {
    const src = copyRepo();
    for (const f of generated) {
      write(join(src, "mods/roundup-pane", f), "repo");
      write(join(src, "mods/roundup-pane/sub", f), "repo");
    }
    write(join(app, "mods/roundup-pane/jsconfig.json"), "herdr");
    write(join(app, "mods/roundup-pane/gpui-kit.d.ts"), "herdr");
    ok(sync(src));
    const installed = files(join(app, "mods/roundup-pane"));
    assert.deepEqual(installed.filter((f) => generated.has(basename(f))), ["gpui-kit.d.ts", "jsconfig.json"]);
    assert.equal(readFileSync(join(app, "mods/roundup-pane/jsconfig.json"), "utf8"), "herdr");
    assert.equal(readFileSync(join(app, "mods/roundup-pane/gpui-kit.d.ts"), "utf8"), "herdr");
    assert.deepEqual(installed.filter((f) => !generated.has(basename(f))), shipped(src, "roundup-pane"));
  });

  test("LAY-14: an empty themes/ installs an empty themes folder; a theme in it is copied beside the others", () => {
    write(join(app, "themes/other.json"), "{}");
    ok(sync());
    assert.deepEqual(files(join(app, "themes")), ["other.json"]);
    const src = copyRepo();
    write(join(src, `themes/${name}.json`), '{"name":"Herdr-Roundup"}');
    ok(sync(src));
    assert.deepEqual(files(join(app, "themes")), [`${name}.json`, "other.json"]);
  });

  test("LAY-15: only the layout's keys section is replaced; global and other sections stay", () => {
    const before = {
      global: { "cmd-k": "palette.open" },
      "layout:main": { "cmd-w": "pane.close" },
      [section]: { "cmd-x": "roundup-old.gone" },
    };
    write(join(app, "keys.json"), JSON.stringify(before));
    ok(sync());
    const keys = json(join(app, "keys.json"));
    assert.deepEqual(keys, { ...before, [section]: json(join(repo, "keys.json"))[section] });
    assert.ok(!existsSync(join(app, "keys.json.tmp")));
  });

  test("LAY-15: a missing keys.json is created with the layout's section", () => {
    ok(sync());
    assert.deepEqual(json(join(app, "keys.json")), { [section]: json(join(repo, "keys.json"))[section] });
  });

  test("LAY-15: a section missing from the repo's keys.json installs as {}, never null", () => {
    const src = copyRepo();
    write(join(src, "keys.json"), '{"layout:other":{"cmd-q":"x.y"}}');
    write(join(app, "keys.json"), JSON.stringify({ global: {}, [section]: { "cmd-w": "roundup-tabs.close" } }));
    ok(sync(src));
    assert.deepEqual(json(join(app, "keys.json")), { global: {}, [section]: {} });
  });

  for (const [a, b, f] of [
    ["roundup-tabs", "roundup-pane", "close.js"],
    ["roundup-tabs", "roundup-pane", "menu.js"],
    ["roundup-preview", "roundup-files", "open-file.js"],
    ["roundup-preview", "roundup-files", "paths.js"],
  ]) {
    test(`LAY-16: when ${b}/${f} differs from ${a}/${f}, sync.sh stops before copying anything`, () => {
      const src = copyRepo();
      appendFileSync(join(src, "mods", b, f), "\n// drifted\n");
      const r = sync(src);
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, new RegExp(`mods/${a}/${f} and mods/${b}/${f} differ: copy one over the other`));
      assert.ok(!existsSync(app), "nothing installed");
      assert.deepEqual(calls(), [], "herdr-app not run");
    });
  }

  test("LAY-17: every installed roundup mod is checked, then the status is read", () => {
    write(join(app, "mods/roundup-retired/main.js"), "");
    write(join(app, "mods/pane/main.js"), "");
    const r = sync();
    ok(r);
    const mods = [...repoMods(), "roundup-retired"].sort();
    assert.deepEqual(calls(), [...mods.map((m) => `check ${app}/mods/${m}/`), "status"]);
    assert.match(r.stdout, /^\[\]$/m, "status' errors are printed");
  });

  test("LAY-17: sync.sh stops at the first failing check, with its exit code", () => {
    const [first, second] = repoMods();
    const r = sync(repo, { fail: `/mods/${second}/`, code: 3 });
    assert.equal(r.status, 3);
    assert.deepEqual(calls(), [`check ${app}/mods/${first}/`, `check ${app}/mods/${second}/`]);
  });

  test("LAY-17: sync.sh fails when herdr-app status fails, though jq would succeed", () => {
    const r = sync(repo, { fail: "status", code: 7 });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /herdr-app status failed/);
    assert.ok(existsSync(join(app, "layouts/Herdr-Roundup.json")), "the files are installed all the same");
  });

  test("LAY-17: sync.sh prints the errors Herdr App reports and fails", () => {
    const r = sync(repo, { status: '{"errors":["layout.error: bad"]}' });
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /layout\.error: bad/);
    assert.match(r.stderr, /reports the errors above/);
  });
});
