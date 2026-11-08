// close.js (both copies: roundup-tabs and roundup-pane), with herdr stubbed: when closing a tab or a
// pane asks first, what the dialog says, and the command it runs. Plus the tab bar's close commands
// and the pane's rename dialog, which use it.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, space, tab, pane, agent, terminal, program, agentProgram } from "./support/harness.mjs";

beforeEach(reset);

const codex = agentProgram("codex", "Codex");
const claude = agentProgram("claude", "Claude Code");
const dialogs = () => herdr.calls("openOverlay").map(([spec]) => spec);
const runs = () => herdr.calls("run").map(([name, args]) => ({ name, args }));
const mode = (kind, m) => herdr.set({ shared: { [`roundup-${kind === "tab" ? "tabs" : "pane"}.confirm-close`]: m } });

// Space s1: tab tb1 (unnamed, an agent pane and a shell pane), tab t2 named "Notes" (one shell pane).
function twoTabs() {
  herdr.set({
    // An unnamed tab is named like its id here, as the catalog (TAB-05) and tabName expect.
    spaces: [space("s1", [tab("tb1", { name: "tb1", active: true }), tab("t2", { name: "Notes", named: true })], { active: true })],
    panes: [
      pane("p1", "tb1", { terminal: "t1", program: claude, title: "claude" }),
      pane("p2", "tb1", { terminal: "t3", program: program("shell"), title: "~" }),
      pane("p3", "t2", { terminal: "t4", program: program("shell") }),
    ],
    terminals: [terminal("t1"), terminal("t3"), terminal("t4")],
  });
}

