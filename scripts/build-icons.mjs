#!/usr/bin/env node
// Vendors Catppuccin Icons (https://github.com/catppuccin/vscode-icons, MIT) into
// mods/roundup-files: the Latte SVGs (light themes) and the Mocha SVGs (dark themes) that its
// icon theme refers to, its LICENSE, and icons.js with the rules that pick an icon.
// Why this set, pinned and generated: docs/adr/0003-catppuccin-icons-pinned-and-generated.md.
//
// Run from anywhere: node scripts/build-icons.mjs. It needs curl and unzip. It reads the
// released .vsix (whose dist/<flavor>/theme.json is the compiled VS Code icon theme) and
// checks its SHA-256 before using it. To move to a newer release, change VERSION and SHA256.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.26.0";
const SHA256 = "57566136d0a8ba8d040eb6e5be866c88ccbb04f3d219d3a7e52a19978900ff3d";
const URL = `https://github.com/catppuccin/vscode-icons/releases/download/v${VERSION}/catppuccin-vsc-icons-${VERSION}.vsix`;
const FLAVORS = ["latte", "mocha"];

// The theme also maps VS Code language ids, which VS Code itself resolves from extensions and
// names. Herdr has no language ids, so these are VS Code's built-in associations for the ids
// the theme uses. They only fill gaps: the theme's own extensions and names always win.
const LANGUAGES = {
  diff: { ext: ["diff", "patch", "rej"] },
  shellscript: { ext: ["sh", "bash", "zsh", "ksh", "bashrc", "zshrc", "profile"] },
  plaintext: { ext: ["txt"] },
  ini: { ext: ["ini"] },
  properties: { ext: ["properties", "cfg", "conf", "directory", "gitattributes", "gitconfig", "gitmodules", "editorconfig", "repo"] },
  log: { ext: ["log"] },
  makefile: { ext: ["mak", "mk"], names: ["makefile", "gnumakefile", "ocamlmakefile"] },
  python: { ext: ["py", "pyi", "pyw", "rpy", "pyt", "gyp", "gypi", "ipy"] },
  markdown: { ext: ["md", "mkd", "mdwn", "mdown", "markdown", "markdn", "mdtxt", "mdtext", "workbook"] },
  yaml: { ext: ["yaml", "yml", "eyaml", "eyml", "cff"] },
  "git-commit": { names: ["commit_editmsg", "merge_msg"] },
  "git-rebase": { names: ["git-rebase-todo"] },
  ignore: { ext: ["gitignore_global", "gitignore", "git-blame-ignore-revs"] },
};

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(repo, "mods", "roundup-files");
const tmp = mkdtempSync(join(tmpdir(), "roundup-icons-"));

try {
  const vsix = join(tmp, "icons.vsix");
  execFileSync("curl", ["-fsSL", "-o", vsix, URL], { stdio: "inherit" });
  const hash = createHash("sha256").update(readFileSync(vsix)).digest("hex");
  if (hash !== SHA256) throw new Error(`${URL}: SHA-256 is ${hash}, expected ${SHA256}`);
  const files = ["extension/LICENSE.txt", ...FLAVORS.flatMap((f) => [`extension/dist/${f}/theme.json`, `extension/dist/${f}/icons/*`])];
  execFileSync("unzip", ["-q", "-o", vsix, ...files, "-d", tmp], { stdio: "inherit" });
  const dist = join(tmp, "extension", "dist");

  const themes = Object.fromEntries(FLAVORS.map((f) => [f, JSON.parse(readFileSync(join(dist, f, "theme.json"), "utf8"))]));
  const rules = (t) => JSON.stringify({ ...t, iconDefinitions: undefined, hidesExplorerArrows: undefined });
  if (rules(themes.latte) !== rules(themes.mocha)) throw new Error("Latte and Mocha map names to different icons; icons.js holds one table");
  const theme = themes.mocha;

  // VS Code compares names case-insensitively; the theme's keys are mostly lower case already.
  const lower = (table) => Object.fromEntries(Object.entries(table ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const fileExtensions = lower(theme.fileExtensions), fileNames = lower(theme.fileNames);
  for (const [id, icon] of Object.entries(theme.languageIds ?? {})) {
    for (const e of LANGUAGES[id]?.ext ?? []) fileExtensions[e] ??= icon;
    for (const n of LANGUAGES[id]?.names ?? []) fileNames[n] ??= icon;
  }
  const data = {
    file: theme.file, folder: theme.folder, folderExpanded: theme.folderExpanded,
    rootFolder: theme.rootFolder, rootFolderExpanded: theme.rootFolderExpanded,
    fileNames, fileExtensions, folderNames: lower(theme.folderNames), folderNamesExpanded: lower(theme.folderNamesExpanded),
  };

  // Only the icons a rule names; each id must be a plain file name in icons/.
  const used = new Set([data.file, data.folder, data.folderExpanded, data.rootFolder, data.rootFolderExpanded,
    ...Object.values(fileNames), ...Object.values(fileExtensions), ...Object.values(data.folderNames), ...Object.values(data.folderNamesExpanded)]);
  for (const f of FLAVORS) {
    const dest = join(out, "icons", f);
    rmSync(dest, { recursive: true, force: true });
    mkdirSync(dest, { recursive: true });
    for (const id of used) {
      const path = themes[f].iconDefinitions[id]?.iconPath ?? "";
      if (!/^[A-Za-z0-9_.-]+$/.test(id) || !/^\.\/icons\/[A-Za-z0-9_.-]+\.svg$/.test(path)) throw new Error(`${f}: unexpected icon ${id} → ${path}`);
      const src = join(dist, f, path);
      if (!existsSync(src)) throw new Error(`${f}: ${path} is missing`);
      copyFileSync(src, join(dest, `${id}.svg`));
    }
  }
  copyFileSync(join(tmp, "extension", "LICENSE.txt"), join(out, "icons", "LICENSE"));
  writeFileSync(join(out, "icons.js"),
    `// Generated by scripts/build-icons.mjs from Catppuccin Icons ${VERSION} (MIT, icons/LICENSE). Do not edit.\n` +
    `// Icon ids name icons/latte/<id>.svg and icons/mocha/<id>.svg. Keys are lower case.\n` +
    `export default ${JSON.stringify(data)};\n`);
  console.log(`Catppuccin Icons ${VERSION}: ${used.size} icons per flavor, ${Object.keys(fileNames).length} names, ${Object.keys(fileExtensions).length} extensions, ${Object.keys(data.folderNames).length} folders`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
