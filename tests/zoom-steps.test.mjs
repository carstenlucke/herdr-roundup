// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
// The zoom steps of roundup-preview's PDF and image viewers.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ZOOMS, nextZoom } from "../mods/roundup-preview/viewers/zoom-steps.js";

test("Zoom steps run from 25 % to 400 %", () => {
  assert.deepEqual(ZOOMS, [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4]);
});

test("From Fit at 60 %, + goes to 75 % and − to 50 %", () => {
  assert.equal(nextZoom(0.6, true), 0.75);
  assert.equal(nextZoom(0.6, false), 0.5);
});

test("From a step, + and − go to the next one; a scale just off a step counts as on it", () => {
  assert.equal(nextZoom(1, true), 1.25);
  assert.equal(nextZoom(1, false), 0.75);
  assert.equal(nextZoom(1.0004, true), 1.25);
  assert.equal(nextZoom(0.9996, false), 0.75);
});

test("Zoom stops at 25 % and 400 %", () => {
  assert.equal(nextZoom(0.25, false), 0.25);
  assert.equal(nextZoom(0.1, false), 0.25);
  assert.equal(nextZoom(4, true), 4);
  assert.equal(nextZoom(5, true), 4);
  assert.equal(nextZoom(0.1, true), 0.25);
});
