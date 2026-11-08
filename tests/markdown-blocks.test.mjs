// node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBlocks } from "../mods/roundup-preview/markdown-blocks.js";

test("splitBlocks: a heading named like an Object property gets a plain slug", () => {
  const slugs = splitBlocks("# Constructor\n\n# toString\n\n# Constructor\n").filter((b) => b.heading).map((b) => b.heading.slug);
  assert.deepEqual(slugs, ["constructor", "tostring", "constructor-1"]);
});
