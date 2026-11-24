// node --test 'tests/*.test.mjs'
// roundup-tabs' bar (L2): it scrolls to the active tab, the wheel moves a tab per notch and a
// swipe a tab per stretch, and what localStorage holds is read with care.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, find, space, tab, pane, clock } from "./support/harness.mjs";

const Tabs = (await import("../mods/roundup-tabs/main.js")).default;

beforeEach(reset);
const runs = () => herdr.calls("run").map(([name]) => name);
const scrolls = (view) => view.scroll.calls.filter(([m]) => m === "scroll_to_item").map(([, i]) => i);

function bar(active = "b") {
  const tabs = ["a", "b", "c"].map((id) => tab(id, { name: id, named: true, active: id === active }));
  herdr.set({ spaces: [space("s1", tabs, { active: true })], panes: tabs.map((t) => pane(`p-${t.id}`, t.id)), layout: { id: "root", children: [] } });
}

test("TAB-17: the bar scrolls to the active tab when it or its place changes, and when the bar or a tab up to it changes size", () => {
  bar("b");
  const { view, cx, render } = mount(Tabs, { props: {} });
  let root = render();
  assert.deepEqual(scrolls(view), [1]);
  render();
  assert.deepEqual(scrolls(view), [1], "nothing changed: not again");
  const area = find(root, (e) => e.elementId === "tab-scroll");
  assert.deepEqual(area.style("track_scroll"), [view.scroll]);
  area.handlers.size_change({}, cx);
  find(root, (e) => e.elementId === "tab-a").handlers.size_change({}, cx);
  assert.deepEqual(scrolls(view), [1, 1, 1]);
  assert.equal(find(root, (e) => e.elementId === "tab-c").handlers.size_change, undefined, "a tab after the active one can't push it out");
  bar("c");
  root = render();
  assert.deepEqual(scrolls(view).at(-1), 2);
  assert.deepEqual(cx.errors, []);
});

test("TAB-13, TAB-18: a wheel notch moves one tab; a swipe one tab after 20 px, then one per 60 px, at most one every 100 ms", () => {
  bar();
  const { view } = mount(Tabs, { props: {} });
  const now = Date.now;
  let at = 1_000_000;
  Date.now = () => at;
  try {
    view.wheel({ delta_lines: { y: 1 }, delta: { y: 20 } });
    view.wheel({ delta_lines: { y: -1 }, delta: { y: -20 } });
    view.wheel({ delta_lines: { y: 0 }, delta: { y: 0 } });
    assert.deepEqual(runs(), ["tab.prev", "tab.next"], "a mouse wheel: one tab per notch, none for a sideways one");
    herdr.clear();
    const swipe = (y) => { at += 20; view.wheel({ delta: { y } }); };
    swipe(-8); swipe(-8);
    assert.deepEqual(runs(), [], "under 20 px");
    swipe(-8);
    assert.deepEqual(runs(), ["tab.next"]);
    for (let i = 0; i < 4; i++) swipe(-10);
    assert.deepEqual(runs(), ["tab.next"], "the next needs 60 px");
    for (let i = 0; i < 3; i++) swipe(-10);
    assert.deepEqual(runs(), ["tab.next", "tab.next"]);
    at += 100;
    swipe(30);
    assert.deepEqual(runs().at(-1), "tab.prev", "a turn starts a new gesture: 20 px again");
    herdr.clear();
    at += 20; view.wheel({ delta: { y: 500 } });
    assert.deepEqual(runs(), [], "within 100 ms of the last switch: not yet");
    at += 300; view.wheel({ delta: { y: 5 } });
    assert.deepEqual(runs(), [], "a pause starts a new gesture");
  } finally { Date.now = now; }
});

test("TAB-19: the panels kept in localStorage are read with care: broken JSON or another type starts empty", () => {
  bar();
  for (const kept of ["{broken", JSON.stringify(["files"]), JSON.stringify("files"), "null"]) {
    localStorage.setItem("panels", kept);
    assert.deepEqual(mount(Tabs, { props: {} }).view.panels, {}, kept);
  }
  localStorage.setItem("panels", JSON.stringify({ s1: "files" }));
  assert.deepEqual(mount(Tabs, { props: {} }).view.panels, { s1: "files" });
});
