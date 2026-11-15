// node --test 'tests/*.test.mjs'
// The Claude Code strategy of roundup-pane's context meter, against files cut from a real session
// (Claude Code 2.1.325, 2026-11-14: two short answers, /context, /compact) and an io stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import claude, { usageTokens, fromStatus, findTranscript, parseSnapshot, displayTokens, slug, checkSession, IDLE_COMPACT_MS, FIND_AGAIN_MS, SNAPSHOT_CANDIDATES } from "../mods/roundup-pane/context/strategies/claude.js";
import { integrationFile, NO_ANSWER } from "../mods/roundup-pane/context/locate.js";
import { NO_READING } from "../mods/roundup-pane/context/tail.js";
import { contextIo, fixture, jsonl } from "./support/context-io.mjs";

const SID = "0fbf3e48-42ea-40d5-b3ed-40730f7e7b44";
const PID = 52896;
const STARTED = 1794613515093; // the session file's startedAt
const TRANSCRIPT = `/Users/a/.claude/projects/-Users-a-src-demo/${SID}.jsonl`;
const full = fixture("claude-transcript.jsonl");
const lines = full.trimEnd().split("\n");
const at = (pred) => lines.findIndex((l) => pred(JSON.parse(l)));
const SNAP = at((l) => l.isMeta === true);
const BOUNDARY = at((l) => l.subtype === "compact_boundary");
// The transcript as it stood before /context and before /compact.
const upTo = (i) => lines.slice(0, i).join("\n") + "\n";
const stdin = JSON.parse(fixture("claude-status-stdin.json"));

function setup({ transcript = full, status = stdin, statusPid = PID, session = {}, env = { HC_TERMINAL_ID: "t7" }, title = "Claude Code" } = {}) {
  const io = contextIo({
    terminals: { t7: { pid: PID, created: STARTED - 4000, title, cwd: "/Users/a/src/demo" } },
    envs: { [PID]: env },
  });
  io.files[`/Users/a/.claude/sessions/${PID}.json`] = JSON.stringify({ pid: PID, sessionId: SID, cwd: "/Users/a/src/demo", startedAt: STARTED, kind: "interactive", ...session });
  if (transcript !== null) io.files[TRANSCRIPT] = transcript;
  if (status) {
    const file = integrationFile(io, "claude", "t7");
    io.files[file] = JSON.stringify({ v: 1, terminal: "t7", pid: statusPid, at: Date.parse("2026-11-13T23:46:03Z"), claude: status });
  }
  return io;
}
const reading = async (io) => {
  const src = await claude.locate({ terminal: "t7" }, io);
  return src && claude.read(src, io, {});
};

test("Claude with its status line: its own window and the last request's tokens, input + caches + output", async () => {
  const r = await reading(setup({ transcript: upTo(SNAP) }));
  assert.equal(r.window, 1_000_000);
  assert.equal(r.used, 4 + 143 + 47_784 + 390);
  assert.equal(r.model, "claude-opus-5-5");
  assert.equal(r.exact, true);
  assert.ok(["status-line", "transcript"].includes(r.source));
  assert.ok(Math.abs(r.percent - 4.8321) < 1e-9);
});

test("after /compact the status line's all-zero usage is no reading: the compaction's postTokens stands", async () => {
  const zero = { ...stdin, context_window: { ...stdin.context_window, current_usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, used_percentage: 0 } };
  const r = await reading(setup({ status: zero }));
  assert.equal(r.used, 12_006);
  assert.equal(r.source, "compaction");
  assert.equal(r.window, 1_000_000, "the window still from the status line");
  assert.deepEqual([r.compaction.pre, r.compaction.post], [48_853, 12_006]);
  assert.equal(r.idleCompactAt, undefined, "nothing to expect right after a compaction");
});

test("a status line file of another process or another session is not used", async () => {
  // Without it and without a snapshot before this point: tokens only.
  let r = await reading(setup({ transcript: upTo(SNAP), statusPid: PID + 1 }));
  assert.equal(r.window, null);
  assert.equal(r.used, 48_321);
  assert.equal(r.source, "transcript");
  r = await reading(setup({ transcript: upTo(SNAP), status: { ...stdin, session_id: "another" } }));
  assert.equal(r.window, null);
});

test("without the integration: the window of this session's /context snapshot, marked as rounded", async () => {
  const r = await reading(setup({ transcript: upTo(BOUNDARY), status: null }));
  assert.equal(r.window, 1_000_000);
  assert.equal(r.windowRounded, true);
  assert.equal(r.exact, false);
  assert.equal(r.used, 48_321);
});

