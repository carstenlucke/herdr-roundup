// node --test 'tests/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { svgSize } from "../mods/roundup-preview/svg-size.js";

test("svgSize: stroke-width is no width", () => {
  assert.deepEqual(svgSize('<svg stroke-width="2" viewBox="0 0 24 24">'), { width: 24, height: 24 });
  assert.deepEqual(svgSize('<svg width="10px" height="20" viewBox="0 0 24 24">'), { width: 10, height: 20 });
  assert.deepEqual(svgSize("<svg>"), { width: 300, height: 150 });
});

// VW-16
test("svgSize: attributes in px, else the viewBox with spaces or commas, else 300×150", () => {
  assert.deepEqual(svgSize('<svg width="480px" height="270px">'), { width: 480, height: 270 });
  assert.deepEqual(svgSize("<svg width='12.5' height='8'>"), { width: 12.5, height: 8 });
  assert.deepEqual(svgSize('<svg viewBox="0 0 64 32">'), { width: 64, height: 32 });
  assert.deepEqual(svgSize('<svg viewBox="0,0,64,32">'), { width: 64, height: 32 });
  assert.deepEqual(svgSize('<svg viewBox="-5, -5 , 40 20">'), { width: 40, height: 20 });
  assert.deepEqual(svgSize('<svg width="100" viewBox="0 0 64 32">'), { width: 100, height: 32 }, "each side falls back alone");
  assert.deepEqual(svgSize('<svg width="100%" height="auto">'), { width: 300, height: 150 });
});

test("svgSize: a prefixed svg tag counts, a page without one has no size", () => {
  assert.deepEqual(svgSize('<?xml version="1.0"?>\n<svg:svg xmlns:svg="http://www.w3.org/2000/svg" width="20" height="10">'), { width: 20, height: 10 });
  assert.deepEqual(svgSize('<SVG WIDTH="20" HEIGHT="10">'), { width: 20, height: 10 });
  assert.deepEqual(svgSize("<html><body>no picture</body></html>"), { width: 0, height: 0 });
  assert.deepEqual(svgSize('<svgfoo width="20">'), { width: 0, height: 0 });
  assert.deepEqual(svgSize(""), { width: 0, height: 0 });
});
