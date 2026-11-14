// The Herdr side of the context meter: the `io` its strategies and reader get (context/locate.js
// names each part), built on exec, hc and readTextFile. Paths go to programs as argv, never into
// shell code; every call has a timeout; output cut off at exec's limit gives no reading; a failed
// program gives null, never an error in `herdr-app status`. Windows has no tail, lsof or ps -E:
// there every part gives null, so there is no reading.

import { exec, hc, home, readTextFile } from "herdr";
import * as fs from "fs/promises";

const T = 5_000;
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

let statForm = null; // "mac" or "gnu", found on the first call

export function makeIo() {
  const io = {
    home: home(),
    now: () => Date.now(),
    async terminal(t) {
      try {
        const r = await hc(["get", t, "--json"]);
        if (r.code !== 0) return null;
        const j = JSON.parse(r.stdout);
        return { pid: j.foreground?.pid ?? null, created: j.created_ms ?? null, title: j.title ?? "", cwd: j.foreground?.cwd ?? j.cwd ?? null };
      } catch {
        return null;
      }
    },
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
    async tail(p, n) {
      const st = await io.stat(p);
      if (!st) return null;
      const text = await run("tail", ["-c", String(n), p], 10_000);
      return text === null ? null : { text, whole: st.size <= n };
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
    // The process and its descendants (pgrep -P, a few levels), then their open files.
    async openFiles(pid) {
      const pids = [String(pid)];
      let level = [String(pid)];
      for (let depth = 0; depth < 4 && level.length; depth++) {
        const next = [];
        for (const p of level) {
          const out = await run("pgrep", ["-P", p]);
          if (out) next.push(...out.split("\n").filter((x) => /^\d+$/.test(x)));
        }
        pids.push(...next);
        level = next;
      }
      // lsof exits 1 when one of the pids has gone meanwhile; what it printed still holds.
      try {
        const r = await exec("lsof", ["-Fn", "-p", pids.join(",")], { timeout: 10_000 });
        return (r.code === 0 || r.code === 1) && r.stdout.length < LIMIT - 1024 ? parseLsof(r.stdout) : null;
      } catch {
        return null;
      }
    },
    async lastLineWith(p, text, max) {
      const out = await run("awk", ["-v", `max=${max}`, "-v", `t=${text}`, 'length($0) < max && index($0, t) { l = $0 } END { if (l != "") print l }', p], 10_000);
      return out ? out.replace(/\n$/, "") : null;
    },
    async alive(pid) {
      try { return (await exec("kill", ["-0", String(pid)], { timeout: T })).code === 0; } catch { return false; }
    },
    async remove(p) {
      try { return (await exec("rm", ["-f", p], { timeout: T })).code === 0; } catch { return false; }
    },
  };
  return io;
}
