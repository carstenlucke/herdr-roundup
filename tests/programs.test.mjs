// node --test tests/
// What the preview's helper programs print, read back: PDF pages from PDFKit, poppler and
// Windows.Data.Pdf, and picture sizes from sips and `file`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfPages, popplerPages, pictureSize } from "../mods/roundup-preview/programs.js";

const rendered = (pages) => ({ code: 0, stdout: JSON.stringify({ count: pages.length, pages }), stderr: "" });
const page = (path) => ({ n: 1, path, width: 612, height: 792 });
const failure = (stderr) => ({ code: 1, stdout: "", stderr });
const UNEXPECTED = { message: "The PDF renderer returned something unexpected" };

// VW-13
test("pdfPages: pages only from the cache folder", () => {
  const ok = pdfPages("macos", rendered([page("data/roundup-preview/k-1-p1.png")]), "k");
  assert.deepEqual(ok, { count: 1, pages: [page("data/roundup-preview/k-1-p1.png")] });
  for (const system of ["macos", "windows"])
    for (const path of ["/etc/x.png", "data/other/x.png", "data/roundup-preview/../../x.png", "data/roundup-preview/sub/x.png", "data/roundup-preview\\..\\x.png", undefined])
      assert.throws(() => pdfPages(system, rendered([page(path)]), "k"), UNEXPECTED, `${system}: ${path}`);
  assert.throws(() => pdfPages("macos", { code: 0, stdout: '{"count":1}', stderr: "" }, "k"), UNEXPECTED, "no pages");
});

test("pdfPages: failures read as one plain line", () => {
  const fails = (system, stderr, message) => assert.throws(() => pdfPages(system, failure(stderr), "k"), { message }, `${system}: ${JSON.stringify(stderr)}`);
  fails("macos", "osascript: 12:30: execution error: Error: This PDF cannot be read (-2700)\n", "This PDF cannot be read");
  fails("macos", "execution error: This PDF is password protected (-2700)", "This PDF is password protected");
  fails("linux", "Command Line Error: Incorrect password\n", "This PDF is password protected");
  fails("linux", "Syntax Error: Couldn't read xref table\n", "Syntax Error: Couldn't read xref table");
  fails("linux", "", "Cannot render this PDF");
  fails("linux", "  \n", "Cannot render this PDF");
  fails("macos", "", "Cannot render this PDF");
  fails("windows", "This PDF is password protected\r\n", "This PDF is password protected");
  fails("windows", "", "Cannot render this PDF");
});

// VW-14
test("popplerPages: count, stamp and sizes, width and height swapped for turned pages", () => {
  const out = [
    "Stamp: 1700000000123456789", "Pages: 4",
    "Page    1 size: 612 x 792 pts (letter)", "Page    1 rot:  0",
    "Page    2 size: 612 x 792 pts (letter)", "Page    2 rot:  90",
    "Page    3 size: 595.28 x 841.89 pts (A4)", "Page    3 rot:  270",
    "Page    4 size: 100 x 200 pts", "Page    4 rot:  180", "",
  ].join("\n");
  const name = (n) => `data/roundup-preview/k1-1700000000123456789-p${n}.png`;
  assert.deepEqual(popplerPages(out, "k1"), { count: 4, pages: [
    { n: 1, path: name(1), width: 612, height: 792 },
    { n: 2, path: name(2), width: 792, height: 612 },
    { n: 3, path: name(3), width: 841.89, height: 595.28 },
    { n: 4, path: name(4), width: 100, height: 200 },
  ] });
  assert.deepEqual(pdfPages("linux", { code: 0, stdout: out, stderr: "" }, "k1").pages.map((p) => p.path), [1, 2, 3, 4].map(name));
  assert.deepEqual(popplerPages("Stamp: 1\nPages: 9\n", "k"), { count: 9, pages: [] }, "no page asked for");
});

// VW-15
test("pictureSize: sips and file output, past a JPEG's density and a BMP's resolution", () => {
  const size = (text) => pictureSize(text);
  assert.deepEqual(size("/x/a.png\n  pixelWidth: 480\n  pixelHeight: 270\n"), { width: 480, height: 270 });
  assert.deepEqual(size("PNG image data, 480 x 270, 8-bit/color RGBA, non-interlaced"), { width: 480, height: 270 });
  assert.deepEqual(size("GIF image data, version 89a, 480 x 270"), { width: 480, height: 270 });
  assert.deepEqual(size("JPEG image data, JFIF standard 1.01, aspect ratio, density 1x1, segment length 16, baseline, precision 8, 480x270, components 3"), { width: 480, height: 270 });
  assert.deepEqual(size("PC bitmap, Windows 3.x format, 480 x 270 x 24, resolution 2835 x 2835 px/m, cbSize 388854"), { width: 480, height: 270 });
  assert.deepEqual(size("RIFF (little-endian) data, Web/P image, VP8 encoding, 480x270, Scaling: [none]x[none]"), { width: 480, height: 270 });
  assert.deepEqual(size("pixelWidth: 480\npixelHeight: 270"), { width: 480, height: 270 }, "Windows prints sips' words");
  assert.deepEqual(size("ASCII text"), { width: 0, height: 0 });
  assert.deepEqual(size(""), { width: 0, height: 0 });
});
