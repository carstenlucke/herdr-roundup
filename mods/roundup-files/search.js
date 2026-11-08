// Search in All: matching against the index, where the cursor goes after it, when the index
// is read again, and what a batch of the folder watch does to the index and the tree. Pure,
// so tests/search.test.mjs runs it in node: the time (`now`), the shown folder, its machine's
// home and git's answer come in as parameters.
//
// An index: { dirs: Set, all: [], lower: [] (all in lower case), full, cut, files (how many
// of all are files), source, from ("git" or "disk"), known: Set (all), added: Set (taken in
// by recheck), pending, checking, at, stale, held, dirty }.
import { INDEX_DIRS, INDEX_PATHS, prunedName, prunedAbove, indexDepth } from "./disk-rules.js";
import { dirOf, baseOf, relTo } from "./tree.js";
import { isIgnored } from "./rows.js";

export const FIND_LIMIT = 200;
// A search index older than this is read again on the next search, whatever the watch said.
export const INDEX_AGE = 300000;
// After a file the index knows changed (it may be gone), the index is read again once it is
// this old: at most one rebuild per 30 s while files keep changing.
export const DIRTY_AGE = 30000;
// After a folder changed (or too many paths to list), the index is read again once it is this
// old: at most one rebuild per 3 s while a build keeps making folders.
export const STALE_AGE = 3000;
// More new paths than this in one batch read the index again instead of checking each.
export const CHECK_PATHS = 100;

// The hits for q (trimmed, lower case): paths whose name holds it first, then those whose
// path does, no path twice, the first FIND_LIMIT.
export function match(index, q) {
  const matches = [], named = [];
  index.all.forEach((rel, i) => {
    const low = index.lower[i];
    if (!low.includes(q)) return;
    matches.push(rel);
    if (baseOf(low).includes(q)) named.push(rel);
  });
  return [...new Set([...named, ...matches])].slice(0, FIND_LIMIT);
}

// Where the cursor goes after a search: it stays on a hit or on a folder above one (both are
// rows of the hit tree), else the first hit. `scroll`: whether the list scrolls to it; a quiet
// rerun only when the cursor changed.
export function cursorAfter(hits, before, quiet) {
  const kept = Boolean(before) && hits.some((h) => h === before || h.startsWith(`${before}/`));
  const cursor = kept ? before : hits[0] ?? "";
  return { cursor, scroll: !quiet || cursor !== before };
}

// Whether the next search reads the index again.
export function outdated(i, now) {
  const age = now - i.at;
  return (i.stale && age >= STALE_AGE) || age >= INDEX_AGE || (i.dirty && age >= DIRTY_AGE);
}

// What a change in the shown folder's .git does to an index from git: excludes and config
// (core.excludesFile) change its list, so it is read again; the index (`git add -f`,
// `git rm --cached` of an ignored file) changes on every add and commit, so it only comes
// out dirty, read again once DIRTY_AGE old. Anything else in .git: nothing (null).
export const gitMeta = (rel) => (rel === ".git/info/exclude" || rel === ".git/config" ? "stale" : rel === ".git/index" ? "dirty" : null);

// Whether a change at rel leaves the tree and git's marks as they are, so it needn't
// refresh: its folder isn't open, and git ignores it (a build in node_modules or target) or
// there is no repo. .git isn't ignored: a commit or `git add` refreshes, and outside a repo
// a `git init` in the shown folder does. A tracked file an ignore rule matches isn't ignored
// either (isIgnored), so its edits show at once. The 10s timer still catches what this misses.
export function unseen(rel, g, folders) {
  if (!rel || !g.known) return false;
  const dir = dirOf(rel);
  if (!dir || folders.has(dir)) return false;
  if (!g.repo) return !rel.startsWith(".git/");
  return isIgnored(g, rel) && !g.status.has(rel);
}

// Whether recheck can take rel into the index: not into one a limit cut short; from the
// disk, only into a folder the index holds (unindexed already left out what is too deep).
export function placeable(index, rel) {
  if (!index.full) return false;
  if (index.from === "git") return true;
  const dir = dirOf(rel);
  return !dir || index.dirs.has(dir);
}

// Whether an index never holds rel: .git and, from git, what it ignores; from the disk, what
// lies inside a pruned folder or deeper than it reads. A path named like a pruned folder
// may be a file, which the disk index holds: classify leaves that to recheck.
export function unindexed(rel, fromGit, g, root, home) {
  if (!rel) return false;
  if (rel.split("/").includes(".git")) return true;
  return fromGit ? isIgnored(g, rel) : prunedAbove(root, rel, home) || rel.split("/").length > indexDepth(root, home);
}

