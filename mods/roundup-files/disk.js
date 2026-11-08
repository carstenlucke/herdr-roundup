// What is on disk: one folder's entries (lazy, for the tree) and an index of every path
// below the shown folder (for search). Here, on another machine (`on`), and on Windows (the
// index not yet).
//
// listDir is Herdr's `files` 0.1.13 `directory()` (Apache-2.0). buildIndex is adapted from
// cybertron288/herdr-mods `filetree` (MIT, (c) 2026 cybertron288), itself a port of
// claude-code-filetree (MIT, (c) 2026 Kurt Buhler). See THIRD_PARTY_NOTICES.md.
import { exec, home, window } from "herdr";
import { listScript, parseListing } from "./listing.js";

export const PER_FOLDER = 500;
// listDir reads at most this many entries of a folder: 100,000 took 5 s and 2.5 MB of output,
// on every refresh, and past about 330,000 the output passes exec's 8 MiB.
const READ_AT_MOST = 10000;
// Search: folders it never enters, how deep and how much it reads.
const PRUNE = [".git", "node_modules", "target", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".nuxt", ".cache", ".gradle", ".idea", "vendor", "Pods", ".tox", ".mypy_cache", ".pytest_cache", "coverage"];
const HOME_PRUNE = ["Library", "AppData", ".Trash"];
export const INDEX_DIRS = 20000, INDEX_PATHS = 40000;
// The characters of paths kinds() puts on one command line. Windows takes at most 32,767: room
// left for the script, the root and the quoting it adds. sh's limit (ARG_MAX) is far higher.
const WINDOWS_LINE = 24000, SH_LINE = 100000;