for (const mod of ["roundup-tabs", "roundup-pane"]) {
  const close = await import(`../mods/${mod}/close.js`);
  const { confirmMode, setConfirmMode, closeTab, closePane, tabProgram, tabName, paneName } = close;

  test(`${mod} close.js: confirmMode reads never/agents/always per kind, else agents`, () => {
    assert.equal(confirmMode("tab"), "agents");
    for (const m of ["never", "agents", "always"]) { mode("tab", m); assert.equal(confirmMode("tab"), m); }
    mode("tab", "sometimes");
    assert.equal(confirmMode("tab"), "agents");
    mode("tab", "never");
    assert.equal(confirmMode("pane"), "agents", "panes have their own key");
    setConfirmMode("pane", "always");
    assert.deepEqual(herdr.calls("setShared").at(-1), ["roundup-pane.confirm-close", "always"]);
    assert.equal(confirmMode("tab"), "never");
  });

  test(`${mod} close.js: never closes at once, agents asks only while one works or waits, always asks`, () => {
    twoTabs();
    mode("tab", "never");
    herdr.set({ agents: [agent("t1", { tab: "tb1", pane: "p1", status: "working" })] });
    closeTab("tb1");
    assert.deepEqual(runs(), [{ name: "tab.close", args: { id: "tb1", confirmed: true } }]);

    herdr.clear();
    mode("tab", "agents");
    for (const status of ["done", "idle"]) {
      herdr.set({ agents: [agent("t1", { tab: "tb1", pane: "p1", status })] });
      closeTab("tb1");
    }
    assert.deepEqual(runs(), [{ name: "tab.close", args: { id: "tb1" } }, { name: "tab.close", args: { id: "tb1" } }], "Herdr's own close, without confirmed");
    assert.deepEqual(dialogs(), []);
    for (const status of ["working", "blocked"]) {
      herdr.set({ agents: [agent("t1", { tab: "tb1", pane: "p1", status })] });
      closeTab("tb1");
    }
    assert.equal(dialogs().length, 2);

    herdr.clear();
    mode("tab", "always");
    herdr.set({ agents: [] });
    closeTab("t2");
    assert.equal(dialogs().length, 1);
    assert.deepEqual(runs(), []);
  });

  test(`${mod} close.js: the dialog is roundup-confirm, 400×170, and says which agents end`, () => {
    twoTabs();
    herdr.set({ agents: [agent("t1", { tab: "tb1", pane: "p1", status: "working", program: claude })] });
    closeTab("tb1");
    assert.deepEqual(dialogs()[0], {
      mod: "roundup-confirm", kind: "dialog", width: 400, height: 170,
      props: { title: "Close tab Claude Code?", detail: "Claude Code is still running in it. Closing ends it.", command: { name: "tab.close", args: { id: "tb1", confirmed: true } } },
    });
    herdr.set({ agents: [
      agent("t1", { tab: "tb1", status: "working", program: claude }), agent("t5", { tab: "tb1", status: "blocked", program: codex }),
      agent("t6", { tab: "tb1", status: "working", program: claude }), agent("t7", { tab: "t2", status: "working", program: codex }),
    ] });
    closeTab("tb1");
    assert.equal(dialogs()[1].props.detail, "3 agents are still running in it (Claude Code, Codex). Closing ends them.");

    mode("tab", "always");
    herdr.set({ agents: [] });
    closeTab("t2");
    assert.equal(dialogs()[2].props.detail, "Its terminals end.");
    herdr.set({ panes: [pane("m1", "t2", { mod: "roundup-preview", title: "roundup-preview" })] });
    closeTab("t2");
    assert.equal(dialogs()[3].props.detail, "Nothing runs in it.");
  });

  test(`${mod} close.js: one dialog at a time: the open one closes first`, () => {
    twoTabs();
    mode("tab", "always");
    herdr.set({ shared: { "roundup-confirm.open": "overlay-old" } });
    closeTab("t2");
    assert.deepEqual(herdr.calls("closeOverlay"), [["overlay-old"]]);
    const opened = herdr.calls("openOverlay")[0][1];
    assert.equal(herdr.shared("roundup-confirm.open"), opened);
    const order = herdr.log.map((e) => e.fn).filter((fn) => ["closeOverlay", "openOverlay"].includes(fn));
    assert.deepEqual(order, ["closeOverlay", "openOverlay"]);
  });

  test(`${mod} close.js: the title names the tab, cut to 26 columns, and the last tab takes its space`, () => {
    twoTabs();
    mode("tab", "always");
    closeTab("t2");
    assert.equal(dialogs()[0].props.title, 'Close tab "Notes"?');
    assert.equal(dialogs()[0].props.detail, "Its terminals end.");
    herdr.set({ spaces: [space("s1", [tab("t2", { name: "A name that is far too long to fit", named: true }), tab("tb9", { name: "tb9" })])] });
    closeTab("t2");
    assert.equal(dialogs()[1].props.title, 'Close tab "A name that is far too lon…"?', "26 characters, then …");
    herdr.set({ spaces: [space("s1", [tab("t2", { name: "漢字漢字漢字漢字漢字漢字漢字", named: true }), tab("tb9", { name: "tb9" })])] });
    closeTab("t2");
    assert.equal(dialogs()[2].props.title, 'Close tab "漢字漢字漢字漢字漢字漢字漢…"?', "a wide character counts 2");
    closeTab("tb9");
    assert.equal(dialogs()[3].props.title, "Close tab Terminal?", "an unnamed tab without panes");
    herdr.set({ spaces: [space("s1", [tab("t2", { name: "Notes", named: true })])] });
    closeTab("t2");
    assert.equal(dialogs()[4].props.detail, "Its terminals end. It's the space's last tab, so the space closes too.");
  });

  test(`${mod} close.js: tabProgram takes an agent pane's program first, else the first pane's`, () => {
    twoTabs();
    assert.equal(tabProgram({ id: "tb1" }).name, "Claude Code");
    herdr.set({ panes: [pane("p2", "tb1", { program: program("shell") }), pane("p1", "tb1", { program: claude })] });
    assert.equal(tabProgram({ id: "tb1" }).name, "Claude Code", "the agent though it comes second");
    herdr.set({ panes: [pane("p2", "tb1", { program: program("nvim", { name: "Neovim" }) }), pane("p1", "tb1")] });
    assert.equal(tabProgram({ id: "tb1" }).name, "Neovim");
    assert.equal(tabName({ id: "tb1", name: "tb1" }), "Neovim");
    assert.equal(tabName({ id: "x", name: "My tab" }), "My tab");
  });

  test(`${mod} close.js: closePane closes a pane with siblings, a lone pane's tab, and says what goes with it`, () => {
    twoTabs();
    mode("pane", "always");
    mode("tab", "always");
    closePane("p2");
    assert.deepEqual(dialogs()[0].props, { title: 'Close pane "zsh"?', detail: "Its terminal ends.", command: { name: "pane.close", args: { pane: "p2" } } });
    closePane("p3");
    assert.deepEqual(dialogs()[1].props.command, { name: "tab.close", args: { id: "t2", confirmed: true } });
    assert.equal(dialogs()[1].props.detail, "Its terminal ends. It's the tab's only pane, so the tab closes too.");
    herdr.set({ spaces: [space("s1", [tab("t2")])], panes: [pane("m1", "t2", { mod: "roundup-preview", title: "Preview" })] });
    closePane("m1");
    assert.equal(dialogs()[2].props.detail, "It's the space's last pane, so the space closes too.", "a mod pane: no terminal ends");
    closePane("gone");
    assert.equal(dialogs().length, 3, "an unknown pane: nothing");

    herdr.clear();
    mode("pane", "never");
    twoTabs();
    closePane("p2");
    mode("tab", "never");
    closePane("p3");
    assert.deepEqual(runs(), [{ name: "pane.close", args: { pane: "p2" } }, { name: "tab.close", args: { id: "t2", confirmed: true } }], "the pane's choice for a pane, the tab's for a lone pane");
  });

  test(`${mod} close.js: a pane's busy agents are its own and its sub-agents' down the parent chain; a lone pane counts the tab's`, () => {
    twoTabs();
    herdr.set({
      terminals: [terminal("t1"), terminal("t3"), terminal("t5", { parent: "t1" }), terminal("t6", { parent: "t5" }), terminal("t8", { parent: "t9" }), terminal("t9", { parent: "t8" })],
      agents: [
        agent("t1", { tab: "tb1", pane: "p1", status: "idle" }),
        agent("t5", { tab: "tb1", status: "working", program: codex }),
        agent("t6", { tab: "tb1", status: "blocked", program: claude }),
        agent("t8", { tab: "tb1", status: "working" }),
      ],
    });
    closePane("p1");
    assert.equal(dialogs()[0].props.detail, "2 agents are still running in it (Codex, Claude Code). Closing ends them.", "a cycle ends, t8 isn't below p1");
    closePane("p2");
    assert.equal(runs().at(-1).name, "pane.close", "none below the shell pane: closes without asking");
    herdr.set({ panes: [pane("p1", "tb1", { terminal: "t1", program: claude })], spaces: [space("s1", [tab("tb1", { name: "tb1" }), tab("t2")])] });
    closePane("p1");
    assert.match(dialogs()[1].props.detail, /^3 agents are still running in it/, "a lone pane: every busy agent in its tab");
  });

  test(`${mod} close.js: paneName: the given name, else the agent's or shell's name, the title, the program, "shell"`, () => {
    herdr.set({ terminals: [terminal("t1", { labels: { "roundup-pane.name": "Build" } }), terminal("t2")], shared: { "roundup-pane.names": { m1: "Docs" } } });
    assert.equal(paneName(pane("p1", "x", { terminal: "t1", program: claude })), "Build");
    assert.equal(paneName(pane("m1", "x", { mod: "roundup-preview", title: "Preview" })), "Docs");
    assert.equal(paneName(pane("p2", "x", { terminal: "t2", program: claude, title: "✳ Working" })), "Claude Code");
    assert.equal(paneName(pane("p2", "x", { terminal: "t2", program: program("shell"), title: "~/src" })), "zsh");
    assert.equal(paneName(pane("p2", "x", { terminal: "t2", program: program("nvim", { name: "Neovim" }), title: "main.js" })), "main.js");
    assert.equal(paneName(pane("p2", "x", { terminal: "t2", program: program("nvim", { name: "Neovim" }), title: "" })), "Neovim");
    assert.equal(paneName(pane("p2", "x", { terminal: "t2", program: undefined, title: "" })), "shell");
  });
}

