// node --test tests/ (Node 22 or later: it loads the mods' files as ES modules without a package.json).
// roundup-files: what the disk index leaves out, how deep it reads, and the tree's order.
import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, sortEntries, psQuote, prunedName, prunedAbove, indexDepth, atHome } from "../mods/roundup-files/disk-rules.js";

test("compare: natural order, case-insensitive, digit runs past 2^53 by digits then length", () => {
  const sorted = (list) => [...list].sort(compare);
  assert.deepEqual(sorted(["file10", "file2", "File1"]), ["File1", "file2", "file10"]);
  assert.deepEqual(sorted(["b", "A", "a"]), ["A", "a", "b"]);
  // Two runs that are one Number past 2^53: the digits decide.
  const big = "9007199254740993", same = "9007199254740992";
  assert.equal(Number(big), Number(same));
  assert.ok(compare(`x${same}`, `x${big}`) < 0);
  assert.ok(compare(`x${big}`, `x${same}`) > 0);
  // Same value, more leading zeros: the longer comes last.
  assert.ok(compare("x01", "x1") > 0);
  assert.ok(compare("x1", "x01") < 0);
  assert.equal(compare("a", "a"), 0);
  assert.ok(compare("a", "ab") < 0);
});

test("sortEntries puts folders first, each in natural order", () => {
  const list = [{ name: "b.txt", dir: false }, { name: "src10", dir: true }, { name: "a.txt", dir: false }, { name: "src2", dir: true }];
  assert.deepEqual(sortEntries(list).map((e) => e.name), ["src2", "src10", "a.txt", "b.txt"]);
});

test("psQuote doubles ' and the curly single quotes", () => {
  assert.equal(psQuote("a"), "'a'");
  assert.equal(psQuote("it's"), "'it''s'");
  assert.equal(psQuote("‘x’"), "'‘‘x’’'");
  assert.equal(psQuote("‚y‛"), "'‚‚y‛‛'");
});

test("prunedName: PRUNE at any depth; Library, AppData, .Trash only at home's top level or anywhere under /", () => {
  const home = "/Users/a";
  assert.ok(prunedName("/r", "node_modules", home));
  assert.ok(prunedName("/r", "x/y/node_modules", home));
  assert.ok(prunedName("/r", ".git", home));
  assert.ok(!prunedName("/r", "src", home));
  assert.ok(prunedName(home, "Library", home));
  assert.ok(prunedName(`${home}/`, "Library", home));
  assert.ok(!prunedName(home, "proj/Library", home));
  assert.ok(!prunedName("/r", "Library", home));
  assert.ok(prunedName("/", "x/Library", home));
  // A home not known yet ("") is no folder's.
  assert.ok(!prunedName(home, "Library", ""));
});

test("prunedAbove is true only inside a pruned folder, not for the pruned path itself", () => {
  const home = "/Users/a";
  assert.ok(prunedAbove("/r", "node_modules/x.js", home));
  assert.ok(prunedAbove("/r", "a/dist/b/c.js", home));
  assert.ok(!prunedAbove("/r", "node_modules", home));
  assert.ok(!prunedAbove("/r", "src/a.js", home));
  assert.ok(prunedAbove(home, "Library/x", home));
  assert.ok(!prunedAbove(home, "p/Library/x", home));
});

test("indexDepth reads 5 levels at home or /, else 12", () => {
  assert.equal(indexDepth("/Users/a", "/Users/a"), 5);
  assert.equal(indexDepth("/Users/a/", "/Users/a"), 5);
  assert.equal(indexDepth("/", "/Users/a"), 5);
  assert.equal(indexDepth("/Users/a/p", "/Users/a"), 12);
  assert.equal(indexDepth("/Users/a", ""), 12);
  assert.ok(atHome("/", ""));
});
