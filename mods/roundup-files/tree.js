// Paths relative to the shown folder: "/"-separated, "" for the folder itself, and the way
// back to an absolute path. Pure, so tests/tree.test.mjs runs it in node.

export const dirOf = (rel) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
export const baseOf = (rel) => rel.slice(rel.lastIndexOf("/") + 1);
export function ancestors(rel) {
  const out = [];
  for (let d = dirOf(rel); d; d = dirOf(d)) out.push(d);
  return out;
}
// Whether rel or one of its folders is in set.
export function within(set, rel) {
  if (!set.size) return false;
  for (let r = rel; r; r = dirOf(r)) if (set.has(r)) return true;
  return false;
}

// abs relative to root: "" for root itself, null outside it. Either may use "\".
export function relTo(root, abs) {
  if (!root || !abs) return null;
  const a = abs.replace(/\\/g, "/"), r = root.replace(/\\/g, "/").replace(/\/+$/, "");
  if (a === r) return "";
  return a.startsWith(r + "/") ? a.slice(r.length + 1) : null;
}
// rel is "/"-separated; a Windows root (C:\ or \\server) gets "\" throughout.
export const join = (root, rel) => {
  if (!rel) return root;
  const sep = /^([A-Za-z]:\\|\\\\)/.test(root) ? "\\" : "/";
  return (/[\\/]$/.test(root) ? root : root + sep) + (sep === "/" ? rel : rel.replace(/\//g, "\\"));
};