test("roundup-tabs' close commands: the focused tab, else the shown one; close:<id>; close-pane only with a focused pane", async () => {
  const Tabs = (await import("../mods/roundup-tabs/main.js")).default;
  twoTabs();
  mode("tab", "never");
  mode("pane", "never");
  const { cx } = mount(Tabs, { props: {} });
  herdr.set({ focused: { space: "s1", tab: "t2", pane: "p3", terminal: "t4", shown: null, agent: null, cwd: null } });
  await herdr.command("close");
  herdr.set({ focused: null });
  await herdr.command("close");
  await herdr.command("close:t2");
  await herdr.command("close:nope");
  await herdr.command("close-pane");
  herdr.set({ focused: { space: "s1", tab: "tb1", pane: "p2", terminal: "t3", shown: null, agent: null, cwd: null } });
  await herdr.command("close-pane");
  assert.deepEqual(runs(), [
    { name: "tab.close", args: { id: "t2", confirmed: true } },
    { name: "tab.close", args: { id: "tb1", confirmed: true } },
    { name: "tab.close", args: { id: "t2", confirmed: true } },
    { name: "pane.close", args: { pane: "p2" } },
  ]);
  assert.deepEqual(cx.errors, []);
});

test("roundup-pane's rename dialog saves a trimmed name of at most 48 code points as the terminal's label", async () => {
  const Pane = (await import("../mods/roundup-pane/main.js")).default;
  const rename = (target, value) => {
    const { view } = mount(Pane, { props: { rename: { ...target, value: "", fallback: "zsh" }, overlay: "overlay-9" } });
    view.input.set_value(value);
    view.input.emit("submit");
    return view;
  };
  rename({ pane: "p1", terminal: "t1" }, "  Build server  ");
  rename({ pane: "p1", terminal: "t1" }, "😀".repeat(50));
  rename({ pane: "p1", terminal: "t1" }, "a".repeat(47) + " b");
  rename({ pane: "p1", terminal: "t1" }, "   ");
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(herdr.calls("hc"), [
    [["label", "t1", "roundup-pane.name=Build server"]],
    [["label", "t1", `roundup-pane.name=${"😀".repeat(48)}`]],
    [["label", "t1", `roundup-pane.name=${"a".repeat(47)}`]],
    [["label", "t1", "roundup-pane.name="]],
  ]);
  assert.deepEqual(herdr.calls("closeOverlay"), [["overlay-9"], ["overlay-9"], ["overlay-9"], ["overlay-9"]]);
  assert.deepEqual(herdr.calls("notify"), []);
});

