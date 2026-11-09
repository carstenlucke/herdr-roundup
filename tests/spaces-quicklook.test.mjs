// roundup-spaces' agent quicklook (L2): the badge's card, reading the core document, the menu
// over it (roundup-menu's open flag) and presses on the badge.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, find, findAll, byId, hasId, fire, click, clock, space, tab, agent, program } from "./support/harness.mjs";

const { default: Spaces, clean } = await import("../mods/roundup-spaces/main.js");
const Menu = (await import("../mods/roundup-menu/main.js")).default;

const MENU_OPEN = "roundup-menu.open";
const DOC = {
  spaces: [{ id: "s1", name: "", folder: "", tabs: [
    { id: "tb1", name: "", root: { type: "row", id: "tb1", children: [
      { type: "block", id: "p1", content: { terminal: "t1" }, size: { weight: 0.6 } },
      { type: "column", id: "c1", size: { weight: 0.4 }, children: [
        { type: "block", id: "p2", content: { terminal: "t2" } },
        { type: "block", id: "p3", content: { terminal: "t3" } },
      ] },
    ] } },
    { id: "tb2", name: "", root: { type: "row", id: "tb2", children: [{ type: "block", id: "p4", content: { terminal: "t4" } }] } },
  ] }],
};
const answer = (value = DOC) => ({ code: 0, stdout: JSON.stringify({ id: 1, jsonrpc: "2.0", result: { value, version: 7 } }) + "\n" });

// The hover's timings in main.js: the read after ARM on the badge, the card forgotten GRACE after
// the pointer left badge and card.
const ARM = 300;
const GRACE = 200;

let logs, log;
beforeEach(() => {
  reset();
  // exec is real in the harness: anything but the document's read fails here.
  herdr.onExec((c) => new Error(`unexpected exec: ${c.command} ${c.args.join(" ")}`));
  logs = [];
  log = console.log;
  console.log = (...a) => logs.push(a.join(" "));
});
afterEach(() => { console.log = log; });

const ag = (address, tabId, extra = {}) => agent(address, { pane: `p${address.slice(1)}`, space: "s1", tab: tabId, status: "idle", title: `✳ task ${address}`, ...extra });

// One space (two tabs), or two, with the agents given.
function world(agents, { two = false } = {}) {
  herdr.set({
    spaces: [
      space("s1", [tab("tb1", { name: "main", named: true, active: true }), tab("tb2")], { active: true }),
      ...(two ? [space("s2", [tab("tb5")])] : []),
    ],
    agents,
  });
}

// The document reads: the sh calls, decoded.
const reads = () => herdr.calls("exec").filter(([cmd]) => cmd === "sh").map(([, args, opts]) => ({ rpc: JSON.parse(args[3]), opts, script: args[1] }));
const card = (root, id = "s1") => find(root, (e) => e.type === "HoverCard" && e.arg === `quick-${id}`);
const content = (root, id = "s1") => card(root, id)?.style("content")?.[0];
const shows = (root, id = "s1") => hasId(content(root, id), `quick-card-${id}`);
const list = (root) => find(root, (e) => e.elementId === null && e.handlers["mouse_up:left"]);
// A spawned task starts on the next tick: a few turns let it reach its exec.
const turns = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const hover = (root, id, on, cx) => fire(byId(root, `crew-${id}`), "hover", on, cx);
const onCard = (root, id, on, cx) => fire(byId(content(root, id), `quick-card-${id}`), "hover", on, cx);
// Rests on the badge until its hover arms (and reads), then lets the read finish.
const rest = async (root, id, cx) => { hover(root, id, true, cx); await clock.advance(ARM); await cx.settle(); };
const maps = (root, id = "s1") => findAll(content(root, id), (e) => e.elementId?.startsWith("quick-pane-")).length;

test("one agent: its tooltip stays, a click on the badge goes to its pane, no card, no read", () => {
  world([ag("t1", "tb1", { status: "working" })]);
  const { cx, render } = mount(Spaces, { props: {} });
  let root = render();
  const pill = byId(root, "crew-s1");
  assert.deepEqual(pill.style("tooltip"), ["1 agent: 1 working"]);
  assert.equal(card(root), undefined);
  hover(root, "s1", true, cx);
  fire(pill, "mouse_down:left", {}, cx);
  assert.equal(cx.stopped, 1, "the press starts no space drag");
  fire(pill, "mouse_up:left", {}, cx);
  fire(byId(root, "space-s1"), "mouse_up:left", {}, cx);
  fire(list(root), "mouse_up:left", {}, cx);
  assert.deepEqual(herdr.calls("run"), [["pane.focus", { pane: "p1" }]]);
  assert.deepEqual(reads(), []);
  assert.deepEqual(cx.errors, []);
});

