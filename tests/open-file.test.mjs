// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OPEN, MOVED, OPENING, TAB_REQUESTS, previewId, shownIn, remember, marked, madePane, openTab, openCommand, requested, taken, windowGone, sameFloat,
} from "../mods/roundup-preview/open-file.js";

test("roundup-files' open-file.js is a copy of roundup-preview's", () => {
  const read = (m) => readFileSync(new URL(`../mods/${m}/open-file.js`, import.meta.url), "utf8");
  assert.equal(read("roundup-files"), read("roundup-preview"));
});

test("previewId: one key per file and machine, however the path is written", () => {
  assert.equal(previewId("C:\\repo\\b.md", null), previewId("c:/REPO/b.md", undefined));
  assert.notEqual(previewId("/a/b.md", null), previewId("/a/b.md", "vps"));
  assert.notEqual(previewId("/a/B.md", null), previewId("/a/b.md", null));
});

test("shownIn: a live pane that still shows the file", () => {
  const open = { [previewId("/r/a.md")]: { pane: "p1", token: "t1" } };
  assert.equal(shownIn(open, {}, "/r/a.md", null, new Set(["p1"])), "p1");
  assert.equal(shownIn(open, {}, "/r/a.md", null, new Set()), null, "pane closed");
  assert.equal(shownIn(open, { t1: "/r/b.md" }, "/r/a.md", null, new Set(["p1"])), null, "followed a link");
  assert.equal(shownIn(open, { t1: "/r/./a.md" }, "/r/a.md", null, new Set(["p1"])), "p1", "back, written another way");
  assert.equal(shownIn(open, {}, "/r/a.md", "vps", new Set(["p1"])), null, "another machine");
});

test("MOVED is per tab: a second tab of the same file doesn't change the recorded one", () => {
  const open = { [previewId("/r/a.md")]: { pane: "p1", token: "t1" } };
  const alive = new Set(["p1", "p2"]);
  // p2 (token t2, not recorded) follows a link: the recorded tab p1 still shows a.md.
  assert.equal(shownIn(open, { t2: "/r/b.md" }, "/r/a.md", null, alive), "p1");
  // p1 follows a link and p2 goes Back: p1 still shows b.md.
  assert.equal(shownIn(open, { t1: "/r/b.md", t2: "/r/a.md" }, "/r/a.md", null, alive), null);
});

test("remember: drops dead panes and unknown tokens, keeps the new tab's early MOVED", () => {
  const open = { [previewId("/r/x.md")]: { pane: "dead", token: "tx" }, [previewId("/r/y.md")]: { pane: "p9", token: "ty" } };
  const moved = { tx: "/r/z.md", ty: "/r/w.md", stray: "/r/s.md", tnew: "/r/b.md" };
  const next = remember(open, moved, "/r/a.md", null, "p1", "tnew", new Set(["p1", "p9"]));
  assert.deepEqual(next.open, { [previewId("/r/y.md")]: { pane: "p9", token: "ty" }, [previewId("/r/a.md")]: { pane: "p1", token: "tnew" } });
  assert.deepEqual(next.moved, { ty: "/r/w.md", tnew: "/r/b.md" });
});

test("marked and madePane: an overlap records nothing", () => {
  let o = marked({}, "a", { since: 0, until: null }, 0);
  o = marked(o, "b", { since: 50, until: null }, 50);
  const now = [{ pane: "pA", mod: "roundup-preview" }];
  assert.deepEqual(madePane(o, "a", new Set(), now), {});
  assert.deepEqual(madePane(marked({}, "a", { since: 0, until: null }, 0), "a", new Set(), now), { pane: "pA" });
  assert.deepEqual(madePane(marked({}, "a", { since: 0, until: null }, 0), "a", new Set(), []), { wait: true });
  assert.deepEqual(marked({ old: { since: 0, until: 1 } }, "n", null, 20000), {}, "entries go after SPAN");
});

// A fake Herdr: panes appear when a test says so, timers run when it steps them, Date.now is set.
let clock, queue, realNow;
const herdr = () => {
  const state = {}, calls = [], list = [];
  const api = {
    panes: () => list.slice(),
    run: (name, args) => { calls.push([name, args]); return null; },
    shared: (k) => state[k],
    setShared: (k, v) => { state[k] = v; return null; },
  };
  return { api, state, calls, list, add: (pane) => list.push({ pane, mod: "roundup-preview" }) };
};
const wait = (ms, fn) => queue.push({ at: clock + ms, fn });
// Moves the clock to `t`, running the timers due by then, in order.
const until = (t) => {
  for (;;) {
    queue.sort((a, b) => a.at - b.at);
    const next = queue[0];
    if (!next || next.at > t) break;
    queue.shift(); clock = next.at; next.fn(wait);
  }
  clock = t;
};
beforeEach(() => { clock = 0; queue = []; realNow = Date.now; Date.now = () => clock; });
afterEach(() => { Date.now = realNow; });