test("roundup-pane's rename dialog says so when hc can't label the terminal", async () => {
  const Pane = (await import("../mods/roundup-pane/main.js")).default;
  // Newest hook first: the first save fails with an exit code, the second as hc not starting.
  herdr.onHc(() => new Error("hc not found"), { times: 1 });
  herdr.onHc(() => ({ code: 1, stderr: "no such terminal\n" }), { times: 1 });
  for (let i = 0; i < 2; i++) {
    const { view } = mount(Pane, { props: { rename: { pane: "p1", terminal: "t1", value: "x" }, overlay: "o" } });
    view.input.emit("submit");
  }
  await new Promise((r) => setImmediate(r));
  const toasts = herdr.calls("notify").map(([n]) => n);
  assert.deepEqual(toasts[0], { title: "Couldn't rename the pane", body: "no such terminal", level: "error" });
  assert.equal(toasts[1].title, "Couldn't rename the pane");
  assert.match(toasts[1].body, /hc not found/);
});

test("roundup-pane's rename dialog keeps a mod pane's name in shared state, others kept", async () => {
  const Pane = (await import("../mods/roundup-pane/main.js")).default;
  herdr.set({ shared: { "roundup-pane.names": { m2: "Other" } } });
  const save = (value) => {
    const { view } = mount(Pane, { props: { rename: { pane: "m1", terminal: null, value: "" }, overlay: "o" } });
    view.input.set_value(value);
    view.input.emit("submit");
  };
  save(" Docs ");
  assert.deepEqual(herdr.shared("roundup-pane.names"), { m2: "Other", m1: "Docs" });
  save("");
  assert.deepEqual(herdr.shared("roundup-pane.names"), { m2: "Other" });
  assert.deepEqual(herdr.calls("hc"), []);
});
