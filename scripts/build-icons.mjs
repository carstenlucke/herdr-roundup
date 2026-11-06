#!/usr/bin/env node
// Vendors Symbols (https://github.com/miguelsolorio/vscode-symbols, MIT) into
// mods/roundup-files: the SVGs its icon theme refers to, its LICENSE, and icons.js with the
// rules that pick an icon. Why this set: docs/adr/0002-file-icon-set.md. Generated from a
// pinned release rather than copied by hand (nobody could tell the version or redo it) or
// fetched at run time (the panel would need the network; offline, no icons).
//
// Run from anywhere: node scripts/build-icons.mjs. It needs curl and unzip. It reads the
// released .vsix (the compiled VS Code icon theme and its SVGs) and checks its SHA-256
// before using it. To move to a newer release, change VERSION and SHA256.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "0.0.26";
const SHA256 = "4607d914804c262ed8a722f3d024befe33174f777ed64fb2dbaf4f8bfaec49a3";
const URL = `https://github.com/miguelsolorio/vscode-symbols/releases/download/${VERSION}/symbols-${VERSION}.vsix`;

// The theme also maps VS Code language ids, which VS Code itself resolves from extensions and
// names (Symbols draws .css and .html this way). Herdr has no language ids, so these are the
// extensions and names VS Code's built-in languages (and the usual language extensions) claim,
// for the ids the theme uses. They only fill gaps: the theme's own extensions and names win.
const LANGUAGES = {
  awk: { ext: ["awk"] },
  bat: { ext: ["bat", "cmd"] },
  c: { ext: ["c", "i"] },
  clojure: { ext: ["clj", "cljs", "cljc", "cljx", "clojure", "edn"] },
  coffeescript: { ext: ["coffee", "cson", "iced"] },
  cpp: { ext: ["cpp", "cppm", "cc", "ccm", "cxx", "cxxm", "c++", "hpp", "hh", "hxx", "h++", "h", "ii", "ino", "inl", "ipp", "ixx", "tpp", "txx"] },
  crystal: { ext: ["cr"] },
  csharp: { ext: ["cs", "csx", "cake"] },
  css: { ext: ["css"] },
  csv: { ext: ["csv"] },
  dart: { ext: ["dart"] },
  dockercompose: { names: ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"] },
  dockerfile: { ext: ["dockerfile", "containerfile"], names: ["dockerfile", "containerfile"] },
  doctex: { ext: ["dtx"] },
  earthfile: { names: ["earthfile"] },
  editorconfig: { names: [".editorconfig"] },
  elixir: { ext: ["ex", "exs"] },
  erlang: { ext: ["erl", "hrl"] },
  fsharp: { ext: ["fs", "fsi", "fsx", "fsscript"] },
  gdresource: { ext: ["tres"] },
  gdscene: { ext: ["tscn"] },
  gdscript: { ext: ["gd"] },
  gdshader: { ext: ["gdshader"] },
  gherkin: { ext: ["feature"] },
  "git-commit": { names: ["commit_editmsg", "merge_msg"] },
  "git-rebase": { names: ["git-rebase-todo"] },
  go: { ext: ["go"] },
  graphql: { ext: ["graphql", "gql"] },
  haml: { ext: ["haml"] },
  handlebars: { ext: ["handlebars", "hbs", "hjs"] },
  haskell: { ext: ["hs", "lhs"] },
  hlsl: { ext: ["hlsl", "hlsli", "fx", "fxh", "vsh", "psh", "cginc", "compute"] },
  html: { ext: ["html", "htm", "shtml", "xhtml", "xht", "mdoc", "jsp", "asp", "aspx", "jshtm", "volt", "ejs", "rhtml"] },
  ignore: { ext: ["gitignore_global", "gitignore", "git-blame-ignore-revs"] },
  java: { ext: ["java", "jav"] },
  javascript: { ext: ["js", "es6", "mjs", "cjs", "pac"], names: ["jakefile"] },
  javascriptreact: { ext: ["jsx"] },
  jinja: { ext: ["jinja", "jinja2", "j2"] },
  json: { ext: ["json", "bowerrc", "jscsrc", "webmanifest", "js.map", "css.map", "ts.map", "har", "jslintrc", "jsonld", "geojson", "vuerc"] },
  julia: { ext: ["jl"] },
  juliamarkdown: { ext: ["jmd"] },
  jupyter: { ext: ["ipynb"] },
  latex: { ext: ["tex", "ltx", "ctx"] },
  less: { ext: ["less"] },
  lua: { ext: ["lua"] },
  makefile: { ext: ["mak", "mk"], names: ["makefile", "gnumakefile", "ocamlmakefile"] },
  markdown: { ext: ["md", "mkd", "mdwn", "mdown", "markdown", "markdn", "mdtxt", "mdtext", "workbook"] },
  mdx: { ext: ["mdx"] },
  nix: { ext: ["nix"] },
  nunjucks: { ext: ["njk", "nunjucks"] },
  "objective-c": { ext: ["m"] },
  "objective-cpp": { ext: ["mm"] },
  pdf: { ext: ["pdf"] },
  perl: { ext: ["pl", "pm", "pod", "t", "psgi"] },
  php: { ext: ["php", "php4", "php5", "phtml", "ctp"] },
  "pip-requirements": { names: ["requirements.txt", "constraints.txt"] },
  plaintext: { ext: ["txt"] },
  postcss: { ext: ["pcss", "postcss"] },
  powershell: { ext: ["ps1", "psm1", "psd1", "pssc", "psrc"] },
  properties: { ext: ["properties", "cfg", "conf", "directory", "gitattributes", "gitconfig", "gitmodules", "repo"] },
  psv: { ext: ["psv"] },
  pug: { ext: ["pug", "jade"] },
  python: { ext: ["py", "rpy", "pyw", "cpy", "gyp", "gypi", "pyi", "ipy", "pyt"] },
  r: { ext: ["r", "rhistory", "rprofile", "rt"] },
  razor: { ext: ["cshtml", "razor"] },
  rescript: { ext: ["res"] },
  "rescript-interface": { ext: ["resi"] },
  ruby: { ext: ["rb", "rbx", "rjs", "gemspec", "rake", "ru", "erb", "podspec", "rbi"], names: ["rakefile", "gemfile", "guardfile", "podfile", "capfile", "brewfile", "vagrantfile"] },
  rust: { ext: ["rs"] },
  sass: { ext: ["sass"] },
  scala: { ext: ["scala", "sc", "sbt"] },
  scss: { ext: ["scss"] },
  shellscript: { ext: ["sh", "bash", "bashrc", "bash_aliases", "bash_profile", "bash_login", "bash_logout", "ebuild", "profile", "zsh", "zshrc", "zprofile", "zlogin", "zlogout", "zshenv", "zsh-theme", "ksh", "csh", "cshrc", "tcshrc"], names: ["apkbuild", "pkgbuild", ".envrc", ".hushlogin"] },
  slint: { ext: ["slint"] },
  sql: { ext: ["sql", "dsql"] },
  styl: { ext: ["styl"] },
  svelte: { ext: ["svelte"] },
  svg: { ext: ["svg"] },
  swift: { ext: ["swift"] },
  terraform: { ext: ["tf", "tfvars"] },
  tex: { ext: ["sty", "cls", "bbx", "cbx"] },
  tsv: { ext: ["tsv"] },
  twig: { ext: ["twig"] },
  typescript: { ext: ["ts", "cts", "mts"] },
  typescriptreact: { ext: ["tsx"] },
  vb: { ext: ["vb", "brs", "vbs", "bas", "vba"] },
  vue: { ext: ["vue"] },
  xml: { ext: ["xml", "xsd", "ascx", "atom", "axml", "axaml", "bpmn", "csproj", "dtd", "fsproj", "iml", "plist", "props", "rss", "storyboard", "targets", "vbproj", "vcxproj", "xaml", "xib", "xlf", "xliff", "xul"] },
  xquery: { ext: ["xq", "xql", "xqm", "xquery", "xqy"] },
  xsl: { ext: ["xsl", "xslt"] },
  yaml: { ext: ["yaml", "yml", "eyaml", "eyml", "cff"] },
};

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(repo, "mods", "roundup-files");
const tmp = mkdtempSync(join(tmpdir(), "roundup-icons-"));

try {
  const vsix = join(tmp, "icons.vsix");
  execFileSync("curl", ["-fsSL", "-o", vsix, URL], { stdio: "inherit" });
  const hash = createHash("sha256").update(readFileSync(vsix)).digest("hex");
  if (hash !== SHA256) throw new Error(`${URL}: SHA-256 is ${hash}, expected ${SHA256}`);
  execFileSync("unzip", ["-q", "-o", vsix, "extension/*", "-d", tmp], { stdio: "inherit" });
  const ext = join(tmp, "extension");
  const pkg = JSON.parse(readFileSync(join(ext, "package.json"), "utf8"));
  const themeFile = join(ext, pkg.contributes.iconThemes[0].path);
  const theme = JSON.parse(readFileSync(themeFile, "utf8"));

  // VS Code compares names case-insensitively.
  const lower = (table) => Object.fromEntries(Object.entries(table ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const fileExtensions = lower(theme.fileExtensions), fileNames = lower(theme.fileNames);
  // A rule naming an icon the theme doesn't define does nothing in VS Code: drop it, and say so.
  const dropped = [];
  const defined = (table) => Object.fromEntries(Object.entries(table).filter(([k, v]) => theme.iconDefinitions[v]?.iconPath || !dropped.push(`${k} → ${v}`)));
  for (const t of [fileExtensions, fileNames]) { const kept = defined(t); for (const k of Object.keys(t)) if (!(k in kept)) delete t[k]; }
  theme.folderNames = defined(theme.folderNames ?? {}); theme.folderNamesExpanded = defined(theme.folderNamesExpanded ?? {});
  if (dropped.length) console.warn(`Rules for icons the theme lacks, left out (${dropped.length}): ${dropped.join(", ")}`);
  for (const [id, icon] of Object.entries(theme.languageIds ?? {}).filter(([, icon]) => theme.iconDefinitions[icon]?.iconPath)) {
    for (const e of LANGUAGES[id]?.ext ?? []) fileExtensions[e] ??= icon;
    for (const n of LANGUAGES[id]?.names ?? []) fileNames[n] ??= icon;
  }
  // A theme without open variants shows the closed icon for an open folder, as VS Code does.
  const data = {
    file: theme.file, folder: theme.folder, folderExpanded: theme.folderExpanded ?? theme.folder,
    rootFolder: theme.rootFolder ?? theme.folder, rootFolderExpanded: theme.rootFolderExpanded ?? theme.rootFolder ?? theme.folderExpanded ?? theme.folder,
    fileNames, fileExtensions, folderNames: lower(theme.folderNames), folderNamesExpanded: lower(theme.folderNamesExpanded),
  };

  // Only the icons a rule names; each id must be a plain file name, each path an SVG of the theme.
  const used = new Set([data.file, data.folder, data.folderExpanded, data.rootFolder, data.rootFolderExpanded,
    ...Object.values(fileNames), ...Object.values(fileExtensions), ...Object.values(data.folderNames), ...Object.values(data.folderNamesExpanded)]);
  const dest = join(out, "icons");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const base = posix.dirname(pkg.contributes.iconThemes[0].path.replace(/^\.\//, ""));
  for (const id of used) {
    const path = theme.iconDefinitions[id]?.iconPath ?? "";
    if (!/^[A-Za-z0-9_.-]+$/.test(id) || !/^\.\/icons\/[a-z]+\/[A-Za-z0-9_.-]+\.svg$/.test(path)) throw new Error(`unexpected icon ${id} → ${path}`);
    const src = join(ext, base, path);
    if (!existsSync(src)) throw new Error(`${path} is missing`);
    copyFileSync(src, join(dest, `${id}.svg`));
  }
  copyFileSync(join(ext, "LICENSE.txt"), join(dest, "LICENSE"));
  writeFileSync(join(out, "icons.js"),
    `// Generated by scripts/build-icons.mjs from Symbols ${VERSION} by Miguel Solorio (MIT, icons/LICENSE). Do not edit.\n` +
    `// Icon ids name icons/<id>.svg. Keys are lower case.\n` +
    `export default ${JSON.stringify(data)};\n`);
  console.log(`Symbols ${VERSION}: ${used.size} icons, ${Object.keys(fileNames).length} names, ${Object.keys(fileExtensions).length} extensions, ${Object.keys(data.folderNames).length} folders`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