test("a snapshot of another model, from before this process, or only inside a long line doesn't count", async () => {
  const swap = (from, to) => upTo(BOUNDARY).replace(from, to);
  let r = await reading(setup({ transcript: swap("**Model:** claude-opus-5-5", "**Model:** claude-sonnet-5-5"), status: null }));
  assert.equal(r.window, null, "another model");
  r = await reading(setup({ transcript: upTo(BOUNDARY), status: null, session: { startedAt: Date.parse("2026-11-13T23:47:00Z") } }));
  assert.equal(r.window, null, "a snapshot from before this process (a resumed session)");
  assert.equal(r.used, 48_321);
  const copy = JSON.parse(lines[SNAP]);
  const blob = JSON.stringify({ type: "api-request-blob", content: [{ type: "text", text: copy.message.content + "y".repeat(70 * 1024) }] });
  const only = lines.filter((_, i) => i !== SNAP).slice(0, BOUNDARY - 1);
  r = await reading(setup({ transcript: jsonl(...only, blob), status: null }));
  assert.equal(r.window, null, "a copy inside an api-request-blob");
});

test("the snapshot search skips later lines that only mention /context: quoted copies, a nested isMeta, another session's; the newer of two valid wins", async () => {
  const snap = JSON.parse(lines[SNAP]);
  const later = (o) => JSON.stringify({ ...o, timestamp: "2026-11-13T23:46:30.000Z" });
  // A Read result of claude.js, a pasted /context: the marker in plain text, no meta line.
  const mention = (i) => JSON.stringify({ type: "user", timestamp: snap.timestamp, sessionId: SID, message: { role: "user", content: [{ type: "tool_result", content: `const SNAPSHOT = "## Context Usage"; // ${i}` }] } });
  const quoted = JSON.stringify({ type: "user", timestamp: snap.timestamp, sessionId: SID, message: { role: "user", content: `pasted: ${lines[SNAP]}` } });
  const nested = JSON.stringify({ type: "user", timestamp: snap.timestamp, sessionId: SID, message: { role: "user", content: "## Context Usage", extra: { isMeta: true } } });
  const other = later({ ...snap, sessionId: "another-session" });
  const base = lines.slice(0, BOUNDARY);
  const at = (...extra) => jsonl(...base, ...extra);
  let r = await reading(setup({ transcript: at(...Array.from({ length: 12 }, (_, i) => mention(i)), quoted), status: null }));
  assert.equal(r.window, 1_000_000, "twelve plain mentions and a quoted copy after the snapshot: the filter drops them");
  r = await reading(setup({ transcript: at(nested, other, nested), status: null }));
  assert.equal(r.window, 1_000_000, "a nested isMeta and another session's snapshot pass the filter but not parseSnapshot / the session check");
  const newer = later({ ...snap, message: { ...snap.message, content: snap.message.content.replace("48.1k / 1m", "48.1k / 500k") } });
  r = await reading(setup({ transcript: at(newer, nested), status: null }));
  assert.equal(r.window, 500_000, "the newer of two valid snapshots");
});

test("the snapshot search is bounded: SNAPSHOT_CANDIDATES rejected candidates after the snapshot leave the window unknown, tokens only", async () => {
  const snap = JSON.parse(lines[SNAP]);
  const nested = JSON.stringify({ type: "user", timestamp: snap.timestamp, sessionId: SID, message: { role: "user", content: "## Context Usage", extra: { isMeta: true } } });
  const base = lines.slice(0, BOUNDARY);
  let r = await reading(setup({ transcript: jsonl(...base, ...Array(SNAPSHOT_CANDIDATES - 1).fill(nested)), status: null }));
  assert.equal(r.window, 1_000_000, "one place left: the snapshot is still among the candidates");
  r = await reading(setup({ transcript: jsonl(...base, ...Array(SNAPSHOT_CANDIDATES).fill(nested)), status: null }));
  assert.equal(r.window, null, "the bound used up: no window, the validation is never relaxed");
  assert.equal(r.used, 48_321, "the tokens still stand");
});

test("parseSnapshot reads model, window and buffer from a snapshot in a string or a content array", () => {
  const s = parseSnapshot(lines[SNAP]);
  assert.deepEqual([s.model, s.window, s.buffer, s.session], ["claude-opus-5-5", 1_000_000, 33_000, SID]);
  const l = JSON.parse(lines[SNAP]);
  const arr = { ...l, message: { role: "user", content: [{ type: "text", text: l.message.content }] } };
  assert.equal(parseSnapshot(JSON.stringify(arr)).window, 1_000_000);
  assert.equal(parseSnapshot(JSON.stringify({ ...l, isMeta: false })), null);
  assert.equal(parseSnapshot("{ half"), null);
  assert.equal(displayTokens("1m"), 1_000_000);
  assert.equal(displayTokens("48.1k"), 48_100);
  assert.equal(displayTokens("749"), 749);
  assert.equal(displayTokens("lots"), null);
});

