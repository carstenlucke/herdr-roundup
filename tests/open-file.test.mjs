// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OPEN, OPEN_V2, MOVED, OPENING, FLOAT, previewId, upgraded, shownIn, remember, marked, madePane, openTab, openCommand, isOpen, fresh, answered, unanswered, placed,
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

const entry = (pane, file, on = null) => ({ pane, file, on });

test("shownIn: a live pane that shows the file now", () => {
  const open = { t1: entry("p1", "/r/a.md") };
  assert.equal(shownIn(open, {}, "/r/a.md", null, new Set(["p1"])), "p1");
  assert.equal(shownIn(open, {}, "/r/a.md", null, new Set()), null, "pane closed");
  assert.equal(shownIn(open, { t1: "/r/b.md" }, "/r/a.md", null, new Set(["p1"])), null, "followed a link");
  assert.equal(shownIn(open, { t1: "/r/./a.md" }, "/r/a.md", null, new Set(["p1"])), "p1", "back, written another way");
  assert.equal(shownIn(open, {}, "/r/a.md", "vps", new Set(["p1"])), null, "another machine");
});

test("shownIn: a tab is found by the file it followed a link to", () => {
  const open = { t1: entry("p1", "/r/a.md"), t2: entry("p2", "/r/a.md", "vps") };
  const alive = new Set(["p1", "p2"]);
  assert.equal(shownIn(open, { t1: "/r/b.md" }, "/r/b.md", null, alive), "p1");
  assert.equal(shownIn(open, { t2: "/r/b.md" }, "/r/b.md", null, alive), null, "b.md on vps isn't b.md here");
  assert.equal(shownIn(open, { t2: "/r/b.md" }, "/r/b.md", "vps", alive), "p2");
});

test("MOVED is per tab: a second tab of the same file doesn't change the recorded one", () => {
  const open = { t1: entry("p1", "/r/a.md") };
  const alive = new Set(["p1", "p2"]);
  // p2 (token t2, not recorded) follows a link: the recorded tab p1 still shows a.md.
  assert.equal(shownIn(open, { t2: "/r/b.md" }, "/r/a.md", null, alive), "p1");
  // p1 follows a link and p2 goes Back: p1 still shows b.md.
  assert.equal(shownIn(open, { t1: "/r/b.md", t2: "/r/a.md" }, "/r/a.md", null, alive), null);
});

test("remember: drops dead panes with their MOVED, keeps unrecorded tabs' and the new tab's early MOVED", () => {
  const open = { tx: entry("dead", "/r/x.md"), ty: entry("p9", "/r/y.md") };
  const moved = { tx: "/r/z.md", ty: "/r/w.md", stray: "/r/s.md", tnew: "/r/b.md" };
  const next = remember(open, moved, "/r/a.md", null, "p1", "tnew", new Set(["p1", "p9"]));
  assert.deepEqual(next.open, { ty: entry("p9", "/r/y.md"), tnew: entry("p1", "/r/a.md") });
  assert.deepEqual(next.moved, { ty: "/r/w.md", stray: "/r/s.md", tnew: "/r/b.md" }, "stray: a live tab an overlap left unrecorded");
});

test("remember: a tab that moved on stays when its first file opens again", () => {
  const open = { t1: entry("p1", "/r/a.md") }, moved = { t1: "/r/b.md" }, alive = new Set(["p1", "p2"]);
  const next = remember(open, moved, "/r/a.md", null, "p2", "t2", alive);
  assert.equal(shownIn(next.open, next.moved, "/r/b.md", null, alive), "p1");
  assert.equal(shownIn(next.open, next.moved, "/r/a.md", null, alive), "p2");
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
  assert.deepEqual(h.state[OPEN], { [args.props.token]: entry("pA", "/r/a.md") });
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
  assert.deepEqual(Object.values(h.state[OPEN]).map((e) => e.pane), ["pD"]);
});

