// The Herdr side of the context meter: the `io` its strategies and reader get (context/locate.js
// names each part), built on exec, hc and readTextFile. Paths go to programs as argv, never into
// shell code; every call has a timeout (hc get's own, from `after`: Herdr's hc() takes none); output
// cut off at exec's limit gives no reading; a failed program gives null, never an error in
// `herdr-app status`. Windows has no tail, lsof or ps -E:
// there every part gives null, so there is no reading.

import { exec, hc, home, readTextFile } from "herdr";
import * as fs from "fs/promises";

const T = 5_000;
export const HC_MS = 5_000;
const LIMIT = 8 * 1024 * 1024;
const run = async (cmd, args, timeout = T) => {
  try {
    const r = await exec(cmd, args, { timeout });
    return r.code === 0 && r.stdout.length < LIMIT - 1024 ? r.stdout : null;
  } catch {
    return null;
  }
};
// The environment keys a strategy looks at, from `ps -wwE`: the arguments come first, so the
// last occurrence of a key is the environment's. A value with a space is cut there.
const ENV_KEYS = ["HC_TERMINAL_ID", "CLAUDE_CONFIG_DIR", "CODEX_HOME", "CLAUDE_CODE_AUTO_COMPACT_WINDOW", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"];
export function parseEnv(text) {
  if (typeof text !== "string") return null;
  const env = {};
  for (const k of ENV_KEYS) {
    const all = [...text.matchAll(new RegExp(`(?:^|\\s)${k}=(\\S*)`, "g"))];
    if (all.length) env[k] = all[all.length - 1][1];
  }
  return env;
}
// `stat -f '%z %Fm'` (macOS) or `stat -c '%s %.9Y'` (Linux): size and mtime in ms.
export function parseStat(text) {
  const m = /^(\d+) (\d+(?:\.\d+)?)\s*$/.exec(text ?? "");
  return m ? { size: Number(m[1]), mtime: Math.round(Number(m[2]) * 1000) } : null;
}
// `lsof -Fn`: one "n<path>" line per open file.
export const parseLsof = (text) => (typeof text === "string" ? text.split("\n").filter((l) => l.startsWith("n/")).map((l) => l.slice(1)) : null);

// `ps -Ao pid=,ppid=`: the process and its descendants down to `depth` levels below it, the
// root first, each once. Lines that aren't two positive whole numbers are skipped; no text: null.
export function descendants(text, pid, depth = 4) {
  if (typeof text !== "string") return null;
  const kids = new Map();
  for (const line of text.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line);
    if (!m || m[1] === "0" || m[2] === "0") continue;
    if (!kids.has(m[2])) kids.set(m[2], []);
    kids.get(m[2]).push(m[1]);
  }
  const root = String(pid);
  const seen = new Set([root]);
  let level = [root];
  for (let d = 0; d < depth && level.length; d++) {
    const next = [];
    for (const p of level) for (const c of kids.get(p) ?? []) if (!seen.has(c)) { seen.add(c); next.push(c); }
    level = next;
  }
  return [...seen];
}

let statForm = null; // "mac" or "gnu", found on the first call

