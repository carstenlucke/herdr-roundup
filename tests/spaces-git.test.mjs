// roundup-spaces' git line: the parsers (git-parse.js, L1) and check() in main.js against real repos (L2).
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { join, basename } from "node:path";
import { utimesSync } from "node:fs";
import { herdr, reset, mount } from "./support/harness.mjs";
import { tempDir, cleanup, git, write, repo } from "./support/git-repo.mjs";
import { parseStatus, parseRevParse } from "../mods/roundup-spaces/git-parse.js";

beforeEach(reset);
after(cleanup);

test("parseStatus counts changed, renamed, conflicted and untracked lines, not ignored ones or headers", () => {
  const out = [
    "# branch.oid 0123", "# branch.head topic", "# branch.upstream origin/topic", "# branch.ab +2 -1",
    "1 .M N... 100644 100644 100644 a a f.txt", "2 R. N... 100644 100644 100644 a a R100 new\told",
    "u UU N... 100644 100644 100644 100644 a a a c.txt", "? new.txt", "! ignored.log", "",
  ].join("\n");
  assert.deepEqual(parseStatus(out), { branch: "topic", ahead: 2, behind: 1, dirty: 4 });
  assert.deepEqual(parseStatus("# branch.oid (initial)\n# branch.head main\n"), { branch: "main", ahead: 0, behind: 0, dirty: 0 }, "no upstream: 0/0");
});

test("parseRevParse: a main checkout, a worktree, an old git and a bare common dir", () => {
  assert.deepEqual(parseRevParse("/src/proj\n/src/proj/.git\n", 0), { top: "/src/proj", repo: "/src/proj/.git", name: "proj", linked: false });
  assert.deepEqual(parseRevParse("/wt/proj/feature\n/src/proj/.git\n", 0), { top: "/wt/proj/feature", repo: "/src/proj/.git", name: "proj", linked: true });
  assert.deepEqual(parseRevParse("/src/proj\n--path-format=absolute\n.git\n", 0), { top: "/src/proj", repo: "/src/proj/.git", name: "proj", linked: false }, "git < 2.31 echoes the flag");
  assert.deepEqual(parseRevParse("/wt/feature\n/srv/x.git\n", 0), { top: "/wt/feature", repo: "/srv/x.git", name: "x", linked: true });
  assert.deepEqual(parseRevParse("/src/proj\r\n/src/proj/.git\r\n", 0).linked, false, "CRLF");
  assert.deepEqual(parseRevParse("", 128), { top: "", repo: "/.git", name: "", linked: false });
});

const Spaces = (await import("../mods/roundup-spaces/main.js")).default;
const key = (cwd, on = null) => JSON.stringify([on, cwd]);

function spacesView() {
  const m = mount(Spaces, { props: {} });
  return m;
}

test("check on real repos: dirty count, a worktree on its repo's card, a non-repo", async () => {
  const dir = repo({ "a.txt": "a\n", "b.txt": "b\n" });
  write(dir, { "a.txt": "changed\n", "new.txt": "n\n" });
  const wt = join(tempDir("roundup-wt-"), "feature");
  git(dir, "worktree", "add", "-q", "-b", "feature", wt);
  const plain = tempDir("roundup-plain-");
  const { view, cx } = spacesView();

  await view.check(key(dir), cx);
  assert.deepEqual(view.git[key(dir)], { name: basename(dir), branch: "main", ahead: 0, behind: 0, dirty: 2, repo: JSON.stringify([null, join(dir, ".git")]), linked: false });
  await view.check(key(wt), cx);
  assert.equal(view.git[key(wt)].linked, true);
  assert.equal(view.git[key(wt)].branch, "feature");
  assert.equal(view.git[key(wt)].repo, view.git[key(dir)].repo, "the same repo");
  await view.check(key(plain), cx);
  assert.equal(view.git[key(plain)], null);
  assert.equal(view.unsure.has(key(plain)), false, "git's own no is kept");
  assert.deepEqual(cx.errors, []);
});

test("check: another failure of git is asked again; an exec that throws keeps the old value", async () => {
  const dir = repo({ "a.txt": "a\n" });
  const { view, cx } = spacesView();
  herdr.onExec((c) => (c.args.includes("status") ? { code: 128, stderr: "fatal: unable to read index" } : undefined), { times: 1 });
  await view.check(key(dir), cx);
  assert.equal(view.git[key(dir)], null);
  assert.equal(view.unsure.has(key(dir)), true);

  await view.check(key(dir), cx);
  const known = view.git[key(dir)];
  assert.equal(known.dirty, 0);
  assert.equal(view.unsure.has(key(dir)), false);
  herdr.failExec("git", new Error("machine unreachable"));
  await view.check(key(dir), cx);
  assert.deepEqual(view.git[key(dir)], known, "what it showed stays");
  assert.equal(view.unsure.has(key(dir)), true);
  const away = key("/far", "vps");
  await view.check(away, cx);
  assert.equal(view.git[away], null);
  assert.equal(view.unsure.has(away), true);
});

test("check runs a status that writes nothing under .git", async () => {
  const dir = repo({ "a.txt": "a\n", "b.txt": "b\n" });
  write(dir, { "a.txt": "changed\n", "new.txt": "n\n" });
  // b.txt touched but unchanged: a status that may refresh the index would rewrite it.
  utimesSync(join(dir, "b.txt"), new Date(Date.now() + 60_000), new Date(Date.now() + 60_000));
  const { snapshot } = await import("./support/git-repo.mjs");
  const before = snapshot(join(dir, ".git"));
  const { view, cx } = spacesView();
  await view.check(key(dir), cx);
  const status = herdr.calls("exec").find(([, args]) => args.includes("status"));
  assert.deepEqual(status.slice(0, 2), ["git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"]]);
  assert.deepEqual(status[2], { cwd: dir, on: null });
  assert.equal(view.git[key(dir)].dirty, 2);
  assert.deepEqual(snapshot(join(dir, ".git")), before);
  git(dir, "status", "--porcelain");
  assert.notDeepEqual(snapshot(join(dir, ".git")), before, "the fixture: a plain status does write");
});

// Found writing these tests: check() tells "no repo" by git's English message. In a German locale
// git says "Kein Git-Repository", so a folder without a repo counts as unsure and is asked again at
// every look (10 s for the shown space, else 60 s). Kept as todo until check() reads it otherwise.
test("check takes a folder without a repo as no repo in any language", { todo: "check() matches git's English 'not a git repository' only" }, async () => {
  const plain = tempDir("roundup-plain-");
  herdr.set({ env: { ...process.env, LC_ALL: "de_DE.UTF-8", LANG: "de_DE.UTF-8", LANGUAGE: "de" } });
  const { view, cx } = spacesView();
  await view.check(key(plain), cx);
  assert.equal(view.git[key(plain)], null);
  assert.equal(view.unsure.has(key(plain)), false);
});
