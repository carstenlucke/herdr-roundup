// node --test 'tests/*.test.mjs'
// roundup-files' pace (pace.js, L1) and the panel using it (L2): no read behind another app, a
// slower pace after a slow read, a catch-up when the window is back.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, space, tab, pane, waitFor, clock } from "./support/harness.mjs";
import { tempDir, cleanup, write } from "./support/git-repo.mjs";
import { POLL, hold, newPace, due, changed, started, ended } from "../mods/roundup-files/pace.js";

const Files = (await import("../mods/roundup-files/main.js")).default;

beforeEach(reset);
after(cleanup);

test("FIL-114: a slow read holds the next ones back: five times its length, at most a minute, a quick one not at all", () => {
  assert.equal(POLL, 10000);
  assert.deepEqual([0, 499, 500, 4000, 30000].map(hold), [0, 0, 2500, 20000, 60000]);
  const p = newPace(0, true);
  started(p, 1000);
  ended(p, 200, 1200);
  assert.deepEqual([p.watchAt, p.pollAt], [1200, 11200], "quick: a change reads at once, the next look in 10 s");
  ended(p, 4000, 5000);
  assert.deepEqual([p.watchAt, p.pollAt], [25000, 25000], "slow: a change and the next look both wait 20 s");
});

test("FIL-114: in front the timer reads every 10 s and a waiting change once its hold is over", () => {
  const p = newPace(0, true);
  assert.equal(due(p, true, 9999, true), false);
  assert.equal(due(p, true, 10000, true), true);
  started(p, 10000);
  ended(p, 4000, 14000); // hold until 34000
  assert.equal(changed(p, true, 15000), false, "a change during the hold waits");
  assert.equal(due(p, true, 33999, true), false);
  assert.equal(due(p, true, 34000, true), true);
  started(p, 34000);
  assert.equal(p.dirty, false, "the read takes the waiting change with it");
  ended(p, 100, 34100);
  assert.equal(changed(p, true, 34200), true, "after a quick read a change reads at once");
});

test("FIL-115: behind another app nothing is read; back in front a change seen meanwhile is, and an unwatched folder always", () => {
  const p = newPace(0, true);
  assert.equal(due(p, false, 60000, true), false, "not even when the 10 s have passed");
  assert.equal(changed(p, false, 61000), false);
  assert.equal(due(p, false, 62000, true), false);
  assert.equal(due(p, true, 62500, true), true, "back: the change seen meanwhile");
  started(p, 62500);
  ended(p, 50, 62550);
  due(p, false, 63000, true);
  assert.equal(due(p, true, 63500, true), false, "back with nothing seen and the folder watched: nothing to read");
  due(p, false, 64000, false);
  assert.equal(due(p, true, 64500, false), true, "a folder without a watch (another machine) is read on coming back");
  assert.equal(newPace(5, false).front, false, "a new folder keeps what is known of the window");
});

test("FIL-115: the panel reads nothing for a change behind another app, and reads once the window is back", async () => {
  const dir = tempDir("roundup-pace-");
  write(dir, { "a.txt": "a\n" });
  herdr.set({
    spaces: [space("s1", [tab("tb1", { active: true })], { active: true, folder: dir })],
    panes: [pane("p1", "tb1", { terminal: "t1", cwd: dir })],
    focused: { space: "s1", tab: "tb1", pane: "p1", terminal: "t1", cwd: dir },
  });
  const { view, cx } = mount(Files, { props: {} });
  view.sync(cx);
  await waitFor(() => herdr.watching(dir) === 1 && !view.loading);
  const front = (active) => herdr.set({ window: { ...herdr.stub.window, active } });
  front(false);
  await clock.advance(1000);
  const before = herdr.calls("exec").length;
  write(dir, { "b.txt": "b\n" });
  herdr.change(dir, [`${dir}/b.txt`]);
  await waitFor(() => herdr.watching(dir) === 1);
  await clock.advance(30000);
  assert.equal(herdr.calls("exec").length, before, "no read behind another app, by the watch or the timer");
  front(true);
  await clock.advance(1000);
  await waitFor(() => !view.loading && herdr.calls("exec").length > before);
  assert.ok((view.entries.get("") ?? []).some((e) => e.name === "b.txt"), "back in front: the change is read");
  assert.deepEqual(cx.errors, []);
});

