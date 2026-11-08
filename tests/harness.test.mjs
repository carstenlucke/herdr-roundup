// The L2 harness itself (tests/support/): what later tests rely on.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { herdr, reset, mount, makeCx, clock, fetch, waitFor, byId, byText, hasId, ids, click, fire, texts, space, tab } from "./support/harness.mjs";

beforeEach(reset);

const kit = await import("gpui-kit").catch(() => null);
const h = await import("herdr").catch(() => null);

test("the bare imports resolve to the stubs, after the harness", async () => {
  assert.ok(kit?.div, "gpui-kit");
  assert.ok((await import("gpui-base")).h_flex, "gpui-base");
  assert.equal(typeof h?.exec, "function", "herdr");
  assert.equal(h.home(), herdr.stub.home);
});

test("builders record ids, styles, text, children, hover and handlers; finders and click reach them", () => {
  const { div, svg } = kit;
  const clicks = [];
  const tree = div().id("root").bg("chrome").when(true, (el) => el.child("shown")).when(false, (el) => el.child("hidden"))
    .child(div().id("btn").hover((s) => s.bg("hover")).on_click((e, cx) => { cx.stop_propagation(); clicks.push(e.click_count); }).child(svg("x.svg").size(12)).child("Close"))
    .children([null, "tail", false]);
  assert.deepEqual(ids(tree), ["root", "btn"]);
  assert.deepEqual(byId(tree, "root").style("bg"), ["chrome"]);
  assert.deepEqual(byId(tree, "btn").hovered.style("bg"), ["hover"]);
  assert.deepEqual(texts(tree), ["shown", "Close", "tail"]);
  assert.equal(byText(tree, "Close").elementId, "btn");
  assert.equal(hasId(tree, "nope"), false);
  assert.throws(() => byId(tree, "nope"), /no element with id "nope"; ids: root, btn/);
  const cx = makeCx();
  click(byId(tree, "btn"), cx, { click_count: 2 });
  assert.deepEqual(clicks, [2]);
  assert.equal(cx.stopped, 1);
  const pressed = [];
  const row = div().on_mouse_down("right", (e) => pressed.push(e.button)).on_key_down((e) => pressed.push(e.key));
  fire(row, "mouse_down:right", { button: "right" });
  fire(row, "key_down", { key: "enter" });
  assert.deepEqual(pressed, ["right", "enter"]);
});

test("a mounted View renders from the fixtures; cx timers run on the virtual clock", async () => {
  class Clock extends kit.View {
    init(_p, cx) { this.ticks = 0; cx.timer.every(1000, (cx) => { this.ticks++; cx.notify(); }); cx.timer.after(500, () => { this.half = true; }); }
    render() { return kit.div().id("c").child(`${h.spaces().length} spaces, ${this.ticks} ticks`); }
  }
  herdr.set({ spaces: [space("s1", [tab("t1")])] });
  const { view, cx, render } = mount(Clock);
  assert.equal(render().text(), "1 spaces, 0 ticks");
  await clock.advance(2500);
  assert.equal(view.ticks, 2);
  assert.equal(view.half, true);
  assert.equal(cx.notified, 2);
  clock.useFakeNow(1000);
  await clock.advance(10);
  assert.equal(Date.now(), 1010);
});

test("advance() does not hang on a handler that sleeps: a new sleep, an earlier one, one past the end", async () => {
  const cx = makeCx();
  const done = [];
  cx.timer.after(10, async (cx) => { await cx.sleep(10); done.push("new"); });
  const earlier = cx.sleep(25);
  cx.timer.after(5, async () => { await earlier; done.push("earlier"); });
  cx.timer.after(10, async (cx) => { await cx.sleep(100); done.push("late"); });
  await clock.advance(30);
  assert.equal(clock.now, 30);
  assert.deepEqual(done, ["new", "earlier"]);
  await clock.advance(100);
  assert.deepEqual(done, ["new", "earlier", "late"]);
  assert.deepEqual(cx.errors, []);
});

test("advance() lets a spawn started just before it schedule its sleep first", async () => {
  const cx = makeCx();
  let woke = null;
  cx.spawn(async (cx) => { await cx.sleep(10); woke = clock.now; });
  await clock.advance(30);
  assert.equal(woke, 10);
});

test("advance() gives a handler a few turns, not its whole I/O; a later failure still reaches cx.errors", async () => {
  const cx = makeCx();
  let release, fail;
  const io = new Promise((r) => { release = r; });
  const failing = new Promise((_, reject) => { fail = reject; });
  let finished = false;
  cx.timer.after(10, async () => { await io; finished = true; });
  cx.timer.after(20, async () => { await failing; });
  await clock.advance(30);
  assert.equal(clock.now, 30);
  assert.equal(finished, false);
  release();
  fail(new Error("later"));
  await waitFor(() => finished && cx.errors.length === 1);
  assert.match(cx.errors[0].message, /later/);
});

