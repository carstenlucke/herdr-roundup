// Git, read-only: each path's status, folders' strongest status and counts, +/− lines,
// the branch and its upstream. Paths are "/"-separated and relative to the shown folder.
//
// The parsing is adapted from cybertron288/herdr-mods `filetree` (MIT, (c) 2026
// cybertron288), itself a port of claude-code-filetree (MIT, (c) 2026 Kurt Buhler).
// See THIRD_PARTY_NOTICES.md.
import { exec } from "herdr";

// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie): the folder
// watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
// Which status a folder shows when its files differ: the most urgent.
const RANK = { "?": 1, A: 2, C: 2, R: 3, T: 3, M: 3, D: 4, U: 5 };
const IGNORED = 5000;
// change: 0 new (untracked or added), 1 modified, 2 deleted.
export const NEW = 0, MODIFIED = 1, DELETED = 2;

export const dirOf = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
export function ancestors(rel) {
  const out = [];
  for (let d = dirOf(rel); d; d = dirOf(d)) out.push(d);
  return out;
}
const stronger = (a, b) => (!a ? b : (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);

// repo: inside a work tree; known: git has answered (or there is none).
export const emptyGit = (known = false) => ({
  repo: false, known, top: "", prefix: "", branch: null,
  status: new Map(), // rel (file or folder) → letter: ? A M R T D U
  files: new Map(), // rel → change, for every path git status lists (files and untracked folders)
  untracked: new Set(), // untracked folders git lists as a whole ("dir/")
  rootUntracked: false, // the shown folder is itself one of them
  ignored: new Set(), // ignored files and folders (at most IGNORED)
  diff: new Map(), // rel (file or folder, "" the whole) → [added, deleted] lines against HEAD
  counts: new Map(), // folder ("" the whole) → [new, modified, deleted]
  records: 0, // lines of git status, without the branch line
});

// git status --porcelain=v2 --branch: its headers don't follow the user's language (v1's
// "## main...origin/main [ahead 1]" does: "[voraus 1]" in German).
//   # branch.oid <sha> | (initial)    # branch.head <name> | (detached)
//   # branch.upstream <name>          # branch.ab +<ahead> -<behind> (absent: upstream gone)
function parseHeader(rec, git) {
  const [, key, value = ""] = /^# (\S+) ?(.*)$/s.exec(rec) ?? [];
  const b = (git.branch ??= { head: "", detached: false, upstream: "", ahead: 0, behind: 0, gone: false });
  if (key === "branch.head") { b.detached = value === "(detached)"; b.head = b.detached ? "HEAD" : value; }
  else if (key === "branch.upstream") { b.upstream = value; b.gone = true; }
  else if (key === "branch.ab") { const m = /^\+(\d+) -(\d+)$/.exec(value); b.ahead = Number(m?.[1] ?? 0); b.behind = Number(m?.[2] ?? 0); b.gone = false; }
}

// git status --porcelain=v2 -z --branch --no-renames --ignored=traditional. Entries:
//   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>          (changed; "." in XY: unchanged)
//   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path> (unmerged)
//   ? <path> (untracked; a folder ends in /)   ! <path> (ignored)
export function parseStatus(stdout, git) {
  const map = (p) => (p.startsWith(git.prefix) ? p.slice(git.prefix.length).replace(/\/$/, "") : null);
  const up = (rel, fn) => { for (const d of [...ancestors(rel), ""]) fn(d); };
  for (const rec of stdout.split("\0")) {
    if (rec.startsWith("# ")) { parseHeader(rec, git); continue; }
    const kind = rec[0];
    let xy, raw;
    if (kind === "?" || kind === "!") { xy = kind + kind; raw = rec.slice(2); }
    else if (kind === "1" || kind === "u") {
      const fields = rec.split(" "), n = kind === "1" ? 8 : 10;
      if (fields.length <= n) continue;
      xy = fields[1].replace(/\./g, " "); raw = fields.slice(n).join(" ");
    } else continue;
    const rel = map(raw);
    // The shown folder itself untracked ("? sub/" run from sub): everything below is new.
    if (rel === "" && xy === "??") { git.rootUntracked = true; git.records++; git.counts.set("", [1, 0, 0]); continue; }
    if (!rel) continue;
    if (xy === "!!") { if (git.ignored.size < IGNORED) git.ignored.add(rel); continue; }
    git.records++;
    const conflict = kind === "u" || /U/.test(xy) || xy === "AA" || xy === "DD";
    const change = conflict ? MODIFIED : xy === "??" || (xy.includes("A") && !xy.includes("D")) ? NEW : xy.includes("D") ? DELETED : MODIFIED;
    const letter = xy === "??" ? "?" : conflict ? "U" : ["D", "M", "R", "C", "A", "T"].filter((c) => xy.includes(c)).reduce(stronger, "") || "M";
    if (xy === "??" && raw.endsWith("/")) git.untracked.add(rel);
    git.files.set(rel, git.files.has(rel) ? Math.max(git.files.get(rel), change) : change);
    up(rel, (d) => { const c = git.counts.get(d) ?? [0, 0, 0]; c[change]++; git.counts.set(d, c); });
    git.status.set(rel, stronger(git.status.get(rel), letter));
    up(rel, (d) => git.status.set(d, stronger(git.status.get(d), letter)));
  }
}

// git diff HEAD --numstat -z --no-renames: "added\tdeleted\tpath\0"; binary files say "-".
export function parseNumstat(stdout, git) {
  for (const rec of stdout.split("\0")) {
    const m = /^(-|\d+)\t(-|\d+)\t(.+)$/s.exec(rec);
    if (!m || !m[3].startsWith(git.prefix)) continue;
    const rel = m[3].slice(git.prefix.length), add = Number(m[1]) || 0, del = Number(m[2]) || 0;
    for (const d of [rel, ...ancestors(rel), ""]) { const v = git.diff.get(d) ?? [0, 0]; git.diff.set(d, [v[0] + add, v[1] + del]); }
  }
}

// Everything git says about root (here or on `on`). Outside a repo: { repo: false, known: true }.
export async function readGit(root, on) {
  const g = (args) => exec("git", [...READ, ...args], { cwd: root, on });
  const git = emptyGit(true);
  const top = await g(["rev-parse", "--show-toplevel", "--show-prefix"]).catch(() => null);
  if (top?.code !== 0) return git;
  const [dir, prefix = ""] = top.stdout.split("\n");
  git.repo = true; git.top = dir.trim(); git.prefix = prefix.trim();
  // Both at once; without a commit yet, diff HEAD fails and there are no lines to count.
  const [status, numstat] = await Promise.all([
    g(["status", "--porcelain=v2", "-z", "--branch", "--no-renames", "--untracked-files=normal", "--ignored=traditional", "--", "."]).catch(() => null),
    g(["diff", "HEAD", "--numstat", "-z", "--no-renames", "--", "."]).catch(() => null),
  ]);
  if (status?.code === 0) parseStatus(status.stdout, git);
  if (numstat?.code === 0) parseNumstat(numstat.stdout, git);
  return git;
}

// The files git counts as the project below root: tracked and new ones, without what
// .gitignore leaves out, and the folders that hold them. At most `limit` files. Null outside
// a repo or without git: the caller reads the disk then.
export async function listFiles(root, on, limit) {
  let r;
  // -s: tracked entries come as "<mode> <object> <stage>\t<path>" (a submodule's mode is
  // 160000, a folder), new ones as their bare path.
  try { r = await exec("git", [...READ, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "-s", "--abbrev=4", "--", "."], { cwd: root, on }); }
  catch { return null; }
  if (r.code !== 0) return null;
  const dirs = new Set(), files = new Set();
  let full = true;
  const addDirs = (rel) => { for (const a of ancestors(rel)) { if (dirs.has(a)) break; dirs.add(a); } };
  const addDir = (d) => { if (d && !dirs.has(d)) { dirs.add(d); addDirs(d); } };
  for (const rec of r.stdout.split("\0")) {
    const staged = /^(\d{6}) [0-9a-f]+ \d\t(.*)$/s.exec(rec), entry = staged ? staged[2] : rec;
    if (staged?.[1] === "160000") { addDir(entry); continue; }
    // An untracked repo inside this one comes as a whole folder ("nested/").
    if (entry.endsWith("/")) { addDir(entry.replace(/\/+$/, "")); continue; }
    if (!entry || files.has(entry)) continue; // a conflicted file is listed once per stage
    if (files.size >= limit) { full = false; break; }
    files.add(entry);
    addDirs(entry);
  }
  return { dirs, all: [...dirs, ...files], full };
}
