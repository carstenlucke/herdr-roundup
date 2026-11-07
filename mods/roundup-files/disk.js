// What is on disk: one folder's entries (lazy, for the tree) and an index of every path
// below the shown folder (for search). Here, on another machine (`on`), and on Windows (the
// index not yet).
//
// listDir is Herdr's `files` 0.1.13 `directory()` (Apache-2.0). buildIndex is adapted from
// cybertron288/herdr-mods `filetree` (MIT, (c) 2026 cybertron288), itself a port of
// claude-code-filetree (MIT, (c) 2026 Kurt Buhler). See THIRD_PARTY_NOTICES.md.
import { exec, home, window } from "herdr";

export const PER_FOLDER = 500;
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
const atHomeOf = (root) => root === home() || root === "/";
// Whether a folder of this name below root is never indexed. A file of that name is.
export const prunedName = (root, name) => PRUNE.includes(name) || (atHomeOf(root) && HOME_PRUNE.includes(name));
// Whether rel lies inside a pruned folder below root (rel itself may still be a file).
export const prunedAbove = (root, rel) => rel.split("/").slice(0, -1).some((n) => prunedName(root, n));

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

// One folder: [{ name, dir }], folders first, the first PER_FOLDER of them in that order.
// `more`: it held more. The whole folder is read and sorted first: a cut while reading
// would drop in the shell's order (dotfiles come last) rather than the shown one.
export async function listDir(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } ${psQuote(path)}`], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  let list;
  if (windows(on)) list = await windowsDirectory();
  else {
    const script = `for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=\${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; done; test -d "$1"`;
    let r;
    try { r = await exec("sh", ["-c", script, "roundup-files", path], { on }); }
    catch (e) {
      if (noSh(e, on)) list = await windowsDirectory();
      else throw e;
    }
    if (!list) {
      if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
      const fields = r.stdout.split("\0");
      list = [];
      for (let i = 0; i + 1 < fields.length; i += 2) list.push({ name: fields[i + 1], dir: fields[i] === "d" });
    }
  }
  return { entries: sortEntries(list).slice(0, PER_FOLDER), more: list.length > PER_FOLDER };
}

// Every path below root, "/"-separated and relative: { dirs: Set, all: [], full }. `full`
// is false when a limit cut it short. Skips PRUNE (and HOME_PRUNE at home), 12 levels deep
// (5 at home or /). Not on Windows yet (issue #10), nor without sh: an error with noIndex.
export async function buildIndex(root, on) {
  const atHome = atHomeOf(root);
  const depth = indexDepth(root);
  const dirs = new Set(), all = [];
  const prune = [...PRUNE, ...(atHome ? HOME_PRUNE : [])];
  // Matched against the part below root, so a root inside a pruned name still indexes. Only
  // folders are pruned: a file named `build` or `vendor` is indexed; `.git` never is (a
  // worktree's is a file). A link to a folder counts as a folder, as in the tree, and isn't
  // followed.
  if (windows(on)) throw noIndex("Search can't read the disk on Windows yet");
  const names = prune.map((n) => `-name '${n}'`).join(" -o ");
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
  return { dirs, all, full: nd <= INDEX_DIRS && nf <= INDEX_PATHS };
}

// How many levels below root buildIndex reads.
export const indexDepth = (root) => (atHomeOf(root) ? 5 : 12);

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
