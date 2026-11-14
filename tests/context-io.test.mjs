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

const { makeIo, parseEnv, parseStat, parseLsof, descendants, HC_MS } = await import("../mods/roundup-pane/context-io.js");

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

test("stat, tail, head, list and lastLinesWith on a real file", async () => {
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
  assert.deepEqual(await io.lastLinesWith(f, "## mark", "b", 100, 8), ['{"b":"## mark"}']);
  assert.deepEqual(await io.lastLinesWith(f, "## mark", "b", 5, 8), [], "longer than the limit");
  assert.equal(await io.stat(join(dir, "none")), null);
  assert.equal(await io.tail(join(dir, "none"), 8), null);
  assert.equal(await io.list(join(dir, "none")), null);
});

test("tail: a file that grows past the size asked for between stat and tail isn't whole; one whose second size isn't known is a failed read", async () => {
  const f = join(dir, "grow.jsonl");
  writeFileSync(f, '{"a":1}\n');
  const io = makeIo();
  // The writer appends just as tail is started: tail reads the grown file's end.
  let grow = true;
  herdr.onExec((c) => { if (c.command === "tail" && grow) { grow = false; writeFileSync(f, '{"a":1}\n' + `{"b":"${"x".repeat(2000)}"}\n`); } return undefined; });
  const chunk = await io.tail(f, 1000);
  assert.equal(chunk.text.length, 1000);
  assert.equal(chunk.whole, false, "the text starts inside a line: not the file's beginning");
  writeFileSync(f, '{"a":1}\n');
  let stats = 0;
  herdr.onExec((c) => (c.command === "stat" && ++stats === 2 ? { code: 1, stdout: "", stderr: "" } : undefined));
  assert.equal(await io.tail(f, 1000), null, "no second size where it decides: a failed read, not a cut one");
  assert.equal((await io.tail(f, 1000)).whole, true, "both sizes known and small: whole");
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
  assert.equal(await io.lastLinesWith(f, "x", "x", 10, 8), null);
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
  const gates = {}; // hc's answer for each terminal, settled when the test says
  herdr.onHc((call) => new Promise((resolve, reject) => { gates[call.args[1]] = { resolve, reject }; }));
  const queue = makeQueue(2);
  const got = {};
  for (const t of ["t1", "t2", "t3"]) queue.run(() => io.terminal(t)).then((r) => { got[t] = r; });
  await flush();
  assert.deepEqual(Object.keys(gates), ["t1", "t2"], "the third waits for a place");
  await clock.advance(HC_MS);
  await flush();
  assert.deepEqual(got, { t1: null, t2: null }, "no answer within the deadline: null");
  assert.ok(gates.t3, "the third runs once a place is free");
  // The stalled calls answer late, one with a result, one failing: dropped, no error.
  gates.t1.resolve({ code: 0, stdout: JSON.stringify({ foreground: { pid: 7 } }) });
  gates.t2.reject(new Error("late failure"));
  await flush();
  assert.deepEqual(got, { t1: null, t2: null });
  // The third answers in time: its answer, and its deadline cancelled.
  gates.t3.resolve({ code: 0, stdout: JSON.stringify({ created_ms: 5, title: "x", foreground: { pid: 42 } }) });
  await flush();
  assert.equal(got.t3?.pid, 42);
  assert.equal(clock.timers.filter((t) => !t.cancelled && !t.done).length, 0, "no deadline left behind");
  assert.deepEqual(cx.errors, []);
});

test("hc get gives null, never throws: hc failing as it is called or later, or no timer for its deadline (a closed cx)", async () => {
  herdr.onHc(() => { throw new Error("hc dispatch failed"); });
  assert.equal(await makeIo().terminal("t1"), null);
  reset();
  herdr.onHc(() => new Error("hc failed later"));
  assert.equal(await makeIo().terminal("t1"), null);
  reset();
  herdr.onHc(() => ({ code: 0, stdout: JSON.stringify({ foreground: { pid: 42 } }) }));
  assert.equal(await makeIo({ after() { throw new Error("closed cx"); } }).terminal("t1"), null);
  assert.equal((await makeIo().terminal("t1")).pid, 42, "without a timer: no deadline, the answer");
});

