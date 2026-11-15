// node --test 'tests/*.test.mjs'
// roundup-pane's context reader (mods/roundup-pane/context/reader.js): when it reads, what it keeps,
// on the virtual clock, with a stub strategy and io; the real Claude strategy for the large-file case.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clock, flush } from "./support/clock.mjs";
import { makeCx } from "./support/cx.mjs";
import { contextIo, fixture } from "./support/context-io.mjs";
import { ContextReader, makeQueue, valid, idleHint, sweep, WORKING_MS, IDLE_MS, AFTER_STATUS_MS, RETRY_MS, HINT_FOR_MS } from "../mods/roundup-pane/context/reader.js";
import claude from "../mods/roundup-pane/context/strategies/claude.js";
import { FIRST, NO_READING } from "../mods/roundup-pane/context/tail.js";
import { localParts, integrationFile, UNSURE } from "../mods/roundup-pane/context/locate.js";

beforeEach(() => clock.reset());

const FILE = "/Users/a/session.jsonl";
function world() {
  const io = contextIo({ files: { [FILE]: "x" }, terminals: { t1: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  const s = {
    src: { id: "fake", pid: 10, session: "s1", files: [FILE] },
    reading: { used: 100, window: 1000, at: 1, source: "fake", exact: true },
    locates: 0,
    reads: 0,
    throws: false,
  };
  const strategy = {
    id: "fake",
    matches: ["fake"],
    async locate() { s.locates++; return s.src; },
    async read() { s.reads++; if (s.throws) throw new Error("boom"); return s.reading; },
  };
  const reader = new ContextReader(io, { strategies: [strategy], queue: makeQueue(2) });
  const cx = makeCx();
  const pane = (status = "idle", extra = {}) => ({ terminal: "t1", program: { key: "fake" }, app: null, status, ...extra });
  return { io, s, reader, cx, pane };
}
const touch = (io, path) => { io.files[path] += "y"; };

test("a header reads once when it starts, then not again while its source is unchanged", async () => {
  const { s, reader, cx, pane } = world();
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(s.reads, 1);
  assert.equal(reader.reading.used, 100);
  assert.ok(cx.notified >= 1);
  await clock.advance(IDLE_MS * 3);
  assert.equal(s.reads, 1, "idle and unchanged: looked at, not read");
  assert.ok(s.locates >= 4);
  assert.deepEqual(cx.errors, []);
});

test("idle, a changed file is read within a minute; working and shown, within 15 s", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  touch(io, FILE);
  await clock.advance(IDLE_MS);
  assert.equal(s.reads, 2);
  reader.see(pane("working"), true, cx);
  await clock.advance(AFTER_STATUS_MS + 10); // the status change, and 2 s later
  const after = s.reads;
  touch(io, FILE);
  await clock.advance(WORKING_MS);
  assert.equal(s.reads, after + 1);
});

test("a status change reads at once and again 2 s later, for writes that come after the status", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane("working"), true, cx);
  await clock.advance(2000);
  const base = s.locates;
  reader.see(pane("idle"), true, cx);
  await clock.advance(0);
  assert.equal(s.locates, base + 1);
  touch(io, FILE);
  await clock.advance(AFTER_STATUS_MS);
  assert.equal(s.locates, base + 2);
  assert.equal(s.reads, 2);
});

test("a pane not shown keeps to the idle schedule while working, and looks at once when shown again", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane("working"), false, cx);
  await clock.advance(2000);
  touch(io, FILE);
  await clock.advance(WORKING_MS * 2);
  assert.equal(s.reads, 1, "hidden: no 15 s reads");
  reader.see(pane("working"), true, cx);
  await clock.advance(0);
  assert.equal(s.reads, 2);
});

test("a status change while not shown reads nothing; the tab shown again reads at once, though the status came back meanwhile", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane("idle"), true, cx);
  await clock.advance(2000);
  reader.see(pane("idle"), false, cx); // the tab goes (main.js's look; a hidden header doesn't render)
  reader.see(pane("working"), false, cx);
  await clock.advance(0);
  assert.equal(s.locates, 1, "hidden: a status change waits");
  touch(io, FILE);
  reader.see(pane("idle"), false, cx); // done again, still hidden
  reader.see(pane("idle"), true, cx); // the tab back: same status as before it went
  await clock.advance(0);
  assert.equal(s.reads, 2, "read at once");
});

test("no source: no reading, tried again with a growing backoff", async () => {
  const { s, reader, cx, pane } = world();
  s.src = null;
  reader.see(pane(), true, cx);
  await clock.advance(1200);
  assert.equal(reader.reading, null);
  const at = [];
  let n = s.locates;
  for (let t = 0; t < RETRY_MS[0] + RETRY_MS[1] + RETRY_MS[2] + 10; t += 1000) {
    await clock.advance(1000);
    if (s.locates !== n) { at.push(clock.now); n = s.locates; }
  }
  const gaps = at.slice(1).map((t, i) => t - at[i]);
  assert.deepEqual(gaps, [RETRY_MS[1], RETRY_MS[2]]);
});

test("a strategy that throws gives no reading and no error", async () => {
  const { s, reader, cx, pane } = world();
  s.throws = true;
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(reader.reading, null);
  assert.deepEqual(cx.errors, []);
});

test("a reading with numbers that aren't sane is none", () => {
  assert.equal(valid({ used: 5, at: 1, window: 0 }), null);
  assert.equal(valid({ used: -1, at: 1 }), null);
  assert.equal(valid({ used: 5 }), null);
  assert.equal(valid({ percent: 8.6, at: 1 }).percent, 8.6);
  assert.equal(valid({ used: 5, at: 1, window: null }).used, 5);
});

test("the pid changes during a read: the late answer is dropped", async () => {
  const { io, s, reader, cx, pane } = world();
  const read = s.reading;
  s.reading = null;
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  s.reading = read;
  io.files[FILE] += "z";
  // The terminal runs another process by the time the read returns.
  const orig = io.terminal;
  io.terminal = async (t) => ({ ...(await orig(t)), pid: 11 });
  await clock.advance(RETRY_MS[0]);
  assert.equal(reader.reading, null);
});

test("the file disappears: the reading goes", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  delete io.files[FILE];
  s.reading = null; // the strategy finds nothing in a missing file
  await clock.advance(IDLE_MS);
  assert.equal(reader.reading, null);
});

