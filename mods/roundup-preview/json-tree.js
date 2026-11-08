// A JSON value as the rows of a collapsible tree. A node's path is a JSON
// Pointer ("" the root, "/a/0" a's first item); `expanded` holds the open ones.
// Pure (no Herdr imports); this repo has no tests for it yet.

const pointer = (path, key) => `${path}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
const kindOf = (v) => v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
const isContainer = (v) => v !== null && typeof v === "object";

function summary(v) {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length;
  return Array.isArray(v) ? `[ ${n} item${n === 1 ? "" : "s"} ]` : `{ ${n} key${n === 1 ? "" : "s"} }`;
}

/** [{ path, depth, key, kind, text, open }] for every visible node, in order. */
export function flatten(value, expanded) {
  const rows = [];
  const walk = (v, path, depth, key) => {
    const container = isContainer(v), open = container && expanded.has(path);
    rows.push({ path, depth, key, kind: kindOf(v), open, text: container ? summary(v) : typeof v === "string" ? JSON.stringify(v) : String(v) });
    if (open) for (const [k, child] of Object.entries(v)) walk(child, pointer(path, k), depth + 1, Array.isArray(v) ? Number(k) : k);
  };
  walk(value, "", 0, null);
  return rows;
}

/** The paths of every container down to `depth` levels below the root (Infinity: all). */
export function containers(value, depth = Infinity) {
  const out = new Set();
  const walk = (v, path, d) => {
    if (!isContainer(v) || d > depth) return;
    out.add(path);
    for (const [k, child] of Object.entries(v)) walk(child, pointer(path, k), d + 1);
  };
  walk(value, "", 0);
  return out;
}

/** The value a JSON Pointer names inside `value`, or undefined. */
export function valueAt(value, path) {
  let v = value;
  for (const part of path.split("/").slice(1)) {
    if (v === null || typeof v !== "object") return undefined;
    v = v[part.replaceAll("~1", "/").replaceAll("~0", "~")];
  }
  return v;
}

/** Alt-click: opens `path` and every container under it, or closes them all when it was open. */
export function toggleDeep(value, expanded, path) {
  const out = new Set(expanded), opening = !expanded.has(path);
  for (const sub of containers(valueAt(value, path))) {
    const full = path + sub;
    if (opening) out.add(full); else out.delete(full);
  }
  return out;
}
