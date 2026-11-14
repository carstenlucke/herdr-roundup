// node --test 'tests/*.test.mjs'
// roundup-agents (the clone of Herdr's agents): a Codex thread id as a title item, which
// roundup-pane's context meter integration adds to Codex's title, is no row's name.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, pane, agent, agentProgram, space, tab, findAll, texts } from "./support/harness.mjs";

const Agents = (await import("../mods/roundup-agents/main.js")).default;
const { clean, noThreadId } = await import("../mods/roundup-agents/main.js");

beforeEach(reset);
const CUT = "01a1d750-0653-7190-914d-7c804...";
const WHOLE = "01a1d750-0653-7190-914d-7c804d23545c";
const codex = agentProgram("codex", "Codex");

// The rows' words, by agent address.
function rows(list, { tabs = [tab("tb1")], paneList } = {}) {
  herdr.set({
    layout: { id: "root", children: [{ id: "sidebar", size: { px: 268 } }] },
    spaces: [space("sp1", tabs, { name: "demo" })],
    panes: paneList ?? list.map((a) => pane(a.pane, a.tab, { terminal: a.address, title: a.title, program: a.program })),
    agents: list,
    terminals: [],
    props: {},
  });
  const { render } = mount(Agents, { props: {} });
  const root = render();
  return Object.fromEntries(list.map((a) => [a.address, texts(findAll(root, (e) => e.elementId === `ag-${a.address}`)[0]).join(" ")]));
}
const row = (address, title, extra = {}) => agent(address, { pane: `p-${address}`, space: "sp1", space_name: "demo", tab: "tb1", tab_name: "1", program: codex, title, ...extra });

test("clean and noThreadId drop a title item that is only a thread id, whole or cut, with a spinner in front or not", () => {
  assert.equal(clean(`⠦ Fix tests | herdr-roundup | ${CUT}`), "Fix tests | herdr-roundup");
  assert.equal(clean(`Fix tests | ${WHOLE}`), "Fix tests");
  assert.equal(clean(`⠦ ${CUT}`), "", "only the id: nothing is left");
  assert.equal(clean(`Fix ${WHOLE} now | ok`), `Fix ${WHOLE} now | ok`, "an id inside other words stays");
  assert.equal(clean(`Review | /${WHOLE}`), `Review | /${WHOLE}`, "a path item stays");
  assert.equal(clean(`Review | #${WHOLE}`), `Review | #${WHOLE}`);
  assert.equal(clean(`Review | -> ${CUT}`), `Review | -> ${CUT}`);
  assert.equal(noThreadId(`⠦ Fix tests | ${CUT}`), "⠦ Fix tests", "the spinner is kept for the shipped cleanup");
  assert.equal(clean("✳ Claude Code"), "Claude Code", "the shipped cleanup as before");
  assert.equal(noThreadId(`zsh | ${CUT}`), "zsh");
  assert.equal(noThreadId(undefined), "");
});

test("a Codex row in an unnamed tab reads the title without the thread id; in a named tab the tab's name", () => {
  let r = rows([row("t1", `⠦ Fix tests | herdr-roundup | ${CUT}`)]);
  assert.match(r.t1, /demo/);
  assert.match(r.t1, /Fix tests \| herdr-roundup/);
  assert.doesNotMatch(r.t1, /01a1d750/);
  r = rows([row("t1", `Fix tests | ${CUT}`)], { tabs: [tab("tb1", { name: "review", named: true })] });
  assert.match(r.t1, /review/);
  assert.doesNotMatch(r.t1, /01a1d750/);
});

test("two agents in one tab each read their own title without the id; a title that is only the id falls back", () => {
  const r = rows([row("t1", `Fix tests | ${WHOLE}`), row("t2", `⠦ ${CUT}`, { pane: "p-t2" })]);
  assert.match(r.t1, /Fix tests/);
  assert.doesNotMatch(r.t1, /01a1d750/);
  assert.doesNotMatch(r.t2, /01a1d750/, "only the id: the row shows no id");
});

test("an agent whose tab isn't known reads its raw title without the id, else the program's name", () => {
  const r = rows([row("t1", `Fix tests | ${CUT}`, { tab: "tb-gone" }), row("t2", CUT, { tab: "tb-gone2", pane: "p-t2" })], { paneList: [] });
  assert.match(r.t1, /Fix tests/);
  assert.doesNotMatch(r.t1, /01a1d750/);
  assert.match(r.t2, /Codex/, "only the id: the program's name");
});