test("a shell that becomes an agent starts reading; an agent that becomes a shell drops its reading", async () => {
  const { s, reader, cx, pane } = world();
  reader.see(pane("idle", { program: { key: "shell" } }), true, cx);
  await clock.advance(5000);
  assert.equal(s.locates, 0);
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(reader.reading.used, 100);
  reader.see(pane(null, { program: { key: "shell" } }), true, cx);
  assert.equal(reader.reading, null);
  const n = s.locates;
  await clock.advance(IDLE_MS * 2);
  assert.equal(s.locates, n);
});

test("near an expected idle compaction the reader looks again, and the hint goes 5 min after its time", async () => {
  const { s, reader, cx, pane } = world();
  s.reading = { used: 300_000, window: 1_000_000, at: 0, source: "fake", exact: true, idleCompactAt: 10_000 };
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(reader.hint, 10_000);
  const n = s.locates;
  await clock.advance(10_000 + 30_000 - 2000 + 10);
  assert.equal(s.locates, n + 1, "one look 30 s after the expected time");
  await clock.advance(HINT_FOR_MS);
  assert.equal(reader.hint, null);
  assert.equal(idleHint(s.reading, "working", 0), null, "never while working");
});

test("the queue lets two reads run at once", async () => {
  const q = makeQueue(2);
  let at = 0, max = 0;
  const gates = [];
  const job = () => new Promise((resolve) => { at++; max = Math.max(max, at); gates.push(() => { at--; resolve(); }); });
  const all = [q.run(job), q.run(job), q.run(job), q.run(job)];
  await flush();
  assert.equal(max, 2);
  assert.equal(q.waiting, 2);
  while (gates.length) { gates.shift()(); await flush(); }
  await Promise.all(all);
  assert.equal(max, 2);
});

test("with the real Claude strategy, the usage line behind a huge line is found by growing the tail", async () => {
  const sid = "0fbf3e48-42ea-40d5-b3ed-40730f7e7b44";
  const transcript = `/Users/a/.claude/projects/-Users-a-src-demo/${sid}.jsonl`;
  const lines = fixture("claude-transcript.jsonl").trimEnd().split("\n");
  const usage = lines.filter((l) => l.includes('"type":"assistant"')).pop();
  const blob = JSON.stringify({ type: "api-request-blob", content: [{ type: "text", text: "x".repeat(FIRST * 2) }] });
  const io = contextIo({
    files: {
      [transcript]: [usage, blob].join("\n") + "\n",
      "/Users/a/.claude/sessions/52896.json": JSON.stringify({ pid: 52896, sessionId: sid, cwd: "/Users/a/src/demo", startedAt: 1794613515093, kind: "interactive" }),
    },
    terminals: { t7: { pid: 52896, created: 1794613511000, title: "Claude Code" } },
    envs: { 52896: { HC_TERMINAL_ID: "t7" } },
  });
  io.now = () => clock.now;
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  reader.see({ terminal: "t7", program: { key: "claude" }, app: "claude", status: "idle" }, true, cx);
  await clock.advance(2000);
  assert.deepEqual(cx.errors, []);
  assert.equal(reader.reading.used, 48_321);
  assert.equal(reader.reading.window, null, "no status line, no snapshot: tokens only");
  assert.deepEqual(io.calls.filter((c) => c[0] === "tail").map((c) => c[2]), [FIRST, FIRST * 4]);
});

// The real Claude strategy with its status line file, which `write` replaces (as the integration's
// mv does): a later `at` than the transcript's answers, so the status line's number is the reading.
function claudeWorld({ wrap = (s) => s, text = fixture("claude-transcript.jsonl") } = {}) {
  const sid = "0fbf3e48-42ea-40d5-b3ed-40730f7e7b44", pid = 52896;
  const stdin = JSON.parse(fixture("claude-status-stdin.json"));
  const mtimes = {};
  const transcript = `/Users/a/.claude/projects/-Users-a-src-demo/${sid}.jsonl`, session = `/Users/a/.claude/sessions/${pid}.json`;
  const started = (startedAt) => JSON.stringify({ pid, sessionId: sid, cwd: "/Users/a/src/demo", startedAt, kind: "interactive" });
  const io = contextIo({
    files: { [transcript]: text, [session]: started(1794613515093) },
    mtimes,
    terminals: { t7: { pid, created: 1794613511000, title: "Claude Code" } },
    envs: { [pid]: { HC_TERMINAL_ID: "t7" } },
  });
  io.now = () => clock.now;
  const status = integrationFile(io, "claude", "t7");
  const write = (cacheRead, at) => {
    const cw = stdin.context_window;
    io.files[status] = JSON.stringify({ v: 1, terminal: "t7", pid, at, claude: { ...stdin, context_window: { ...cw, current_usage: { ...cw.current_usage, cache_read_input_tokens: cacheRead } } } });
    mtimes[status] = at;
  };
  const used = (cacheRead) => 4 + 390 + 143 + cacheRead;
  const reader = new ContextReader(io, { strategies: [wrap(claude)], queue: makeQueue(2) });
  const cx = makeCx();
  const see = () => reader.see({ terminal: "t7", program: { key: "claude" }, app: "claude", status: "idle" }, true, cx);
  const of = (path) => io.calls.filter((c) => c[1] === path).map((c) => c[0]);
  const ofStatus = () => of(status);
  const tails = () => io.calls.filter((c) => c[0] === "tail").length;
  // `stat` or `readText` of one file answering as `fn` says; the returned function ends it.
  const stub = (name, path, fn) => {
    const real = io[name];
    io[name] = async (p, ...a) => (p === path ? fn(() => real(p, ...a)) : real(p, ...a));
    return () => { io[name] = real; };
  };
  return { io, status, transcript, session, started, mtimes, write, used, reader, cx, see, of, ofStatus, tails, stub };
}
const T0 = Date.parse("2026-11-14T00:00:00Z");