test("output cut off at exec's limit gives no reading", async () => {
  herdr.onExec((c) => (c.command === "tail" ? { code: 0, stdout: "x".repeat(8 * 1024 * 1024) } : undefined));
  const f = join(dir, "v.jsonl");
  writeFileSync(f, "{}\n");
  assert.equal(await makeIo().tail(f, 10), null);
});

test("descendants: the process and four levels below it from one ps, each once; bad lines skipped", () => {
  const ps = [
    "    1     0", // launchd
    "  100     1", // the agent
    "  101   100", "  102   100", // two children
    "  103   101", "  104   103", "  105   104", // down to the fourth level below
    "  106   105", // the fifth: not taken
    "  200     1", // someone else's
    "  x   100", "  0   100", "", "  107   abc",
  ].join("\n");
  assert.deepEqual(descendants(ps, 100).sort(), ["100", "101", "102", "103", "104", "105"]);
  assert.deepEqual(descendants(ps, 100, 1).sort(), ["100", "101", "102"]);
  assert.deepEqual(descendants("  5 4\n  4 5\n", 4), ["4", "5"], "a cycle doesn't repeat");
  assert.deepEqual(descendants("", 9), ["9"]);
  assert.equal(descendants(null, 9), null);
});

test("openFiles asks ps once, then lsof for the tree; a failed ps gives null, not the root's files alone", async () => {
  herdr.onExec((c) => {
    if (c.command === "ps") return { code: 0, stdout: "  100     1\n  101   100\n  102   101\n" };
    if (c.command === "lsof") return { code: 1, stdout: "p100\nn/a/rollout-1.jsonl\np102\nn/a/rollout-2.jsonl\n" }; // exit 1: a pid gone meanwhile
    return undefined;
  });
  const io = makeIo();
  assert.deepEqual(await io.openFiles(100), ["/a/rollout-1.jsonl", "/a/rollout-2.jsonl"]);
  assert.equal(herdr.calls("exec").filter((c) => c[0] === "ps").length, 1);
  assert.deepEqual(herdr.calls("exec").find((c) => c[0] === "lsof")[1], ["-n", "-P", "-w", "-Fn", "-p", "100,101,102"], "no host or port lookups, no warnings");
  assert.equal(herdr.calls("exec").filter((c) => c[0] === "pgrep").length, 0);
  reset();
  herdr.onExec((c) => (c.command === "ps" ? { code: 1, stdout: "" } : c.command === "lsof" ? { code: 0, stdout: "n/a/x\n" } : undefined));
  assert.equal(await makeIo().openFiles(100), null);
  assert.equal(herdr.calls("exec").filter((c) => c[0] === "lsof").length, 0);
});

test("lastLinesWith through the real awk: the last n of the lines with the text that match the ERE, newest first; escaped copies and long lines don't count", async () => {
  const { SNAPSHOT_META } = await import("../mods/roundup-pane/context/strategies/claude.js");
  const f = join(dir, "snap.jsonl");
  const meta = (i, space = "") => JSON.stringify({ type: "user", n: i, text: "## Context Usage" }).replace('"type"', `"isMeta"${space}:${space}true,"type"`);
  const quoted = JSON.stringify({ type: "user", text: `copy: ${meta(99)} ## Context Usage` }); // the meta line inside a string: quotes escaped
  const lines = [meta(1), "## Context Usage only", quoted, meta(2, " "), meta(3), meta(4) + "x".repeat(200), meta(5, "\t")];
  writeFileSync(f, lines.join("\n") + "\n");
  const io = makeIo();
  const got = await io.lastLinesWith(f, "## Context Usage", SNAPSHOT_META, 150, 3);
  assert.deepEqual(got.map((l) => JSON.parse(l).n), [5, 3, 2], "newest first, three at most; the long one (4) is over the limit");
  const all = await io.lastLinesWith(f, "## Context Usage", SNAPSHOT_META, 150, 8);
  assert.deepEqual(all.map((l) => JSON.parse(l).n), [5, 3, 2, 1], "the plain mention and the escaped copy never match");
  assert.deepEqual(await io.lastLinesWith(f, "## nothing", SNAPSHOT_META, 150, 8), []);
});
