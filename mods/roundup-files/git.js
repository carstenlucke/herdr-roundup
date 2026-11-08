// Git, read-only: each path's status, folders' strongest status and counts, +/− lines,
// the branch and its upstream. Paths are "/"-separated and relative to the shown folder.
//
// The parsing is adapted from cybertron288/herdr-mods `filetree` (MIT, (c) 2026
// cybertron288), itself a port of claude-code-filetree (MIT, (c) 2026 Kurt Buhler).
// See THIRD_PARTY_NOTICES.md.
import { exec, home, window } from "herdr";
import { kinds } from "./disk.js";
import { ancestors } from "./tree.js";
import { emptyGit, parseIgnored, parseForced, parseStatus, parseNumstat } from "./git-parse.js";

export { dirOf, ancestors, within } from "./tree.js";
export { NEW, MODIFIED, DELETED, emptyGit, parseHeader, parseIgnored, parseForced, parseStatus, parseNumstat } from "./git-parse.js";

// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie): the folder
// watch would see it, and every refresh would start the next one. diff.relative=false: numstat's
// paths stay relative to the repo, whatever the user's config says.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "diff.relative=false"];

// Where Git for Windows installs git when the app's PATH lacks it (git installed after the app
// started: a process keeps the PATH of its start). The one that starts is kept per machine.
const WINDOWS_GITS = () => ["C:\\Program Files\\Git\\cmd\\git.exe", `${home()}\\AppData\\Local\\Programs\\Git\\cmd\\git.exe`];
const gits = new Map();
// Runs git; rejects when no git starts (not installed, or the folder is gone).
export async function runGit(args, root, on) {
  const key = on ?? "";
  const known = gits.get(key);
  if (known) return exec(known, [...READ, ...args], { cwd: root, on });
  const tries = ["git", ...(!on && window()?.platform === "windows" ? WINDOWS_GITS() : [])];
  let error;
  for (const cmd of tries) {
    try {
      const r = await exec(cmd, [...READ, ...args], { cwd: root, on });
      gits.set(key, cmd);
      return r;
    } catch (e) { error ??= e; }
  }
  throw error;
}

// At most this many unsure paths are looked up on disk per read, in one kinds() call. One not
// looked up, or whose lookup failed, counts as there: a missing file then says so when opened.
const UNSURE = 2000;
// At most this many paths git lists as one that may be a link to a folder (maybeDirs) are
// looked up per read, in the same kinds() call; as many as Changed shows. Tracked links first.
const MAYBE_DIRS = 2000;

// Everything git says about root (here or on `on`). Outside a repo: { repo: false, known: true }.
// `base`: { top, prefix } from an earlier read of root, which skips rev-parse; the caller drops
// it when `.git` in root comes or goes, or when this says `failed`. If status fails with it,
// or lists paths outside its prefix, root is read again without.
export async function readGit(root, on, base) {
  const g = (args) => runGit(args, root, on);
  const out = emptyGit(true);
  let where = base, failed = false;
  if (!where) {
    const top = await g(["rev-parse", "--show-toplevel", "--show-prefix"]).catch(() => { out.missing = true; return null; });
    if (top?.code !== 0) return out;
    // Only the line ends go: a folder's name may begin or end with a space.
    const [dir, prefix = ""] = top.stdout.split(/\r?\n/);
    where = { top: dir, prefix };
  }
  out.repo = true; out.top = where.top; out.prefix = where.prefix;
  // Status, the ignored paths, the tracked ones an ignore rule matches and whether root is
  // ignored (then the disk for status's unsure paths, all batches at once) beside numstat;
  // without a commit yet, diff HEAD fails and there are no lines to count. In an ignored root
  // every untracked path is ignored: the list of ignored ones isn't needed.
  const status = Promise.all([
    g(["status", "--porcelain=v2", "-z", "--branch", "--no-renames", "--untracked-files=normal", "--ignored=no", "--", "."]).catch(() => null),
    g(["ls-files", "-z", "--others", "--ignored", "--exclude-standard", "--directory", "--", "."]).catch(() => null),
    g(["ls-files", "-z", "--cached", "--ignored", "--exclude-standard", "--", "."]).catch(() => null),
    ignoresRoot(root, on),
  ])
    .then(async ([r, ignoredList, forcedList, ignored]) => {
      if (ignored) out.rootIgnored = true;
      else if (ignoredList?.code === 0) parseIgnored(ignoredList.stdout, out);
      if (forcedList?.code === 0) parseForced(forcedList.stdout, out);
      if (r?.code !== 0) { failed = true; return; }
      if (parseStatus(r.stdout, out) && base) { failed = true; return; }
      // One kinds() call for both: the unsure paths and the ones that may be links to folders,
      // each with its own cap, so neither crowds out the other.
      const unsure = [...out.unsure].slice(0, UNSURE);
      const all = [...out.maybeDirs], untracked = (rel) => out.status.get(rel) === "?";
      const maybe = [...all.filter((rel) => !untracked(rel)), ...all.filter(untracked)].slice(0, MAYBE_DIRS);
      const look = [...new Set([...unsure, ...maybe])];
      if (!look.length) return;
      const found = await kinds(root, look, on).catch(() => null);
      if (!found) return;
      // An unsure path that is a folder (an ignored link to one, out of the index) opens from disk.
      for (const rel of unsure) { const k = found.get(rel); if (!k) out.gone.add(rel); else if (k === "d") out.links.add(rel); }
      for (const rel of maybe) if (found.get(rel) === "d") out.links.add(rel);
    });
  const [, numstat] = await Promise.all([status, g(["diff", "HEAD", "--numstat", "-z", "--no-renames", "--", "."]).catch(() => null)]);
  // The repo found with `base` is gone or moved: find it again.
  if (failed && base) return readGit(root, on);
  // Status failed in the repo just found: not "clean", but unknown.
  if (failed) { out.failed = true; return out; }
  if (numstat?.code === 0) parseNumstat(numstat.stdout, out);
  return out;
}