test("upgraded: tabs recorded under open.v2 count beside open.v3's", () => {
  const v2 = { [previewId("/r/a.md")]: { pane: "p1", token: "t1" }, [previewId("C:\\R\\B.md", "vps")]: { pane: "p2", token: "t2" }, bad: { pane: "p3", token: "t3" } };
  assert.deepEqual(upgraded(undefined, v2), { t1: entry("p1", "/r/a.md"), t2: entry("p2", "c:/r/b.md", "vps") });
  assert.equal(shownIn(upgraded(undefined, v2), {}, "C:\\r\\b.md", "vps", new Set(["p2"])), "p2");
  assert.deepEqual(upgraded({ t9: entry("p9", "/r/x.md"), t1: entry("p1", "/r/z.md") }, v2),
    { t1: entry("p1", "/r/z.md"), t2: entry("p2", "c:/r/b.md", "vps"), t9: entry("p9", "/r/x.md") }, "open.v3's entries win, v2's are added");
  assert.deepEqual(upgraded({ t9: entry("p9", "/r/x.md") }, null), { t9: entry("p9", "/r/x.md") });
  assert.deepEqual(upgraded(undefined, undefined), {});
});

test("openTab after the upgrade: an open.v2 tab is focused, and keeps its MOVED once open.v3 is written", () => {
  const h = herdr();
  h.add("pOld");
  h.state[OPEN_V2] = { [previewId("/r/a.md")]: { pane: "pOld", token: "tOld" } };
  h.state[MOVED] = { tOld: "/r/b.md" };
  openTab(h.api, "/r/b.md", null, wait);
  assert.deepEqual(h.calls.at(-1), ["pane.focus", { pane: "pOld" }], "found by the file it moved to");
  openTab(h.api, "/r/c.md", null, wait);
  const token = h.calls.at(-1)[1].props.token;
  until(300); h.add("pC"); until(1000);
  assert.deepEqual(h.state[OPEN], { tOld: entry("pOld", "/r/a.md"), [token]: entry("pC", "/r/c.md") });
  assert.deepEqual(h.state[MOVED], { tOld: "/r/b.md" });
  assert.equal(h.state[OPEN_V2], null, "open.v2 goes once open.v3 holds its tabs");
});

test("openCommand: split modes and the props a tab gets", () => {
  assert.deepEqual(openCommand({ file: "/r/a.md", mode: "split-down", token: "t" }),
    ["pane.split", { direction: "down", mod: "roundup-preview", props: { file: "/r/a.md", on: null, token: "t" } }]);
  assert.deepEqual(openCommand({ file: "C:\\r\\a.md" }),
    ["tab.new", { name: "a.md", mod: "roundup-preview", props: { file: "C:\\r\\a.md", on: null, token: null } }]);
});

test("shared keys keep their names", () => {
  assert.equal(FLOAT, "roundup-preview.float");
  assert.equal(OPEN, "roundup-preview.open.v3");
  assert.equal(MOVED, "roundup-preview.moved.v2");
  assert.equal(OPENING, "roundup-preview.opening");
});

// FLOAT as the panel and the window write it: openFloat, a panel copy's probe, the window's answer.
const window1 = { id: "o1", file: "/r/a.md", on: null, token: "T", copy: "c1" };

test("isOpen: a fresh record or an answered probe", () => {
  assert.equal(isOpen(null), false);
  assert.equal(isOpen(undefined), false);
  assert.equal(isOpen(window1), true, "openFloat's record, no probe");
  assert.equal(isOpen({ ...window1, probe: "p1" }), false, "asked, no answer yet");
  assert.equal(isOpen({ ...window1, probe: "p1", alive: "p1" }), true, "answered");
  assert.equal(isOpen({ ...window1, probe: "p2", alive: "p1" }), false, "a newer probe, not answered yet");
});

test("a saved answer from the last run doesn't count: the new probe waits for a live window", () => {
  const saved = { ...window1, probe: "p1", alive: "p1" };
  const asked = { ...saved, probe: "p2" };
  assert.equal(isOpen(asked), false);
  assert.equal(unanswered(asked, "p2"), true, "no window answers: FLOAT goes");
});