const windows = (on) => !on && window()?.platform === "windows";
// Whether buildIndex can read the disk on `on`. A machine without sh is found only on trying.
export const diskSearch = (on) => !windows(on);
// buildIndex can't read the disk there: search keeps to git's files.
const noIndex = (message) => Object.assign(new Error(message), { noIndex: true });
export const psQuote = (s) => "'" + s.replace(/['‘’‚‛]/g, "$&$&") + "'";
// A machine without sh (Windows over `on`): exec says so when it tries.
const noSh = (e, on) => on && String(e).includes("cannot start sh: program not found");
// The home of `on`'s machine: this one's from home(), another's once learnHome has read it
// ("" until then, which is no folder's).
const homes = new Map();
const homeOf = (on) => (on ? homes.get(on) ?? "" : home());
const trimSlash = (p) => p.replace(/\/+$/, "") || "/";
async function learnHome(on) {
  if (!on || homes.has(on)) return;
  const r = await exec("sh", ["-c", 'printf %s "$HOME"'], { on }).catch(() => null);
  if (r?.code === 0 && r.stdout) homes.set(on, trimSlash(r.stdout));
}
const isHome = (root, on) => Boolean(homeOf(on)) && trimSlash(root) === trimSlash(homeOf(on));
const atHomeOf = (root, on) => root === "/" || isHome(root, on);
// Whether a folder at rel below root (on `on`) is never indexed. A file there is. HOME_PRUNE:
// at home only its top level (~/Library, not a project's Library), at / at any depth.
export const prunedName = (root, rel, on) => {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return PRUNE.includes(name) || (HOME_PRUNE.includes(name) && (root === "/" || (isHome(root, on) && !rel.includes("/"))));
};
// Whether rel lies inside a pruned folder below root (rel itself may still be a file).
export const prunedAbove = (root, rel, on) => {
  const parts = rel.split("/");
  return parts.slice(0, -1).some((_, i) => prunedName(root, parts.slice(0, i + 1).join("/"), on));
};

// Natural order, case-insensitive ("file2" before "file10"); this runtime has no Intl.
export function compare(a, b) {
  const x = a.toLowerCase().match(/\d+|\D+/g) ?? [], y = b.toLowerCase().match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const nx = /^\d/.test(x[i]), ny = /^\d/.test(y[i]);
    // Runs past 2^53 can come out the same Number: then their digits decide, below.
    if (nx && ny && (Number(x[i]) !== Number(y[i]) || x[i].length !== y[i].length)) return Number(x[i]) - Number(y[i]) || x[i].length - y[i].length;
    return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length || (a < b ? -1 : a > b ? 1 : 0);
}
export const sortEntries = (list) => list.sort((a, b) => Number(b.dir) - Number(a.dir) || compare(a.name, b.name));

// One folder: [{ name, dir, link, broken }] (link: a link's target as written, "" when it
// can't be read, null for no link; broken: a link that points nowhere), folders first, the first PER_FOLDER of them in that order.
// `more`: it held more. Up to READ_AT_MOST entries are read and sorted first: a cut while
// reading drops in the shell's order (dotfiles come last) rather than the shown one, so only
// a folder larger than that may miss a few of its first PER_FOLDER.
export async function listDir(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Only symlinks and junctions are links: other reparse points (OneDrive's folders) are
    // folders, and a hard link (PowerShell 5.1 gives it a LinkType and a Target too) is a
    // file. LinkType is read only on reparse points: reading it opens the file.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    // link: a link's target as written ("" when it can't be read); broken: it points nowhere.
    const r = await exec("powershell", ["-NoProfile", "-Command", `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First ${READ_AT_MOST} | ForEach-Object { $rp = [bool]($_.Attributes -band [IO.FileAttributes]::ReparsePoint); $isLink = $rp -and ($_.LinkType -in 'SymbolicLink','Junction'); $t = if ($isLink) { $tg = $_.Target; if ($tg) { @($tg)[0] } else { '' } } else { $null }; $at = if ($t) { [IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $t) } else { $null }; @{ name=$_.Name; dir=($_.PSIsContainer -and (-not $isLink -or ($at -and [IO.Directory]::Exists($at)))); link=$t; broken=[bool]($at -and -not (Test-Path -LiteralPath $at)) } }) | ConvertTo-Json -Compress } ${psQuote(path)}`], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return (Array.isArray(result) ? result : [result]).map((e) => ({ name: e.name, dir: Boolean(e.dir), link: e.link ?? null, broken: Boolean(e.broken) }));
  };
  let list;
  if (windows(on)) list = await windowsDirectory();
  else {
    const script = listScript(READ_AT_MOST);
    let r;
    try { r = await exec("sh", ["-c", script, "roundup-files", path], { on }); }
    catch (e) {
      if (noSh(e, on)) list = await windowsDirectory();
      else throw e;
    }
    if (!list) {
      if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
      list = parseListing(r.stdout);
    }
  }
  return { entries: sortEntries(list).slice(0, PER_FOLDER), more: list.length > PER_FOLDER };
}

// Every path below root, "/"-separated and relative: { dirs: Set, all: [], full, cut }.
// `full` is false when a limit cut it short; `cut` says which ("dirs", "files").
// Skips PRUNE (and HOME_PRUNE: at home its top level, at / any), 12 levels deep (5 at home or
// /; the home of the folder's machine). Not on Windows yet (issue #10), nor without sh: an
// error with noIndex.
export async function buildIndex(root, on) {
  if (windows(on)) throw noIndex("Search can't read the disk on Windows yet");
  await learnHome(on);
  const atHome = atHomeOf(root, on);
  const depth = indexDepth(root, on);
  const dirs = new Set(), all = [];
  // Matched against the part below root, so a root inside a pruned name still indexes. Only
  // folders are pruned: a file named `build` or `vendor` is indexed; `.git` never is (a
  // worktree's is a file). A link to a folder counts as a folder, as in the tree, and isn't
  // followed.
  const top = !atHome ? [] : HOME_PRUNE.map((n) => (root === "/" ? `-name '${n}'` : `-path './${n}'`));
  const names = [...PRUNE.map((n) => `-name '${n}'`), ...top].join(" -o ");
  // A link to a folder: -type l and test -d (which follows it). One with a pruned name is in
  // neither list.
  const skip = `-type d \\( ${names} \\) -prune -o`, link = `-type l -exec test -d {} \\;`;
  // -mindepth 1: "." itself would count against the cut and hide one folder too many.
  // NUL-separated, as a name may hold a newline. `cut` keeps the first N records and ends
  // find early (head -z is GNU only): it swaps NUL and newline around head and back.
  const cut = `cut() { tr '\\000\\n' '\\n\\000' | head -n "$1" | tr '\\n\\000' '\\000\\n'; }`;
  const script = `${cut}; cd "$1" || exit 3; find . -mindepth 1 -maxdepth ${depth} ${skip} \\( -type d -o -type l ! \\( ${names} \\) -exec test -d {} \\; \\) -print0 2>/dev/null | cut ${INDEX_DIRS + 1}; printf '//\\0'; find . -maxdepth ${depth} ${skip} ! -type d ! -name .git ! \\( ${link} \\) -print0 2>/dev/null | cut ${INDEX_PATHS + 1}`;
  let r;
  try { r = await exec("sh", ["-c", script, "roundup-files", root], { on }); }
  catch (e) { if (noSh(e, on)) throw noIndex("Search can't read the disk without sh"); throw e; }
  if (r.code === 3) throw new Error("Cannot open this folder");
  let inDirs = true, nd = 0, nf = 0;
  for (const line of r.stdout.split("\0")) {
    if (line === "//") { inDirs = false; continue; }
    if (!line.startsWith("./")) continue;
    if (inDirs ? ++nd > INDEX_DIRS : ++nf > INDEX_PATHS) continue;
    const rel = line.slice(2);
    all.push(rel);
    if (inDirs) dirs.add(rel);
  }
  const over = [...(nd > INDEX_DIRS ? ["dirs"] : []), ...(nf > INDEX_PATHS ? ["files"] : [])];
  return { dirs, all, full: !over.length, cut: over };
}

// root with links resolved, as the folder watch reports it (macOS: /tmp is /private/tmp);
// null where it is the same or can't be told. Here only, as the watch is.
export async function realPath(root) {
  if (windows(null)) return null;
  const r = await exec("sh", ["-c", 'cd "$1" && pwd -P', "roundup-files", root]).catch(() => null);
  const real = r?.code === 0 ? r.stdout.replace(/\n$/, "") : "";
  return real && real !== (root.replace(/\/+$/, "") || "/") ? real : null;
}

// How many levels below root (on `on`) buildIndex reads.
export const indexDepth = (root, on) => (atHomeOf(root, on) ? 5 : 12);

// args in pieces of at most `max` characters (with a separator each).
function pieces(args, max) {
  const out = [];
  let piece = [], length = 0;
  for (const a of args) {
    if (length + a.length + 1 > max && piece.length) { out.push(piece); piece = []; length = 0; }
    piece.push(a); length += a.length + 1;
  }
  if (piece.length) out.push(piece);
  return out;
}

// Which of rels (relative to root) exist: Map rel → "d" (a folder) or "f". Missing ones are
// left out. Any number of paths: they go in pieces of at most WINDOWS_LINE or SH_LINE
// characters, one after another, so a call starts one process for most lists and never
// several at once.
export async function kinds(root, rels, on) {
  const found = new Map();
  const windowsKinds = async () => {
    for (const piece of pieces(rels.map(psQuote), WINDOWS_LINE)) {
      const r = await exec("powershell", ["-NoProfile", "-Command", `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($b) foreach ($r in @(${piece.join(",")})) { $f = Join-Path $b $r; if (Test-Path -LiteralPath $f -PathType Container) { 'd' + $r } elseif (Test-Path -LiteralPath $f) { 'f' + $r } } } ${psQuote(root)}`], { on });
      if (r.code !== 0) throw new Error(r.stderr || "Cannot open this folder");
      for (const line of r.stdout.split(/\r?\n/)) if (line.length > 1) found.set(line.slice(1), line[0]);
    }
    return found;
  };
  if (windows(on)) return windowsKinds();
  const script = `cd "$1" || exit 3; shift; for p; do if [ -d "$p" ]; then printf 'd%s\\0' "$p"; elif [ -e "$p" ] || [ -L "$p" ]; then printf 'f%s\\0' "$p"; fi; done`;
  for (const piece of pieces(rels, SH_LINE)) {
    let r;
    try { r = await exec("sh", ["-c", script, "roundup-files", root, ...piece], { on }); }
    catch (e) { if (noSh(e, on)) return windowsKinds(); throw e; }
    if (r.code !== 0) throw new Error(r.stderr || "Cannot open this folder");
    for (const rec of r.stdout.split("\0")) if (rec.length > 1) found.set(rec.slice(1), rec[0]);
  }
  return found;
}