test("Claude's status line file is stat'd once and read once per look, stat first; read() asks it nothing", async () => {
  const w = claudeWorld();
  w.write(47_784, T0);
  w.see();
  await clock.advance(2000);
  assert.deepEqual(w.cx.errors, []);
  assert.equal(w.reader.reading.used, w.used(47_784));
  assert.equal(w.reader.reading.source, "status-line");
  assert.deepEqual(w.ofStatus(), ["stat", "readText"], "a look that reads: one observation, nothing more");
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.deepEqual(w.ofStatus(), ["stat", "readText"], "a look with nothing new: the same, and no read()");
  assert.equal(w.io.calls.filter((c) => c[0] === "tail").length, 0, "unchanged: the transcript isn't read");
});

test("Claude's status line file replaced between locate() and read(): this look keeps what locate saw, the next reads the new file", async () => {
  let swap = null;
  const w = claudeWorld({ wrap: (s) => ({ ...s, async locate(...a) { const src = await s.locate(...a); swap?.(); swap = null; return src; } }) });
  w.write(47_784, T0);
  swap = () => w.write(90_000, T0 + 5000);
  w.see();
  await clock.advance(2000);
  assert.deepEqual(w.cx.errors, []);
  assert.equal(w.reader.reading.used, w.used(47_784), "the content of locate()'s observation, not the newer file");
  assert.equal(w.reader.reading.at, T0, "with that content's time, not the newer file's mtime");
  await clock.advance(IDLE_MS);
  assert.equal(w.reader.reading.used, w.used(90_000), "the newer file is read on the next look, not taken as unchanged");
  assert.equal(w.reader.reading.at, T0 + 5000);
});

test("Claude's status line file replaced between locate()'s stat and its read: the newer content now, and read again on the next look", async () => {
  const w = claudeWorld();
  w.write(47_784, T0);
  const readText = w.io.readText;
  let swap = () => w.write(90_000, T0 + 5000);
  w.io.readText = async (p) => { if (p === w.status && swap) { swap(); swap = null; } return readText(p); };
  w.see();
  await clock.advance(2000);
  assert.equal(w.reader.reading.used, w.used(90_000), "the content read is the newer file's");
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.equal(w.io.calls.filter((c) => c[0] === "tail").length > 0, true, "its stat was the older file's: changed, read again");
  assert.equal(w.reader.reading.used, w.used(90_000));
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.equal(w.io.calls.filter((c) => c[0] === "tail").length, 0, "then unchanged");
});

test("Claude: each file of the source is stat'd once per look, before it is read, and the reader stats none again", async () => {
  const w = claudeWorld();
  w.write(47_784, T0);
  w.see();
  await clock.advance(2000);
  assert.equal(w.reader.reading.source, "status-line");
  // The status line gives the window: no snapshot search, which stats the transcript itself.
  assert.deepEqual(w.of(w.session), ["stat", "readText"]);
  assert.deepEqual(w.of(w.status), ["stat", "readText"]);
  assert.deepEqual(w.of(w.transcript), ["stat", "tail"], "the stat that found it is the reader's (the stub's tail stats nothing)");
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.deepEqual([w.of(w.session), w.of(w.status), w.of(w.transcript)], [["stat", "readText"], ["stat", "readText"], ["stat"]], "nothing new: the same, without the read");
});

test("Claude: a status line file whose stat fails is read all the same, and again on every look while it fails", async () => {
  const w = claudeWorld();
  w.write(47_784, T0);
  w.see();
  await clock.advance(2000);
  assert.equal(w.reader.reading.used, w.used(47_784));
  const works = w.stub("stat", w.status, () => null); // `stat` failed or timed out; the file is there
  w.write(60_000, T0 + 1000);
  await clock.advance(IDLE_MS);
  assert.equal(w.reader.reading.used, w.used(60_000), "no stat: its content counts");
  assert.equal(w.reader.reading.source, "status-line");
  w.write(70_000, T0 + 2000);
  await clock.advance(IDLE_MS);
  assert.equal(w.reader.reading.used, w.used(70_000), "no stat twice: not taken as unchanged");
  works();
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.ok(w.tails() > 0, "a look without a stat is not kept: read again");
  assert.equal(w.reader.reading.used, w.used(70_000));
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.equal(w.tails(), 0, "with its stat: unchanged");
  assert.deepEqual(w.cx.errors, []);
});

for (const [what, answer] of [["can't be read", null], ["doesn't parse", "{ half"]]) {
  test(`Claude: a status line file that ${what} once, while the transcript gives a reading: read again on the next look, its stat unchanged`, async () => {
    const w = claudeWorld();
    w.write(47_784, T0);
    const works = w.stub("readText", w.status, () => answer);
    w.see();
    await clock.advance(2000);
    assert.ok(valid(w.reader.reading), "the transcript's reading");
    assert.notEqual(w.reader.reading.source, "status-line");
    works();
    await clock.advance(IDLE_MS);
    assert.equal(w.reader.reading.source, "status-line", "the file wasn't taken as read");
    assert.equal(w.reader.reading.used, w.used(47_784));
    w.io.calls.length = 0;
    await clock.advance(IDLE_MS);
    assert.equal(w.tails(), 0, "read: unchanged");
    assert.deepEqual(w.cx.errors, []);
  });
}

test("Claude without a status line file: one stat and one read of it per look, the transcript not read again; one that comes is read, its stat failing or not", async () => {
  const w = claudeWorld();
  w.see();
  await clock.advance(2000);
  assert.ok(valid(w.reader.reading));
  assert.equal(w.reader.reading.source, "compaction");
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS * 3);
  const looks = w.of(w.session).filter((c) => c === "stat").length;
  assert.ok(looks >= 3);
  assert.deepEqual(w.ofStatus(), Array(looks).fill(["stat", "readText"]).flat(), "asked on every look, as before");
  assert.equal(w.tails(), 0, "no file twice is no change");
  const works = w.stub("stat", w.status, () => null);
  w.write(47_784, T0);
  await clock.advance(IDLE_MS);
  assert.equal(w.reader.reading.source, "status-line", "there now, its stat failing");
  works();
  await clock.advance(IDLE_MS);
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.equal(w.tails(), 0);
});

// The transcript up to its compaction, without the status line: the window is the /context
// snapshot's (23:46:18), which counts only for a session started before it.
const snapshotOnly = () => {
  const lines = fixture("claude-transcript.jsonl").trimEnd().split("\n");
  return lines.slice(0, lines.findIndex((l) => JSON.parse(l).subtype === "compact_boundary")).join("\n") + "\n";
};
const AFTER_SNAPSHOT = Date.parse("2026-11-13T23:47:00Z");

