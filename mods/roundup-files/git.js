// Git, read-only: each path's status, folders' strongest status and counts, +/− lines,
// the branch and its upstream. Paths are "/"-separated and relative to the shown folder.
//
// The parsing is adapted from cybertron288/herdr-mods `filetree` (MIT, (c) 2026
// cybertron288), itself a port of claude-code-filetree (MIT, (c) 2026 Kurt Buhler).
// See THIRD_PARTY_NOTICES.md.
import { exec } from "herdr";
import { kinds } from "./disk.js";

// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie): the folder
// watch would see it, and every refresh would start the next one. diff.relative=false: numstat's
// paths stay relative to the repo, whatever the user's config says.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "diff.relative=false"];
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
// Whether rel or one of its folders is in set.
export function within(set, rel) {
  if (!set.size) return false;
  for (let r = rel; r; r = dirOf(r)) if (set.has(r)) return true;
  return false;
}
// At most this many unsure paths are looked up on disk per read, 500 per lookup. One not looked
// up, or whose lookup failed, counts as there: a missing file then says so when it is opened.
const UNSURE = 2000, BATCH = 500;

// repo: inside a work tree; known: git has answered (or there is none).
export const emptyGit = (known = false) => ({
  repo: false, known, top: "", prefix: "", branch: null,
  status: new Map(), // rel (file or folder) → letter: ? A M R T D U
  files: new Map(), // rel → change, for every path git status lists (files and untracked folders)
  untracked: new Set(), // untracked folders git lists as a whole ("dir/")
  links: new Set(), // submodules: folders, though git lists them as one path
  gone: new Set(), // listed paths not in the working tree (a deletion in the index alone isn't one)
  unsure: new Set(), // ones git can't place: below an untracked or ignored folder; gone if the disk agrees
  rootUntracked: false, // the shown folder is itself one of them
  ignored: new Set(), // ignored files and folders (at most IGNORED)
  rootIgnored: false, // the shown folder is ignored, or lies in an ignored folder
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

// git status --porcelain=v2 -z --branch --no-renames --ignored=matching. Entries:
//   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>          (changed; "." in XY: unchanged)
//   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path> (unmerged)
//   ? <path> (untracked; a folder ends in /)   ! <path> (ignored)
// <sub> starts with S for a submodule. <mW>, the working tree's mode, is 000000 where the path
// isn't there for git: also after `git rm --cached`, but then git lists the file as new too.
// "matching" lists an ignored folder without walking it ("traditional" walks all of it, every
// node_modules and target, on every refresh), and the ignored files of a folder that isn't
// ignored itself one by one ("traditional" lists that folder when all it holds is ignored).
export function parseStatus(stdout, git) {
  const map = (p) => (p.startsWith(git.prefix) ? p.slice(git.prefix.length).replace(/\/$/, "") : null);
  const up = (rel, fn) => { for (const d of [...ancestors(rel), ""]) fn(d); };
  const absent = new Set(), present = new Set();
  for (const rec of stdout.split("\0")) {
    if (rec.startsWith("# ")) { parseHeader(rec, git); continue; }
    const kind = rec[0];
    let xy, raw, sub = "", worktree = "";
    if (kind === "?" || kind === "!") { xy = kind + kind; raw = rec.slice(2); }
    else if (kind === "1" || kind === "u") {
      const fields = rec.split(" "), n = kind === "1" ? 8 : 10;
      if (fields.length <= n) continue;
      xy = fields[1].replace(/\./g, " "); raw = fields.slice(n).join(" ");
      sub = fields[2]; worktree = fields[kind === "1" ? 5 : 6];
    } else continue;
    // The shown folder ignored, or inside an ignored folder: git names only that folder.
    if (xy === "!!" && raw.endsWith("/") && git.prefix.startsWith(raw)) { git.rootIgnored = true; continue; }
    const rel = map(raw);
    // The shown folder itself untracked ("? sub/" run from sub): everything below is new.
    if (rel === "" && xy === "??") { git.rootUntracked = true; git.records++; git.counts.set("", [1, 0, 0]); continue; }
    if (!rel) continue;
    if (xy === "!!") { if (git.ignored.size < IGNORED) git.ignored.add(rel); continue; }
    if (xy === "??") present.add(rel);
    if (sub.startsWith("S")) git.links.add(rel);
    if (worktree === "000000") absent.add(rel);
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
  // Git lists a file it doesn't track and that is there as new, unless it lists the folder
  // above as a whole or leaves it out as ignored: then only the disk can tell.
  for (const rel of absent) {
    if (present.has(rel)) continue;
    if (git.rootUntracked || git.rootIgnored || within(git.untracked, rel) || within(git.ignored, rel)) git.unsure.add(rel);
    else git.gone.add(rel);
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
  // Status (and then the disk for its unsure paths, all batches at once) beside numstat;
  // without a commit yet, diff HEAD fails and there are no lines to count.
  const status = g(["status", "--porcelain=v2", "-z", "--branch", "--no-renames", "--untracked-files=normal", "--ignored=matching", "--", "."])
    .catch(() => null)
    .then((r) => {
      if (r?.code !== 0) return;
      parseStatus(r.stdout, git);
      const unsure = [...git.unsure].slice(0, UNSURE), batches = [];
      for (let i = 0; i < unsure.length; i += BATCH) batches.push(unsure.slice(i, i + BATCH));
      return Promise.all(batches.map(async (batch) => {
        const found = await kinds(root, batch, on).catch(() => null);
        if (found) for (const rel of batch) if (!found.has(rel)) git.gone.add(rel);
      }));
    });
  const [, numstat] = await Promise.all([status, g(["diff", "HEAD", "--numstat", "-z", "--no-renames", "--", "."]).catch(() => null)]);
  if (numstat?.code === 0) parseNumstat(numstat.stdout, git);
  return git;
}

// The files git counts as the project below root: tracked and new ones, without what
// .gitignore leaves out, and the folders that hold them. At most `limit` files. Null outside
// a repo or without git: the caller reads the disk then. `paths` (relative to root): only
// those, and what is below them.
export async function listFiles(root, on, limit, paths) {
  let r;
  const specs = paths ? paths.map((p) => `:(literal)${p}`) : ["."];
  // -s: tracked entries come as "<mode> <object> <stage>\t<path>" (a submodule's mode is
  // 160000, a folder), new ones as their bare path.
  try { r = await exec("git", [...READ, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "-s", "--abbrev=4", "--", ...specs], { cwd: root, on }); }
  catch { return null; }
  if (r.code !== 0) return null;
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
  for (let i = 0; i < links.length; i += BATCH) {
    const found = await kinds(root, links.slice(i, i + BATCH), on).catch(() => new Map());
    for (const [rel, kind] of found) if (kind === "d" && files.delete(rel)) addDir(rel);
  }
  return { dirs, files, all: [...dirs, ...files], full };
}
