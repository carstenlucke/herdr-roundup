// node --test 'tests/*.test.mjs'
// Static checks of layouts/Herdr-Roundup.json: ids, colors, version, preview, the mods it places
// and the blocks the mods look up. Each failure names the file, the place in the tree and the value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";

const NAME = "Herdr-Roundup";
const repo = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(repo(path), "utf8");
const FILE = `layouts/${NAME}.json`;
const layout = JSON.parse(read(FILE));

// Every value in the tree with where it sits ("children[0].content.mod"), objects and arrays included.
function* walk(value, at = "") {
  yield [at, value];
  if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) yield* walk(v, Array.isArray(value) ? `${at}[${k}]` : at ? `${at}.${k}` : k);
}
// Every block (an object with an id) by id; a duplicate id keeps its first block.
const blocks = new Map();
for (const [at, v] of walk(layout)) if (v && typeof v === "object" && !Array.isArray(v) && "id" in v && !blocks.has(v.id)) blocks.set(v.id, { at, block: v });
const block = (id) => blocks.get(id)?.block;

// The color names theme() has (herdr.d.ts): light and dark themes name the same ones.
const THEME_COLORS = new Set(["background", "surface", "canvas", "chrome", "popover", "raised", "hover", "selected", "border",
  "input", "foreground", "muted", "dim", "accent", "accent_foreground", "solid", "solid_foreground", "selection",
  "working", "blocked", "done", "idle", "unknown", ...Array.from({ length: 16 }, (_, i) => `ansi${i}`)]);

// Herdr's shipped mods this layout places as they are.
const SHIPPED = new Set(["agents", "changes", "workspace-status"]);
const roundupMods = readdirSync(repo("mods")).filter((d) => d.startsWith("roundup-") && statSync(repo(`mods/${d}`)).isDirectory());

// LAY-01
test("every id in the layout tree is unique", () => {
  const seen = new Map(), dup = [];
  for (const [at, v] of walk(layout)) {
    if (!v || typeof v !== "object" || Array.isArray(v) || !("id" in v)) continue;
    if (seen.has(v.id)) dup.push(`id "${v.id}" at ${at || "root"} and at ${seen.get(v.id) || "root"}`);
    else seen.set(v.id, at);
  }
  assert.deepEqual(dup, [], `${FILE}: duplicate block ids crash Herdr App`);
  assert.ok(seen.size > 10, `${FILE}: found only ${seen.size} ids`);
});

// LAY-02
test("every color in the layout is a theme name, not hex", () => {
  const bad = [];
  const check = (at, c) => { if (typeof c !== "string" || !THEME_COLORS.has(c)) bad.push(`${at}: ${JSON.stringify(c)}`); };
  let colors = 0;
  for (const [at, v] of walk(layout)) {
    const key = at.split(".").pop();
    if (key === "color") { colors++; check(at, v); }
    else if (key === "background") {
      colors++;
      if (typeof v === "string") check(at, v);
      else if (Array.isArray(v?.gradient)) v.gradient.forEach((c, i) => check(`${at}.gradient[${i}]`, c));
      else if (!v?.image) bad.push(`${at}: ${JSON.stringify(v)}`);
    } else if (key === "colors" && v && typeof v === "object") for (const [n, c] of Object.entries(v)) { colors++; check(`${at}.${n}`, c); }
  }
  assert.deepEqual(bad, [], `${FILE}: colors must be theme names (${[...THEME_COLORS].slice(0, 6).join(", ")}, …) so the layout works light and dark`);
  assert.ok(colors >= 5, `${FILE}: found only ${colors} colors`);
});

