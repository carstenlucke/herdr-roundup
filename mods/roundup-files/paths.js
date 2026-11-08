// Paths in every system's form. Pure, so tests/paths.test.mjs runs it in node.
// A Windows path comes with \, / or both; a backslash in a POSIX name stays. A path
// starting // is a Windows share: localPath settles that off Windows, where it is a slip.

const WINDOWS = /^[a-z]:[\\/]|^\\\\|^\/\//i;
const ROOT = /^(?:[a-z]:\/|\/\/|\/)/i;
// watchFolder reports Windows paths in verbatim form: \\?\C:\x, \\?\UNC\srv\share\x.
const verbatim = (path) => path.replace(/^\\\\\?\\(UNC\\)?/i, (_, unc) => unc ? "\\\\" : "");

export const isWindows = (path) => WINDOWS.test(path);

export function normalize(path) {
  const source = isWindows(path) ? verbatim(path).replaceAll("\\", "/") : path;
  const root = source.match(ROOT)?.[0] ?? "", out = [];
  for (const part of source.slice(root.length).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop(); else out.push(part);
  }
  return (root || "/") + out.join("/");
}

export function dirname(path) {
  const full = normalize(path), root = full.match(ROOT)[0], cut = full.lastIndexOf("/");
  return cut < root.length ? root : full.slice(0, cut);
}

/** A path as opened on `system`: off Windows, a panel at / joins root and path into //etc/x. */
export const localPath = (path, system) => system === "windows" ? path : path.replace(/^\/{2,}/, "/");

/** `path` as its own system writes it: backslashes on Windows. */
export const native = (path, system) => system === "windows" ? path.replaceAll("/", "\\") : path;

/** A path's form for comparing and as a key: Windows paths ignore case and \ vs /, POSIX ones don't. */
export function pathKey(path) {
  const full = normalize(path);
  return isWindows(full) ? full.toLowerCase() : full;
}

export const samePath = (a, b) => pathKey(a) === pathKey(b);

/** Whether a watchFolder result touches `file`: the file, or its folder when the list overflowed. */
export function changedFile(changed, file) {
  const targets = [pathKey(file), pathKey(dirname(file))];
  return changed.some((path) => targets.includes(pathKey(path)));
}

/** `file` from the repo root when it has one, else from the home folder as ~/…, else as is. */
export function relativePath(file, root, home) {
  const full = normalize(file), target = pathKey(file);
  const under = (base) => {
    if (!base) return null;
    const folder = pathKey(base).replace(/\/$/, "");
    return target.startsWith(folder + "/") ? full.slice(folder.length + 1) : null;
  };
  return under(root) ?? (under(home) !== null ? `~/${under(home)}` : full);
}