test("Claude's session file replaced between locate() and the read, only its startedAt new: this look keeps what locate saw, the next weighs the snapshot again", async () => {
  let swap = null;
  const w = claudeWorld({ text: snapshotOnly(), wrap: (s) => ({ ...s, async locate(...a) { const src = await s.locate(...a); swap?.(); swap = null; return src; } }) });
  // The same session id and folder (so the source's key stays), the same size: only the time.
  swap = () => { w.io.files[w.session] = w.started(AFTER_SNAPSHOT); w.mtimes[w.session] = 5; };
  w.see();
  await clock.advance(2000);
  assert.deepEqual(w.cx.errors, []);
  assert.equal(w.reader.reading.window, 1_000_000, "the session as locate() read it: the snapshot counts");
  await clock.advance(IDLE_MS);
  assert.equal(w.reader.reading.window, null, "the newer session file is read on the next look: the snapshot is from before it");
  assert.equal(w.reader.reading.used, 48_321);
});

test("Claude's session file replaced between locate()'s stat and its read: the newer content now, and read again on the next look", async () => {
  const w = claudeWorld({ text: snapshotOnly() });
  let swap = () => { w.io.files[w.session] = w.started(AFTER_SNAPSHOT); w.mtimes[w.session] = 5; };
  const works = w.stub("readText", w.session, (real) => { swap?.(); swap = null; return real(); });
  w.see();
  await clock.advance(2000);
  assert.equal(w.reader.reading.window, null, "the content read is the newer file's");
  works();
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.ok(w.tails() > 0, "its stat was the older file's: changed, read again");
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.equal(w.tails(), 0, "then unchanged");
});

test("Claude: a session file whose stat fails is used all the same, and the source read again on every look while it fails", async () => {
  const w = claudeWorld({ text: snapshotOnly() });
  const works = w.stub("stat", w.session, () => null);
  w.see();
  await clock.advance(2000);
  assert.equal(w.reader.reading.window, 1_000_000);
  w.io.files[w.session] = w.started(AFTER_SNAPSHOT); // no stat to tell it by
  await clock.advance(IDLE_MS);
  assert.equal(w.reader.reading.window, null, "not taken as unchanged");
  works();
  await clock.advance(IDLE_MS);
  w.io.calls.length = 0;
  await clock.advance(IDLE_MS);
  assert.equal(w.tails(), 0, "with its stat: unchanged");
  assert.deepEqual(w.cx.errors, []);
});

test("sweep removes the integration files of ended terminals whose process is gone, and temp files older than an hour, nothing else", async () => {
  const dir = "/Users/a/.cache/herdr-roundup/context/claude";
  const io = contextIo({
    files: {
      [`${dir}/t1.json`]: JSON.stringify({ pid: 1 }), // live terminal here
      [`${dir}/t2.json`]: JSON.stringify({ pid: 2 }), // ended, process gone, old
      [`${dir}/t3.json`]: JSON.stringify({ pid: 3 }), // ended here, but its process lives (another core)
      [`${dir}/t4.json`]: JSON.stringify({ pid: 4 }), // ended, but written a moment ago
      [`${dir}/.t5.123`]: "", // a temp file of the status line script, left by a killed run
      [`${dir}/.t1.456`]: "", // the same, of a live terminal
      [`${dir}/.t1.789`]: "", // a temp file being written now
      [`${dir}/notes.txt`]: "", // anything else
    },
    mtimes: { [`${dir}/t4.json`]: 3 * 3600_000, [`${dir}/.t1.789`]: 3 * 3600_000 },
  });
  io.now = () => 3 * 3600_000;
  io.alive = async (pid) => pid === 3;
  const gone = [];
  io.remove = async (p) => { gone.push(p); delete io.files[p]; return true; };
  assert.equal(await sweep(io, ["t1"]), 3);
  assert.deepEqual(gone.sort(), [`${dir}/.t1.456`, `${dir}/.t5.123`, `${dir}/t2.json`]);
});

// Two agents one after the other in the same terminal; A's read waits on a gate the test opens.
function switching() {
  const { io, cx } = world();
  const gate = {};
  const reads = { a: 0, b: 0 };
  const mk = (id, value) => ({
    id,
    matches: [id],
    async locate() { return { id, pid: 10, session: id, files: [FILE] }; },
    async read() {
      reads[id]++;
      if (id === "a" && gate.hold) await new Promise((r) => { gate.open = r; });
      return { used: value, window: 1000, at: 1, source: id, exact: true };
    },
  });
  const reader = new ContextReader(io, { strategies: [mk("a", 111), mk("b", 222)], queue: makeQueue(2) });
  const pane = (key) => ({ terminal: "t1", program: { key }, app: null, status: "idle" });
  return { io, cx, gate, reads, reader, pane };
}

test("the program changes while a read is pending, the new one's first look coming first: it is handed over and reads", async () => {
  const { cx, gate, reads, reader, pane } = switching();
  gate.hold = true;
  reader.see(pane("a"), true, cx);
  await clock.advance(2000); // A's read now waits
  assert.equal(reads.a, 1);
  reader.see(pane("b"), true, cx);
  await clock.advance(2000); // B's first look fires while A is busy
  assert.equal(reads.b, 0);
  gate.open();
  await clock.advance(10);
  assert.equal(reads.b, 1, "B read once A was done");
  assert.equal(reader.reading.used, 222, "A's late answer never replaces B's");
  await clock.advance(IDLE_MS * 3);
  assert.ok(reader.timer, "B keeps its schedule");
  assert.deepEqual(cx.errors, []);
});

test("the program changes while a read is pending, the old read ending first: the new one reads on its own timer", async () => {
  const { cx, gate, reads, reader, pane } = switching();
  gate.hold = true;
  reader.see(pane("a"), true, cx);
  await clock.advance(2000);
  reader.see(pane("b"), true, cx);
  gate.open(); // A ends before B's first timer
  await clock.advance(2000);
  assert.equal(reads.b, 1);
  assert.equal(reader.reading.used, 222);
});

