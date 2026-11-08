// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
// roundup-preview: a read's text as it is shown, and the code view's value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checked, codeValue, LIMIT, readFailure } from "../mods/roundup-preview/text-file.js";

test("A file gone is \"This file is no longer available\"; a NUL is a binary file", () => {
  assert.throws(() => checked(null), { message: "This file is no longer available" });
  assert.throws(() => checked("a\0b"), { message: "Binary file · no text preview" });
  assert.equal(readFailure("stream did not contain valid UTF-8"), "Binary or non-UTF-8 file · no text preview");
});

test("checked drops a byte-order mark and keeps the rest", () => {
  assert.equal(checked("﻿{\"a\":1}"), "{\"a\":1}");
  assert.equal(checked("plain\n"), "plain\n");
  assert.equal(checked(""), "");
});

test("The code view ends with \"… (file truncated)\" past 400,000 characters, or for any cut text however short", () => {
  assert.equal(LIMIT, 400000);
  assert.equal(codeValue("short"), "short");
  assert.equal(codeValue("x".repeat(LIMIT)), "x".repeat(LIMIT));
  assert.equal(codeValue("x".repeat(LIMIT + 1)), "x".repeat(LIMIT) + "\n… (file truncated)");
  assert.equal(codeValue("head\n", true), "head\n\n… (file truncated)");
  assert.equal(codeValue("", true), "\n… (file truncated)");
});