// `after(ms, f)` → a handle with cancel(): a timer that outlives the call (init's cx.timer.after).
// It gives hc get a deadline: a slow hc frees its place in the reader's queue after HC_MS and
// counts as no answer. The race doesn't stop hc itself, whose late answer is dropped. Without
// `after` (the sweeper, which never asks hc) there is no deadline.
export function makeIo({ after = null } = {}) {
  // One hc call, its JSON answer through `pick`, bounded by HC_MS where there is a timer.
  const ask = async (args, pick) => {
    let timer = null;
    try {
      const answer = hc(args).then((r) => (r.code === 0 ? pick(JSON.parse(r.stdout)) : null)).catch(() => null);
      if (!after) return await answer;
      let expire;
      const deadline = new Promise((resolve) => { expire = resolve; });
      timer = after(HC_MS, () => expire(null)); // a closed cx throws here: no answer
      return await Promise.race([answer, deadline]);
    } catch {
      return null; // hc failing as it is called, or no timer to bound it: no answer
    } finally {
      try { timer?.cancel(); } catch {}
    }
  };
  const io = {
    home: home(),
    now: () => Date.now(),
    terminal: (t) => ask(["get", t, "--json"], (j) => ({ pid: j.foreground?.pid ?? null, created: j.created_ms ?? null, title: j.title ?? "", cwd: j.foreground?.cwd ?? j.cwd ?? null })),
    // The screen only (no history above it): `{ text }` of `hc read`.
    screen: (t) => ask(["read", t, "--json"], (j) => (typeof j.text === "string" ? j.text : null)),
    async env(pid) { return parseEnv(await run("ps", ["-wwE", "-p", String(pid), "-o", "command="])); },
    async readText(p) {
      try { return await readTextFile(p); } catch { return null; }
    },
    async stat(p) {
      if (statForm !== "gnu") {
        const out = await run("stat", ["-f", "%z %Fm", p]);
        if (out !== null) { statForm = "mac"; return parseStat(out); }
        if (statForm === "mac") return null;
      }
      const out = await run("stat", ["-c", "%s %.9Y", p]);
      if (out !== null) statForm = "gnu";
      return parseStat(out);
    },
    // `whole` (the text starts at the file's beginning) needs the size before and after: a file
    // that grew past n in between was cut. Growing only after tail ran it wasn't, but counts as cut
    // then too, which costs a larger read at most. No second size where it decides: null, a failed
    // read (taken as cut, the whole first line would go, and the reader could keep "no number" for
    // an unchanged file).
    async tail(p, n) {
      const st = await io.stat(p);
      if (!st) return null;
      const text = await run("tail", ["-c", String(n), p], 10_000);
      if (text === null) return null;
      if (st.size > n) return { text, whole: false };
      const after = await io.stat(p);
      return after === null ? null : { text, whole: after.size <= n };
    },
    async head(p, n) { return run("head", ["-c", String(n), p]); },
    async list(dir) {
      try {
        const names = await fs.readdir(dir);
        return Array.isArray(names) ? names.map((n) => (typeof n === "string" ? n : n?.name)).filter(Boolean) : null;
      } catch {
        return null;
      }
    },
    // The process and its descendants (four levels, from one `ps` of all processes), then their
    // open files. A failed or cut ps gives null, not the root's files alone: a descendant not seen
    // could hold another thread's rollout. (A child born after the ps is missed until the next look.)
    async openFiles(pid) {
      const pids = descendants(await run("ps", ["-Ao", "pid=,ppid="]), pid);
      if (!pids) return null;
      // lsof exits 1 when one of the pids has gone meanwhile; what it printed still holds.
      try {
        // -n -P: no host or port names (a lookup per socket can take seconds); -w: no warnings.
        const r = await exec("lsof", ["-n", "-P", "-w", "-Fn", "-p", pids.join(",")], { timeout: 10_000 });
        return (r.code === 0 || r.code === 1) && r.stdout.length < LIMIT - 1024 ? parseLsof(r.stdout) : null;
      } catch {
        return null;
      }
    },
    // The last `n` lines shorter than max holding text and matching the ERE re, newest first (a
    // ring of n in awk: the output stays n lines however many match). [] for none, null on failure.
    async lastLinesWith(p, text, re, max, n) {
      const prog = 'length($0) < max && index($0, t) && $0 ~ re { l[c++ % n] = $0 } END { for (i = 1; i <= n && i <= c; i++) print l[(c - i) % n] }';
      const out = await run("awk", ["-v", `max=${max}`, "-v", `t=${text}`, "-v", `re=${re}`, "-v", `n=${n}`, prog, p], 10_000);
      return out === null ? null : out.split("\n").filter(Boolean);
    },
    async alive(pid) {
      try { return (await exec("kill", ["-0", String(pid)], { timeout: T })).code === 0; } catch { return false; }
    },
    // Through `rm`, not fs.unlink: Herdr's fs/promises writes only under ~/.config/herdr-app
    // (AGENTS.md), and these files are under ~/.cache (ADR 0003). An unlink there would fail
    // into the catch and the sweep would quietly remove nothing; node's fs in the tests can't tell.
    async remove(p) {
      try { return (await exec("rm", ["-f", p], { timeout: T })).code === 0; } catch { return false; }
    },
  };
  return io;
}
