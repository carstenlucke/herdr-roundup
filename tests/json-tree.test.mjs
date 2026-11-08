// node --test 'tests/*.test.mjs'
// The JSON viewer's tree: rows for the open nodes, JSON Pointers as paths, alt-click on a branch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, containers, valueAt, toggleDeep } from "../mods/roundup-preview/json-tree.js";

const doc = { a: { b: [1, "x", null] }, "k/~": { deep: { er: true } }, n: 2, e: {}, one: [0] };

// VW-21
test("flatten: a row per visible node, containers summed up", () => {
  const closed = flatten(doc, new Set());
  assert.deepEqual(closed, [{ path: "", depth: 0, key: null, kind: "object", open: false, text: "{ 5 keys }" }]);
  const rows = flatten(doc, new Set(["", "/a", "/a/b"]));
  assert.deepEqual(rows.map((r) => [r.path, r.depth, r.key, r.kind, r.text]), [
    ["", 0, null, "object", "{ 5 keys }"],
    ["/a", 1, "a", "object", "{ 1 key }"],
    ["/a/b", 2, "b", "array", "[ 3 items ]"],
    ["/a/b/0", 3, 0, "number", "1"],
    ["/a/b/1", 3, 1, "string", '"x"'],
    ["/a/b/2", 3, 2, "null", "null"],
    ["/k~1~0", 1, "k/~", "object", "{ 1 key }"],
    ["/n", 1, "n", "number", "2"],
    ["/e", 1, "e", "object", "{ 0 keys }"],
    ["/one", 1, "one", "array", "[ 1 item ]"],
  ]);
  assert.deepEqual(flatten("plain", new Set([""])), [{ path: "", depth: 0, key: null, kind: "string", open: false, text: '"plain"' }]);
});

test("pointers escape ~ and / and valueAt follows them back", () => {
  const all = [...containers(doc)];
  assert.ok(all.includes("/k~1~0/deep"), all.join(" "));
  for (const path of all) assert.equal(typeof valueAt(doc, path), "object", path);
  assert.deepEqual(valueAt(doc, "/k~1~0/deep"), { er: true });
  assert.equal(valueAt(doc, "/a/b/1"), "x");
  assert.equal(valueAt(doc, ""), doc);
  assert.equal(valueAt(doc, "/n/x"), undefined);
  assert.equal(valueAt(doc, "/missing/x"), undefined);
});

test("containers: the root and its first level at depth 1, every one without a depth", () => {
  assert.deepEqual([...containers(doc, 1)], ["", "/a", "/k~1~0", "/e", "/one"]);
  assert.deepEqual([...containers(doc)], ["", "/a", "/a/b", "/k~1~0", "/k~1~0/deep", "/e", "/one"]);
  assert.deepEqual([...containers(42)], []);
});

test("toggleDeep: opens a closed branch with all below it, closes an open one, leaves the rest", () => {
  const opened = toggleDeep(doc, new Set([""]), "/k~1~0");
  assert.deepEqual([...opened].sort(), ["", "/k~1~0", "/k~1~0/deep"]);
  const closed = toggleDeep(doc, new Set(["", "/a", "/a/b", "/k~1~0"]), "/a");
  assert.deepEqual([...closed].sort(), ["", "/k~1~0"]);
  const all = toggleDeep(doc, new Set(), "");
  assert.deepEqual([...all].sort(), [...containers(doc)].sort());
});
