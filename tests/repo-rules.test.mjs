// node --test 'tests/*.test.mjs'
// Static checks of the repo's rules (CLAUDE.md): mod folders and mod.json, keys.json, the
// commands and shared keys the mods use, their assets, their network use and the files two
// mods share. Each failure names the file and the value that breaks the rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";

const NAME = "Herdr-Roundup";
const repo = (path) => new URL(`../${path}`, import.meta.url);
const read = (path) => readFileSync(repo(path), "utf8");
const layout = JSON.parse(read(`layouts/${NAME}.json`));
const keys = JSON.parse(read("keys.json"));

const folders = readdirSync(repo("mods")).filter((d) => statSync(repo(`mods/${d}`)).isDirectory());
const roundupMods = folders.filter((d) => d.startsWith("roundup-"));

// A mod's .js files (paths from the repo root), its vendored icons left out.
function jsFiles(mod) {
  const out = [];
  const scan = (dir) => {
    for (const e of readdirSync(repo(dir), { withFileTypes: true })) {
      const path = `${dir}/${e.name}`;
      if (e.isDirectory()) scan(path);
      else if (e.name.endsWith(".js")) out.push(path);
    }
  };
  scan(`mods/${mod}`);
  return out;
}
// Code without its comments, line numbers kept: a rule's word in a comment isn't a use. A `//`
// after a letter or a colon (https://, a regex) stays.
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).replace(/(^|[\s;,(){}])\/\/.*$/gm, "$1");
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

// Mods the layout places: every content.mod and the terminal menu.
const placed = new Set([layout.terminal_menu]);
(function walk(v) {
  if (!v || typeof v !== "object") return;
  if (typeof v.content?.mod === "string") placed.add(v.content.mod);
  for (const c of Object.values(v)) walk(c);
})(layout);

// The roundup mods cloned from Herdr's shipped ones (THIRD_PARTY_NOTICES.md); roundup-preview
// comes from herdr-cria instead.
const CLONES = ["roundup-confirm", "roundup-files", "roundup-pane", "roundup-spaces", "roundup-tabs", "roundup-workspace-chrome"];

// LAY-08
test("every mod folder is roundup-* with a mod.json placed nowhere, clones naming what they came from", () => {
  const bad = [];
  for (const d of folders) {
    if (!d.startsWith("roundup-")) { bad.push(`mods/${d}: not roundup-*`); continue; }
    if (!existsSync(repo(`mods/${d}/mod.json`))) { bad.push(`mods/${d}: no mod.json`); continue; }
    const m = JSON.parse(read(`mods/${d}/mod.json`));
    if (m.place !== "none") bad.push(`mods/${d}/mod.json: place ${JSON.stringify(m.place)}, not "none" (the layout places it)`);
    const c = m.cloned_from;
    if (c !== undefined && (typeof c?.name !== "string" || !/^\d+\.\d+\.\d+$/.test(c?.version)))
      bad.push(`mods/${d}/mod.json: cloned_from ${JSON.stringify(c)} needs {name, version}`);
    if (CLONES.includes(d) && c?.name !== d.slice("roundup-".length))
      bad.push(`mods/${d}/mod.json: a clone of Herdr's ${d.slice("roundup-".length)} must keep cloned_from, has ${JSON.stringify(c)}`);
  }
  assert.deepEqual(bad, []);
});

// LAY-09
test("keys.json binds only the layout's own section, cmd-shift-w through the tab bar", () => {
  assert.deepEqual(Object.keys(keys), [`layout:${NAME}`], "keys.json: only the layout's section, never global");
  const own = keys[`layout:${NAME}`];
  assert.equal(own["cmd-w"], "roundup-tabs.close", "keys.json: cmd-w");
  assert.equal(own["cmd-shift-w"], "roundup-tabs.close-pane", "keys.json: cmd-shift-w");
  const toPane = Object.entries(own).filter(([, action]) => String(action).startsWith("roundup-pane."));
  assert.deepEqual(toPane, [], "keys.json: every pane header is a roundup-pane copy, each would get the command and close pane after pane");
});

// LAY-10
test("each mod command keys.json binds is handled by that mod's command loop, and that mod is placed", () => {
  const bad = [];
  for (const [section, bindings] of Object.entries(keys))
    for (const [key, action] of Object.entries(bindings)) {
      const [, mod, command] = String(action).match(/^(roundup-[a-z-]+)\.([\w-]+)$/) ?? [];
      if (!mod) continue; // Herdr's own app commands
      const where = `keys.json ${section} ${key} → ${action}`;
      if (!roundupMods.includes(mod)) { bad.push(`${where}: no mods/${mod}`); continue; }
      if (!placed.has(mod)) bad.push(`${where}: the layout doesn't place ${mod}, so nothing receives it`);
      const main = code(`mods/${mod}/main.js`);
      if (!/\bnextCommand\(\)/.test(main)) bad.push(`${where}: mods/${mod}/main.js has no nextCommand() loop`);
      else if (!new RegExp(`(===|startsWith\\()\\s*["'\`]${command}["'\`]`).test(main)) bad.push(`${where}: mods/${mod}/main.js never compares a command with "${command}"`);
    }
  assert.deepEqual(bad, []);
});