test("the last of iterations counts; <synthetic> answers and side chains are skipped", () => {
  const u = (i, cr) => ({ input_tokens: i, cache_creation_input_tokens: 0, cache_read_input_tokens: cr, output_tokens: 10 });
  assert.equal(usageTokens({ ...u(100, 900), iterations: [u(1, 2), u(5, 500)] }), 515);
  assert.equal(usageTokens(u(100, 900)), 1010);
  assert.equal(usageTokens({ input_tokens: -1 }), null);
  assert.equal(usageTokens({ input_tokens: Infinity }), null);
  const ts = "2026-11-13T23:50:00.000Z";
  const found = findTranscript([
    JSON.stringify({ type: "assistant", timestamp: ts, message: { model: "claude-opus-5-5", usage: u(1, 99) } }),
    JSON.stringify({ type: "assistant", timestamp: ts, isSidechain: true, message: { model: "claude-opus-5-5", usage: u(9, 9999) } }),
    JSON.stringify({ type: "assistant", timestamp: ts, message: { model: "<synthetic>", usage: u(0, 0) } }),
  ], true);
  assert.equal(found.usage.used, 110);
  assert.equal(findTranscript([], false), undefined, "nothing yet: read more");
  assert.deepEqual(findTranscript([], true), { usage: null, compaction: null });
});

test("a chunk that starts inside a line and a last line still being written give the line before", async () => {
  const io = setup({ transcript: upTo(SNAP) + '{"type":"assistant","timestamp":"2026-11-13T23:47:', status: null });
  const r = await reading(io);
  assert.equal(r.used, 48_321);
});

test("an idle session above 200k expects its compaction 55 min after the last answer", async () => {
  const ts = "2026-11-13T23:50:00.000Z";
  const big = jsonl({ type: "assistant", timestamp: ts, message: { model: "claude-opus-5-5", usage: { input_tokens: 5, cache_creation_input_tokens: 1000, cache_read_input_tokens: 250_000, output_tokens: 500 } } });
  const r = await reading(setup({ transcript: big, status: null }));
  assert.equal(r.used, 251_505);
  assert.equal(r.idleCompactAt, Date.parse(ts) + IDLE_COMPACT_MS);
  const small = await reading(setup({ transcript: upTo(SNAP), status: null }));
  assert.equal(small.idleCompactAt, undefined);
});

test("locate: the session file must be the pid's, interactive and started in the terminal's life", () => {
  const fg = { pid: 7, created: 1000 };
  assert.ok(checkSession({ sessionId: "s", pid: 7, kind: "interactive", startedAt: 2000 }, fg));
  assert.equal(checkSession({ sessionId: "s", pid: 7, kind: "print", startedAt: 2000 }, fg), null);
  assert.equal(checkSession({ sessionId: "s", pid: 8, startedAt: 2000 }, fg), null);
  assert.equal(checkSession({ sessionId: "s", pid: 7, startedAt: -5000 }, fg), null);
  assert.equal(checkSession({ pid: 7 }, fg), null);
  assert.equal(slug("/Users/a/src/my.app_v2"), "-Users-a-src-my-app-v2");
});

test("locate: another terminal's process, no session file or no foreground process give nothing", async () => {
  assert.equal(await reading(setup({ env: { HC_TERMINAL_ID: "t9" } })), null);
  const io = setup();
  delete io.files[`/Users/a/.claude/sessions/${PID}.json`];
  assert.equal(await reading(io), null);
  const none = contextIo({ terminals: { t7: { pid: null, created: 0, title: "" } } });
  assert.equal(await claude.locate({ terminal: "t7" }, none), null, "hc answers: no foreground process");
  assert.equal(await claude.locate({ terminal: "t7" }, contextIo()), NO_ANSWER, "hc gives no answer: passed on, not null");
});

