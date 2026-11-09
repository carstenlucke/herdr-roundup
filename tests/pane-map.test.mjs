// roundup-spaces' agent quicklook: reading the core document `herdr-app` and turning a tab's
// tree into a pane map (mods/roundup-spaces/pane-map.js, L1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { docValue, localId, tabRoot, paneMap, leaves, quicklook, fingerprint } from "../mods/roundup-spaces/pane-map.js";

// A slice of a real `doc.get {name: "herdr-app"}` answer (2026-11-09), names and ids made up,
// shapes kept: the tab's root is a row with the tab's id, a leaf's `size` may be missing.
const DOC = {
  spaces: [
    { id: "sp1", name: "roundup", folder: "/src/roundup", tabs: [
      { id: "tb1", name: "main", root: { type: "row", id: "tb1", children: [
        { type: "block", id: "p1", content: { terminal: "t44" }, size: { weight: 0.5 } },
        { type: "column", id: "s1", size: { weight: 0.5 }, children: [
          { type: "block", id: "p2", content: { terminal: "t45" } },
          { type: "block", id: "p3", content: { terminal: "t46" } },
        ] },
      ] } },
      { id: "tb2", name: "", root: { type: "row", id: "tb2", children: [
        { type: "block", id: "p4", content: { terminal: "t2c" }, size: { weight: 0.4896000027656555 } },
        { type: "block", id: "p5", content: { terminal: "t2d" }, size: { weight: 0.5103999972343445 } },
      ] } },
    ] },
    { id: "sp2", name: "", folder: "", tabs: [
      { id: "tb3", name: "", root: { type: "row", id: "tb3", children: [{ type: "block", id: "p6", content: { terminal: "t9y" } }] } },
    ] },
  ],
};
const answer = (result, extra = {}) => JSON.stringify({ id: 1, jsonrpc: "2.0", result, ...extra });
const tab = (id, index, name = String(index)) => ({ id, index, name });
const agent = (address, tabId, extra = {}) => ({ address, pane: `p-${address}`, tab: tabId, tab_index: 1, tab_name: "", status: "idle", title: "", ...extra });

test("docValue: the answer to request 1 gives { version, value }; errors, other ids, no value and broken JSON give null", () => {
  assert.deepEqual(docValue(answer({ value: DOC, version: 603 }) + "\n"), { version: 603, value: DOC });
  assert.deepEqual(docValue(answer({ value: DOC })), { version: null, value: DOC }, "no version");
  assert.equal(docValue(answer({ value: null, version: 1 })), null, "value null");
  assert.equal(docValue(JSON.stringify({ id: 1, jsonrpc: "2.0", error: { code: -32601, message: "no such method" } })), null, "RPC error");
  assert.equal(docValue(JSON.stringify({ id: 2, jsonrpc: "2.0", result: { value: DOC } })), null, "another id");
  assert.equal(docValue(answer("x")), null, "result not an object");
  assert.equal(docValue(answer({ value: [1] })), null, "value an array");
  assert.equal(docValue('{"id":1,"jsonrpc":"2.0","result":{"value":'), null, "broken JSON");
  assert.equal(docValue(""), null);
  assert.equal(docValue(undefined), null);
  assert.equal(docValue(answer({ value: DOC }) + "\n" + answer({ value: DOC })), null, "two answers to one request");
});

test("localId strips only the expected machine's prefix: local ids stay, other machines' don't match", () => {
  assert.equal(localId("t7", null), "t7");
  assert.equal(localId("vps/t7", null), null, "a remote id is not this computer's");
  assert.equal(localId("vps/t7", "vps"), "t7");
  assert.equal(localId("box/t7", "vps"), null, "another machine with the same local id");
  assert.equal(localId("t7", "vps"), null, "an unqualified id is this computer's, not vps's");
  assert.equal(localId("vps/", "vps"), null);
  assert.equal(localId("", null), null);
  assert.equal(localId(undefined, null), null);
});

test("tabRoot finds a tab by its local id and checks that spaces and tabs are lists", () => {
  assert.equal(tabRoot(DOC, "tb2", null), DOC.spaces[0].tabs[1].root);
  assert.equal(tabRoot(DOC, "vps/tb2", "vps"), DOC.spaces[0].tabs[1].root);
  assert.equal(tabRoot(DOC, "box/tb2", "vps"), null);
  assert.equal(tabRoot(DOC, "tb9", null), null, "not in the document");
  assert.equal(tabRoot({ spaces: {} }, "tb1", null), null, "spaces: {}");
  assert.equal(tabRoot({}, "tb1", null), null);
  assert.equal(tabRoot({ spaces: [{ id: "sp1" }] }, "tb1", null), null, "a space without tabs");
  assert.equal(tabRoot(null, "tb1", null), null);
});

test("paneMap: nested splits keep their weights on every node; a missing size counts as 1", () => {
  assert.deepEqual(paneMap(tabRoot(DOC, "tb1", null)), { dir: "row", weight: 1, children: [
    { terminal: "t44", weight: 0.5 },
    { dir: "column", weight: 0.5, children: [{ terminal: "t45", weight: 1 }, { terminal: "t46", weight: 1 }] },
  ] });
  assert.deepEqual(paneMap(tabRoot(DOC, "tb2", null)).children.map((c) => c.weight), [0.4896000027656555, 0.5103999972343445], "unequal leaves");
  const uneven = { type: "column", children: [
    { type: "row", size: { weight: 3 }, children: [{ type: "block", content: { terminal: "a" } }, { type: "column", children: [{ type: "block", content: { terminal: "b" } }, { type: "block", content: { terminal: "c" }, size: { weight: 2 } }] }] },
    { type: "block", content: { terminal: "d" } },
  ] };
  const m = paneMap(uneven);
  assert.equal(m.children[0].weight, 3);
  assert.equal(m.children[0].children[1].children[1].weight, 2, "unevenly nested subtrees");
  assert.deepEqual(leaves(m).map((l) => l.terminal), ["a", "b", "c", "d"], "reading order");
});