test("an agent that becomes a shell while its read is pending reads nothing after it", async () => {
  const { cx, gate, reads, reader, pane } = switching();
  gate.hold = true;
  reader.see(pane("a"), true, cx);
  await clock.advance(2000);
  reader.see(pane("b"), true, cx);
  await clock.advance(2000); // B's look noted as `again`
  reader.see(pane("shell"), true, cx);
  gate.open();
  await clock.advance(IDLE_MS * 2);
  assert.deepEqual(reads, { a: 1, b: 0 });
  assert.equal(reader.reading, null);
  assert.equal(reader.timer, null);
});

test("no reading once (a failed tail): read again on the next look although no file changed", async () => {
  const { s, reader, cx, pane } = world();
  const good = s.reading;
  s.reading = null;
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(s.reads, 1);
  s.reading = good;
  await clock.advance(RETRY_MS[0]);
  assert.equal(s.reads, 2, "retried without a file change");
  assert.equal(reader.reading.used, 100);
});

test("a strategy that threw once is read again on the next look, though its files didn't change", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(reader.reading.used, 100);
  touch(io, FILE);
  reader.see(pane("working"), true, cx); // a status change: a look at once
  s.throws = true;
  await clock.advance(10);
  assert.equal(reader.reading, null);
  s.throws = false;
  await clock.advance(RETRY_MS[0] + 10);
  assert.equal(reader.reading?.used, 100);
});

test("a deliberate no-reading (a compaction) still clears the meter", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(reader.reading.used, 100);
  touch(io, FILE);
  s.reading = null;
  await clock.advance(IDLE_MS);
  assert.equal(reader.reading, null);
});

test("hc get gives no answer after a read: the reading stands, and the next look checks again", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.see(pane(), true, cx);
  await clock.advance(2000);
  assert.equal(reader.reading.used, 100);
  const orig = io.terminal;
  io.terminal = async () => null; // hc slow or failed (the stub strategy's locate doesn't ask it)
  touch(io, FILE);
  s.reading = { ...s.reading, used: 150 };
  await clock.advance(IDLE_MS);
  assert.equal(reader.reading.used, 100, "unverified: not taken, the old one stays");
  io.terminal = orig;
  await clock.advance(IDLE_MS);
  assert.equal(reader.reading.used, 150, "checked again without a file change");
  io.terminal = async (t) => ({ ...(await orig(t)), pid: null }); // an answer: no such process
  touch(io, FILE);
  await clock.advance(IDLE_MS);
  assert.equal(reader.reading, null);
});

// The real strategies, each over its fixture: a reading, then hc without an answer during locate.
function realAgent(kind) {
  if (kind === "claude") {
    const sid = "0fbf3e48-42ea-40d5-b3ed-40730f7e7b44";
    const lines = fixture("claude-transcript.jsonl").trimEnd().split("\n");
    const usage = lines.filter((l) => l.includes('"type":"assistant"')).pop();
    const io = contextIo({
      files: {
        [`/Users/a/.claude/projects/-Users-a-src-demo/${sid}.jsonl`]: usage + "\n",
        "/Users/a/.claude/sessions/52896.json": JSON.stringify({ pid: 52896, sessionId: sid, cwd: "/Users/a/src/demo", startedAt: 1794613515093, kind: "interactive" }),
        "/Users/a/.claude/sessions/52897.json": JSON.stringify({ pid: 52897, sessionId: "1fbf3e48-42ea-40d5-b3ed-40730f7e7b44", cwd: "/Users/a/src/demo", startedAt: 1794613515093, kind: "interactive" }),
      },
      terminals: { t7: { pid: 52896, created: 1794613511000, title: "Claude Code" } },
      envs: { 52896: { HC_TERMINAL_ID: "t7" }, 52897: { HC_TERMINAL_ID: "t7" } },
    });
    return { io, pane: { terminal: "t7", program: { key: "claude" }, app: "claude", status: "idle" }, otherPid: 52897 };
  }
  const id = "01a1d750-0653-7190-914d-7c804d23545c";
  const p = localParts(1794613708371);
  const file = `/Users/a/.codex/sessions/${p.y}/${p.mo}/${p.d}/rollout-${p.y}-${p.mo}-${p.d}T${p.h}-${p.mi}-${p.s}-${id}.jsonl`;
  const io = contextIo({
    files: { [file]: fixture("codex-rollout.jsonl") },
    terminals: { t8: { pid: 55080, created: 1, title: "01a1d750-0653-7190-914d-7c804... | ok" } },
    envs: { 55080: { HC_TERMINAL_ID: "t8" }, 55081: { HC_TERMINAL_ID: "t8" } },
  });
  return { io, pane: { terminal: "t8", program: { key: "codex" }, app: "codex", status: "idle" }, otherPid: 55081 };
}

for (const kind of ["claude", "codex"]) {
  test(`${kind}: hc gives no answer while locating: the reading stands; an answer without the process, or another process, drops it`, async () => {
    const { io, pane, otherPid } = realAgent(kind);
    io.now = () => clock.now;
    const reader = new ContextReader(io, { queue: makeQueue(2) });
    const cx = makeCx();
    reader.see(pane, true, cx);
    await clock.advance(2000);
    const first = reader.reading;
    assert.ok(first?.used > 0, "a reading to begin with");
    const orig = io.terminal;
    io.terminal = async () => null; // hc slow or failed
    await clock.advance(IDLE_MS);
    assert.deepEqual(reader.reading, first, "no answer proves nothing");
    io.terminal = orig;
    const reads = () => io.calls.filter((c) => c[0] === "tail").length;
    const before = reads();
    await clock.advance(IDLE_MS);
    assert.ok(reads() > before, "read again after no answer, though no file changed");
    assert.deepEqual(reader.reading, first);
    // Another process now (for Codex also without the id in its title, which would name the same
    // rollout and rightly read it): the old reading goes, as its new source has none.
    io.terminal = async (t) => ({ ...(await orig(t)), pid: otherPid, ...(kind === "codex" ? { title: "Codex" } : {}) });
    await clock.advance(IDLE_MS);
    assert.equal(reader.reading, null, "another process: the old reading goes");
    io.terminal = async (t) => ({ ...(await orig(t)), pid: null }); // an answer: no process
    reader.reading = first;
    await clock.advance(RETRY_MS.at(-1));
    assert.equal(reader.reading, null, "hc answered without a process");
    assert.deepEqual(cx.errors, []);
  });
}

