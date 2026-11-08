// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// roundup-spaces: a space's place, its git line, the agents badge, tints, rebuilt machines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { place, alpha, badge, gitWhere, changesTip, rebuilt } from "../mods/roundup-spaces/space-text.js";

test("alpha: #abc and #a1b2c3 get the alpha, #a1b2c3dd has it replaced, case-insensitive; other forms are null", () => {
  assert.equal(alpha("#abc", "26"), "#aabbcc26");
  assert.equal(alpha("#ABC", "26"), "#AABBCC26");
  assert.equal(alpha("#a1b2c3", "2e"), "#a1b2c32e");
  assert.equal(alpha("#a1b2c3dd", "2e"), "#a1b2c32e");
  assert.equal(alpha("#A1B2C3DD", "24"), "#A1B2C324");
  assert.equal(alpha("ansi6", "26"), null);
  assert.equal(alpha("rgb(1,2,3)", "26"), null);
  assert.equal(alpha("#abcd", "26"), null);
  assert.equal(alpha(undefined, "26"), null);
  assert.equal(alpha(null, "26"), null);
});

test("The git line: repo left out in a tree row or when it is the space's name, case-insensitive", () => {
  const g = { name: "herdr-roundup", branch: "feature", ahead: 0, behind: 0, dirty: 0 };
  assert.equal(gitWhere(g, false, "Notes"), "herdr-roundup · feature");
  assert.equal(gitWhere(g, true, "Notes"), "feature");
  assert.equal(gitWhere(g, false, "Herdr-Roundup"), "feature");
});

test("The git line: branch left out when it is the name or main/master; null is detached", () => {
  const g = (branch) => ({ name: "repo", branch, ahead: 0, behind: 0, dirty: 0 });
  assert.equal(gitWhere(g("main"), false, "x"), "repo");
  assert.equal(gitWhere(g("master"), false, "x"), "repo");
  assert.equal(gitWhere(g("Fix-It"), false, "fix-it"), "repo");
  assert.equal(gitWhere(g(null), false, "x"), "repo · detached");
  assert.equal(gitWhere(g(null), true, "x"), "detached");
});

test("The git line: nothing to say is null, only counts left is \"\"", () => {
  const g = { name: "repo", branch: "main", ahead: 0, behind: 0, dirty: 0 };
  assert.equal(gitWhere(g, true, "x"), null);
  assert.equal(gitWhere({ ...g, dirty: 3 }, true, "x"), "");
  assert.equal(gitWhere({ ...g, ahead: 1 }, true, "x"), "");
  assert.equal(gitWhere({ ...g, behind: 2 }, true, "x"), "");
  assert.equal(changesTip(1), "1 uncommitted change");
  assert.equal(changesTip(3), "3 uncommitted changes");
});

test("The badge takes the most urgent status: blocked > done > working > idle, unknown counts as idle", () => {
  assert.equal(badge(["idle", "working", "done"]).top, "done");
  assert.equal(badge(["working", "blocked", "done"]).top, "blocked");
  assert.equal(badge(["idle", "working"]).top, "working");
  assert.deepEqual(badge(["idle", "idle"]), { top: "idle", calm: true, n: 2, tip: "2 agents: 2 idle" });
  assert.equal(badge(["mystery", "idle"]).calm, true);
  assert.equal(badge(["mystery"]).top, "mystery");
});

test("The badge's tooltip counts by urgency, singular for one agent", () => {
  assert.equal(badge(["idle", "blocked", "idle"]).tip, "3 agents: 1 blocked, 2 idle");
  assert.equal(badge(["working"]).tip, "1 agent: 1 working");
  assert.equal(badge(["idle", "done", "working", "done"]).tip, "4 agents: 2 done, 1 working, 1 idle");
});

test("rebuilt only for an unreachable machine whose core is another", () => {
  assert.equal(rebuilt({ state: "unreachable", why: 'a different core answers there ("abc123")' }), true);
  assert.equal(rebuilt({ state: "unreachable", why: "connection refused" }), false);
  assert.equal(rebuilt({ state: "connected", why: 'a different core answers there ("abc123")' }), false);
  assert.equal(rebuilt({ state: "unreachable", why: 'a different core answers there ("")' }), false);
  assert.equal(rebuilt({ state: "unreachable" }), false);
  assert.equal(rebuilt(undefined), false);
});

test("place is the first terminal pane's cwd in the space's tabs, else its folder", () => {
  const s = { id: "s", machine: null, folder: "/made", tabs: [{ id: "t1" }, { id: "t2" }] };
  const ps = [{ tab: "other", cwd: "/elsewhere" }, { tab: "t1", cwd: null }, { tab: "t2", cwd: "/now" }, { tab: "t1", cwd: "/later" }];
  assert.equal(place(s, ps), "/now");
  assert.equal(place(s, []), "/made");
  assert.equal(place({ ...s, tabs: undefined }, ps), "/made");
});