// LAY-02 (mods)
test("no hex color in the mods' JavaScript", () => {
  const bad = [];
  const scan = (dir) => {
    for (const e of readdirSync(repo(dir), { withFileTypes: true })) {
      const path = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (path !== "mods/roundup-files/icons") scan(path); } // vendored, ADR 0002
      else if (e.name.endsWith(".js"))
        read(path).split("\n").forEach((line, i) => {
          for (const m of line.matchAll(/#[0-9a-f]{3,8}\b/gi)) if ([3, 4, 6, 8].includes(m[0].length - 1)) bad.push(`${path}:${i + 1}: ${m[0]}`);
        });
    }
  };
  scan("mods");
  assert.deepEqual(bad, [], "use theme() colors so the mods follow the theme");
});

// LAY-03
test("the root version is major.minor.patch, or a pre-release of one, and has its release notes", () => {
  const v = layout.version;
  assert.match(String(v), /^\d+\.\d+\.\d+(-(alpha|beta|rc)(\.\d+)?)?$/, `${FILE}: root "version" is ${JSON.stringify(v)}, which update.js can't compare`);
  assert.ok(existsSync(repo(`RELEASE-v${v}.md`)), `${FILE}: version ${v} has no RELEASE-v${v}.md beside it`);
});

// LAY-04
test("the root preview names an existing layouts/Herdr-Roundup.* file", () => {
  const p = layout.preview;
  assert.match(String(p), new RegExp(`^layouts/${NAME}\\.(svg|png)$`), `${FILE}: "preview" ${JSON.stringify(p)} isn't one sync.sh copies (layouts/${NAME}.*)`);
  assert.ok(existsSync(repo(p)), `${FILE}: "preview" names ${p}, which doesn't exist`);
});

// LAY-05
test("the layout file, sync.sh's name and keys.json's section agree, with no space", () => {
  const layouts = readdirSync(repo("layouts")).filter((f) => f.endsWith(".json"));
  assert.deepEqual(layouts, [`${NAME}.json`], "layouts/: one layout file, named without a space (Herdr can't switch to a name with one)");
  assert.match(read("scripts/sync.sh"), new RegExp(`^name=${NAME}(\\s|$)`, "m"), `scripts/sync.sh: name= isn't ${NAME}`);
  assert.ok(Object.hasOwn(JSON.parse(read("keys.json")), `layout:${NAME}`), `keys.json: no "layout:${NAME}" section`);
});

// LAY-06
test("every mod the layout places exists, and the chrome and pane mods sit where the code expects", () => {
  const bad = [];
  const known = (mod) => SHIPPED.has(mod) || roundupMods.includes(mod);
  for (const [at, v] of walk(layout)) if (at === "content.mod" || at.endsWith(".content.mod")) if (!known(v)) bad.push(`${at}: ${JSON.stringify(v)}`);
  if (!known(layout.terminal_menu)) bad.push(`terminal_menu: ${JSON.stringify(layout.terminal_menu)}`);
  assert.deepEqual(bad, [], `${FILE}: a mod that is neither mods/roundup-* nor ${[...SHIPPED].join(", ")}`);

  assert.equal(layout.terminal_menu, "roundup-pane", `${FILE}: terminal_menu`);
  assert.equal(block("brand")?.content?.mod, "roundup-workspace-chrome", `${FILE}: block "brand"`);
  assert.ok(!block("brand").content.props?.footer, `${FILE}: block "brand" must not have props.footer`);
  assert.equal(block("sidebar-footer")?.content?.mod, "roundup-workspace-chrome", `${FILE}: block "sidebar-footer"`);
  assert.equal(block("sidebar-footer").content.props?.footer, true, `${FILE}: block "sidebar-footer" needs props.footer: true`);
  assert.equal(block("main")?.content?.pane?.header?.content?.mod, "roundup-pane", `${FILE}: block "main" pane header`);
});

// LAY-07
test("the blocks the mods look up exist with the right shape", () => {
  const sidebar = block("sidebar"), panel = block("panel"), body = block("panel-body");
  assert.equal(sidebar?.type, "column", `${FILE}: block "sidebar" (roundup-workspace-chrome resizes it) must be a column`);
  assert.equal(typeof sidebar.size?.px, "number", `${FILE}: block "sidebar" needs size.px, got ${JSON.stringify(sidebar.size)}`);
  assert.ok(panel, `${FILE}: no block "panel" (roundup-tabs shows and hides it)`);
  assert.equal(body?.type, "stack", `${FILE}: block "panel-body" must be a stack, got ${JSON.stringify(body?.type)}`);
  assert.ok(blocks.get("panel-body").at.startsWith(blocks.get("panel").at + "."), `${FILE}: "panel-body" must sit inside "panel"`);
  const ids = body.children.map((c) => c.id);
  for (const id of ["files", "changes"]) assert.ok(ids.includes(id), `${FILE}: "panel-body" holds ${JSON.stringify(ids)}, not "${id}"`);
});

// LAY-23
test("RECIPE.md stays under 64 KB, or herdr.dev's gallery skips the layout", () => {
  const bytes = statSync(repo("RECIPE.md")).size;
  assert.ok(bytes < 64 * 1024, `RECIPE.md has ${bytes} bytes; herdr.dev's gallery skips one of 65,536 or more: shorten it`);
});
