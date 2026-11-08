// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// Which folder roundup-files shows: the focused pane's, with Herdr's state as fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import { location } from "../mods/roundup-files/location.js";

// Space s1 (active, local) with tab t1 (a terminal in /a, a mod pane) and t2 (a preview tab:
// mod panes only); space s2 on machine m with tab t3.
const space = (over = {}) => ({ id: "s1", active: true, machine: null, folder: "/start", tabs: [{ id: "t1" }, { id: "t2" }], ...over });
const PANES = [
  { pane: "p1", tab: "t1", terminal: "term1", cwd: "/a" },
  { pane: "p2", tab: "t1", terminal: null, cwd: null },
  { pane: "p3", tab: "t2", terminal: null, cwd: null },
  { pane: "p4", tab: "t3", terminal: "m/term4", cwd: "/remote" },
];
const herdr = ({ spaces = [space()], panes = PANES, focused = null } = {}) => ({ spaces: () => spaces, panes: () => panes, focused: () => focused });
const at = (pane, over = {}) => ({ space: "s1", tab: "t1", pane, terminal: null, shown: null, agent: null, cwd: null, ...over });

test("The focused terminal's cwd", () => {
  assert.deepEqual(location(herdr({ focused: at("p1", { terminal: "term1", cwd: "/a" }) }), new Map()), { cwd: "/a", on: null });
});

test("A focused mod pane shows the first terminal of its tab", () => {
  assert.deepEqual(location(herdr({ focused: at("p2") }), new Map()), { cwd: "/a", on: null });
});

test("A tab without terminals keeps the last folder shown in this space", () => {
  const last = new Map();
  location(herdr({ focused: at("p1", { cwd: "/a" }) }), last);
  assert.deepEqual(last.get("s1"), { cwd: "/a", on: null });
  // The terminal moved on meanwhile: the preview tab still shows what was shown last.
  const moved = PANES.map((p) => (p.pane === "p1" ? { ...p, cwd: "/b" } : p));
  assert.deepEqual(location(herdr({ panes: moved, focused: at("p3", { tab: "t2" }) }), last), { cwd: "/a", on: null });
});

test("Before any folder was shown: the space's first terminal with a cwd, else space.folder", () => {
  assert.deepEqual(location(herdr({ focused: at("p3", { tab: "t2" }) }), new Map()), { cwd: "/a", on: null });
  const none = PANES.filter((p) => p.tab !== "t1");
  assert.deepEqual(location(herdr({ panes: none, focused: at("p3", { tab: "t2" }) }), new Map()), { cwd: "/start", on: null });
  assert.deepEqual(location(herdr({ spaces: [space({ folder: null })], panes: none, focused: at("p3", { tab: "t2" }) }), new Map()), { cwd: null, on: null });
  // Terminals of other spaces don't count.
  assert.deepEqual(location(herdr({ panes: PANES.filter((p) => p.tab === "t3" || p.tab === "t2"), focused: at("p3", { tab: "t2" }) }), new Map()), { cwd: "/start", on: null });
});

test("on comes from space.machine; a focused terminal outside a pane names its machine", () => {
  const remote = space({ id: "s2", machine: "m", tabs: [{ id: "t3" }] });
  assert.deepEqual(location(herdr({ spaces: [remote], focused: at("p4", { space: "s2", tab: "t3", terminal: "m/term4", cwd: "/remote" }) }), new Map()), { cwd: "/remote", on: "m" });
  assert.deepEqual(location(herdr({ spaces: [remote], focused: at(null, { terminal: "m/term4", cwd: "/x" }) }), new Map()), { cwd: "/x", on: "m" });
  assert.deepEqual(location(herdr({ spaces: [remote], focused: at(null, { terminal: "term1", cwd: "/x" }) }), new Map()), { cwd: "/x", on: null });
});

test("Without an active space or focus", () => {
  assert.deepEqual(location(herdr({ spaces: [], focused: null }), new Map()), { cwd: null, on: null });
  const last = new Map();
  assert.deepEqual(location(herdr({ spaces: [], focused: at(null, { cwd: "/x" }) }), last), { cwd: "/x", on: null });
  assert.equal(last.size, 0);
});