test("two agents: hovering reads the document once, the card shows them by tab with a pane map", async () => {
  world([ag("t3", "tb1", { status: "blocked" }), ag("t4", "tb2", { status: "done" }), ag("t1", "tb1", { status: "working", program: program("claude", { agent: true, icon: "icons/claude.svg", tint: false }) })]);
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  let root = render();
  assert.equal(byId(root, "crew-s1").style("tooltip"), undefined, "no tooltip under the card");
  hover(root, "s1", true, cx);
  await clock.advance(ARM - 1);
  assert.equal(reads().length, 0, "not before the hover has lasted ARM");
  await clock.advance(1);
  await cx.settle();
  assert.equal(reads().length, 1);
  const [{ rpc, opts, script }] = reads();
  assert.deepEqual(rpc, { jsonrpc: "2.0", id: 1, method: "doc.get", params: { name: "herdr-app", on: null } });
  assert.deepEqual(opts, { timeout: 3000 }, "on only in the request, not as exec's");
  assert.equal(script, 'printf "%s\\n" "$1" | hc connect');
  root = render();
  const c = content(root);
  assert.deepEqual(byId(c, "quick-card-s1").style("w"), [330]);
  assert.deepEqual(byId(c, "quick-list-s1").style("max_h"), [360]);
  const rows = findAll(c, (e) => e.elementId?.startsWith("quick-row-")).map((e) => e.elementId);
  assert.deepEqual(rows, ["quick-row-t1", "quick-row-t3", "quick-row-t4"], "tab 1 in its tree's order, then tab 2");
  assert.match(byId(c, "quick-row-t1").text(), /^task t1 working$/, "the title without its mark, the status word");
  assert.match(byId(c, "quick-row-t3").text(), /needs you/);
  assert.ok(find(byId(c, "quick-row-t1"), (e) => e.type === "image" && e.arg === "icons/claude.svg"), "the program's icon");
  assert.ok(hasId(c, "quick-pane-t1") && hasId(c, "quick-pane-t3") && hasId(c, "quick-pane-t4"));
  assert.deepEqual(byId(c, "quick-pane-t1").style("flex_grow"), [0.6]);
  // h_flex centers across its axis: without stretching, a row's panes are 0px high (a line in the app).
  const frame = find(c, (e) => e.has("w") && e.style("w")[0] === 60);
  const splits = findAll(frame, (e) => e.type === "h_flex" || e.type === "v_flex");
  assert.ok(splits.length >= 3 && splits.every((e) => e.has("items_stretch")), "every split and the frame stretch their children");
  assert.ok(byId(c, "quick-pane-t1").has("self_stretch"));
  assert.deepEqual(byId(c, "quick-pane-t3").style("bg"), ["blocked"], "an agent's pane in its status color");
  assert.match(c.text(), /main/, "a named tab's name");
  assert.deepEqual(cx.errors, []);
});

test("hovering a row lights its pane; a click on a row or on a pane goes there, then the card is empty until the badge is next entered", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  let root = render();
  await rest(root, "s1", cx);
  root = render();
  hover(root, "s1", false, cx); // on to the card
  onCard(root, "s1", true, cx);
  await clock.advance(GRACE * 3);
  root = render();
  assert.deepEqual(byId(content(root), "quick-pane-t2").style("opacity"), [0.45], "the card stays while the pointer is on it");
  fire(byId(content(root), "quick-row-t2"), "hover", true, cx);
  root = render();
  assert.deepEqual(byId(content(root), "quick-pane-t2").style("opacity"), [1]);
  assert.deepEqual(byId(content(root), "quick-pane-t2").style("border_color"), ["foreground"]);
  assert.deepEqual(byId(content(root), "quick-pane-t1").style("opacity"), [0.45]);
  click(byId(content(root), "quick-row-t2"), cx);
  assert.deepEqual(herdr.calls("run"), [["pane.focus", { pane: "p2" }]]);
  root = render();
  assert.equal(shows(root), false, "empty after the jump");
  hover(root, "s1", true, cx);
  root = render();
  assert.equal(shows(root), true);
  click(byId(content(root), "quick-pane-t1"), cx);
  assert.deepEqual(herdr.calls("run").at(-1), ["pane.focus", { pane: "p1" }]);
  assert.equal(herdr.calls("run").some(([n]) => n === "space.select"), false);
  assert.deepEqual(cx.errors, []);
});