test("paneMap: a mod leaf is drawn neutral; px sizes, bad weights and unknown forms give no map at all", () => {
  const row = (...children) => ({ type: "row", children });
  const term = (t, size) => ({ type: "block", content: { terminal: t }, ...(size === undefined ? {} : { size }) });
  assert.deepEqual(paneMap(row(term("t1"), { type: "block", content: { mod: "roundup-preview", props: {} } })).children[1], { mod: true, weight: 1 });
  assert.equal(paneMap(row(term("t1"), term("t2", { px: 240 }))), null, "size.px");
  for (const w of [0, -1, Infinity, NaN, "1", null]) assert.equal(paneMap(row(term("t1"), term("t2", { weight: w }))), null, `weight ${w}`);
  assert.equal(paneMap(row(term("t1"), term("t2", {}))), null, "size without weight");
  assert.equal(paneMap(row(term("t1"), { type: "block", content: { tab: "active" } })), null, "unknown content");
  assert.equal(paneMap(row(term("t1"), { type: "block" })), null, "no content");
  assert.equal(paneMap(row(term("t1"), { type: "stack", children: [term("t2")] })), null, "unknown node type");
  assert.equal(paneMap(row()), null, "empty children");
  assert.equal(paneMap({ type: "row" }), null, "no children");
  assert.equal(paneMap(null), null);
});

test("quicklook: by tab in tab order, in the tree's order, with a map per tab whose agents all are in its tree", () => {
  const tabs = [tab("tb2", 2), tab("tb1", 1, "main")];
  const list = [agent("t46", "tb1", { status: "blocked" }), agent("t2d", "tb2"), agent("t44", "tb1", { status: "working" })];
  const q = quicklook(list, tabs, DOC, null);
  assert.deepEqual(q.map((g) => [g.index, g.name]), [[1, "main"], [2, "2"]]);
  assert.deepEqual(q[0].rows.map((a) => a.address), ["t44", "t46"], "the tree's order, not agents()'");
  assert.equal(q[0].map.children[0].agent.address, "t44");
  assert.equal(q[0].map.children[1].children[0].agent, undefined, "a terminal that isn't an agent stays neutral");
  assert.equal(q[0].map.children[1].children[1].agent.status, "blocked");
  assert.deepEqual(q[1].rows.map((a) => a.address), ["t2d"]);
  assert.ok(q[1].map);
});

test("quicklook without a fitting tree: rows stay, each current agent once, only that tab loses its map", () => {
  const tabs = [tab("tb1", 1, "main"), tab("tb2", 2), tab("tb9", 3)];
  const rows = (q) => q.flatMap((g) => g.rows.map((a) => a.address)).sort();
  // A tab the document doesn't have (made after the read).
  let q = quicklook([agent("t44", "tb1"), agent("t70", "tb9")], tabs, DOC, null);
  assert.deepEqual(rows(q), ["t44", "t70"]);
  assert.ok(q[0].map);
  assert.equal(q[1].map, null);
  // One of two agents of a tab in its tree (a new split): agents() order, no map.
  q = quicklook([agent("t71", "tb1"), agent("t44", "tb1")], tabs, DOC, null);
  assert.deepEqual(q[0].rows.map((a) => a.address), ["t71", "t44"]);
  assert.equal(q[0].map, null);
  // An agent gone since the read: its pane is drawn neutral, no row for it.
  q = quicklook([agent("t45", "tb1")], tabs, DOC, null);
  assert.deepEqual(rows(q), ["t45"]);
  assert.equal(q[0].map.children[0].agent, undefined);
  // The same address moved to another tab (pane.swap across tabs, a stale read): a row in its new tab, once.
  q = quicklook([agent("t44", "tb2"), agent("t2c", "tb2")], tabs, DOC, null);
  assert.deepEqual(q.map((g) => g.index), [2]);
  assert.deepEqual(rows(q), ["t2c", "t44"]);
  assert.equal(q[0].map, null);
  // No document: every tab without a map, agents() order.
  q = quicklook([agent("t46", "tb1"), agent("t44", "tb1")], tabs, null, null);
  assert.deepEqual(q[0].rows.map((a) => a.address), ["t46", "t44"]);
  assert.equal(q[0].map, null);
});

test("quicklook on another machine: qualified ids match that machine's document only", () => {
  const tabs = [tab("vps/tb2", 1)];
  const q = quicklook([agent("vps/t2c", "vps/tb2"), agent("vps/t2d", "vps/tb2")], tabs, DOC, "vps");
  assert.ok(q[0].map);
  assert.equal(q[0].map.children[0].agent.address, "vps/t2c", "the leaf keeps the app's agent, qualified address included");
  assert.equal(quicklook([agent("box/t2c", "vps/tb2")], tabs, DOC, "vps")[0].map, null, "another machine's prefix");
  assert.equal(quicklook([agent("t2c", "tb2"), agent("t2d", "tb2")], [tab("tb2", 1)], DOC, "vps")[0].map, null, "local ids against vps's document");
});

test("fingerprint: the same agents in any order give the same string; a tab change gives another", () => {
  const a = [agent("t1", "tb1"), agent("t2", "tb2")];
  assert.equal(fingerprint(a), fingerprint([...a].reverse()));
  assert.notEqual(fingerprint(a), fingerprint([agent("t1", "tb2"), agent("t2", "tb2")]));
  assert.notEqual(fingerprint(a), fingerprint(a.slice(1)));
});
