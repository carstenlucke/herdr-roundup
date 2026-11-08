// The panel's rows: All from the disk, the search hits as a tree, Changed from git's paths,
// and the status a row shows. Pure, so tests/rows.test.mjs runs it in node. `git` is what
// git.js's readGit answers; `tree` the panel's { entries, folders, shut }.
//
// Every row: { rel, name, dir, depth, open, gone, disk, link, broken, blocked }. gone: not on
// disk (deleted). link, broken, blocked: as listDir has them, on rows read from disk; other
// rows (search, a folder only git lists) leave them out, so test them with != null and as
// booleans.
// disk: a folder that opens from disk (tree.folders); in Changed, the others fold (tree.shut).
import { compare } from "./disk-rules.js";
import { dirOf, baseOf, ancestors, within } from "./tree.js";

// Changed shows at most this many of git's paths (in git's order): its rows are built on every
// render, about 10 µs a row here, so 2,000 keep a key press near 20 ms (5,000: 70 ms).
export const CHANGED_LIMIT = 2000;

// The folder's entries and those of its open folders, from the disk.
export function diskRows(tree, prefix = "", depth = 0, out = []) {
  for (const e of tree.entries.get(prefix) ?? []) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name, open = e.dir && tree.folders.has(rel);
    out.push({ rel, name: e.name, dir: e.dir, depth, open, gone: false, disk: e.dir, link: e.link, broken: e.broken, blocked: e.blocked });
    if (open && depth < 40) diskRows(tree, rel, depth + 1, out);
  }
  return out;
}

// Search matches as a tree: each match under its folders, all open. Git still lists a file
// deleted but not yet committed; it shows struck through, as in Changed. A path with
// matches below it is a folder even when the index's folders (capped at INDEX_DIRS) lack it.
export function hitRows(hits, dirs, gone) {
  const out = [], keep = new Set(), kids = new Map();
  for (const h of hits) { keep.add(h); for (const a of ancestors(h)) keep.add(a); }
  for (const rel of keep) { const p = dirOf(rel); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(rel); }
  const isDir = (rel) => dirs.has(rel) || kids.has(rel);
  const walk = (p, depth) => {
    const list = (kids.get(p) ?? []).sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || compare(baseOf(a), baseOf(b)));
    for (const rel of list) {
      out.push({ rel, name: baseOf(rel), dir: isDir(rel), depth, open: kids.has(rel), gone: gone.has(rel), disk: false });
      if (kids.has(rel)) walk(rel, depth + 1);
    }
  };
  walk("", 0);
  return out;
}

// Exactly the paths git status lists, as a tree: deleted files too, untracked folders and
// submodules as one row that opens from disk. A search (q, lower case) filters them. The
// first CHANGED_LIMIT of them; `cut`: more were left out.
export function changedRows(g, q, tree) {
  const out = [], kids = new Map(), dirs = new Set([...g.untracked, ...g.links]);
  const add = (rel) => { const p = dirOf(rel); if (!kids.has(p)) kids.set(p, new Set()); kids.get(p).add(rel); };
  let taken = 0, cut = false;
  for (const rel of g.files.keys()) {
    if (q && !rel.toLowerCase().includes(q)) continue;
    if (taken++ >= CHANGED_LIMIT) { cut = true; break; }
    add(rel);
    for (const a of ancestors(rel)) { dirs.add(a); add(a); }
  }
  const order = (list) => list.sort((a, b) => Number(b[1]) - Number(a[1]) || compare(baseOf(a[0]), baseOf(b[0])));
  // A folder git lists file by file: what it lists.
  const walk = (p, depth) => {
    for (const [rel, dir] of order([...(kids.get(p) ?? [])].map((rel) => [rel, dirs.has(rel)]))) {
      const gone = g.gone.has(rel);
      if (dir && !gone && (g.untracked.has(rel) || g.links.has(rel))) {
        const open = tree.folders.has(rel) || (Boolean(q) && kids.has(rel));
        out.push({ rel, name: baseOf(rel), dir: true, depth, open, gone: false, disk: true });
        if (open) mixed(rel, depth + 1);
      } else if (dir && !gone) {
        const open = Boolean(q) || !tree.shut.has(rel);
        out.push({ rel, name: baseOf(rel), dir: true, depth, open, gone: false, disk: false });
        if (open) walk(rel, depth + 1);
      } else out.push({ rel, name: baseOf(rel), dir, depth, open: false, gone, disk: false });
    }
  };
  // A folder that opens from disk: what it holds there and, with it, what git lists below it
  // that isn't there (a file deleted next to new ones). During a search it opens for what
  // the search found in it, and shows what is on disk once opened.
  const mixed = (p, depth) => {
    const disk = tree.folders.has(p) ? tree.entries.get(p) ?? [] : [], here = new Map();
    for (const e of disk) here.set(`${p}/${e.name}`, e);
    const list = new Map([...here].map(([rel, e]) => [rel, e.dir]));
    for (const rel of kids.get(p) ?? []) if (!list.has(rel)) list.set(rel, dirs.has(rel));
    for (const [rel, dir] of order([...list])) {
      const e = here.get(rel), name = baseOf(rel), onDisk = Boolean(e), gone = !onDisk && g.gone.has(rel);
      const link = e?.link ?? null, broken = e?.broken ?? false, blocked = e?.blocked ?? false;
      if (dir && onDisk) {
        const open = tree.folders.has(rel) || (Boolean(q) && kids.has(rel));
        out.push({ rel, name, dir, depth, open, gone, disk: true, link, broken, blocked });
        if (open && depth < 40) mixed(rel, depth + 1);
      } else if (dir && !gone) {
        // Only in git's list (its files deleted): it folds, as in walk.
        const open = Boolean(q) || !tree.shut.has(rel);
        out.push({ rel, name, dir, depth, open, gone, disk: false });
        if (open && depth < 40) mixed(rel, depth + 1);
      } else out.push({ rel, name, dir, depth, open: false, gone, disk: false, link, broken, blocked });
    }
  };
  walk("", 0);
  return { rows: out, cut };
}

// A tracked file is never ignored, though a rule matches it (added with -f), nor its folders.
export const isIgnored = (g, rel) => (g.rootIgnored || within(g.ignored, rel)) && !g.forced.has(rel);

export const underUntracked = (g, rel) => g.rootUntracked || within(g.untracked, rel);

// The letter a row shows (null: none), and whether it is dimmed as ignored. An ignored path
// below an untracked folder (newdir/node_modules) is dimmed, not new.
export function rowStatus(g, rel) {
  const own = g.status.get(rel), ignored = !own && isIgnored(g, rel);
  return { status: own ?? (!ignored && underUntracked(g, rel) ? "?" : null), ignored };
}
