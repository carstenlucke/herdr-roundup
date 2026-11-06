// What is on disk: one folder's entries (lazy, for the tree) and an index of every path
// below the shown folder (for search). Here, on another machine (`on`), and on Windows.
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

const windows = (on) => !on && window()?.platform === "windows";
const psQuote = (s) => "'" + s.replace(/['‘’‚‛]/g, "$&$&") + "'";

// Natural order, case-insensitive ("file2" before "file10"); this runtime has no Intl.
export function compare(a, b) {
  const x = a.toLowerCase().match(/\d+|\D+/g) ?? [], y = b.toLowerCase().match(/\d+|\D+/g) ?? [];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    const nx = /^\d/.test(x[i]), ny = /^\d/.test(y[i]);
    if (nx && ny) return Number(x[i]) - Number(y[i]) || x[i].length - y[i].length;
    return x[i] < y[i] ? -1 : 1;
  }
  return x.length - y.length || (a < b ? -1 : a > b ? 1 : 0);
}
export const sortEntries = (list) => list.sort((a, b) => Number(b.dir) - Number(a.dir) || compare(a.name, b.name));

// One folder: [{ name, dir }], folders first. `more`: it held more than PER_FOLDER.
export async function listDir(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First ${PER_FOLDER + 1} | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } ${psQuote(path)}`], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  let list;
  if (windows(on)) list = await windowsDirectory();
  else {
    const script = `n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=\${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt ${PER_FOLDER} ] && break; done; test -d "$1"`;
    let r;
    try { r = await exec("sh", ["-c", script, "roundup-files", path], { on }); }
    catch (e) {
      if (on && String(e).includes("cannot start sh: program not found")) list = await windowsDirectory();
      else throw e;
    }
    if (!list) {
      if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
      const fields = r.stdout.split("\0");
      list = [];
      for (let i = 0; i + 1 < fields.length; i += 2) list.push({ name: fields[i + 1], dir: fields[i] === "d" });
    }
  }
  return { entries: sortEntries(list.slice(0, PER_FOLDER)), more: list.length > PER_FOLDER };
}

// Every path below root, "/"-separated and relative: { dirs: Set, all: [], full }. `full`
// is false when a limit cut it short. Skips PRUNE (and HOME_PRUNE at home), 12 levels deep
// (5 at home or /).
export async function buildIndex(root, on) {
  const atHome = root === home() || root === "/";
  const depth = atHome ? 5 : 12;
  const dirs = new Set(), all = [];
  if (windows(on)) {
    const names = PRUNE.map((n) => n.replace(/\./g, "\\.")).join("|");
    const r = await exec("powershell", ["-NoProfile", "-Command", `[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) $b = (Resolve-Path -LiteralPath $p).Path.TrimEnd('\\'); Get-ChildItem -LiteralPath $b -Recurse -Force -Depth ${depth} -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '[\\\\/](${names})([\\\\/]|$)' } | Select-Object -First ${INDEX_PATHS + 1} | ForEach-Object { $(if ($_.PSIsContainer) {'d'} else {'f'}) + ($_.FullName.Substring($b.Length + 1) -replace '\\\\', '/') } } ${psQuote(root)}`]);
    for (const line of r.stdout.split(/\r?\n/)) if (line.length > 1) { const rel = line.slice(1); all.push(rel); if (line[0] === "d") dirs.add(rel); }
    return { dirs, all: all.slice(0, INDEX_PATHS), full: all.length <= INDEX_PATHS };
  }
  const names = [...PRUNE, ...(atHome ? HOME_PRUNE : [])].map((n) => `-name '${n}'`).join(" -o ");
  const script = `cd "$1" || exit 3; find . -maxdepth ${depth} \\( ${names} \\) -prune -o -type d -print 2>/dev/null | head -n ${INDEX_DIRS + 1}; echo //; find . -maxdepth ${depth} \\( ${names} \\) -prune -o ! -type d -print 2>/dev/null | head -n ${INDEX_PATHS + 1}`;
  const r = await exec("sh", ["-c", script, "roundup-files", root], { on });
  if (r.code === 3) throw new Error("Cannot open this folder");
  let inDirs = true, nd = 0, nf = 0;
  for (const line of r.stdout.split("\n")) {
    if (line === "//") { inDirs = false; continue; }
    if (!line.startsWith("./")) continue;
    if (inDirs ? ++nd > INDEX_DIRS : ++nf > INDEX_PATHS) continue;
    const rel = line.slice(2);
    all.push(rel);
    if (inDirs) dirs.add(rel);
  }
  return { dirs, all, full: nd <= INDEX_DIRS && nf <= INDEX_PATHS };
}