// Whether git ignores root: root is ignored or lies in an ignored folder, also when that
// folder holds a tracked file (status lists the file then and doesn't name the folder). The
// one test for it: readGit's rootIgnored and listFiles both use it. Null when git can't tell.
export async function ignoresRoot(root, on) {
  const r = await runGit(["check-ignore", "-q", "--no-index", "--", "./"], root, on).catch(() => null);
  return r?.code === 0 ? true : r?.code === 1 ? false : null;
}

// The files git counts as the project below root: tracked and new ones, without what
// .gitignore leaves out, and the folders that hold them. At most `limit` files. Null outside
// a repo, without git, or when git ignores root (it would list little or nothing there): the
// caller reads the disk then. `paths` (relative to root): only those, and what is below them.
// `ignored`: whether git ignores root, when the caller knows (readGit's rootIgnored).
export async function listFiles(root, on, limit, paths, ignored) {
  let r, skip;
  const specs = paths ? paths.map((p) => `:(literal)${p}`) : ["."];
  // -s: tracked entries come as "<mode> <object> <stage>\t<path>" (a submodule's mode is
  // 160000, a folder), new ones as their bare path.
  try {
    [r, skip] = await Promise.all([
      runGit(["ls-files", "-z", "--cached", "--others", "--exclude-standard", "-s", "--abbrev=4", "--", ...specs], root, on),
      paths || ignored !== undefined ? ignored : ignoresRoot(root, on),
    ]);
  } catch { return null; }
  if (r.code !== 0 || skip) return null;
  const dirs = new Set(), files = new Set();
  let full = true;
  const addDirs = (rel) => { for (const a of ancestors(rel)) { if (dirs.has(a)) break; dirs.add(a); } };
  const addDir = (d) => { if (d && !dirs.has(d)) { dirs.add(d); addDirs(d); } };
  const links = [];
  for (const rec of r.stdout.split("\0")) {
    const staged = /^(\d{6}) [0-9a-f]+ \d\t(.*)$/s.exec(rec), entry = staged ? staged[2] : rec;
    if (staged?.[1] === "160000") { addDir(entry); continue; }
    if (staged?.[1] === "120000" && !files.has(entry)) links.push(entry);
    // An untracked repo inside this one comes as a whole folder ("nested/").
    if (entry.endsWith("/")) { addDir(entry.replace(/\/+$/, "")); continue; }
    if (!entry || files.has(entry)) continue; // a conflicted file is listed once per stage
    if (files.size >= limit) { full = false; break; }
    files.add(entry);
    addDirs(entry);
  }
  // A tracked link to a folder is a folder, as in the tree (git doesn't follow it, nor does
  // this). Untracked links stay files: checking every new path costs too much.
  if (links.length) {
    const found = await kinds(root, links, on).catch(() => new Map());
    for (const [rel, kind] of found) if (kind === "d" && files.delete(rel)) addDir(rel);
  }
  return { dirs, files, all: [...dirs, ...files], full, cut: full ? [] : ["files"] };
}
