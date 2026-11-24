// node --test 'tests/*.test.mjs'
// roundup-files and roundup-preview stop watching a folder they no longer show (L2): Herdr 0.1.16's
// watchFolder() returns a FolderWatch whose cancel() releases the call, where before a watch waited
// until that folder's next change.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { herdr, reset, mount, space, tab, pane, waitFor, clock } from "./support/harness.mjs";
import { tempDir, cleanup, write } from "./support/git-repo.mjs";

const Files = (await import("../mods/roundup-files/main.js")).default;
const { Preview } = await import("../mods/roundup-preview/preview.js");

beforeEach(reset);
after(cleanup);
const cancelled = () => herdr.calls("watchFolder.cancel").map(([p]) => p);

test("FIL-113: the panel cancels the watch of the folder shown before; a watch that answers with nothing is set again by the next timed read", async () => {
  clock.useFakeNow();
  const a = tempDir("roundup-watch-a-"), b = tempDir("roundup-watch-b-");
  write(a, { "a.txt": "a\n" });
  write(b, { "b.txt": "b\n" });
  const at = (cwd) => herdr.set({
    spaces: [space("s1", [tab("tb1", { active: true })], { active: true, folder: cwd })],
    panes: [pane("p1", "tb1", { terminal: "t1", cwd })],
    focused: { space: "s1", tab: "tb1", pane: "p1", terminal: "t1", cwd },
  });
  at(a);
  const { view, cx } = mount(Files, { props: {} });
  view.sync(cx);
  await waitFor(() => herdr.watching(a) === 1);
  // Nothing changed (a watch Herdr reclaimed): no refresh, and no new watch at once, which would
  // reclaim another one's; the next timed read watches again.
  await waitFor(() => !view.loading);
  view.ctx.base = { top: a, prefix: "" }; // as a repo's read leaves it
  const refreshes = herdr.calls("exec").length;
  herdr.change(a, []);
  await waitFor(() => view.watched === null);
  assert.equal(herdr.watching(a), 0, "not watched again at once");
  assert.equal(herdr.calls("exec").length, refreshes, "an empty answer reads nothing at once");
  assert.equal(view.ctx.base, null, "a .git may have come or gone meanwhile: rev-parse again");
  await clock.advance(10000);
  await waitFor(() => herdr.watching(a) === 1 && !view.loading, 2000, "the timed read watches again");
  at(b);
  view.sync(cx);
  assert.deepEqual(cancelled(), [a]);
  await waitFor(() => herdr.watching(b) === 1);
  assert.equal(herdr.watching(a), 0, "the folder shown before is released");
  assert.deepEqual(cx.errors, []);
});

test("CHG-09: a preview cancels the watch of the folder it showed when it shows a file elsewhere, and when it closes", async () => {
  const a = tempDir("roundup-watch-pa-"), b = tempDir("roundup-watch-pb-");
  write(a, { "one.txt": "1\n" });
  write(b, { "two.txt": "2\n" });
  herdr.set({ props: { file: join(a, "one.txt") } });
  const view = new Preview();
  const { cx } = mount(class { init(_p, cx) { view.init(_p, cx); } }, { props: { file: join(a, "one.txt") } });
  await waitFor(() => herdr.watching(a) === 1);
  view.show(join(b, "two.txt"), cx);
  assert.deepEqual(cancelled(), [a]);
  await waitFor(() => herdr.watching(b) === 1);
  assert.equal(herdr.watching(a), 0);
  view.close();
  assert.deepEqual(cancelled(), [a, b]);
  assert.equal(herdr.watching(b), 0);
  assert.deepEqual(cx.errors, []);
});

test("CHG-10: a preview whose watch Herdr reclaimed reads its file once and looks every 3 s, without a new watch", async () => {
  const a = tempDir("roundup-watch-pr-");
  write(a, { "one.txt": "1\n" });
  const file = join(a, "one.txt");
  herdr.set({ props: { file } });
  const view = new Preview();
  const { cx } = mount(class { init(_p, cx) { view.init(_p, cx); } }, { props: { file } });
  await waitFor(() => herdr.watching(a) === 1 && view.loads === 1);
  herdr.clear();
  herdr.change(a, []);
  await waitFor(() => view.loads === 2 && view.poll, 2000, "read once, then the look every 3 s");
  assert.deepEqual(herdr.calls("watchFolder"), [], "no new watch, which would reclaim another one's");
  write(a, { "one.txt": "changed\n" });
  await clock.advance(3000);
  await waitFor(() => view.loads === 3, 2000, "the look sees the save");
  view.show(join(a, "one.txt"), cx);
  assert.equal(view.poll, null, "showing a file again watches it again");
  await waitFor(() => herdr.watching(a) === 1);
  view.close();
  assert.deepEqual(cx.errors, []);
});