test("every() is rescheduled after its handler's turns, so slow async calls overlap (harness behaviour)", async () => {
  const cx = makeCx();
  const log = [];
  let open = 0, most = 0;
  const timer = cx.timer.every(10, async (cx) => {
    most = Math.max(most, ++open);
    log.push(["start", clock.now]);
    await cx.sleep(15);
    open--;
    log.push(["end", clock.now]);
  });
  await clock.advance(30);
  assert.deepEqual(log, [["start", 10], ["start", 20], ["end", 25], ["start", 30]]);
  assert.equal(most, 2);
  timer.cancel();
  await clock.advance(15);
  assert.equal(open, 0);
  assert.deepEqual(log.slice(4), [["end", 35], ["end", 45]]);
});

test("space() numbers its tabs by their place in the list, over an index they carry", () => {
  assert.deepEqual(space("s1", [tab("a"), tab("b")]).tabs.map((t) => t.index), [1, 2]);
  assert.deepEqual(space("s1", [tab("a", { index: 7 }), tab("b")]).tabs.map((t) => t.index), [1, 2]);
});

test("exec runs real processes, records them, and hooks answer or fail them; hc only records", async () => {
  const r = await h.exec("sh", ["-c", "printf %s \"$PWD\"; printf err >&2; exit 3"], { cwd: tmpdir() });
  assert.equal(r.code, 3);
  assert.equal(r.stderr, "err");
  await assert.rejects(h.exec("roundup-no-such-program-xyz", []), /cannot start/);
  await assert.rejects(h.exec("sh", ["-c", "true"], { cwd: join(tmpdir(), "roundup-missing-folder-xyz") }));
  herdr.onExec((c) => (c.command === "git" ? { stdout: "fake" } : undefined), { times: 1 });
  assert.deepEqual(await h.exec("git", ["status"]), { code: 0, stdout: "fake", stderr: "" });
  herdr.failExec("git");
  await assert.rejects(h.exec("git", ["status"]), /program not found/);
  assert.deepEqual(herdr.calls("exec").map(([cmd]) => cmd), ["sh", "roundup-no-such-program-xyz", "sh", "git", "git"]);
  assert.deepEqual(await h.hc(["label", "t1", "k=v"]), { code: 0, stdout: "", stderr: "" });
  assert.deepEqual(herdr.calls("hc"), [[["label", "t1", "k=v"]]]);
});

test("shared state is JSON in memory; commands and folder changes come when the test sends them", async () => {
  const value = { a: [1] };
  h.setShared("k", value);
  value.a.push(2);
  assert.deepEqual(h.shared("k"), { a: [1] });
  assert.equal(h.shared("missing"), null);
  const got = [];
  const cx = makeCx();
  cx.spawn(async () => { for (;;) got.push(await h.nextCommand()); });
  await herdr.command("one");
  await herdr.command("two");
  assert.deepEqual(got, ["one", "two"]);
  const watched = h.watchFolder("/w");
  assert.equal(herdr.watching("/w"), 1);
  herdr.change("/w", ["/w/a"]);
  assert.deepEqual(await watched, ["/w/a"]);
});

test("fetch never reaches the network: it fails until a test answers, and can wait for the test", async () => {
  await assert.rejects(globalThis.fetch("https://example.invalid"), /no network/);
  fetch.reply(200, { ok: 1 });
  assert.deepEqual(await (await globalThis.fetch("https://example.invalid")).json(), { ok: 1 });
  const gate = fetch.defer();
  const pending = globalThis.fetch("https://example.invalid/slow");
  gate.resolve(404, {});
  assert.equal((await pending).status, 404);
  assert.equal(fetch.calls.length, 3);
});

test("writeTextFile writes only below the temp folder", async () => {
  await assert.rejects(h.writeTextFile("/etc/roundup-test", "x", null), /outside/);
  const path = join(tmpdir(), `roundup-write-${process.pid}.txt`);
  await h.writeTextFile(path, "one", null);
  await assert.rejects(h.writeTextFile(path, "two", "stale"), /stale/);
  await h.writeTextFile(path, "two", "one");
  assert.equal(await h.readTextFile(path), "two");
  assert.equal(await h.readTextFile(path + ".missing"), null);
  rmSync(path);
});

test("the README's example: the shown tab's × closes it", async () => {
  const { pane } = await import("./support/harness.mjs");
  const Tabs = (await import("../mods/roundup-tabs/main.js")).default;
  herdr.set({
    spaces: [space("s1", [tab("tb1", { name: "tb1", active: true }), tab("t2")], { active: true })],
    panes: [pane("p1", "tb1", { terminal: "t1" })],
    shared: { "roundup-tabs.confirm-close": "never" },
  });
  const { cx, render } = mount(Tabs, { props: {} });
  click(byId(render(), "close-tb1"), cx);
  assert.deepEqual(herdr.calls("run"), [["tab.close", { id: "tb1", confirmed: true }]]);
});