test("openTab: a new tab with a token, recorded once its pane comes", () => {
  const h = herdr();
  let done = 0;
  openTab(h.api, "/r/a.md", null, wait, () => done++, "sp1");
  const [[name, args]] = h.calls;
  assert.equal(name, "tab.new");
  assert.equal(args.space, "sp1");
  assert.equal(args.props.file, "/r/a.md");
  assert.ok(args.props.token);
  until(300); h.add("pA"); until(1000);
  assert.equal(done, 1);
  assert.deepEqual(h.state[OPEN], { [previewId("/r/a.md")]: { pane: "pA", token: args.props.token } });
  // The next open of the same file focuses that pane.
  openTab(h.api, "/r/a.md", null, wait);
  assert.deepEqual(h.calls.at(-1), ["pane.focus", { pane: "pA" }]);
});

test("openTab: a pane later than five looks isn't recorded", () => {
  const h = herdr();
  let done = 0;
  openTab(h.api, "/r/a.md", null, wait, () => done++);
  until(1100); h.add("pA"); until(2000);
  assert.equal(done, 1);
  assert.equal(h.state[OPEN], undefined);
  assert.equal(h.state[OPENING][h.calls[0][1].props.token].until, null, "it may still come: later opens don't record");
});

test("openTab: overlapping opens with a late second pane give no pane a wrong file", () => {
  const h = herdr();
  openTab(h.api, "/r/a.md", null, wait);           // A at 0
  until(50); openTab(h.api, "/r/b.md", null, wait); // B at 50: overlaps A
  until(150); h.add("pA");                          // only A's pane comes in time
  until(400); openTab(h.api, "/r/c.md", null, wait); // C at 400
  until(800); h.add("pB");                          // B's pane, late
  until(900); h.add("pC");
  until(3000);
  assert.deepEqual(h.state[OPEN] ?? {}, {}, "nothing recorded rather than pB for c.md");
  // Once the open-ended ones are older than SPAN, a new open records again.
  until(12000); openTab(h.api, "/r/d.md", null, wait);
  until(12100); h.add("pD"); until(13000);
  assert.equal(h.state[OPEN][previewId("/r/d.md")].pane, "pD");
});

test("openCommand: split modes and the props a tab gets", () => {
  assert.deepEqual(openCommand({ file: "/r/a.md", mode: "split-down", token: "t" }),
    ["pane.split", { direction: "down", mod: "roundup-preview", props: { file: "/r/a.md", on: null, token: "t" } }]);
  assert.deepEqual(openCommand({ file: "C:\\r\\a.md" }),
    ["tab.new", { name: "a.md", mod: "roundup-preview", props: { file: "C:\\r\\a.md", on: null, token: null } }]);
});

test("TAB_REQUESTS: each owner takes only its own, old ones go", () => {
  let r = requested({}, "r1", { at: 0, owner: "panel-1", file: "/r/a.md", on: null, space: null }, 0);
  r = requested(r, "r2", { at: 10, owner: "panel-2", file: "/r/b.md", on: null, space: null }, 10);
  const { mine, rest } = taken(r, "panel-1", 20);
  assert.deepEqual(mine.map((x) => x.file), ["/r/a.md"]);
  assert.deepEqual(Object.keys(rest), ["r2"]);
  assert.deepEqual(taken(r, "panel-2", 40000), { mine: [], rest: {} }, "older than 30 s");
  assert.equal(TAB_REQUESTS, "roundup-preview.tab-requests");
  assert.equal(MOVED, "roundup-preview.moved.v2");
  assert.equal(OPENING, "roundup-preview.opening");
});

test("windowGone: only a list of names without roundup-preview", () => {
  assert.equal(windowGone({ overlays: [] }), true);
  assert.equal(windowGone({ overlays: ["toast"] }), true);
  assert.equal(windowGone({ overlays: ["roundup-preview", "toast"] }), false);
  assert.equal(windowGone({ overlays: [{ mod: "roundup-preview", id: "o1" }] }), false, "unknown shape keeps it");
  assert.equal(windowGone({ overlays: [null] }), false);
  assert.equal(windowGone({}), false);
  assert.equal(windowGone(null), false);
});

test("sameFloat: token, id and copy all still match", () => {
  const was = { token: "T", id: "o1", copy: "c1", owner: "p1" };
  assert.ok(sameFloat({ ...was, owner: "p2", file: "/r/b.md" }, was));
  assert.ok(!sameFloat({ ...was, copy: "c2" }, was), "the window's copy started again");
  assert.ok(!sameFloat({ ...was, id: "o2" }, was));
  assert.ok(!sameFloat({ ...was, token: "U" }, was));
  assert.ok(!sameFloat(null, was));
});
