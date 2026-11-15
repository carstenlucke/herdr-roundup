// An `io` for the context strategies (mods/roundup-pane/context/locate.js names its parts) over
// files in memory: { path: text }. Terminals, environments, open files and screens are fixtures too.
// `calls` records what was asked, so a test can see that nothing more was read than needed.
import { readFileSync } from "node:fs";

export const fixture = (name) => readFileSync(new URL(`../fixtures/context/${name}`, import.meta.url), "utf8");

export function contextIo({ home = "/Users/a", now = Date.parse("2026-11-14T00:00:00Z"), files = {}, mtimes = {}, terminals = {}, envs = {}, open = {}, screens = {} } = {}) {
  const calls = [];
  const io = {
    home,
    calls,
    files,
    now: () => io.clock,
    clock: now,
    async terminal(t) { calls.push(["terminal", t]); return terminals[t] ?? null; },
    async env(pid) { calls.push(["env", pid]); return envs[pid] ?? null; },
    async readText(p) { calls.push(["readText", p]); return p in files ? files[p] : null; },
    async stat(p) { calls.push(["stat", p]); return p in files ? { size: Buffer.byteLength(files[p]), mtime: mtimes[p] ?? 0 } : null; },
    async tail(p, n) {
      calls.push(["tail", p, n]);
      if (!(p in files)) return null;
      const b = Buffer.from(files[p]);
      return { text: b.subarray(Math.max(0, b.length - n)).toString("utf8"), whole: b.length <= n };
    },
    async head(p, n) { calls.push(["head", p, n]); return p in files ? Buffer.from(files[p]).subarray(0, n).toString("utf8") : null; },
    async list(dir) {
      calls.push(["list", dir]);
      const names = Object.keys(files).filter((p) => p.startsWith(dir + "/")).map((p) => p.slice(dir.length + 1).split("/")[0]);
      return names.length ? [...new Set(names)] : null;
    },
    async openFiles(pid) { calls.push(["openFiles", pid]); return open[pid] ?? null; },
    screens,
    async screen(t) { calls.push(["screen", t]); return t in screens ? screens[t] : null; },
    // As context-io.js's awk, with the ERE's [[:space:]] as \s.
    async lastLinesWith(p, text, re, max, n) {
      calls.push(["lastLinesWith", p]);
      if (!(p in files)) return null;
      const ere = new RegExp(re.replaceAll("[[:space:]]", "\\s"));
      return files[p].split("\n").filter((l) => l.length < max && l.includes(text) && ere.test(l)).slice(-n).reverse();
    },
  };
  return io;
}

// JSON lines as a file's text.
export const jsonl = (...lines) => lines.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n") + "\n";
