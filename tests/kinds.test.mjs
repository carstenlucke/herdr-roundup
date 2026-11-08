// node --test 'tests/*.test.mjs'
// Which viewer and editor language a file gets, by its extension, and the extension a
// downloaded image keeps, by its MIME type.
import { test } from "node:test";
import assert from "node:assert/strict";
import { viewerFor, languageOf, basename, extension } from "../mods/roundup-preview/kinds.js";
import { imageExtension } from "../mods/roundup-preview/mime.js";

// VW-01
test("viewerFor: the viewer by extension, case ignored, anything else in the code viewer", () => {
  const cases = {
    markdown: ["a.md", "a.markdown", "a.mdx", "README.MD"],
    pdf: ["a.pdf", "A.PDF"],
    table: ["a.csv", "a.tsv", "A.Csv"],
    json: ["a.json"],
    image: ["a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.svg", "a.bmp", "a.tiff", "a.heic", "A.JPG"],
    code: [".env", "Makefile", "a.js", "a.txt", "a.jsonc", "a.md.bak", "noext"],
  };
  for (const [viewer, files] of Object.entries(cases)) for (const f of files) assert.equal(viewerFor(f), viewer, f);
  assert.equal(viewerFor("C:\\docs\\Notes.MD"), "markdown");
});

// VW-02
test("languageOf: editor languages for extensions that aren't one, else the extension or text", () => {
  for (const f of ["a.ts", "a.tsx", "a.mjs", "a.jsx", "a.cjs"]) assert.equal(languageOf(f), "js", f);
  assert.equal(languageOf("a.yml"), "yaml");
  assert.equal(languageOf("a.toml"), "yaml");
  assert.equal(languageOf("a.sh"), "bash");
  assert.equal(languageOf("a.zsh"), "bash");
  assert.equal(languageOf("a.py"), "python");
  assert.equal(languageOf("a.md"), "markdown");
  assert.equal(languageOf("a.rs"), "rust");
  assert.equal(languageOf("a.go"), "go", "unknown: the extension itself");
  assert.equal(languageOf("Makefile"), "text");
  assert.equal(languageOf(".env"), "text");
});

test("basename and extension: either slash, a trailing slash, a leading dot", () => {
  assert.equal(basename("/a/b/c.md"), "c.md");
  assert.equal(basename("C:\\a\\b\\c.md"), "c.md");
  assert.equal(basename("C:/a\\b/c.md"), "c.md");
  assert.equal(basename("/a/b/"), "b");
  assert.equal(basename("c.md"), "c.md");
  assert.equal(extension("/a/b.tar.GZ"), "gz");
  assert.equal(extension("/a/.env"), "");
  assert.equal(extension("/a.b/c"), "");
});

// VW-09
test("imageExtension: the drawn image types, with parameters and in any case, else null", () => {
  assert.equal(imageExtension("image/png"), "png");
  assert.equal(imageExtension("image/jpeg"), "jpg");
  assert.equal(imageExtension("image/gif"), "gif");
  assert.equal(imageExtension("image/webp"), "webp");
  assert.equal(imageExtension("image/svg+xml"), "svg");
  assert.equal(imageExtension("IMAGE/PNG"), "png");
  assert.equal(imageExtension("image/svg+xml; charset=utf-8"), "svg");
  assert.equal(imageExtension(" image/jpeg ;q=1"), "jpg");
  for (const m of ["image/bmp", "image/tiff", "text/html", "application/octet-stream", "", null, undefined])
    assert.equal(imageExtension(m), null, String(m));
});
