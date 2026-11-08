// node --test 'tests/*.test.mjs'
// Where a link in a Markdown preview goes: the web, a heading, another file, or nowhere.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLink } from "../mods/roundup-preview/links.js";

const DOC = "/a/b/doc.md";

// LNK-01
test("resolveLink: empty links, anchors, and web and mail links in any case", () => {
  assert.deepEqual(resolveLink(DOC, ""), { error: "Empty link" });
  assert.deepEqual(resolveLink(DOC, "  "), { error: "Empty link" });
  assert.deepEqual(resolveLink(DOC, undefined), { error: "Empty link" });
  assert.deepEqual(resolveLink(DOC, "#h"), { anchor: "h" });
  assert.deepEqual(resolveLink(DOC, "?q"), { anchor: "" });
  assert.deepEqual(resolveLink(DOC, "?q#h"), { anchor: "h" });
  for (const url of ["http://x.org", "https://x.org/a?b#c", "HTTPS://X.ORG", "mailto:a@b.org", "MailTo:a@b.org"])
    assert.deepEqual(resolveLink(DOC, url), { url });
});

// LNK-02
test("resolveLink: a relative link resolves against the document, without its query, decoded", () => {
  assert.deepEqual(resolveLink("/a/doc.md", "../x/c.md#Intro"), { file: "/x/c.md", anchor: "Intro" });
  assert.deepEqual(resolveLink(DOC, "c.md"), { file: "/a/b/c.md" });
  assert.deepEqual(resolveLink(DOC, "./sub/../c.md"), { file: "/a/b/c.md" });
  assert.deepEqual(resolveLink(DOC, "c.md?x=1"), { file: "/a/b/c.md" });
  assert.deepEqual(resolveLink(DOC, "c.md?x=1#Top"), { file: "/a/b/c.md", anchor: "Top" });
  assert.deepEqual(resolveLink(DOC, "my%20file.md"), { file: "/a/b/my file.md" });
  assert.deepEqual(resolveLink(DOC, "/top.md"), { file: "/top.md" });
  assert.deepEqual(resolveLink(DOC, "bad%zz.md"), { error: "This link has an invalid path" });
});

// LNK-03
test("resolveLink: other schemes are refused, a Windows drive in a Windows document is a path", () => {
  assert.deepEqual(resolveLink(DOC, "ftp://x.org/f"), { error: "Can't open ftp: links here" });
  assert.deepEqual(resolveLink(DOC, "javascript:alert(1)"), { error: "Can't open javascript: links here" });
  assert.deepEqual(resolveLink(DOC, "vscode://file/x"), { error: "Can't open vscode: links here" });
  assert.deepEqual(resolveLink("C:/r/doc.md", "D:/x.md"), { file: "D:/x.md" });
  assert.deepEqual(resolveLink("C:/r/doc.md", "d:\\x.md"), { file: "d:/x.md" });
  assert.deepEqual(resolveLink(DOC, "D:/x.md"), { error: "Can't open D: links here" }, "off Windows D: is a scheme");
});

// LNK-04
test("resolveLink: file URLs, and a root path in a Windows document stays on its drive", () => {
  assert.deepEqual(resolveLink(DOC, "file:///etc/hosts"), { file: "/etc/hosts" });
  assert.deepEqual(resolveLink(DOC, "file://localhost/etc/hosts"), { file: "/etc/hosts" });
  assert.deepEqual(resolveLink(DOC, "FILE://LOCALHOST/etc/hosts"), { file: "/etc/hosts" });
  assert.deepEqual(resolveLink(DOC, "file:///etc/my%20hosts#x"), { file: "/etc/my hosts", anchor: "x" });
  assert.deepEqual(resolveLink("C:/r/doc.md", "file:///D:/x.md"), { file: "D:/x.md" });
  assert.deepEqual(resolveLink("C:/r/doc.md", "/top.md"), { file: "C:/top.md" });
  assert.deepEqual(resolveLink("C:\\r\\doc.md", "sub\\a.md"), { file: "C:/r/sub/a.md" });
});

// LNK-05
test("resolveLink: a share on another computer is refused, the document's own share is not", () => {
  const other = { error: "Can't open links to another computer" };
  assert.deepEqual(resolveLink("C:/r/doc.md", "\\\\other\\s\\x.md"), other);
  assert.deepEqual(resolveLink("C:/r/doc.md", "//other/s/x.md"), other);
  assert.deepEqual(resolveLink("C:/r/doc.md", "file://other/s/x.md"), other);
  assert.deepEqual(resolveLink("//srv/sh/doc.md", "//other/sh/y.md"), other);
  assert.deepEqual(resolveLink("//srv/sh/doc.md", "x.md"), { file: "//srv/sh/x.md" });
  assert.deepEqual(resolveLink("//srv/sh/doc.md", "/top.md"), { file: "//srv/sh/top.md" });
  assert.deepEqual(resolveLink("//srv/sh/doc.md", "//SRV/sh/y.md"), { file: "//SRV/sh/y.md" }, "host names ignore case");
});
