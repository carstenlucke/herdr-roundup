// The ways from a terminal to the source of its agent's context, which strategies combine.
// Pure: everything outside comes through `io` (context-io.js in Herdr, a stub in the tests):
//
//   io.home                       the person's home folder
//   io.now()                      ms since the epoch
//   io.terminal(address)          `hc get <t> --json`, cut to { pid, created, title, cwd } (pid: the
//                                 foreground process, the agent's own), or null: no answer
//   io.env(pid)                   that process's environment (`ps -wwE`), or null (processEnv
//                                 keeps it per pid)
//   io.readText(path)             a small file (up to 1 MiB) as text, or null
//   io.stat(path)                 { size, mtime } or null
//   io.tail(path, bytes)          { text, whole } of the file's last bytes, or null
//   io.head(path, bytes)          its first bytes as text, or null
//   io.list(dir)                  the names in a folder, or null
//   io.openFiles(pid)             paths the process and its descendants hold open (`lsof`), or null
//   io.lastLinesWith(path, text, re, maxLength, n)
//                                 the file's last n lines shorter than maxLength containing text and
//                                 matching the awk ERE re, newest first: [] for none, null on failure
//
// None of these throws for a missing file or a failed program: they give null, and a strategy
// gives no reading. No guessing: a session found only by folder and recency is never a match.
//
// A strategy's locate() gives a source, null (no source: the meter goes), or NO_ANSWER: hc gave no
// answer, so nothing is known about the terminal and the reading stands until the next look.

// Where integrations write, one file per terminal: ~/.cache/herdr-roundup/context/<agent>/<t>.json.
export const integrationFile = (io, agent, terminal) => `${io.home}/.cache/herdr-roundup/context/${agent}/${terminal}.json`;

export function parseJson(text) {
  if (typeof text !== "string" || !text) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

export const NO_ANSWER = Object.freeze({ noAnswer: true });

// The terminal's foreground process: { pid, created, title, cwd }; null when hc answered without a
// live pid; NO_ANSWER when hc gave no answer (slow, failed), which a locate() passes on.
export async function foreground(io, terminal) {
  const t = await io.terminal(terminal);
  if (!t) return NO_ANSWER;
  return Number.isInteger(t.pid) && t.pid > 0 ? t : null;
}

// The environment of the terminal's process (`ps -wwE`), which never changes while it runs: kept
// in the reader's `memo` for the current pid only (one entry), and only an answer (a failed ps is
// asked again on the next look).
export async function processEnv(io, pid, memo = {}) {
  if (memo.env?.pid === pid) return memo.env.value;
  const value = await io.env(pid);
  if (value) memo.env = { pid, value };
  return value;
}

// What a strategy puts in its source's `observed` for a file whose stat and content don't belong
// together for sure: the reader uses this look's content, but keeps nothing of the look, so the
// next one reads again.
export const UNSURE = Symbol("unsure");

// One JSON file as one observation, for a strategy that reads it in locate(): { path, stat, json }.
// The stat comes first: a file replaced in between (the integrations write a temp file and mv it)
// has content newer than its stat, and the next look sees a change and reads again. Never the
// reverse, a newer stat on older content, which the reader would keep as read.
// The file is read whatever the stat said (io.stat gives null for a failed or slow `stat` too, not
// only for no file). `stat` is what the reader may keep of it, passed on in `observed` (path →
// stat), so the reader doesn't stat the file again:
//   { size, mtime }  stat'd, read and parsed (whoever's JSON it is: the caller's checks come after)
//   null             neither the stat nor the read gave anything: no file, as far as can be told
//   UNSURE           one without the other: the stat failed though there is content, or the
//                    content couldn't be read or parsed though there is a file
export async function observeJsonFile(io, path) {
  const st = await io.stat(path);
  const text = await io.readText(path);
  const json = parseJson(text);
  const stat = st && json ? st : st === null && text === null ? null : UNSURE;
  return { path, stat, json };
}

// The file an agent's integration writes for this terminal, as one observation: { path, stat, file }.
// `file` only if it is this terminal's and was written by this process: { v: 1, terminal, pid, at,
// ... }. A file of an ended terminal, of an earlier process in the same terminal, or of another
// version gives null (with its stat: it was read).
export async function observeTerminalFile(io, agent, terminal, pid) {
  const { path, stat, json: f } = await observeJsonFile(io, integrationFile(io, agent, terminal));
  const own = f && f.v === 1 && f.terminal === terminal && f.pid === pid && Number.isFinite(f.at);
  return { path, stat, file: own ? f : null };
}

// A thread id in a terminal title, whole or as Codex cuts it (`01a1d750-0653-7190-914d-7c804...`):
// at least the first four groups and one more digit. Two different ids in the title: null.
const ID = /(?<![0-9a-f-])([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{1,12})(?![0-9a-f-])/gi;
// Every different thread id in a title (none: []).
export function titleIds(title) {
  if (typeof title !== "string") return [];
  return [...new Set([...title.matchAll(ID)].map((m) => m[1].toLowerCase()))];
}
export function byTitle(title) {
  const ids = titleIds(title);
  return ids.length === 1 ? ids[0] : null;
}

// A UUIDv7's time: its first 12 hex digits are ms since the epoch. Null for another version.
export function uuid7Time(id) {
  const m = /^([0-9a-f]{8})-([0-9a-f]{4})-7/i.exec(id ?? "");
  return m ? parseInt(m[1] + m[2], 16) : null;
}

// The open files of a process and its descendants that match `pattern`, without repeats.
export async function byOpenFile(io, pid, pattern) {
  const files = await io.openFiles(pid);
  if (!Array.isArray(files)) return null;
  return [...new Set(files.filter((f) => pattern.test(f)))];
}

// Two-digit parts of a local date, as file names use them.
export function localParts(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return { y: String(d.getFullYear()), mo: p(d.getMonth() + 1), d: p(d.getDate()), h: p(d.getHours()), mi: p(d.getMinutes()), s: p(d.getSeconds()) };
}
