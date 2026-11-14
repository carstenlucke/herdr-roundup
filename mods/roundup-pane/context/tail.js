// Reading the end of an agent's session file: a transcript reaches 8.5 MB with single lines of
// 1.3 MB, and readTextFile stops at 1 MiB. So the end is read with `io.tail` (tail -c), 256 KiB
// first and four times more while what is looked for isn't in it, up to a little under exec's
// 8 MiB. Pure: `io` comes in.

export const FIRST = 256 * 1024;
export const MAX = 7 * 1024 * 1024;

// The complete lines of a chunk from the end of a file. A chunk that doesn't start at the file's
// beginning (`whole` false) starts inside a line: that piece goes. A last line without its newline
// is still being written: it goes too.
export function completeLines(text, whole) {
  const parts = text.split("\n");
  parts.pop(); // after the last "\n": "" for a finished file, a line being written otherwise
  if (!whole) parts.shift();
  return parts;
}

// The lines from the end backwards, each parsed; lines that aren't JSON are skipped.
export function* fromEnd(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (!l) continue;
    let v;
    try { v = JSON.parse(l); } catch { continue; }
    if (v && typeof v === "object") yield v;
  }
}

// Reads ever larger ends of `path` until `find(lines, whole)` gives an answer. `find` returns
// undefined for "not in here, read more"; anything else (null included) is the answer.
// No file, or nothing found in the largest end or the whole file: null.
export async function scanTail(io, path, find, { first = FIRST, max = MAX } = {}) {
  for (let n = first; ; n = Math.min(n * 4, max)) {
    const chunk = await io.tail(path, n);
    if (!chunk || typeof chunk.text !== "string") return null;
    const found = find(completeLines(chunk.text, chunk.whole), chunk.whole);
    if (found !== undefined) return found;
    if (chunk.whole || n >= max) return null;
  }
}
