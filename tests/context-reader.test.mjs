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
import { FIRST } from "../mods/roundup-pane/context/tail.js";

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

test("sweep removes the integration files of ended terminals whose process is gone, and nothing else", async () => {
  const dir = "/Users/a/.cache/herdr-roundup/context/claude";
  const io = contextIo({
    files: {
      [`${dir}/t1.json`]: JSON.stringify({ pid: 1 }), // live terminal here
      [`${dir}/t2.json`]: JSON.stringify({ pid: 2 }), // ended, process gone, old
      [`${dir}/t3.json`]: JSON.stringify({ pid: 3 }), // ended here, but its process lives (another core)
      [`${dir}/t4.json`]: JSON.stringify({ pid: 4 }), // ended, but written a moment ago
      [`${dir}/.t5.123`]: "", // a temp file of the status line script
    },
    mtimes: { [`${dir}/t4.json`]: 3 * 3600_000 },
  });
  io.now = () => 3 * 3600_000;
  io.alive = async (pid) => pid === 3;
  const gone = [];
  io.remove = async (p) => { gone.push(p); delete io.files[p]; return true; };
  assert.equal(await sweep(io, ["t1"]), 1);
  assert.deepEqual(gone, [`${dir}/t2.json`]);
});