for (const [what, reply] of [["exec throws", new Error("cannot start sh")], ["exit code 1", { code: 1, stderr: "no core" }], ["nonsense", { code: 0, stdout: "hello\n" }]]) {
  test(`unreadable document (${what}): rows without maps on the narrow card; the next opening recovers`, async () => {
    world([ag("t1", "tb1"), ag("t4", "tb2")]);
    herdr.onExec((c) => (c.command === "sh" ? reply : undefined), { times: 1 });
    const { cx, render } = mount(Spaces, { props: {} });
    let root = render();
    await rest(root, "s1", cx);
    root = render();
    let c = content(root);
    assert.deepEqual(byId(c, "quick-card-s1").style("w"), [286]);
    assert.ok(hasId(c, "quick-row-t1") && hasId(c, "quick-row-t4"));
    assert.equal(findAll(c, (e) => e.elementId?.startsWith("quick-pane-")).length, 0);
    assert.equal(logs.filter((l) => l.startsWith("roundup-spaces: no pane maps (this computer)")).length, 1, "logged once");
    herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
    hover(root, "s1", false, cx);
    await clock.advance(GRACE);
    await rest(render(), "s1", cx);
    c = content(render());
    assert.deepEqual(byId(c, "quick-card-s1").style("w"), [330]);
    assert.ok(hasId(c, "quick-pane-t1"));
    assert.deepEqual(cx.errors, []);
  });
}

test("one read per machine at a time; renders never read; a new agent outside the tree reads once more, a repeat of it not", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  let release;
  herdr.onExec((c) => (c.command === "sh" ? new Promise((r) => { release = () => r(answer()); }) : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  let root = render();
  hover(root, "s1", true, cx);
  await clock.advance(ARM);
  await turns();
  for (let i = 0; i < 20; i++) render();
  await clock.advance(250 * 4);
  assert.equal(reads().length, 1, "pending: no second read");
  release();
  await cx.settle();
  await clock.advance(250 * 8);
  assert.equal(reads().length, 1, "the agents fit the tree: nothing more");
  // A split with a new agent the document read doesn't have.
  world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t9", "tb1")]);
  await clock.advance(250);
  await turns();
  assert.equal(reads().length, 2);
  release();
  await cx.settle();
  // Still not in the tree (the read was too early, or it never will be): no more reads for it.
  for (let i = 0; i < 12; i++) await clock.advance(250);
  for (let i = 0; i < 20; i++) render();
  assert.equal(reads().length, 2);
  assert.equal(maps(render()), 0, "that tab without a map");
  // Opened on purpose again: one more read.
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  hover(render(), "s1", true, cx);
  await clock.advance(ARM);
  await turns();
  assert.equal(reads().length, 3);
  release();
  await cx.settle();
  assert.deepEqual(cx.errors, []);
});

test("agents that change while a read runs are read for once it is done, unless its answer has them", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  const pending = [];
  herdr.onExec((c) => (c.command === "sh" ? new Promise((r) => pending.push(r)) : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  hover(render(), "s1", true, cx);
  await clock.advance(ARM);
  await turns();
  assert.equal(reads().length, 1);
  // A split adds t9 while the read is out: the ticks may not read now, and must not forget it.
  world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t9", "tb1")]);
  await clock.advance(250 * 4);
  assert.equal(reads().length, 1, "one read per machine at a time");
  pending.shift()(answer()); // the old tree, without t9
  await cx.settle();
  await clock.advance(250);
  await turns();
  assert.equal(reads().length, 2, "read again for t9");
  const withT9 = structuredClone(DOC);
  withT9.spaces[0].tabs[0].root.children.push({ type: "block", id: "p9", content: { terminal: "t9" } });
  pending.shift()(answer(withT9));
  await cx.settle();
  assert.ok(hasId(content(render()), "quick-pane-t9"));
  // Its answer already has the next change: no read for it.
  world([ag("t1", "tb1"), ag("t9", "tb1"), ag("t2", "tb1"), ag("t3", "tb1")]);
  await clock.advance(250 * 4);
  assert.equal(reads().length, 2, "t3 is in the tree already");
  assert.deepEqual(cx.errors, []);
});

test("a later read that fails keeps the last good document and its maps; the failure is logged once until one works", async () => {
  world([ag("t1", "tb1"), ag("t4", "tb2")]);
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined), { times: 1 });
  const { cx, render } = mount(Spaces, { props: {} });
  await rest(render(), "s1", cx);
  assert.equal(maps(render()), 2);
  for (const [i, reply] of [new Error("timed out"), { code: 1, stderr: "no core\nmore" }, { code: 0, stdout: "hello\n" }].entries()) {
    herdr.onExec((c) => (c.command === "sh" ? reply : undefined), { times: 1 });
    hover(render(), "s1", false, cx);
    await clock.advance(GRACE);
    await rest(render(), "s1", cx);
    assert.equal(reads().length, 2 + i);
    assert.equal(maps(render()), 2, `maps kept after failure ${i + 1}`);
  }
  assert.deepEqual(logs, ["roundup-spaces: no pane maps (this computer): timed out"], "the first failure only");
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined), { times: 1 });
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  await rest(render(), "s1", cx);
  herdr.onExec((c) => (c.command === "sh" ? { code: 1, stderr: "no core" } : undefined), { times: 1 });
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  await rest(render(), "s1", cx);
  assert.equal(logs.at(-1), "roundup-spaces: no pane maps (this computer): exit 1: no core", "after a good read, a failure is logged again");
  // A new agent the old tree doesn't hold: only its tab goes without a map.
  world([ag("t1", "tb1"), ag("t4", "tb2"), ag("t8", "tb2")]);
  await clock.advance(250);
  await cx.settle();
  const c = content(render());
  assert.ok(hasId(c, "quick-pane-t1") && !hasId(c, "quick-pane-t4"));
  assert.ok(hasId(c, "quick-row-t1") && hasId(c, "quick-row-t4") && hasId(c, "quick-row-t8"));
  assert.deepEqual(cx.errors, []);
});