test("locate: CLAUDE_CONFIG_DIR replaces ~/.claude; a transcript not under its slug is found by its session id", async () => {
  const io = setup({ status: null, env: { HC_TERMINAL_ID: "t7", CLAUDE_CONFIG_DIR: "/Users/a/.claude-work" } });
  for (const p of Object.keys(io.files)) if (p.startsWith("/Users/a/.claude/")) { io.files[p.replace("/.claude/", "/.claude-work/")] = io.files[p]; delete io.files[p]; }
  const moved = `/Users/a/.claude-work/projects/-elsewhere/${SID}.jsonl`;
  io.files[moved] = io.files[`/Users/a/.claude-work/projects/-Users-a-src-demo/${SID}.jsonl`];
  delete io.files[`/Users/a/.claude-work/projects/-Users-a-src-demo/${SID}.jsonl`];
  const src = await claude.locate({ terminal: "t7" }, io);
  assert.equal(src.transcript, moved);
  assert.equal((await claude.read(src, io, {})).used, 12_006);
});

test("a changed compaction setting in the agent's environment goes with the reading", async () => {
  const r = await reading(setup({ env: { HC_TERMINAL_ID: "t7", CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "70" } }));
  assert.equal(r.setting, "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=70");
});

test("a session just started (no answer yet, status line with usage null) shows nothing", async () => {
  const fresh = { ...stdin, context_window: { ...stdin.context_window, current_usage: null, used_percentage: null } };
  assert.equal(await reading(setup({ transcript: upTo(5), status: fresh })), NO_READING, "read, no number: not an error");
  assert.equal(await reading(setup({ transcript: null, status: fresh })), NO_READING, "no transcript yet: not an error either");
});

test("fromStatus: whole-number used_percentage is not used, the window must be a positive number", () => {
  const f = { claude: { ...stdin, context_window: { ...stdin.context_window, context_window_size: -5 } } };
  assert.equal(fromStatus(f, SID).window, null);
  assert.equal(fromStatus(f, "other"), null);
  assert.equal(fromStatus({ claude: stdin }, SID).used, 48_321);
});

// A fresh session: its transcript isn't written yet, where the slug puts it or anywhere. The
// folder search (one stat per project folder) runs again only after FIND_AGAIN_MS.
function fresh({ dirs = 30 } = {}) {
  const io = setup({ transcript: null, status: null });
  for (let i = 0; i < dirs; i++) io.files[`/Users/a/.claude/projects/-p${i}/other.jsonl`] = "{}\n";
  io.clock = 0;
  const memo = {};
  const look = () => claude.locate({ terminal: "t7" }, io, memo);
  const lists = () => io.calls.filter((c) => c[0] === "list").length;
  return { io, memo, look, lists };
}

test("a fresh session's transcript search runs once per FIND_AGAIN_MS, while the slug path is asked every look", async () => {
  const { io, look, lists } = fresh();
  assert.equal((await look()).transcript, null);
  assert.equal((await look()).transcript, null);
  assert.equal(lists(), 1, "one search within the interval");
  const slugStats = io.calls.filter((c) => c[0] === "stat" && c[1] === TRANSCRIPT).length;
  assert.equal(slugStats, 2, "the slug path on every look");
  io.files[TRANSCRIPT] = full; // written where expected: found at once
  assert.equal((await look()).transcript, TRANSCRIPT);
  assert.equal(lists(), 1);
});

test("a transcript written off its slug is found after FIND_AGAIN_MS, not before; one in two folders is none", async () => {
  const { io, look, lists } = fresh();
  await look();
  const off = `/Users/a/.claude/projects/-elsewhere/${SID}.jsonl`;
  io.files[off] = full;
  assert.equal((await look()).transcript, null, "the miss holds");
  io.clock += FIND_AGAIN_MS;
  assert.equal((await look()).transcript, off);
  assert.equal(lists(), 2);
  assert.equal((await look()).transcript, off, "the hit is kept");
  assert.equal(lists(), 2, "and not searched for again");
  // Ambiguous: a second copy elsewhere. The kept hit is still there, so it stands; a new search
  // (the kept one gone) finds two and gives none.
  io.files[`/Users/a/.claude/projects/-third/${SID}.jsonl`] = full;
  delete io.files[off];
  io.files[`/Users/a/.claude/projects/-fourth/${SID}.jsonl`] = full;
  assert.equal((await look()).transcript, null, "two matches: none");
});