test("a closed reader starts no look and arms nothing, a pending one's answer is dropped, and another reader on the queue still reads", async () => {
  const io = contextIo({ files: { [FILE]: "x" }, terminals: { t1: { pid: 10, created: 0, title: "" }, t2: { pid: 10, created: 0, title: "" }, t3: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  const gates = [];
  const looks = { t1: 0, t2: 0, t3: 0 };
  const strategy = {
    id: "fake",
    matches: ["fake"],
    async locate({ terminal }) {
      looks[terminal]++;
      if (gates.hold) await new Promise((r) => gates.push(r));
      return { id: "fake", pid: 10, session: terminal, files: [FILE] };
    },
    async read() { return { used: 100, window: 1000, at: 1, source: "fake", exact: true }; },
  };
  const queue = makeQueue(2);
  const readers = Object.fromEntries(["t1", "t2", "t3"].map((t) => [t, new ContextReader(io, { strategies: [strategy], queue })]));
  const cx = makeCx();
  const pane = (t) => ({ terminal: t, program: { key: "fake" }, app: null, status: "idle" });
  gates.hold = true;
  for (const t of ["t1", "t2", "t3"]) readers[t].see(pane(t), true, cx);
  await clock.advance(2000);
  // Two hold the queue (which two goes by each terminal's jitter), the third waits.
  const [running, other] = ["t1", "t2", "t3"].filter((t) => looks[t] === 1);
  const queued = ["t1", "t2", "t3"].find((t) => looks[t] === 0);
  assert.ok(running && other && queued);
  assert.equal(queue.waiting, 1);
  readers[running].close(); // in flight
  readers[queued].close(); // queued, not started
  gates.hold = false;
  while (gates.length) gates.shift()();
  await clock.advance(10);
  assert.equal(looks[queued], 0, "the queued look of a closed reader does no I/O");
  assert.equal(readers[running].reading, null, "the pending answer is dropped");
  assert.equal(readers[running].timer, null);
  assert.equal(readers[queued].timer, null);
  assert.equal(readers[other].reading?.used, 100);
  readers[running].see(pane(running), true, cx);
  await clock.advance(IDLE_MS * 2);
  assert.equal(looks[running], 1, "nothing arms again after close, not even from see()");
  assert.ok(looks[other] >= 2, "the other reader goes on");
  assert.deepEqual(cx.errors, []);
});

test("the queue: a released job frees its place once, a waiting one never runs, and late answers free nothing", async () => {
  const q = makeQueue(2);
  const gates = [];
  let started = 0;
  const hang = () => new Promise((resolve, reject) => { started++; gates.push({ resolve, reject }); });
  const a = q.enter(hang), b = q.enter(hang), c = q.enter(hang), d = q.enter(hang);
  await flush();
  assert.equal(started, 2);
  assert.equal(q.running, 2);
  assert.equal(q.waiting, 2);
  c.release(); // waiting: taken out, never runs, its caller gets false
  assert.equal(await c.promise, false);
  assert.equal(q.waiting, 1);
  a.release(); // running and hanging for good: its place goes to d
  a.release(); // twice: nothing more
  assert.equal(await a.promise, false);
  await flush();
  assert.equal(started, 3, "d runs in a's place");
  assert.equal(q.running, 2);
  assert.equal(q.waiting, 0);
  gates[0].resolve("late"); // a's late answer
  await flush();
  assert.equal(q.running, 2, "a's late answer frees no other job's place");
  gates[1].reject(new Error("b failed")); // b settles on its own
  await assert.rejects(b.promise);
  await flush();
  assert.equal(q.running, 1);
  b.release(); // after it settled: nothing
  assert.equal(q.running, 1);
  gates[2].resolve(true);
  assert.equal(await d.promise, true);
  await flush();
  assert.equal(q.running, 0, "never below zero");
  assert.equal(started, 3, "c never ran");
});

test("headers that close while their looks hang free the shared queue: a third header still reads", async () => {
  const io = contextIo({ files: { [FILE]: "x" }, terminals: { t1: { pid: 10, created: 0, title: "" }, t2: { pid: 10, created: 0, title: "" }, t3: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  const looks = { t1: 0, t2: 0, t3: 0 };
  const strategy = {
    id: "fake",
    matches: ["fake"],
    async locate({ terminal }) {
      looks[terminal]++;
      if (terminal !== "t3") await new Promise(() => {}); // hc get or exec of a closed copy: never settles
      return { id: "fake", pid: 10, session: terminal, files: [FILE] };
    },
    async read() { return { used: 100, window: 1000, at: 1, source: "fake", exact: true }; },
  };
  const queue = makeQueue(2);
  const readers = Object.fromEntries(["t1", "t2", "t3"].map((t) => [t, new ContextReader(io, { strategies: [strategy], queue })]));
  const cx = makeCx();
  const pane = (t) => ({ terminal: t, program: { key: "fake" }, app: null, status: "idle" });
  readers.t1.see(pane("t1"), true, cx);
  readers.t2.see(pane("t2"), true, cx);
  await clock.advance(2000);
  assert.equal(queue.running, 2, "both hang in the queue");
  readers.t1.close();
  readers.t2.close();
  assert.equal(queue.running, 0, "closing freed both places");
  readers.t3.see(pane("t3"), true, cx);
  await clock.advance(2000);
  assert.equal(readers.t3.reading?.used, 100);
  assert.deepEqual(cx.errors, []);
});

// Looks of the stub strategy within `ms`, counted from now.
async function looksWithin(s, ms) {
  const before = s.locates;
  await clock.advance(ms);
  return s.locates - before;
}

test("read without a number, where the file alone decides: the meter goes, no backoff, the unchanged file isn't read again, a later count comes in the cadence", async () => {
  const { io, s, reader, cx, pane } = world();
  reader.strategies[0].keepsNoReading = true;
  const good = s.reading;
  s.reading = NO_READING; // Codex after a compaction mid-turn, until its next token_count
  reader.see(pane("working"), true, cx);
  await clock.advance(2000 + AFTER_STATUS_MS);
  assert.equal(reader.reading, null);
  assert.equal(reader.misses, 0);
  const reads = s.reads;
  assert.ok((await looksWithin(s, WORKING_MS * 6)) >= 6, "every 15 s while working and shown, no backoff");
  assert.equal(s.reads, reads, "unchanged: looked at, not read");
  reader.see(pane("working"), false, cx); // hidden: the idle schedule
  const hidden = await looksWithin(s, IDLE_MS * 2);
  assert.ok(hidden >= 2 && hidden <= 3, `every 60 s hidden (${hidden})`);
  reader.see(pane("working"), true, cx);
  await clock.advance(10);
  touch(io, FILE);
  s.reading = good;
  await clock.advance(WORKING_MS);
  assert.equal(reader.reading?.used, 100, "the next count within 15 s");
  assert.deepEqual(cx.errors, []);
});

test("a file observed as UNSURE: its look is never kept, with a reading or without a number where the file alone decides; read again on every look", async () => {
  for (const reading of [undefined, NO_READING]) {
    const { s, reader, cx, pane } = world();
    reader.strategies[0].keepsNoReading = true; // Codex
    s.src = { ...s.src, observed: { [FILE]: UNSURE } };
    if (reading) s.reading = reading;
    reader.see(pane(), true, cx);
    await clock.advance(2000);
    assert.equal(s.reads, 1);
    assert.equal(reader.reading?.used, reading ? undefined : 100, "the look's content counts");
    assert.deepEqual([reader.key, reader.stats], [null, null], "nothing kept, the sentinel least of all");
    await clock.advance(IDLE_MS * 2);
    assert.equal(s.reads, 3, "read on each look");
    assert.equal(reader.misses, 0);
    s.src = { ...s.src, observed: { [FILE]: { size: 1, mtime: 0 } } };
    await clock.advance(IDLE_MS);
    assert.equal(s.reads, 4);
    assert.notEqual(reader.stats, null, "with its stat: kept");
    await clock.advance(IDLE_MS);
    assert.equal(s.reads, 4, "and unchanged");
    assert.deepEqual(cx.errors, []);
  }
});

test("read without a number, where the strategy can't tell it from a failed read: read again on every look, without a backoff", async () => {
  const { s, reader, cx, pane } = world();
  reader.strategies[0].keepsNoReading = false; // Claude
  s.reading = NO_READING;
  reader.see(pane("working"), true, cx);
  await clock.advance(2000 + AFTER_STATUS_MS);
  const reads = s.reads;
  await clock.advance(WORKING_MS * 4);
  assert.ok(s.reads - reads >= 4, "read on each look, every 15 s");
  assert.equal(reader.misses, 0);
});

test("Claude: a status line file that can't be read a few times is read again every 15 s while working, not after a growing backoff", async () => {
  const sid = "0fbf3e48-42ea-40d5-b3ed-40730f7e7b44";
  const transcript = `/Users/a/.claude/projects/-Users-a-src-demo/${sid}.jsonl`;
  const io = contextIo({
    files: {
      [transcript]: JSON.stringify({ type: "user", sessionId: sid, message: { role: "user", content: "hi" }, timestamp: "2026-11-13T23:45:00Z" }) + "\n",
      "/Users/a/.claude/sessions/52896.json": JSON.stringify({ pid: 52896, sessionId: sid, cwd: "/Users/a/src/demo", startedAt: 1794613515093, kind: "interactive" }),
    },
    terminals: { t7: { pid: 52896, created: 1794613511000, title: "Claude Code" } },
    envs: { 52896: { HC_TERMINAL_ID: "t7" } },
  });
  const status = integrationFile(io, "claude", "t7");
  io.files[status] = JSON.stringify({ v: 1, terminal: "t7", pid: 52896, at: 1794613600000, claude: { session_id: sid, transcript_path: transcript, model: { id: "claude-x" }, context_window: { context_window_size: 1_000_000, current_usage: { input_tokens: 5000 } } } });
  io.now = () => clock.now;
  let fails = 3;
  const readText = io.readText;
  io.readText = async (p) => (p === status && fails-- > 0 ? null : readText(p)); // there, but not read this time
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  reader.see({ terminal: "t7", program: { key: "claude" }, app: "claude", status: "working" }, true, cx);
  await clock.advance(2000 + AFTER_STATUS_MS);
  assert.equal(reader.reading, null);
  // With a backoff the fourth look would come at 15 + 30 + 60 s; every 15 s it comes at 45 s.
  await clock.advance(WORKING_MS * 3);
  assert.equal(reader.reading?.used, 5000);
  assert.equal(reader.reading?.window, 1_000_000);
  assert.deepEqual(cx.errors, []);
});

test("a process's environment is asked once per pid: kept while it runs, asked again for a new pid or after a failed ps", async () => {
  const { io, pane } = realAgent("claude");
  io.now = () => clock.now;
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  const envs = () => io.calls.filter((c) => c[0] === "env").length;
  const env = io.env;
  let failOnce = true;
  io.env = async (pid) => (failOnce ? ((failOnce = false), null) : env(pid));
  reader.see(pane, true, cx);
  await clock.advance(2000);
  await clock.advance(IDLE_MS * 3);
  assert.ok(reader.reading?.used > 0);
  // The stub counts only the calls that reached it: the first look's failed ps wasn't kept, the
  // second look's answer was, and no later look asked again.
  assert.equal(envs(), 1);
  assert.equal(reader.memo.env?.pid, 52896);
  const orig = io.terminal;
  io.terminal = async (t) => ({ ...(await orig(t)), pid: 52897 }); // a new process in the terminal
  await clock.advance(IDLE_MS);
  assert.equal(reader.memo.env?.pid, 52897, "one entry, for the current pid");
  assert.deepEqual(cx.errors, []);
});

test("Codex: a title that names another thread when the read ends drops the late answer; one without an id, or the cut id of a fallback, keeps it", async () => {
  const { io, pane } = realAgent("codex");
  io.now = () => clock.now;
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  const tail = io.tail;
  let during = null; // the title hc get gives once the read has started
  const orig = io.terminal;
  let title = null;
  io.terminal = async (t) => ({ ...(await orig(t)), ...(title === null ? {} : { title }) });
  io.tail = async (...a) => { if (during !== null) title = during; return tail(...a); };
  reader.see(pane, true, cx);
  await clock.advance(2000);
  const first = reader.reading;
  assert.ok(first?.used > 0);
  // /new in the same process while the read runs: the title now names another thread.
  during = "01a1d751-9827-7f61-959e-cedf8... | ok";
  reader.key = reader.stats = null; // a file changed: read again
  reader.see({ ...pane, status: "working" }, true, cx);
  await clock.advance(10);
  assert.equal(reader.reading, null, "another thread: the late answer goes");
  // A title without an id for a moment says nothing: the answer stands.
  title = null;
  during = "Codex";
  reader.see({ ...pane, status: "idle" }, true, cx);
  await clock.advance(10);
  assert.deepEqual(reader.reading, first);
  assert.deepEqual(cx.errors, []);
});

test("Codex: the same thread's id shown longer when the read ends keeps the answer, and the source's key stays", async () => {
  const { io, pane } = realAgent("codex");
  io.now = () => clock.now;
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  const tail = io.tail;
  const orig = io.terminal;
  let title = null, during = null;
  io.terminal = async (t) => ({ ...(await orig(t)), ...(title === null ? {} : { title }) });
  io.tail = async (...a) => { if (during !== null) title = during; return tail(...a); };
  reader.see(pane, true, cx);
  await clock.advance(2000);
  const first = reader.reading, key = reader.key;
  assert.ok(first?.used > 0);
  assert.ok(key, "a source key was kept");
  assert.equal(first.session, "01a1d750-0653-7190-914d-7c804d23545c", "the session is the whole id, not the title's cut");
  // Other title items go: Codex shows the whole id during the next read.
  during = "01a1d750-0653-7190-914d-7c804d23545c";
  reader.key = reader.stats = null;
  reader.see({ ...pane, status: "working" }, true, cx);
  await clock.advance(10);
  assert.deepEqual(reader.reading, first, "the same thread: the answer stands");
  // The next look locates by the whole id: the same source.
  during = null;
  reader.see({ ...pane, status: "idle" }, true, cx);
  await clock.advance(60_000);
  assert.deepEqual(reader.reading, first);
  assert.equal(reader.key, key, "the source's key doesn't change with the title's cut");
  assert.deepEqual(cx.errors, []);
  reader.close();
});

test("Codex fallback (CODEX_HOME not as read): the cut title id still matches its open rollout after the read", async () => {
  const { io, pane } = realAgent("codex");
  io.now = () => clock.now;
  const file = Object.keys(io.files)[0];
  io.env = async () => ({ HC_TERMINAL_ID: "t8", CODEX_HOME: "/Users/a/My" }); // cut at a space
  io.openFiles = async () => [file];
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  reader.see(pane, true, cx);
  await clock.advance(2000);
  assert.equal(reader.reading?.used, 18_298);
  assert.equal(reader.reading?.session, "01a1d750-0653-7190-914d-7c804d23545c", "the whole id, from the rollout's name");
});

test("Claude: a new session in the same process during a read: the late answer stands until the next successful locate, which clears it", async () => {
  const { io, pane } = realAgent("claude");
  io.now = () => clock.now;
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  reader.see(pane, true, cx);
  await clock.advance(2000);
  const first = reader.reading;
  assert.ok(first?.used > 0);
  // /clear: the session file of the same pid names a new session, with no transcript yet.
  const sessionFile = "/Users/a/.claude/sessions/52896.json";
  const s = JSON.parse(io.files[sessionFile]);
  const tail = io.tail;
  io.tail = async (...a) => { io.files[sessionFile] = JSON.stringify({ ...s, sessionId: "2fbf3e48-42ea-40d5-b3ed-40730f7e7b44" }); return tail(...a); };
  reader.key = reader.stats = null; // a file changed: read again
  reader.see({ ...pane, status: "working" }, true, cx);
  await clock.advance(10);
  assert.deepEqual(reader.reading, first, "the same pid: not caught after the read");
  io.tail = tail;
  await clock.advance(AFTER_STATUS_MS + 10);
  assert.equal(reader.reading, null, "the next locate sees the new session: no transcript yet, no number");
  assert.equal(reader.misses, 0);
  assert.deepEqual(cx.errors, []);
});

test("Codex: a failed tail (a second size not known) is retried on the next look without stats, though the rollout didn't change", async () => {
  const { io, pane } = realAgent("codex");
  io.now = () => clock.now;
  const tail = io.tail;
  let fail = true;
  io.tail = async (...a) => (fail ? ((fail = false), null) : tail(...a));
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  reader.see(pane, true, cx);
  await clock.advance(2000);
  assert.equal(reader.reading, null);
  assert.equal(reader.stats, null, "a failed read keeps no stats");
  assert.equal(reader.misses, 1);
  await clock.advance(RETRY_MS[0]);
  assert.equal(reader.reading?.used, 18_298, "read again, the file unchanged");
});

test("Codex: a title with a second thread id when the read ends drops the late answer", async () => {
  const { io, pane } = realAgent("codex");
  io.now = () => clock.now;
  const reader = new ContextReader(io, { queue: makeQueue(2) });
  const cx = makeCx();
  const orig = io.terminal;
  let title = null;
  io.terminal = async (t) => ({ ...(await orig(t)), ...(title === null ? {} : { title }) });
  reader.see(pane, true, cx);
  await clock.advance(2000);
  assert.ok(reader.reading?.used > 0);
  const tail = io.tail;
  io.tail = async (...a) => { title = "01a1d750-0653-7190-914d-7c804... | 01a1d751-9827-7f61-959e-cedf8..."; return tail(...a); };
  reader.key = reader.stats = null; // a file changed: read again
  reader.see({ ...pane, status: "working" }, true, cx);
  await clock.advance(10);
  assert.equal(reader.reading, null, "two ids: not the same thread for sure");
});

test("a header that closes between wake() and its task's start takes no place in the queue", async () => {
  const { reader, s } = world();
  const queue = makeQueue(2);
  reader.queue = queue;
  const hang = () => new Promise(() => {});
  queue.enter(hang); queue.enter(hang); // both places taken
  const tasks = [];
  const cx = makeCx();
  const later = { ...cx, spawn: (body) => { tasks.push(body); } }; // GPUI starts it on the next tick
  reader.strategy = reader.strategies[0];
  reader.terminal = "t1";
  reader.wake(later);
  reader.close();
  for (const body of tasks) body(cx); // not awaited: a task that queued would wait for good
  await flush();
  assert.equal(queue.waiting, 0, "nothing queued for a closed reader");
  assert.equal(reader.job, null);
  assert.equal(reader.busy, false);
  assert.equal(s.locates, 0);
});