test("crossing badges reads nothing; leaving before ARM and coming back waits the whole ARM again", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" }), ag("t6", "tb5", { space: "s2", pane: "p6" })], { two: true });
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  hover(render(), "s1", true, cx);
  await clock.advance(50);
  hover(render(), "s1", false, cx);
  hover(render(), "s2", true, cx);
  await clock.advance(50);
  hover(render(), "s2", false, cx);
  for (let i = 0; i < 8; i++) await clock.advance(250);
  assert.equal(reads().length, 0, "no read, neither on the way nor on a tick after");
  assert.equal(shows(render(), "s1") || shows(render(), "s2"), false, "both cards forgotten");
  hover(render(), "s1", true, cx);
  await clock.advance(100);
  hover(render(), "s1", false, cx);
  await clock.advance(100);
  hover(render(), "s1", true, cx);
  await clock.advance(ARM - 1);
  assert.equal(reads().length, 0, "the first entry's timer doesn't count for the second");
  await clock.advance(1);
  await turns();
  assert.equal(reads().length, 1);
  assert.deepEqual(cx.errors, []);
});

test("from badge to card the card and its reads stay; GRACE after leaving both it is gone and reads nothing more", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { view, cx, render } = mount(Spaces, { props: {} });
  await rest(render(), "s1", cx);
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE / 2); // across the gap
  onCard(render(), "s1", true, cx);
  await clock.advance(GRACE * 2);
  assert.equal(shows(render()), true, "on the card");
  world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t9", "tb1")]);
  await clock.advance(250);
  await turns();
  assert.equal(reads().length, 2, "a new agent while the pointer is on the card reads");
  await cx.settle();
  // Back to the badge from the card: the same hover, no new read on entering.
  onCard(render(), "s1", false, cx);
  hover(render(), "s1", true, cx);
  await clock.advance(ARM * 2);
  assert.equal(reads().length, 2);
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE - 1);
  assert.equal(shows(render()), true, "not yet");
  await clock.advance(1);
  assert.equal(shows(render()), false);
  assert.deepEqual([view.peek, view.armed, view.cardHot, view.lit], [null, null, null, null]);
  world([ag("t1", "tb1"), ag("t2", "tb2"), ag("t7", "tb2")]);
  for (let i = 0; i < 8; i++) await clock.advance(250);
  assert.equal(reads().length, 2, "a closed card reads nothing");
  assert.deepEqual(cx.errors, []);
});

