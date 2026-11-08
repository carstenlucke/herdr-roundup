// node --test 'tests/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitBlocks, slugify, imageNote } from "../mods/roundup-preview/markdown-blocks.js";
import { GONE } from "../mods/roundup-preview/text-file.js";

// VW-03
test("splitBlocks: a heading named like an Object property gets a plain slug", () => {
  const slugs = splitBlocks("# Constructor\n\n# toString\n\n# Constructor\n").filter((b) => b.heading).map((b) => b.heading.slug);
  assert.deepEqual(slugs, ["constructor", "tostring", "constructor-1"]);
});

test("slugify: GitHub's anchors, lower case, punctuation dropped, link text and letters kept", () => {
  assert.equal(slugify("Hello **World**!"), "hello-world");
  assert.equal(slugify("`code` and *em*"), "code-and-em");
  assert.equal(slugify("[Link text](http://x.org) here"), "link-text-here");
  assert.equal(slugify("A <b>tag</b>"), "a-tag");
  assert.equal(slugify("Über Größe"), "über-größe");
  assert.equal(slugify("日本語 見出し"), "日本語-見出し");
  assert.equal(slugify("C++ & C#"), "c--c", "each space a dash");
  assert.equal(slugify("x - y"), "x---y");
  assert.equal(slugify("v1.2 Notes"), "v12-notes");
});

test("splitBlocks: a block per heading, repeated titles numbered -1, -2", () => {
  const blocks = splitBlocks("intro\n# A\ntext\n## A\n# A #\n");
  assert.deepEqual(blocks.map((b) => b.heading ?? null), [
    null,
    { level: 1, title: "A", slug: "a" },
    { level: 2, title: "A", slug: "a-1" },
    { level: 1, title: "A", slug: "a-2" },
  ]);
  assert.equal(blocks[1].text, "# A\ntext\n");
});

// VW-04
test("splitBlocks: images, linked ones too, are blocks of their own, but not inside inline code", () => {
  assert.deepEqual(splitBlocks("a ![x](i.png) b\n"), [{ text: "a " }, { image: { alt: "x", src: "i.png" } }, { text: " b\n" }]);
  assert.deepEqual(splitBlocks('![x](<i.png> "title")\n'), [{ image: { alt: "x", src: "i.png" } }]);
  assert.deepEqual(splitBlocks("[![alt](i.png)](http://l.org)\n"), [{ image: { alt: "alt", src: "i.png", link: "http://l.org" } }]);
  assert.deepEqual(splitBlocks("text `![x](i.png)` more\n"), [{ text: "text `![x](i.png)` more\n" }]);
});

test("splitBlocks: fenced code stays whole until a fence of the same character, at least as long", () => {
  const backticks = splitBlocks("```\n![x](i.png)\n# no\n```\n# yes\n");
  assert.deepEqual(backticks.map((b) => b.heading?.title ?? null), [null, "yes"]);
  assert.equal(backticks[0].text, "```\n![x](i.png)\n# no\n```\n");
  assert.deepEqual(splitBlocks("````\n```\n# no\n````\n# yes\n").map((b) => b.heading?.title ?? null), [null, "yes"], "a shorter fence doesn't close");
  assert.deepEqual(splitBlocks("~~~\n```\n# no\n~~~\n"), [{ text: "~~~\n```\n# no\n~~~\n" }], "another character doesn't close");
  assert.equal(splitBlocks("```\n# never closed\n").length, 1);
});

test("splitBlocks: reference definitions go into every text block, an empty file is one empty block", () => {
  const blocks = splitBlocks("# A\n\n[r]: http://x.org\n\n# B\n\nsee [r]\n");
  assert.equal(blocks.length, 2);
  for (const b of blocks) assert.ok(b.text.endsWith("\n\n[r]: http://x.org"), JSON.stringify(b.text));
  const withImage = splitBlocks("see [r]\n![i](i.png)\n[r]: http://x.org\n");
  assert.ok(withImage.every((b) => b.image || b.text.includes("[r]: http://x.org")));
  assert.deepEqual(splitBlocks("only [r]\n\n[r]: http://x.org\n"), [{ text: "only [r]\n\n[r]: http://x.org\n" }], "one block keeps its own");
  assert.deepEqual(splitBlocks(""), [{ text: "" }]);
});

// VW-05
test("imageNote: why an image block isn't drawn", () => {
  assert.equal(imageNote({ url: "https://x.org/i.png" }, "ask"), "on the web");
  assert.equal(imageNote({ url: "https://x.org/i.png" }, "loading"), "loading…");
  assert.equal(imageNote({ url: "https://x.org/i.png" }, "loaded"), "couldn't load");
  assert.equal(imageNote({}, "ask"), "not found");
  assert.equal(imageNote({ failed: GONE }, "ask"), "not found");
  assert.equal(imageNote({ failed: "Permission denied" }, "ask"), "Permission denied");
});
