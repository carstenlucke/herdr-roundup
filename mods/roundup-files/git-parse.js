// What git's output says, without running git: the parsers readGit (git.js) feeds, and the empty
// result they fill. No `herdr` import, so tests run them in node.
//
// The parsing is adapted from cybertron288/herdr-mods `filetree` (MIT, (c) 2026 cybertron288),
// itself a port of claude-code-filetree (MIT, (c) 2026 Kurt Buhler). See THIRD_PARTY_NOTICES.md.
import { dirOf, ancestors, within } from "./tree.js";

// Which status a folder shows when its files differ: the most urgent.
const RANK = { "?": 1, A: 2, C: 2, R: 3, T: 3, M: 3, D: 4, U: 5 };
const IGNORED = 5000;
// change: 0 new (untracked or added), 1 modified, 2 deleted.
export const NEW = 0, MODIFIED = 1, DELETED = 2;
const stronger = (a, b) => (!a ? b : (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a);

// repo: inside a work tree; known: git has answered (or there is none); missing: no git started;
// failed: in a repo, but status failed (too large or slow, a broken index): nothing below is known.
export const emptyGit = (known = false) => ({
  repo: false, known, missing: false, failed: false, top: "", prefix: "", branch: null,
  status: new Map(), // rel (file or folder) → letter: ? A M R T D U
  files: new Map(), // rel → change, for every path git status lists (files and untracked folders)
  untracked: new Set(), // untracked folders git lists as a whole ("dir/")
  links: new Set(), // submodules and links to folders: folders, though git lists them as one path
  maybeDirs: new Set(), // listed paths that may be links to folders: tracked links, untracked paths without "/"
  gone: new Set(), // listed paths not in the working tree (a deletion in the index alone isn't one)
  unsure: new Set(), // ones git can't place: below an untracked or ignored folder; gone if the disk agrees
  rootUntracked: false, // the shown folder is itself one of them
  ignored: new Set(), // ignored files and folders (at most IGNORED)
  rootIgnored: false, // the shown folder is ignored, or lies in an ignored folder
  forced: new Set(), // tracked files an ignore rule matches (added with -f), and their folders
  diff: new Map(), // rel (file or folder, "" the whole) → [added, deleted] lines against HEAD
  counts: new Map(), // folder ("" the whole) → [new, modified, deleted]
  records: 0, // lines of git status, without the branch line
});

// git status --porcelain=v2 --branch: its headers don't follow the user's language (v1's
// "## main...origin/main [ahead 1]" does: "[voraus 1]" in German).
//   # branch.oid <sha> | (initial)    # branch.head <name> | (detached)
//   # branch.upstream <name>          # branch.ab +<ahead> -<behind> (absent: upstream gone)
export function parseHeader(rec, git) {
  const [, key, value = ""] = /^# (\S+) ?(.*)$/s.exec(rec) ?? [];
  const b = (git.branch ??= { head: "", detached: false, upstream: "", ahead: 0, behind: 0, gone: false });
  if (key === "branch.head") { b.detached = value === "(detached)"; b.head = b.detached ? "HEAD" : value; }
  else if (key === "branch.upstream") { b.upstream = value; b.gone = true; }
  else if (key === "branch.ab") { const m = /^\+(\d+) -(\d+)$/.exec(value); b.ahead = Number(m?.[1] ?? 0); b.behind = Number(m?.[2] ?? 0); b.gone = false; }
}

// git ls-files -z --others --ignored --exclude-standard --directory, run in root: the ignored
// paths below it, relative to it. An ignored folder comes as a whole without being walked
// ("node_modules/"), and so does a folder git doesn't track that holds only ignored files
// ("logs/" for `logs/*`), as status --ignored=traditional lists them. Traditional walks every
// ignored folder on every refresh, and "matching" lists the second kind file by file. ls-files
// also lists each path below such a folder: those are left out here, so they don't count
// against IGNORED. Read before parseStatus, which needs it for its unsure paths.
export function parseIgnored(stdout, git) {
  for (const rec of stdout.split("\0")) {
    const rel = rec.replace(/\/$/, "");
    if (!rel || within(git.ignored, dirOf(rel))) continue;
    if (git.ignored.size >= IGNORED) break;
    git.ignored.add(rel);
  }
}

// git ls-files -z --cached --ignored --exclude-standard, run in root: the tracked files an
// ignore rule matches (added with `git add -f`), relative to root. They and their folders
// aren't ignored, though they lie in an ignored folder or the shown folder is one.
export function parseForced(stdout, git) {
  for (const rel of stdout.split("\0")) {
    if (!rel) continue;
    git.forced.add(rel);
    for (const a of ancestors(rel)) { if (git.forced.has(a)) break; git.forced.add(a); }
  }
}

// git status --porcelain=v2 -z --branch --no-renames --ignored=no (parseIgnored reads the
// ignored paths). Entries:
//   1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>          (changed; "." in XY: unchanged)
//   u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path> (unmerged)
//   ? <path> (untracked; a folder ends in /)
// <sub> starts with S for a submodule. <mW>, the working tree's mode, is 000000 where the path
// isn't there for git: also after `git rm --cached`, but then git lists the file as new too.
// Answers how many paths lay outside git.prefix: status runs on "." alone, so any means the
// prefix is wrong (a repo made between root and the one it was read in).
export function parseStatus(stdout, git) {
  const map = (p) => (p.startsWith(git.prefix) ? p.slice(git.prefix.length).replace(/\/$/, "") : null);
  const up = (rel, fn) => { for (const d of [...ancestors(rel), ""]) fn(d); };
  const absent = new Set(), present = new Set();
  let outside = 0;
  for (const rec of stdout.split("\0")) {
    if (rec.startsWith("# ")) { parseHeader(rec, git); continue; }
    const kind = rec[0];
    let xy, raw, sub = "", worktree = "";
    if (kind === "?") { xy = "??"; raw = rec.slice(2); }
    else if (kind === "1" || kind === "u") {
      const fields = rec.split(" "), n = kind === "1" ? 8 : 10;
      if (fields.length <= n) continue;
      xy = fields[1].replace(/\./g, " "); raw = fields.slice(n).join(" ");
      sub = fields[2]; worktree = fields[kind === "1" ? 5 : 6];
    } else continue;
    const rel = map(raw);
    if (rel === null) { outside++; continue; }
    // The shown folder itself untracked ("? sub/" run from sub): everything below is new.
    if (rel === "" && xy === "??") { git.rootUntracked = true; git.records++; git.counts.set("", [1, 0, 0]); continue; }
    if (!rel) continue;
    if (xy === "??") present.add(rel);
    if (sub.startsWith("S")) git.links.add(rel);
    // Git doesn't follow a link: a link to a folder comes as one path, untracked without "/".
    // Only the disk tells (readGit): mode 120000 is a tracked link that is there.
    else if (worktree === "120000" || (xy === "??" && !raw.endsWith("/"))) git.maybeDirs.add(rel);
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
  return outside;
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
