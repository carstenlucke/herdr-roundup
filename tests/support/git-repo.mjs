// Real git repos in temp folders, for L2 tests. Importing this makes git in this test process
// independent of the person's and the CI's config: no global or system config, a fixed identity,
// English messages, no repo search above the temp folder, and no automatic maintenance: since git
// 2.47 a commit may start `git maintenance` detached, whose objects/maintenance.lock comes and goes
// under a test that compares .git before and after (SPC-05 failed so on CI, 2026-11-10).
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, statSync, readdirSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

const TMP = realpathSync(tmpdir());
const configDir = mkdtempSync(join(TMP, "roundup-gitconfig-"));
const testConfig = join(configDir, "config");
writeFileSync(testConfig, "[maintenance]\n\tauto = false\n[gc]\n\tauto = 0\n");
process.on("exit", () => rmSync(configDir, { recursive: true, force: true }));

Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: testConfig,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Roundup Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Roundup Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  GIT_CEILING_DIRECTORIES: TMP,
  LC_ALL: "C", LANG: "C",
});

const made = [];

// A new empty folder under the system temp folder, links resolved (git reports /private/var on macOS).
export function tempDir(prefix = "roundup-") {
  const dir = mkdtempSync(join(TMP, prefix));
  made.push(dir);
  return dir;
}

// Removes every folder tempDir() made (call in after()).
export function cleanup() {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}

// Runs git in cwd; answers stdout. Throws on a non-zero exit.
export function git(cwd, ...args) {
  return execFileSync("git", ["-c", "init.defaultBranch=main", "-c", "protocol.file.allow=always", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Writes files below dir: { "a/b.txt": "text" }; folders are made as needed.
export function write(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  }
}

export const link = (dir, rel, target) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); symlinkSync(target, join(dir, rel)); };

// A repo in a new temp folder (or in `dir`), with files committed when given.
export function repo(files, dir = tempDir("roundup-repo-")) {
  mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q");
  if (files && Object.keys(files).length) {
    write(dir, files);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "first");
  }
  return dir;
}

export function commit(dir, message = "change") {
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", message);
}

// Every file below dir (.git included when dir is one) with its mtime and size: compare before and after
// a read to see that it wrote nothing.
export function snapshot(dir) {
  const out = {};
  const go = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) go(p);
      else { const s = statSync(p, { throwIfNoEntry: false }); if (s) out[p.slice(dir.length + 1)] = `${s.mtimeMs}:${s.size}`; }
    }
  };
  go(dir);
  return out;
}