test("a kept hit that is gone is searched for again at once; another home or session doesn't use the memo", async () => {
  const { io, memo, look, lists } = fresh();
  const off = `/Users/a/.claude/projects/-elsewhere/${SID}.jsonl`;
  io.files[off] = full;
  assert.equal((await look()).transcript, off);
  delete io.files[off];
  const moved = `/Users/a/.claude/projects/-moved/${SID}.jsonl`;
  io.files[moved] = full;
  assert.equal((await look()).transcript, moved, "found again at once");
  assert.equal(lists(), 2);
  // Another session in the same terminal (a new process): its own search, not the old memo.
  const sid2 = "1fbf3e48-42ea-40d5-b3ed-40730f7e7b44";
  io.files[`/Users/a/.claude/sessions/${PID}.json`] = JSON.stringify({ pid: PID, sessionId: sid2, cwd: "/Users/a/src/demo", startedAt: STARTED, kind: "interactive" });
  assert.equal((await look()).transcript, null);
  assert.equal(lists(), 3);
  // Another Claude home (CLAUDE_CONFIG_DIR) for the first session: its own search too.
  io.files[`/Users/a/.cw/sessions/${PID}.json`] = JSON.stringify({ pid: PID, sessionId: SID, cwd: "/Users/a/src/demo", startedAt: STARTED, kind: "interactive" });
  io.files[`/Users/a/.cw/projects/-x/${SID}.jsonl`] = full;
  const envs = { HC_TERMINAL_ID: "t7", CLAUDE_CONFIG_DIR: "/Users/a/.cw" };
  io.env = async () => envs;
  delete memo.env; // a process's environment is kept per pid: here the same pid stands for a new process
  assert.equal((await look()).transcript, `/Users/a/.cw/projects/-x/${SID}.jsonl`);
  assert.equal(memo.transcripts.size, 3);
});

test("while a miss is held, the status line's path and the slug path are still asked: either found at once", async () => {
  const given = `/Users/a/elsewhere/${SID}.jsonl`;
  const withStatus = () => {
    const { io, look, lists } = fresh();
    io.files[integrationFile(io, "claude", "t7")] = JSON.stringify({ v: 1, terminal: "t7", pid: PID, at: Date.parse("2026-11-13T23:46:03Z"), claude: { ...stdin, session_id: SID, transcript_path: given } });
    return { io, look, lists };
  };
  // The status line names a path not written yet: the slug's, written meanwhile, is found.
  let w = withStatus();
  assert.equal((await w.look()).transcript, null);
  assert.equal(w.lists(), 1, "a miss held");
  w.io.files[TRANSCRIPT] = full;
  assert.equal((await w.look()).transcript, TRANSCRIPT);
  // The status line's own path, written meanwhile: found, and first.
  w = withStatus();
  await w.look();
  w.io.files[given] = full;
  w.io.files[TRANSCRIPT] = full;
  assert.equal((await w.look()).transcript, given);
  assert.equal(w.lists(), 1);
});

test("locate: the source carries each of its files' stat, the transcript's the one that found it, by its slug, by the search or as a kept hit", async () => {
  const sessionFile = `/Users/a/.claude/sessions/${PID}.json`;
  const statOf = (io, p) => ({ size: Buffer.byteLength(io.files[p]), mtime: 0 });
  const stats = (io, p) => io.calls.filter((c) => c[0] === "stat" && c[1] === p).length;
  // By its slug, with the status line file.
  let io = setup();
  const status = integrationFile(io, "claude", "t7");
  let src = await claude.locate({ terminal: "t7" }, io);
  assert.deepEqual(src.files, [sessionFile, status, TRANSCRIPT]);
  assert.deepEqual(src.observed, { [sessionFile]: statOf(io, sessionFile), [status]: statOf(io, status), [TRANSCRIPT]: statOf(io, TRANSCRIPT) });
  assert.deepEqual(src.files.map((f) => stats(io, f)), [1, 1, 1], "one stat each");
  assert.equal(src.transcript, TRANSCRIPT, "the transcript itself stays a path");
  // No status line file: null, which the reader takes as no file; no transcript: no entry.
  const f = fresh();
  src = await f.look();
  assert.deepEqual(src.observed, { [sessionFile]: statOf(f.io, sessionFile), [status]: null });
  // Found by the search, then kept: each look's own stat, and none more for `observed`.
  const off = `/Users/a/.claude/projects/-elsewhere/${SID}.jsonl`;
  f.io.files[off] = full;
  f.io.clock += FIND_AGAIN_MS;
  src = await f.look();
  assert.deepEqual(src.observed[off], statOf(f.io, off));
  assert.equal(stats(f.io, off), 1, "the search's stat");
  f.io.files[off] += "\n";
  src = await f.look();
  assert.deepEqual(src.observed[off], statOf(f.io, off), "a kept hit: this look's stat, not the one kept");
  assert.equal(stats(f.io, off), 2, "one per look");
  assert.deepEqual([...f.memo.transcripts.values()].map((m) => Object.keys(m)), [["path", "at"]], "the memo keeps no stat");
});
