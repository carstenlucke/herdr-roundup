// node --test 'tests/*.test.mjs'
// scripts/preview.py's outputs: Settings shows the bare window (no scene, or "window"), only
// "poster" (README's preview.png) puts it beside name, claim and features, and --scenes, which
// site.sh draws, leaves the poster out. The poster's window shows the agent quicklook card,
// Settings' doesn't. Herdr's program icons come from a stub home.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));

function stubHome() {
  const dir = mkdtempSync(join(tmpdir(), "roundup-preview-"));
  mkdirSync(join(dir, "home", "icons"), { recursive: true });
  for (const key of ["claude", "codex", "pi", "shell", "vite"])
    writeFileSync(join(dir, "home", "icons", `${key}.svg`), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"/></svg>');
  return dir;
}

function draw(dir, ...scene) {
  const out = join(dir, `${scene[0] ?? "default"}.svg`);
  const run = spawnSync("python3", ["scripts/preview.py", REPO, out, ...scene],
    { cwd: REPO, env: { ...process.env, HERDR_APP_HOME: join(dir, "home") }, encoding: "utf8" });
  assert.equal(run.status, 0, `preview.py ${scene.join(" ")}: ${run.stderr}`);
  return readFileSync(out, "utf8");
}

// LAY-21
test("preview.py: Settings gets the bare window, only poster draws the poster, and --scenes leaves it out", () => {
  const dir = stubHome();
  try {
    const plain = draw(dir), window = draw(dir, "window"), poster = draw(dir, "poster");
    assert.doesNotMatch(plain, /id="poster-/, "no scene: the bare window, as Settings shows it");
    assert.equal(window, plain, "the scene window is the same bare window");
    assert.match(poster, /id="poster-/);
    assert.match(poster, /<symbol id="window"/, "the poster holds the window");
    const scenes = spawnSync("python3", ["scripts/preview.py", "--scenes"], { cwd: REPO, encoding: "utf8" });
    assert.equal(scenes.status, 0, scenes.stderr);
    assert.ok(!scenes.stdout.split("\n").includes("poster"), "site.sh draws every scene --scenes lists: the poster is none");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// LAY-22
test("preview.py: the poster shows the agent quicklook card, Settings' window doesn't", () => {
  const dir = stubHome();
  try {
    const plain = draw(dir), poster = draw(dir, "poster");
    assert.doesNotMatch(plain, /id="quicklook"/, "Settings' window has no hover card open");
    assert.equal((poster.match(/id="quicklook"/g) ?? []).length, 1, "the poster's window shows the card once");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
