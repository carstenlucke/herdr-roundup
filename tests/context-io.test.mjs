// node --test 'tests/*.test.mjs'
// roundup-pane's context-io.js: the `io` the context strategies get in Herdr, on real temp files
// through the herdr stub's real exec; a missing program gives null, never an error.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { herdr, reset } from "./support/harness.mjs";
import { clock, flush } from "./support/clock.mjs";
import { makeCx } from "./support/cx.mjs";
import { makeQueue } from "../mods/roundup-pane/context/reader.js";

const { makeIo, parseEnv, parseStat, parseLsof, HC_MS } = await import("../mods/roundup-pane/context-io.js");

const dir = mkdtempSync(join(realpathSync(tmpdir()), "context-io-"));
after(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => { reset(); clock.reset(); });

test("parseEnv takes the environment's value, the last of a key (arguments come first), and only the keys the strategies read", () => {
  const ps = "claude --name HC_TERMINAL_ID=t9 PATH=/bin HC_TERMINAL_ID=t7 CLAUDE_CONFIG_DIR=/Users/a/.cw SECRET=x\n";
  assert.deepEqual(parseEnv(ps), { HC_TERMINAL_ID: "t7", CLAUDE_CONFIG_DIR: "/Users/a/.cw" });
  assert.deepEqual(parseEnv("zsh\n"), {});
  assert.equal(parseEnv(null), null);
});

test("parseStat reads macOS' and GNU's size and mtime in ms; parseLsof the open paths", () => {
  assert.deepEqual(parseStat("5280 1794339085.804695647\n"), { size: 5280, mtime: 1794339085805 });
  assert.deepEqual(parseStat("12 1794339085\n"), { size: 12, mtime: 1794339085000 });
  assert.equal(parseStat("stat: no such file"), null);
  assert.deepEqual(parseLsof("p123\nfcwd\nn/Users/a\nf9\nn/Users/a/rollout-x.jsonl\n"), ["/Users/a", "/Users/a/rollout-x.jsonl"]);
});

test("stat, tail, head, list and lastLineWith on a real file", async () => {
  const f = join(dir, "t.jsonl");
  writeFileSync(f, '{"a":1}\n{"b":"## mark"}\n{"c":3}\n');
  const io = makeIo();
  const st = await io.stat(f);
  assert.equal(st.size, 32);
  assert.ok(Math.abs(st.mtime - Date.now()) < 60_000);
  assert.deepEqual(await io.tail(f, 8), { text: '{"c":3}\n', whole: false });
  assert.equal((await io.tail(f, 1000)).whole, true);
  assert.equal(await io.head(f, 7), '{"a":1}');
  assert.ok((await io.list(dir)).includes("t.jsonl"));
  assert.equal(await io.lastLineWith(f, "## mark", 100), '{"b":"## mark"}');
  assert.equal(await io.lastLineWith(f, "## mark", 5), null, "longer than the limit");
  assert.equal(await io.stat(join(dir, "none")), null);
  assert.equal(await io.tail(join(dir, "none"), 8), null);
  assert.equal(await io.list(join(dir, "none")), null);
});

test("a platform without tail, lsof, ps or stat gives null everywhere, and no error", async () => {
  for (const p of ["tail", "lsof", "ps", "stat", "pgrep", "awk", "head"]) herdr.failExec(p);
  const f = join(dir, "u.jsonl");
  writeFileSync(f, "{}\n");
  const io = makeIo();
  assert.equal(await io.stat(f), null);
  assert.equal(await io.tail(f, 10), null);
  assert.equal(await io.head(f, 10), null);
  assert.equal(await io.env(1), null);
  assert.equal(await io.openFiles(1), null);
  assert.equal(await io.lastLineWith(f, "x", 10), null);
});

test("terminal: hc get's foreground pid, creation time and title; a failing hc gives null", async () => {
  herdr.onHc(() => ({ code: 0, stdout: JSON.stringify({ address: "t7", created_ms: 5, title: "Claude Code", foreground: { pid: 42, cwd: "/x" } }) }));
  assert.deepEqual(await makeIo().terminal("t7"), { pid: 42, created: 5, title: "Claude Code", cwd: "/x" });
  assert.deepEqual(herdr.calls("hc").at(-1), [["get", "t7", "--json"]]);
  herdr.onHc(() => ({ code: 1, stdout: "", stderr: "no such terminal" }));
  assert.equal(await makeIo().terminal("t9"), null);
  herdr.onHc(() => ({ code: 0, stdout: "not json" }));
  assert.equal(await makeIo().terminal("t9"), null);
});

test("hc get that doesn't answer gives null after its deadline and frees the queue: two stalled, a third still runs", async () => {
  const cx = makeCx();
  const io = makeIo({ after: (ms, f) => cx.timer.after(ms, f) });
  let late = null;
  herdr.onHc(() => new Promise((resolve) => { late = resolve; })); // hc never answers (until late)
  const queue = makeQueue(2);
  const got = [];
  for (const t of ["t1", "t2", "t3"]) queue.run(() => io.terminal(t)).then((r) => got.push([t, r]));
  await flush();
  assert.equal(herdr.calls("hc").length, 2, "the third waits for a place");
  await clock.advance(HC_MS);
  await flush();
  assert.deepEqual(got.slice(0, 2).map((g) => g[1]), [null, null], "no answer within the deadline: null");
  assert.equal(herdr.calls("hc").length, 3, "the third runs once a place is free");
  herdr.onHc(() => ({ code: 0, stdout: JSON.stringify({ created_ms: 5, title: "x", foreground: { pid: 42 } }) }));
  late({ code: 0, stdout: "{}" }); // a late answer of a stalled call is dropped, no error
  await clock.advance(HC_MS);
  await flush();
  assert.equal(got.length, 3);
  assert.deepEqual((await io.terminal("t4")).pid, 42, "an answer in time wins, its deadline cancelled");
  assert.equal(clock.timers.filter((t) => !t.cancelled && !t.done).length, 0, "no deadline left behind");
  assert.deepEqual(cx.errors, []);
});

test("output cut off at exec's limit gives no reading", async () => {
  herdr.onExec((c) => (c.command === "tail" ? { code: 0, stdout: "x".repeat(8 * 1024 * 1024) } : undefined));
  const f = join(dir, "v.jsonl");
  writeFileSync(f, "{}\n");
  assert.equal(await makeIo().tail(f, 10), null);
});
