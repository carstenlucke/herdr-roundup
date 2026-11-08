// What the disk index leaves out and how deep it reads, the tree's order, and the limits
// disk.js reads by. Pure, so tests/disk-rules.test.mjs runs it in node: `home` is the home
// of the folder's machine ("" when not known), which disk.js passes in.

export const PER_FOLDER = 500;
export const INDEX_DIRS = 20000, INDEX_PATHS = 40000;
// Search: folders it never enters.
export const PRUNE = [".git", "node_modules", "target", ".venv", "venv", "__pycache__", "dist", "build", ".next", ".nuxt", ".cache", ".gradle", ".idea", "vendor", "Pods", ".tox", ".mypy_cache", ".pytest_cache", "coverage"];
export const HOME_PRUNE = ["Library", "AppData", ".Trash"];

export const psQuote = (s) => "'" + s.replace(/['‘’‚‛]/g, "$&$&") + "'";

export const trimSlash = (p) => p.replace(/\/+$/, "") || "/";
const isHome = (root, home) => Boolean(home) && trimSlash(root) === trimSlash(home);
export const atHome = (root, home) => root === "/" || isHome(root, home);
// Whether a folder at rel below root is never indexed. A file there is. HOME_PRUNE: at home
// only its top level (~/Library, not a project's Library), at / at any depth.
export const prunedName = (root, rel, home) => {
  const name = rel.slice(rel.lastIndexOf("/") + 1);
  return PRUNE.includes(name) || (HOME_PRUNE.includes(name) && (root === "/" || (isHome(root, home) && !rel.includes("/"))));
};
// Whether rel lies inside a pruned folder below root (rel itself may still be a file).
export const prunedAbove = (root, rel, home) => {
  const parts = rel.split("/");
  return parts.slice(0, -1).some((_, i) => prunedName(root, parts.slice(0, i + 1).join("/"), home));
};
// How many levels below root buildIndex reads.
export const indexDepth = (root, home) => (atHome(root, home) ? 5 : 12);

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