test("FIL-113: an index built while the watch is reclaimed comes out stale, and the search reads it again", async () => {
  clock.useFakeNow();
  const a = tempDir("roundup-watch-ix-");
  write(a, { "a.txt": "a\n" });
  herdr.set({
    spaces: [space("s1", [tab("tb1", { active: true })], { active: true, folder: a })],
    panes: [pane("p1", "tb1", { terminal: "t1", cwd: a })],
    focused: { space: "s1", tab: "tb1", pane: "p1", terminal: "t1", cwd: a },
  });
  const { view, cx } = mount(Files, { props: {} });
  view.sync(cx);
  await waitFor(() => herdr.watching(a) === 1 && !view.loading);
  // The disk's index (find) is held up until the watch has answered.
  let release;
  const gate = new Promise((r) => { release = r; });
  herdr.onExec((c) => (c.command === "sh" && String(c.args[1]).includes("find .") ? gate.then(() => undefined) : undefined), { times: 1 });
  const built = view.ensureIndex(view.ctx);
  await waitFor(() => view.indexing && herdr.calls("exec").some(([cmd, args]) => cmd === "sh" && String(args[1]).includes("find .")));
  herdr.change(a, []);
  await waitFor(() => view.watched === null);
  release();
  const index = await built;
  assert.equal(index.stale, true, "what changed meanwhile may be missing from it");
  assert.equal(index.at, 0, "so it is read again before the next search");
  view.close?.();
  assert.deepEqual(cx.errors, []);
});

test("CHG-10: the one read comes after the stamp has answered, so a save between them is still seen; its own cancel on a switch to another machine polls nothing", async () => {
  const a = tempDir("roundup-watch-po-");
  write(a, { "one.txt": "1\n", "two.txt": "2\n" });
  const file = join(a, "one.txt");
  herdr.set({ props: { file } });
  const view = new Preview();
  const { cx } = mount(class { init(_p, cx) { view.init(_p, cx); } }, { props: { file } });
  await waitFor(() => herdr.watching(a) === 1 && view.loads === 1);
  // The stamp answers 20 ms late, the same each time; each read notes whether a stamp had answered by then.
  let stamps = 0, answered = 0;
  const readWhen = [];
  herdr.onExec((c) => {
    if (c.command !== "sh" || c.args[2] !== "stamp") return undefined;
    stamps++;
    return new Promise((r) => setTimeout(r, 20)).then(() => { answered++; return { code: 0, stdout: "1\n" }; });
  });
  herdr.onReadTextFile(() => { readWhen.push(answered); return undefined; });
  herdr.change(a, []);
  await waitFor(() => view.loads === 2 && view.poll);
  assert.ok(readWhen.length >= 1 && readWhen[0] >= 1, "the file is read again only once the stamp has answered");
  // Its own cancel: showing a file on another machine ends the loop; nothing is polled.
  view.show(join(a, "two.txt"), cx);
  await waitFor(() => herdr.watching(a) === 1 && view.poll === null);
  const before = stamps;
  view.on = "box";
  view.show(join(a, "one.txt"), cx);
  await waitFor(() => herdr.watching(a) === 0);
  await new Promise((r) => setTimeout(r, 100)); // a stamp would have been asked and answered by now
  await clock.advance(6000);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(stamps, before, "no stamp for the local file shown before");
  assert.equal(view.poll, null, "and no look every 3 s");
  view.close();
  assert.deepEqual(cx.errors, []);
});

test("FIL-116: an older index build that finishes last doesn't replace the index of a newer one", async () => {
  const a = tempDir("roundup-watch-old-");
  write(a, { "a.txt": "a\n" });
  herdr.set({
    spaces: [space("s1", [tab("tb1", { active: true })], { active: true, folder: a })],
    panes: [pane("p1", "tb1", { terminal: "t1", cwd: a })],
    focused: { space: "s1", tab: "tb1", pane: "p1", terminal: "t1", cwd: a },
  });
  const { view, cx } = mount(Files, { props: {} });
  view.sync(cx);
  await waitFor(() => herdr.watching(a) === 1 && !view.loading);
  view.setSource("disk", cx);
  // The first build (the disk's) is held up; the source goes to git and back, which starts two more.
  let release;
  const gate = new Promise((r) => { release = r; });
  herdr.onExec((c) => (c.command === "sh" && String(c.args[1]).includes("find .") ? gate.then(() => undefined) : undefined), { times: 1 });
  const older = view.ensureIndex(view.ctx);
  await waitFor(() => herdr.calls("exec").some(([cmd, args]) => cmd === "sh" && String(args[1]).includes("find .")));
  view.setSource("git", cx);
  const between = view.ensureIndex(view.ctx);
  view.setSource("disk", cx);
  const newer = await view.ensureIndex(view.ctx);
  await between.catch(() => null);
  assert.equal(view.index, newer, "the newest build's index");
  release();
  await older;
  assert.equal(view.index, newer, "the older build, done last, is dropped");
  assert.deepEqual(cx.errors, []);
});