test("from one card to another badge: the first is dropped at once, its timer leaves the second alone", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" }), ag("t6", "tb5", { space: "s2", pane: "p6" })], { two: true });
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { view, cx, render } = mount(Spaces, { props: {} });
  await rest(render(), "s1", cx);
  assert.equal(view.armed, "s1");
  hover(render(), "s1", false, cx);
  hover(render(), "s2", true, cx);
  assert.equal(view.armed, null, "s1 may read no more");
  world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t9", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" }), ag("t6", "tb5", { space: "s2", pane: "p6" })], { two: true });
  await clock.advance(ARM);
  await cx.settle();
  assert.equal(reads().length, 2, "s2's own read only");
  assert.equal(shows(render(), "s2"), true);
  assert.equal(shows(render(), "s1"), false);
  await clock.advance(GRACE * 3);
  assert.equal(shows(render(), "s2"), true, "s1's leave doesn't take s2's card");
  assert.deepEqual(cx.errors, []);
});

test("a menu, a click on the badge, a press on a row or a jump before ARM: no read; a space down to one agent or gone ends the hover", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")], { two: true });
  herdr.set({ agents: [ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" })] });
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { view, cx, render } = mount(Spaces, { props: {} });
  hover(render(), "s1", true, cx);
  await clock.advance(100);
  fire(byId(render(), "space-s1"), "mouse_down:right", {}, cx);
  herdr.set({ shared: { [MENU_OPEN]: "ov-1" } });
  await clock.advance(ARM);
  herdr.set({ shared: { [MENU_OPEN]: null } });
  await clock.advance(ARM);
  assert.equal(reads().length, 0, "the menu's timer is gone, also once the menu is closed");
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  hover(render(), "s1", true, cx);
  await clock.advance(100);
  fire(byId(render(), "crew-s1"), "mouse_down:left", {}, cx);
  fire(byId(render(), "crew-s1"), "mouse_up:left", {}, cx);
  await clock.advance(ARM);
  assert.equal(reads().length, 0, "after a click on the badge");
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  hover(render(), "s1", true, cx);
  await clock.advance(100);
  herdr.set({ agents: [ag("t1", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" })] });
  await clock.advance(250);
  assert.equal(view.peek, null, "down to one agent: the hover ends");
  herdr.set({ agents: [ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" })] });
  await clock.advance(ARM);
  assert.equal(reads().length, 0);
  // A press on another row (a click or the start of a drag).
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  hover(render(), "s1", true, cx);
  await clock.advance(100);
  fire(byId(render(), "space-s2"), "mouse_down:left", {}, cx);
  fire(list(render()), "mouse_up:left", {}, cx);
  await clock.advance(ARM);
  assert.equal(reads().length, 0, "after a press on a row");
  // A jump from the card, which shows before it reads.
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  hover(render(), "s1", true, cx);
  await clock.advance(100);
  click(byId(content(render()), "quick-row-t2"), cx);
  await clock.advance(ARM);
  assert.equal(reads().length, 0, "after a jump");
  // The space closes under the pointer.
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  hover(render(), "s1", true, cx);
  await clock.advance(100);
  herdr.set({ spaces: [space("s2", [tab("tb5")])], agents: [ag("t5", "tb5", { space: "s2", pane: "p5" })] });
  await clock.advance(250);
  assert.equal(view.peek, null, "gone: the hover ends");
  await clock.advance(ARM);
  assert.equal(reads().length, 0);
  assert.deepEqual(cx.errors, []);
});

for (const how of ["a click on another row", "a space menu opened and closed"]) {
  test(`an armed card left, then ${how} before GRACE: the card is still forgotten and nothing reads`, async () => {
    world([ag("t1", "tb1"), ag("t2", "tb1")], { two: true });
    herdr.set({ agents: [ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" })] });
    herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
    const { view, cx, render } = mount(Spaces, { props: {} });
    await rest(render(), "s1", cx);
    assert.equal(reads().length, 1);
    hover(render(), "s1", false, cx);
    await clock.advance(50);
    if (how.startsWith("a click")) {
      fire(byId(render(), "space-s2"), "mouse_down:left", {}, cx);
      fire(byId(render(), "space-s2"), "mouse_up:left", {}, cx);
    } else {
      fire(byId(render(), "space-s2"), "mouse_down:right", {}, cx);
      herdr.set({ shared: { [MENU_OPEN]: "ov-1" } });
      await clock.advance(500);
      herdr.set({ shared: { [MENU_OPEN]: null } });
    }
    await clock.advance(GRACE * 10);
    assert.equal(view.peek, null);
    assert.equal(shows(render()), false, "no card content is built");
    world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t9", "tb1")], { two: true });
    for (let i = 0; i < 8; i++) await clock.advance(250);
    assert.equal(reads().length, 1);
    assert.deepEqual(cx.errors, []);
  });
}

test("a failed read, then a new hover while another space's read holds the machine: it reads once that one is done", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" }), ag("t6", "tb5", { space: "s2", pane: "p6" })], { two: true });
  herdr.onExec((c) => (c.command === "sh" ? { code: 1 } : undefined), { times: 1 });
  const { cx, render } = mount(Spaces, { props: {} });
  await rest(render(), "s1", cx);
  assert.equal(reads().length, 1, "failed: this set of agents counts as tried");
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  let release;
  herdr.onExec((c) => (c.command === "sh" ? new Promise((r) => { release = r; }) : undefined));
  hover(render(), "s2", true, cx);
  await clock.advance(ARM);
  await turns();
  assert.equal(reads().length, 2, "s2's read is out");
  hover(render(), "s2", false, cx);
  hover(render(), "s1", true, cx);
  await clock.advance(ARM + 250 * 2);
  assert.equal(reads().length, 2, "the machine is busy: s1 waits");
  // s2's answer has no tree for s1: s1 reads now, although the same set failed before.
  release(answer({ spaces: [] }));
  await cx.settle();
  await clock.advance(250);
  await turns();
  assert.equal(reads().length, 3);
  release(answer());
  await cx.settle();
  assert.equal(maps(render()), 2);
  assert.deepEqual(cx.errors, []);
});

test("back on the same badge within GRACE, the card never entered: the same hover, no new read", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { view, cx, render } = mount(Spaces, { props: {} });
  await rest(render(), "s1", cx);
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE - 25);
  hover(render(), "s1", true, cx);
  await clock.advance(ARM * 2);
  assert.equal(reads().length, 1);
  assert.equal(view.armed, "s1");
  hover(render(), "s1", false, cx);
  await clock.advance(GRACE);
  hover(render(), "s1", true, cx);
  await clock.advance(ARM);
  await turns();
  assert.equal(reads().length, 2, "after GRACE: a new hover reads");
  assert.deepEqual(cx.errors, []);
});

test("a failing read is tried once per new set of agents, not on every tick", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.onExec((c) => (c.command === "sh" ? { code: 1 } : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  await rest(render(), "s1", cx);
  for (let i = 0; i < 16; i++) await clock.advance(250);
  assert.equal(reads().length, 1);
  world([ag("t1", "tb1"), ag("t2", "tb2")]);
  for (let i = 0; i < 16; i++) await clock.advance(250);
  await cx.settle();
  assert.equal(reads().length, 2);
  assert.deepEqual(cx.errors, []);
});

test("rail and Windows: no card on the rail, no read on Windows (its card has rows only)", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.set({ layout: { id: "root", type: "row", children: [{ id: "sidebar", type: "column", size: { px: 76 }, children: [] }] } });
  let m = mount(Spaces, { props: {} });
  assert.equal(card(m.render()), undefined);
  assert.equal(hasId(m.render(), "crew-s1"), false);
  for (let i = 0; i < 4; i++) await clock.advance(250);
  assert.deepEqual(reads(), []);

  reset();
  herdr.onExec((c) => new Error(`unexpected exec: ${c.command}`));
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.set({ window: { platform: "windows", titlebar: "system", buttons: true, maximized: false, fullscreen: false, active: true } });
  m = mount(Spaces, { props: {} });
  hover(m.render(), "s1", true, m.cx);
  await m.cx.settle();
  assert.deepEqual(reads(), []);
  assert.deepEqual(byId(content(m.render()), "quick-card-s1").style("w"), [286]);
  assert.deepEqual(m.cx.errors, []);
});

test("roundup-menu marks itself open with its overlay id and clears only its own entry", async () => {
  const a = mount(Menu, { props: { tab: "global", overlay: "ov-A" } });
  assert.equal(herdr.shared(MENU_OPEN), "ov-A");
  const b = mount(Menu, { props: { tab: "global", overlay: "ov-B" } });
  assert.equal(herdr.shared(MENU_OPEN), "ov-B");
  await a.view.close(a.cx);
  assert.equal(herdr.shared(MENU_OPEN), "ov-B", "A's close leaves B's entry");
  await b.view.close(b.cx);
  assert.equal(herdr.shared(MENU_OPEN), null);
});

test("the space menu is roundup-menu; starting roundup-spaces leaves a menu's open flag alone", () => {
  herdr.set({ shared: { [MENU_OPEN]: "ov-live" } });
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  const { cx, render } = mount(Spaces, { props: {} });
  assert.equal(herdr.shared(MENU_OPEN), "ov-live", "a menu open while this mod reloads stays marked");
  fire(byId(render(), "space-s1"), "mouse_down:right", {}, cx);
  const opened = herdr.calls("openOverlay");
  assert.equal(opened.length, 1, "the menu opens once");
  assert.equal(opened[0][0].mod, "roundup-menu");
  assert.deepEqual(opened[0][0].props, { tab: "space", target: { id: "s1" } });
});

test("a flag a crash left behind goes with the next menu: it writes its own id and clears it on closing", async () => {
  herdr.set({ shared: { [MENU_OPEN]: "ov-crashed" } });
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  const { cx, render } = mount(Spaces, { props: {} });
  hover(render(), "s1", true, cx);
  assert.equal(shows(render()), false, "empty while the flag is there");
  hover(render(), "s1", false, cx);
  const m = mount(Menu, { props: { tab: "space", target: { id: "s1" }, overlay: "ov-next" } });
  assert.equal(herdr.shared(MENU_OPEN), "ov-next");
  await m.view.close(m.cx);
  assert.equal(herdr.shared(MENU_OPEN), null);
  hover(render(), "s1", true, cx);
  assert.equal(shows(render()), true);
});

test("menu on the badge, left, then closed: the card shows again on entering", () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  const { cx, render } = mount(Spaces, { props: {} });
  let root = render();
  hover(root, "s1", true, cx);
  assert.equal(shows(render()), true);
  fire(byId(root, "space-s1"), "mouse_down:right", {}, cx);
  assert.equal(shows(render()), false, "empty at once, before the menu says it is open");
  herdr.set({ shared: { [MENU_OPEN]: "overlay-1" } });
  hover(render(), "s1", false, cx);
  assert.equal(shows(render()), false, "the menu is still open");
  hover(render(), "s1", true, cx);
  assert.equal(shows(render()), false, "back on the badge, the menu open: empty");
  hover(render(), "s1", false, cx);
  herdr.set({ shared: { [MENU_OPEN]: null } });
  render(); // the menu's setShared re-renders
  hover(render(), "s1", true, cx);
  assert.equal(shows(render()), true);
});

test("menu on the badge, closed, then left: empty until left, then shows on entering", () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  const { cx, render } = mount(Spaces, { props: {} });
  hover(render(), "s1", true, cx);
  fire(byId(render(), "space-s1"), "mouse_down:right", {}, cx);
  herdr.set({ shared: { [MENU_OPEN]: "overlay-1" } });
  render();
  herdr.set({ shared: { [MENU_OPEN]: null } });
  assert.equal(shows(render()), false, "closed, the pointer still on the badge: stays empty");
  hover(render(), "s1", false, cx);
  hover(render(), "s1", true, cx);
  assert.equal(shows(render()), true);
});

test("a row drag let go on another row's badge drops there and jumps nowhere", () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")], { two: true });
  herdr.set({ agents: [ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" })] });
  const { cx, render } = mount(Spaces, { props: {} });
  let root = render();
  fire(byId(root, "space-s2"), "mouse_down:left", {}, cx);
  fire(byId(root, "space-s1"), "mouse_move", {}, cx);
  root = render();
  fire(byId(root, "crew-s1"), "mouse_up:left", {}, cx);
  fire(byId(root, "space-s1"), "mouse_up:left", {}, cx);
  fire(list(root), "mouse_up:left", {}, cx);
  assert.deepEqual(herdr.calls("run"), [["space.move", { id: "s2", index: 1 }]]);
  assert.equal(cx.stopped, 0);
});

test("a press and release on the badge go to the agent once, never select the space", () => {
  world([ag("t1", "tb1")]);
  const { cx, render } = mount(Spaces, { props: {} });
  const root = render();
  fire(byId(root, "crew-s1"), "mouse_down:left", {}, cx);
  fire(byId(root, "crew-s1"), "mouse_up:left", {}, cx);
  fire(byId(root, "space-s1"), "mouse_up:left", {}, cx);
  fire(list(root), "mouse_up:left", {}, cx);
  assert.deepEqual(herdr.calls("run"), [["pane.focus", { pane: "p1" }]]);
});

test("two or more agents: a press and release on the badge select the space once, the card then empty", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")], { two: true });
  herdr.set({ agents: [ag("t1", "tb1"), ag("t2", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" }), ag("t6", "tb5", { space: "s2", pane: "p6" })] });
  const { view, cx, render } = mount(Spaces, { props: {} });
  let root = render();
  hover(root, "s2", true, cx);
  fire(byId(root, "crew-s2"), "mouse_down:left", {}, cx);
  assert.equal(cx.stopped, 1, "the press starts no space drag");
  fire(byId(root, "crew-s2"), "mouse_up:left", {}, cx);
  fire(byId(root, "space-s2"), "mouse_up:left", {}, cx);
  fire(list(root), "mouse_up:left", {}, cx);
  assert.deepEqual(herdr.calls("run"), [["space.select", { id: "s2" }]]);
  assert.equal(shows(render(), "s2"), false, "empty after the click, as after a jump");
  assert.equal(view.pressed, null);
  // A press on the badge let go elsewhere selects nothing.
  fire(byId(render(), "crew-s2"), "mouse_down:left", {}, cx);
  fire(list(render()), "mouse_up:left", {}, cx);
  fire(byId(render(), "crew-s2"), "mouse_up:left", {}, cx);
  assert.equal(herdr.calls("run").length, 1);
});

test("a badge press let go elsewhere is forgotten: a later drag onto that badge only drops", () => {
  world([ag("t1", "tb1")], { two: true });
  herdr.set({ agents: [ag("t1", "tb1"), ag("t5", "tb5", { space: "s2", pane: "p5" })] });
  const { view, cx, render } = mount(Spaces, { props: {} });
  let root = render();
  fire(byId(root, "crew-s1"), "hover", true, cx);
  fire(byId(root, "crew-s1"), "mouse_down:left", {}, cx);
  fire(byId(root, "crew-s1"), "hover", false, cx);
  // Released outside the list: no handler here sees it.
  fire(byId(root, "space-s2"), "mouse_down:left", {}, cx);
  fire(byId(root, "space-s1"), "mouse_move", {}, cx);
  root = render();
  fire(byId(root, "crew-s1"), "mouse_up:left", {}, cx);
  fire(byId(root, "space-s1"), "mouse_up:left", {}, cx);
  fire(list(root), "mouse_up:left", {}, cx);
  assert.deepEqual(herdr.calls("run"), [["space.move", { id: "s2", index: 1 }]]);
  assert.deepEqual([view.pressed, view.over, view.badgePress], [null, null, null]);
});

test("a right-click on the badge opens the menu once; the card's own presses stay in the card", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  let root = render();
  assert.equal(byId(root, "crew-s1").handlers["mouse_down:right"], undefined, "the badge leaves right presses to its row");
  fire(byId(root, "space-s1"), "mouse_down:right", {}, cx);
  assert.equal(herdr.calls("openOverlay").length, 1);
  herdr.set({ shared: { [MENU_OPEN]: null } });
  hover(render(), "s1", true, cx);
  hover(render(), "s1", false, cx);
  await cx.settle();
  const c = byId(content(render()), "quick-card-s1");
  const before = cx.stopped;
  fire(c, "mouse_down:left", {}, cx);
  fire(c, "mouse_down:right", {}, cx);
  assert.equal(cx.stopped, before + 2);
});

test("clean strips a program's spinner or star and its space, nothing else in front", () => {
  const cases = [
    ["⠋ codex", "codex"], ["⠏ ⠋ scratchpad", "scratchpad"], ["✳ Task", "Task"], ["✻ Working", "Working"],
    ["✳️ Task", "Task"], ["· thinking", "thinking"], ["  ✶  x  ", "x"],
    ["~/src/app", "~/src/app"], ["./build.sh", "./build.sh"], ["[WIP] refactor", "[WIP] refactor"],
    ["(venv) zsh", "(venv) zsh"], ["_private", "_private"], ["© Copyright", "© Copyright"], ["🐍 Python", "🐍 Python"],
    ["✳Task", "✳Task"], ["...", "..."], [null, ""], ["", ""],
  ];
  for (const [title, want] of cases) assert.equal(clean(title), want, JSON.stringify(title));
});