// One batch of the folder watch. A folder the index knows, or the root (too many changes to
// list), means the folder structure may have changed: the index goes stale. A path it doesn't
// know, and one it took in that way, is checked on its own (recheck), so a save through a
// temporary file doesn't read the whole index again; one it can't place this way makes it
// stale. A file it knows may have been deleted: the index comes out dirty. Paths the index
// never holds don't count: .git and, from the disk, the pruned folders, from git, what it
// ignores. From git, a changed .gitignore counts, and so does what in .git changes git's list
// without a path changing (gitMeta). A change during an index build (`job`) may be missing
// from it: the job is marked, and its index comes out dirty.
//
// s: { root, real (root with links resolved, or null), home, git, folders, index, job }.
// It marks index (stale, dirty) and job (changedGit, changedDisk) as changed() did, and
// answers { shown: the tree refreshes, drops: how often `.git` itself changed (a repo made
// or removed here), recheck: the paths to check }.
export function classify(paths, s) {
  const { root, real, home, git, folders, index, job } = s, fromGit = index?.from === "git";
  const check = [];
  let drops = 0;
  // A path it can't place, or none at all, refreshes as well: it can't tell.
  let shown = !paths.length;
  for (const abs of paths) {
    const rel = relTo(root, abs) ?? relTo(real, abs);
    if (rel === null) { shown = true; continue; }
    if (rel === ".git") drops++;
    if (!shown && !unseen(rel, git, folders)) shown = true;
    // Either source may end up read from the other (ensureIndex): both rules are kept.
    const meta = gitMeta(rel);
    if (job) {
      if (baseOf(rel) === ".gitignore" || meta || !unindexed(rel, true, git, root, home)) job.changedGit = true;
      if (!unindexed(rel, false, git, root, home)) job.changedDisk = true;
    }
    if (!index) continue;
    if (fromGit && (baseOf(rel) === ".gitignore" || meta === "stale")) { index.stale = true; continue; }
    if (fromGit && meta === "dirty") { index.dirty = true; continue; }
    if (unindexed(rel, fromGit, git, root, home)) continue;
    // From the disk, a new path named like a pruned folder (a build's `dist`, say): recheck
    // tells a file from a folder. One recheck can't place is most likely the folder.
    if (!fromGit && !index.known.has(rel) && prunedName(root, rel, home) && !placeable(index, rel)) continue;
    if (rel === "" || index.dirs.has(rel)) index.stale = true;
    else if (index.added.has(rel) || (!index.known.has(rel) && placeable(index, rel))) check.push(rel);
    // A capped index can't place it, and reading it again would be cut short as well.
    else if (!index.known.has(rel)) { if (index.full) index.stale = true; else index.dirty = true; }
    else index.dirty = true;
  }
  if (index && !index.stale && check.length > CHECK_PATHS) index.stale = true;
  return { shown, drops, recheck: index && !index.stale ? check : [] };
}

// What recheck read about rels (files and dirs that are there now), put into the index: a
// new file goes in (from git, with what git lists below a new folder and the folders above),
// one it took in this way and that is gone comes out. "stale" when a limit would be passed
// (the index is read again, which cuts it and says so), "moved" when it changed, else "same".
// From git only the files count (listFiles caps no folders); folders aren't files.
export function applyRecheck(index, rels, files, dirs) {
  const newDirs = new Set(dirs.filter((d) => !index.dirs.has(d) && !index.known.has(d)));
  const newFiles = new Set(files.filter((f) => !index.known.has(f) && !newDirs.has(f)));
  if (index.files + newFiles.size > INDEX_PATHS) return "stale";
  if (index.from === "disk" && index.dirs.size + newDirs.size > INDEX_DIRS) return "stale";
  let moved = false;
  const take = (rel) => { if (index.known.has(rel)) return; index.all.push(rel); index.lower.push(rel.toLowerCase()); index.known.add(rel); index.added.add(rel); moved = true; };
  for (const d of dirs) if (!index.dirs.has(d)) { if (index.known.has(d)) index.files--; index.dirs.add(d); take(d); }
  for (const f of files) if (!index.known.has(f)) { take(f); index.files++; }
  // What it took in and is gone now, with what it took in below it.
  const here = new Set([...files, ...dirs]);
  const gone = rels.filter((rel) => index.added.has(rel) && !here.has(rel));
  const out = (p) => index.added.has(p) && !here.has(p) && gone.some((g) => p === g || p.startsWith(`${g}/`));
  if (gone.length) {
    const drop = new Set([...index.added].filter(out));
    index.lower = index.lower.filter((_, i) => !drop.has(index.all[i]));
    index.all = index.all.filter((p) => !drop.has(p));
    for (const p of drop) { if (!index.dirs.delete(p)) index.files--; index.added.delete(p); index.known.delete(p); }
    moved = true;
  }
  return moved ? "moved" : "same";
}
