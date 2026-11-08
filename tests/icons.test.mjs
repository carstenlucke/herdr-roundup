// node --test tests/
// roundup-files' file icons: how iconFor matches a path against the Symbols tables, and that
// every icon the tables name is there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { iconFor, rootIcon } from "../mods/roundup-files/icon.js";
import ICONS from "../mods/roundup-files/icons.js";

const icon = (id) => `mods/roundup-files/icons/${id}.svg`;
const FILE = icon(ICONS.file), FOLDER = icon(ICONS.folder);
const repo = (path) => new URL(`../${path}`, import.meta.url);

// Rules the shipped tables lack (a path rule, an open folder's own icon), added for one test.
function withRules(table, rules, fn) {
  Object.assign(ICONS[table], rules);
  try { fn(); } finally { for (const k of Object.keys(rules)) delete ICONS[table][k]; }
}

// FIL-108
test("iconFor: names like Object's own properties get the generic icons", () => {
  for (const name of ["constructor", "__proto__", "foo.constructor", "foo.__proto__"])
    assert.equal(iconFor(name, false, false), FILE, name);
  assert.equal(iconFor("src/constructor", false, false), FILE);
  for (const open of [false, true]) {
    assert.equal(iconFor("constructor", true, open), FOLDER);
    assert.equal(iconFor("__proto__", true, open), FOLDER);
  }
});

// FIL-109
test("iconFor: case doesn't matter", () => {
  assert.equal(iconFor("Dockerfile", false, false), icon("docker"));
  assert.equal(iconFor("README.MD", false, false), icon(ICONS.fileExtensions.md));
  assert.equal(iconFor("SRC", true, false), icon(ICONS.folderNames.src));
});

test("iconFor: a file's name beats its extension, and the longest extension wins", () => {
  assert.notEqual(ICONS.fileExtensions.yaml, "docker");
  assert.equal(iconFor("compose.yaml", false, false), icon("docker"), "a name rule over .yaml");
  assert.equal(iconFor("other.yaml", false, false), icon(ICONS.fileExtensions.yaml));
  assert.equal(iconFor("a.spec.ts", false, false), icon(ICONS.fileExtensions["spec.ts"]));
  assert.equal(iconFor("a.d.ts", false, false), icon("ts-types"));
  assert.equal(iconFor("a.ts", false, false), icon(ICONS.fileExtensions.ts));
  assert.notEqual(ICONS.fileExtensions["spec.ts"], ICONS.fileExtensions.ts);
});

test("iconFor: the whole name counts as an extension", () => {
  assert.equal(ICONS.fileNames["tsconfig.json"], undefined, "the test needs a name only fileExtensions lists");
  assert.equal(iconFor("tsconfig.json", false, false), icon(ICONS.fileExtensions["tsconfig.json"]));
  assert.notEqual(ICONS.fileExtensions["tsconfig.json"], ICONS.fileExtensions.json);
  assert.equal(iconFor("noext", false, false), FILE);
});

test("iconFor: a rule naming a path beats one naming the last part", () => {
  withRules("folderNames", { "docs/src": "folder-red" }, () => {
    assert.equal(iconFor("docs/src", true, false), icon("folder-red"));
    assert.equal(iconFor("app/docs/src", true, false), icon("folder-red"), "the path's end counts");
    assert.equal(iconFor("lib/src", true, false), icon(ICONS.folderNames.src));
  });
  withRules("fileNames", { "x/settings.json": "gear" }, () => {
    assert.equal(iconFor("a/x/settings.json", false, false), icon("gear"));
    assert.equal(iconFor("a/y/settings.json", false, false), icon(ICONS.fileExtensions.json));
  });
});

test("iconFor: an open folder without an open icon of its own shows its closed one", () => {
  assert.deepEqual(ICONS.folderNamesExpanded, {}, "Symbols has no open folder icons");
  assert.equal(iconFor("src", true, true), icon(ICONS.folderNames.src));
  assert.equal(iconFor("plain", true, true), icon(ICONS.folderExpanded));
  withRules("folderNamesExpanded", { src: "folder-red" }, () => {
    assert.equal(iconFor("src", true, true), icon("folder-red"));
    assert.equal(iconFor("src", true, false), icon(ICONS.folderNames.src));
  });
  assert.equal(rootIcon(true), icon(ICONS.rootFolderExpanded));
});

// FIL-110
test("every icon the tables name is in icons/, with the licence beside them", () => {
  const ids = new Set();
  for (const [k, v] of Object.entries(ICONS)) if (typeof v === "string") ids.add(v); else for (const id of Object.values(v)) ids.add(id);
  const missing = [...ids].filter((id) => !existsSync(repo(icon(id))));
  assert.deepEqual(missing, [], "mods/roundup-files/icons.js names icons that mods/roundup-files/icons/ lacks");
  assert.ok(ids.size > 100, `only ${ids.size} icon ids`);
  assert.ok(existsSync(repo("mods/roundup-files/icons/LICENSE")), "mods/roundup-files/icons/LICENSE");
  assert.ok(readdirSync(repo("mods/roundup-files/icons")).length > ids.size, "an svg per id plus LICENSE");
});

test("web files get icons of their own", () => {
  for (const name of ["a.css", "a.html", "a.php", "a.vue"]) assert.notEqual(iconFor(name, false, false), FILE, name);
});