test("answered: only the window copy FLOAT names answers, and only an open probe", () => {
  const asked = { ...window1, probe: "p1" };
  assert.deepEqual(answered(asked, "T", "c1"), { ...asked, alive: "p1" });
  assert.equal(answered(asked, "T", "c0"), null, "an older copy of the window");
  assert.equal(answered(asked, "U", "c1"), null, "another window");
  assert.equal(answered({ ...asked, copy: undefined }, "T", "c1"), null, "a record without copy is no proof");
  assert.equal(answered({ ...asked, alive: "p1" }, "T", "c1"), null, "answered already: no write");
  assert.equal(answered(window1, "T", "c1"), null, "nothing asked: no write");
  assert.equal(answered(null, "T", "c1"), null);
});

test("unanswered: only the probe a panel copy wrote, still open, clears FLOAT", () => {
  const asked = { ...window1, probe: "p1" };
  assert.equal(unanswered(asked, "p1"), true);
  assert.equal(unanswered({ ...asked, alive: "p1" }, "p1"), false, "the window answered");
  assert.equal(unanswered({ ...asked, probe: "p2" }, "p1"), false, "a newer probe: its own timer decides");
  assert.equal(unanswered({ ...asked, probe: "p2", alive: "p2" }, "p1"), false);
  assert.equal(unanswered({ ...window1, token: "U" }, "p1"), false, "a window opened since");
  assert.equal(unanswered(null, "p1"), false);
});

test("a window copy that starts during a probe proves itself: fresh drops probe and answer", () => {
  const asked = { ...window1, probe: "p1" };
  const restarted = { ...fresh(asked), copy: "c2" };
  assert.deepEqual(restarted, { ...window1, copy: "c2" });
  assert.equal(isOpen(restarted), true);
  assert.equal(unanswered(restarted, "p1"), false, "the panel's timeout leaves it");
  assert.deepEqual(fresh({ ...window1, probe: "p1", alive: "p1" }), window1);
  assert.deepEqual(fresh(null), {});
});

test("two panel copies ask one after the other: both see the window once the newer probe is answered", () => {
  let f = { ...window1, probe: "p1" };          // panel 1 asks
  f = { ...f, probe: "p2" };                    // panel 2 asks before the window answered
  f = answered(f, "T", "c1");                   // the window answers what it finds
  assert.equal(isOpen(f), true, "the same record frees both panels");
  assert.equal(unanswered(f, "p1"), false, "panel 1's timeout: not its probe");
  assert.equal(unanswered(f, "p2"), false, "panel 2's timeout: answered");
});

// openFloat (roundup-files main.js) and the window copy's start (roundup-preview preview.js), as
// they write FLOAT; `inside` says whether the copy starts within openOverlay or after it.
const replaceWindow = (inside) => {
  let f = { id: "o-old", file: "/r/old.md", on: null, token: "OLD", copy: "c-old" };
  const start = () => { // preview.js: only over its own token, with its copy, no probe
    if (!f || f.token === "NEW") f = { ...fresh(f), id: "o-new", file: "/r/new.md", on: null, token: "NEW", copy: "c-new" };
  };
  const record = { file: "/r/new.md", on: null, token: "NEW" };
  f = record;                        // openFloat: the new token first
  if (inside) start();               // openOverlay runs the copy's start
  f = placed(f, { ...record, id: "o-new" });
  if (!inside) start();
  return f;
};

test("replacing a window: the new copy's record keeps its copy, whenever it starts", () => {
  for (const inside of [true, false]) {
    const f = replaceWindow(inside);
    assert.equal(f.token, "NEW");
    assert.equal(f.copy, "c-new", inside ? "copy started inside openOverlay" : "copy started after");
    assert.equal(f.id, "o-new");
    // A panel copy starting later asks; the live window can answer it.
    const asked = { ...f, probe: "p1" };
    assert.deepEqual(answered(asked, "NEW", "c-new"), { ...asked, alive: "p1" });
  }
  assert.deepEqual(placed({ token: "OLD", copy: "c-old" }, { token: "NEW", id: "o" }), { token: "NEW", id: "o" }, "another token's record goes");
});