// LAY-11
// Herdr's names for state its shipped mods share with these.
const HERDR_KEYS = new Set(["sidebar.width", "sidebar.collapsed", "space.colors", "workspace.panels", "layout"]);
test("every shared-state key is under an existing roundup mod's name or one of Herdr's", () => {
  const bad = [];
  let found = 0;
  for (const mod of roundupMods) {
    const files = jsFiles(mod), texts = files.map(code), all = texts.join("\n");
    // A constant's string values: `NAME = "…"`, `NAME = \`…\``, or each value of `NAME = { … }`.
    const strings = (src) => [...src.matchAll(/"([^"\\]*)"|`([^`\\]*)`/g)].map((m) => m[1] ?? m[2]);
    const constant = (name) => {
      const m = all.match(new RegExp(`\\b${name}\\s*=\\s*("[^"\\n]*"|\`[^\`\\n]*\`|\\{[^}]*\\})`));
      return m ? strings(m[1]).map(expand) : null;
    };
    // A template's ${NAME} filled in where NAME is a constant; anything else ends the key's known prefix.
    const expand = (t) => t.replace(/\$\{(\w+)\}/g, (all, n) => (/^[A-Z_]+$/.test(n) && constant(n)?.length === 1 ? constant(n)[0] : all));
    const prefix = (k) => k.split("${")[0];
    files.forEach((file, i) => {
      for (const m of texts[i].matchAll(/(?<![\w.$])(setShared|shared)\(\s*([^,)\s]+)/g)) {
        const arg = m[2], at = `${file}:${lineOf(texts[i], m.index)}: ${m[1]}(${arg}`;
        let ks;
        if (/^["'`]/.test(arg)) ks = strings(texts[i].slice(m.index + m[0].length - arg.length)).slice(0, 1).map(expand);
        else ks = constant(arg.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "");
        if (!ks?.length) { bad.push(`${at}: can't tell which key`); continue; }
        for (const k of ks.map(prefix)) {
          found++;
          const owner = k.match(/^(roundup-[a-z-]+)\./)?.[1];
          if (!HERDR_KEYS.has(k) && !(owner && roundupMods.includes(owner))) bad.push(`${at}: key ${JSON.stringify(k)}`);
        }
      }
    });
  }
  assert.deepEqual(bad, [], `a mod's own key goes under roundup-<mod>.; Herdr's are ${[...HERDR_KEYS].join(", ")}`);
  assert.ok(found > 20, `found only ${found} keys`);
});

// LAY-12
// Icon names built at run time, per mod: mods/<mod>/<name>.svg.
const DYNAMIC = {
  "roundup-pane": ["rename", "split-right", "split-down", "zoom", "unzoom", "close"], // header buttons
  "roundup-tabs": ["win-max", "win-restore"], // window controls
  "roundup-workspace-chrome": ["refresh", "bot", "notes", "skip", "check", "settings", "plus", "circle-alert", "spinner"], // menu, footer, details
  "roundup-preview": ["more", "collapse", "expand", "toc", "to-tab", "close"], // iconButton, windowButton
  "roundup-files": ["chevron-down", "chevron-right", "chevron-left", "link", "branch", "search"], // ICON()
};
test("every svg and png a mod draws exists, and none of its own lies unused", () => {
  const bad = [], used = new Set();
  for (const mod of roundupMods)
    for (const file of jsFiles(mod)) {
      const text = code(file);
      for (const m of text.matchAll(/["'`](mods\/(roundup-[a-z-]+)\/[^"'`$]+\.(?:svg|png))["'`]/g)) {
        used.add(m[1]);
        if (!existsSync(repo(m[1]))) bad.push(`${file}:${lineOf(text, m.index)}: ${m[1]} doesn't exist`);
      }
    }
  for (const [mod, names] of Object.entries(DYNAMIC)) {
    const all = jsFiles(mod).map(code).join("\n");
    for (const n of names) {
      const path = `mods/${mod}/${n}.svg`;
      used.add(path);
      if (!existsSync(repo(path))) bad.push(`${path} doesn't exist (a name ${mod} builds at run time)`);
      // The list stays true: the name, or its last part for chevron-${…}, is in the code.
      if (!all.includes(`"${n}"`) && !all.includes(`"${n.split("-").pop()}"`)) bad.push(`${mod} no longer names "${n}": update DYNAMIC`);
    }
  }
  for (const mod of roundupMods)
    for (const f of readdirSync(repo(`mods/${mod}`)).filter((f) => /\.(svg|png)$/.test(f)))
      if (!used.has(`mods/${mod}/${f}`)) bad.push(`mods/${mod}/${f} is drawn nowhere`);
  assert.deepEqual(bad, []);
});

// CHR-31
test("only update.js fetches, and only the release list's pages; no other network address in the mods", () => {
  const bad = [];
  for (const mod of roundupMods)
    for (const file of jsFiles(mod)) {
      const text = code(file);
      for (const m of text.matchAll(/(?<![\w.$])fetch\(\s*([^,)\s]*)/g))
        if (file !== "mods/roundup-workspace-chrome/update.js" || m[1] !== "url") bad.push(`${file}:${lineOf(text, m.index)}: fetch(${m[1]}`);
      for (const m of text.matchAll(/\b(?:https?|wss?|ftp):\/\/[^\s"'`)]+/g))
        if (!/^https:\/\/(api\.)?github\.com\/(repos\/)?carstenlucke\/herdr-roundup(\/|$)/.test(m[0])) bad.push(`${file}:${lineOf(text, m.index)}: ${m[0]}`);
    }
  assert.deepEqual(bad, []);
  const update = read("mods/roundup-workspace-chrome/update.js");
  assert.match(update, /export const RELEASE_LIST = "https:\/\/api\.github\.com\/repos\/carstenlucke\/herdr-roundup\/releases\?per_page=30"/);
  assert.match(update, /const url = page === 1 \? RELEASE_LIST : `\$\{RELEASE_LIST\}&page=\$\{page\}`;/, "fetch's url is the list or one of its pages");
  assert.doesNotMatch(update, /herdr-roundup\/releases\/latest/, "both channels read the list");
});

// PAN-01
test("roundup-pane's close.js and menu.js are copies of roundup-tabs'", () => {
  for (const f of ["close.js", "menu.js"])
    assert.equal(read(`mods/roundup-pane/${f}`), read(`mods/roundup-tabs/${f}`), `mods/roundup-pane/${f} and mods/roundup-tabs/${f} differ: copy one over the other`);
});

// PAN-02
test("roundup-pane has no command loop: cmd-shift-w goes only through the tab bar", () => {
  const loops = jsFiles("roundup-pane").filter((f) => /\bnextCommand\b/.test(code(f)));
  assert.deepEqual(loops, [], "every pane header is a copy of roundup-pane: each would take the command");
  const bindings = Object.entries(keys).flatMap(([section, b]) => Object.entries(b).map(([key, a]) => [section, key, a]));
  const close = bindings.filter(([, , a]) => /close-pane$|^pane\.close$|^roundup-pane\./.test(a));
  assert.deepEqual(close, [[`layout:${NAME}`, "cmd-shift-w", "roundup-tabs.close-pane"]], "keys.json: closing a pane by key");
});

// FIL-104
test("roundup-files is a focusable clone of Herdr's files, in the layout's files block", () => {
  const m = JSON.parse(read("mods/roundup-files/mod.json"));
  assert.equal(m.focusable, true, "mods/roundup-files/mod.json: focusable");
  assert.equal(m.place, "none", "mods/roundup-files/mod.json: place");
  assert.deepEqual(m.cloned_from, { name: "files", version: "0.1.13" }, "mods/roundup-files/mod.json: cloned_from");
  let files;
  (function walk(v) { if (v && typeof v === "object") { if (v.id === "files") files = v; Object.values(v).forEach(walk); } })(layout);
  assert.equal(files?.content?.mod, "roundup-files", `layouts/${NAME}.json: block "files"`);
});

// FIL-111
test("THIRD_PARTY_NOTICES.md names the Lucide link icon and the Geist font with its licence, and they exist", () => {
  const notices = read("THIRD_PARTY_NOTICES.md");
  const lucide = notices.split("\n").find((l) => l.includes("[Lucide]"));
  assert.ok(lucide?.includes("mods/roundup-files/link.svg"), "THIRD_PARTY_NOTICES.md: the Lucide row doesn't name mods/roundup-files/link.svg");
  const geist = notices.split("\n").find((l) => l.includes("Geist-Italic.ttf"));
  assert.ok(geist?.includes("mods/roundup-files/fonts/OFL.txt"), "THIRD_PARTY_NOTICES.md: the Geist row doesn't name fonts/OFL.txt");
  for (const f of ["mods/roundup-files/link.svg", "mods/roundup-files/fonts/Geist-Italic.ttf", "mods/roundup-files/fonts/OFL.txt"])
    assert.ok(existsSync(repo(f)), `${f} doesn't exist`);
});
