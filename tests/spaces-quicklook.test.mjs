// roundup-spaces' agent quicklook (L2): the badge's card, reading the core document, the menu
// over it (roundup-menu's open flag) and presses on the badge.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, find, findAll, byId, hasId, fire, click, clock, space, tab, agent, program } from "./support/harness.mjs";

const Spaces = (await import("../mods/roundup-spaces/main.js")).default;
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

beforeEach(() => {
  reset();
  // exec is real in the harness: anything but the document's read fails here.
  herdr.onExec((c) => new Error(`unexpected exec: ${c.command} ${c.args.join(" ")}`));
});

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
  hover(root, "s1", true, cx);
  hover(root, "s1", false, cx); // on to the card
  await cx.settle();
  root = render();
  assert.deepEqual(byId(content(root), "quick-pane-t2").style("opacity"), [0.45]);
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
    hover(root, "s1", true, cx);
    await cx.settle();
    root = render();
    let c = content(root);
    assert.deepEqual(byId(c, "quick-card-s1").style("w"), [286]);
    assert.ok(hasId(c, "quick-row-t1") && hasId(c, "quick-row-t4"));
    assert.equal(findAll(c, (e) => e.elementId?.startsWith("quick-pane-")).length, 0);
    herdr.onExec((c) => (c.command === "sh" ? answer() : undefined));
    hover(root, "s1", false, cx);
    hover(root, "s1", true, cx);
    await cx.settle();
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
  await turns();
  hover(root, "s1", false, cx);
  hover(root, "s1", true, cx);
  for (let i = 0; i < 20; i++) render();
  await turns();
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
  assert.equal(findAll(content(render()), (e) => e.elementId?.startsWith("quick-pane-")).length, 0, "that tab without a map");
  // Opened on purpose again: one more read.
  hover(render(), "s1", false, cx);
  hover(render(), "s1", true, cx);
  await turns();
  assert.equal(reads().length, 3);
  release();
  await cx.settle();
  assert.deepEqual(cx.errors, []);
});

test("a failing read is tried once per new set of agents, not on every tick", async () => {
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  herdr.onExec((c) => (c.command === "sh" ? { code: 1 } : undefined));
  const { cx, render } = mount(Spaces, { props: {} });
  hover(render(), "s1", true, cx);
  await cx.settle();
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

test("the space menu is roundup-menu; a flag left from before is cleared at start", () => {
  herdr.set({ shared: { [MENU_OPEN]: "ov-old" } });
  world([ag("t1", "tb1"), ag("t2", "tb1")]);
  const { cx, render } = mount(Spaces, { props: {} });
  assert.equal(herdr.shared(MENU_OPEN), null);
  fire(byId(render(), "space-s1"), "mouse_down:right", {}, cx);
  const opened = herdr.calls("openOverlay");
  assert.equal(opened.length, 1, "the menu opens once");
  assert.equal(opened[0][0].mod, "roundup-menu");
  assert.deepEqual(opened[0][0].props, { tab: "space", target: { id: "s1" } });
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
