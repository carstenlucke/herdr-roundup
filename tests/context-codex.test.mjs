// node --test 'tests/*.test.mjs'
// The Codex strategy of roundup-pane's context meter, against a rollout cut from a real session
// (Codex 0.167.0, 2026-11-14, thread id in the title) and an io stub.
import { test } from "node:test";
import assert from "node:assert/strict";
import codex, { rolloutId, rolloutByPrefix, findRollout, threadSource, AMBIGUOUS } from "../mods/roundup-pane/context/strategies/codex.js";
import { localParts } from "../mods/roundup-pane/context/locate.js";
import { NO_READING } from "../mods/roundup-pane/context/tail.js";
import { contextIo, fixture, jsonl } from "./support/context-io.mjs";

const ID = "01a1d750-0653-7190-914d-7c804d23545c";
const PID = 55080;
const rollout = fixture("codex-rollout.jsonl");
const p = localParts(1794613708371); // the id's time, in this machine's zone, as Codex names files
const DIR = `/Users/a/.codex/sessions/${p.y}/${p.mo}/${p.d}`;
const FILE = `${DIR}/rollout-${p.y}-${p.mo}-${p.d}T${p.h}-${p.mi}-${p.s}-${ID}.jsonl`;
const TITLE = "01a1d750-0653-7190-914d-7c804... | Antworte nur mit ok";

function setup({ title = TITLE, files = { [FILE]: rollout }, env = { HC_TERMINAL_ID: "t8" }, open = {} } = {}) {
  return contextIo({ files: { ...files }, terminals: { t8: { pid: PID, created: 1, title, cwd: "/Users/a/src/demo" } }, envs: { [PID]: env }, open });
}
const reading = async (io) => {
  const src = await codex.locate({ terminal: "t8" }, io);
  return src && codex.read(src, io);
};

test("Codex by the thread id in its title: the rollout's raw last_token_usage of model_context_window", async () => {
  const r = await reading(setup());
  assert.equal(r.used, 18_298);
  assert.equal(r.window, 475_000);
  assert.equal(r.model, "gpt-6.1-sol");
  assert.equal(r.exact, true);
  assert.equal(r.source, "rollout");
  assert.equal(r.at, Date.parse("2026-11-13T23:48:54.662Z"));
});

test("the title's id prefix leads to the one rollout of its day; two matches or none give nothing", async () => {
  const io = setup();
  assert.equal(await rolloutByPrefix(io, "/Users/a/.codex", "01a1d750-0653-7190-914d-7c804"), FILE);
  assert.deepEqual(io.calls.filter((c) => c[0] === "list").map((c) => c[1]), [DIR], "only that day's folder is listed");
  assert.equal(await rolloutByPrefix(io, "/Users/a/.codex", "01a1d751-9827-7f61-959e-cedf8"), null, "none");
  assert.equal(await rolloutByPrefix(setup({ files: { [FILE]: rollout, [FILE.replace("7c804d23545c", "7c804d999999")]: rollout } }), "/Users/a/.codex", "01a1d750-0653-7190-914d-7c804"), AMBIGUOUS, "two");
  const twin = FILE.replace("7c804d23545c", "7c804d999999");
  assert.equal(await reading(setup({ files: { [FILE]: rollout, [twin]: rollout } })), null);
  assert.equal(await reading(setup({ files: {} })), null);
  assert.equal(rolloutId(`rollout-2026-11-14T00-48-28-${ID}.jsonl`), ID);
  assert.equal(rolloutId("other.jsonl"), null);
});

test("a found rollout is kept per home and prefix and checked with one stat; gone, a miss or two matches are searched again", async () => {
  const H = "/Users/a/.codex", PRE = "01a1d750-0653-7190-914d-7c804";
  const lists = (io) => io.calls.filter((c) => c[0] === "list").length;
  let io = setup(), memo = {};
  assert.equal(await rolloutByPrefix(io, H, PRE, memo), FILE);
  const n = lists(io);
  assert.equal(await rolloutByPrefix(io, H, PRE, memo), FILE);
  assert.equal(lists(io), n, "the second look lists no folder");
  assert.ok(io.calls.some((c) => c[0] === "stat" && c[1] === FILE), "it checks the kept file");
  assert.equal(await rolloutByPrefix(io, "/Users/b/.codex", PRE, memo), null, "another home: its own search");
  assert.ok(lists(io) > n);
  // Gone: searched again at once, and a file now elsewhere found.
  io = setup(); memo = {};
  await rolloutByPrefix(io, H, PRE, memo);
  const moved = FILE.replace("7c804d23545c", "7c804d23545d");
  delete io.files[FILE]; io.files[moved] = rollout;
  assert.equal(await rolloutByPrefix(io, H, PRE, memo), moved);
  // A miss isn't kept: the file written after it counts on the next look.
  io = setup({ files: {} }); memo = {};
  assert.equal(await rolloutByPrefix(io, H, PRE, memo), null);
  io.files[FILE] = rollout;
  assert.equal(await rolloutByPrefix(io, H, PRE, memo), FILE);
  // AMBIGUOUS isn't kept either: once one of the two goes, the other is the one.
  const twin = FILE.replace("7c804d23545c", "7c804d999999");
  io = setup({ files: { [FILE]: rollout, [twin]: rollout } }); memo = {};
  assert.equal(await rolloutByPrefix(io, H, PRE, memo), AMBIGUOUS);
  delete io.files[twin];
  assert.equal(await rolloutByPrefix(io, H, PRE, memo), FILE);
  // A longer prefix's hit says nothing for a shorter one: that one is searched (and here two match).
  io.files[twin] = rollout;
  assert.equal(await rolloutByPrefix(io, H, "01a1d750-0653-7190-914d-7c80", memo), AMBIGUOUS);
});

test("stillSame checks the title's id against the rollout's whole id: the same thread cut otherwise stands, another with the same start doesn't", async () => {
  const src = await codex.locate({ terminal: "t8" }, setup());
  assert.deepEqual([src.how, src.titlePrefix, src.thread], ["title", "01a1d750-0653-7190-914d-7c804", ID], "the thread is the rollout's whole id");
  const same = (title) => codex.stillSame(src, { title });
  assert.equal(same(`${ID} | ok`), true, "the whole id now");
  assert.equal(same("01a1d750-0653-7190-914d-7c80... | ok"), true, "cut shorter");
  assert.equal(same("01a1d750-0653-7190-914d-7c804d2... | ok"), true, "cut longer");
  assert.equal(same("01a1d750-0653-7190-914d-7c804d9... | ok"), false, "a longer id with the same start: another thread");
  assert.equal(same("01a1d751-9827-7f61-959e-cedf8... | ok"), false, "another thread");
  assert.equal(same(`${ID} | 01a1d751-9827-7f61-959e-cedf8...`), false, "two ids");
  assert.equal(same("Codex"), true, "no id says nothing");
  const full = await codex.locate({ terminal: "t8" }, setup({ title: `${ID} | ok` }));
  assert.equal(codex.stillSame(full, { title: TITLE }), true, "whole id at locate, cut after");
});

test("a title whose rollout isn't in CODEX_HOME falls back to the open files, but only to its own thread's one user rollout", async () => {
  // CODEX_HOME as read is wrong (cut at a space, or no ps -E on Linux): the rollout lies elsewhere.
  const elsewhere = { HC_TERMINAL_ID: "t8", CODEX_HOME: "/Users/a/My" };
  let io = setup({ env: elsewhere, open: { [PID]: [FILE] } });
  const src = await codex.locate({ terminal: "t8" }, io);
  assert.deepEqual([src.how, src.titlePrefix, src.thread], ["title+open-file", "01a1d750-0653-7190-914d-7c804", ID]);
  assert.equal((await codex.read(src, io)).used, 18_298);
  // Two user threads open, told apart by the title.
  const other = `${DIR}/rollout-2026-11-14T00-49-00-01a1d751-9827-7f61-959e-cedf80000000.jsonl`;
  io = setup({ env: elsewhere, files: { [FILE]: rollout, [other]: rollout }, open: { [PID]: [other, FILE] } });
  assert.equal((await codex.locate({ terminal: "t8" }, io)).file, FILE);
  // The title names a thread none of the open rollouts is: nothing, not the one that is open.
  io = setup({ title: "01a1d751-aaaa-7f61-959e-cedf8...", open: { [PID]: [FILE] } });
  assert.equal(await reading(io), null);
  // Two open user rollouts that both start with the title's prefix: nothing.
  const twin = FILE.replace("7c804d23545c", "7c804d999999");
  io = setup({ env: elsewhere, files: { [FILE]: rollout, [twin]: rollout }, open: { [PID]: [FILE, twin] } });
  assert.equal(await reading(io), null);
  // Two of the title's prefix in its folder: ambiguous there already, no fallback.
  io = setup({ files: { [FILE]: rollout, [twin]: rollout }, open: { [PID]: [FILE] } });
  assert.equal(await reading(io), null);
  assert.equal(io.calls.some((c) => c[0] === "openFiles"), false);
});

test("direct mode without the title: the one user rollout the process holds open", async () => {
  const guardian = rollout.replace('"thread_source":"user"', '"thread_source":"guardian_review"');
  const g = `${DIR}/rollout-2026-11-14T00-49-00-01a1d750-aaaa-7190-914d-000000000000.jsonl`;
  const files = { [FILE]: rollout, [g]: guardian };
  let r = await reading(setup({ title: "Codex", files, open: { [PID]: [FILE, g, "/dev/null"] } }));
  assert.equal(r.used, 18_298);
  // Two user threads in one process: ambiguous.
  r = await reading(setup({ title: "Codex", files: { [FILE]: rollout, [g]: rollout }, open: { [PID]: [FILE, g] } }));
  assert.equal(r, null);
  // The shared daemon's files lie outside the process tree: nothing open, nothing shown.
  assert.equal(await reading(setup({ title: "Codex", files, open: { [PID]: [] } })), null);
  assert.equal(await reading(setup({ title: "Codex", files })), null, "lsof failed");
  assert.equal(threadSource(rollout.slice(0, 300)), null, "a cut first line is no session_meta");
});

test("token_count with info null is no new reading; a compaction or a model change after the last gives none", async () => {
  const ts = "2026-11-13T23:49:00.000Z";
  let r = await reading(setup({ files: { [FILE]: rollout + jsonl({ timestamp: ts, type: "event_msg", payload: { type: "token_count", info: null } }) } }));
  assert.equal(r.used, 18_298);
  r = await reading(setup({ files: { [FILE]: rollout + jsonl({ timestamp: ts, type: "compacted", payload: { message: "" } }) } }));
  assert.equal(r, NO_READING, "read, no number: not an error");
  r = await reading(setup({ files: { [FILE]: rollout + jsonl({ timestamp: ts, type: "turn_context", payload: { model: "gpt-6.1-mini" } }) } }));
  assert.equal(r, NO_READING);
  // A new token_count after the change counts again, with the new model.
  r = await reading(setup({ files: { [FILE]: rollout + jsonl(
    { timestamp: ts, type: "turn_context", payload: { model: "gpt-6.1-mini" } },
    { timestamp: ts, type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { total_tokens: 30_000 }, model_context_window: 258_400 } } },
  ) } }));
  assert.deepEqual([r.used, r.window, r.model], [30_000, 258_400, "gpt-6.1-mini"]);
});

test("numbers that are not finite or negative, and a window of 0, give no reading", () => {
  const tc = (last, window) => JSON.stringify({ timestamp: "2026-11-13T23:49:00.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { total_tokens: last }, model_context_window: window } } });
  assert.equal(findRollout([tc(-1, 475_000)], true), null);
  assert.equal(findRollout([tc(10, 0)], true), null);
  assert.equal(findRollout([tc("10", 475_000)], true), null);
  assert.equal(findRollout([], false), undefined, "nothing yet: read more");
});

test("another terminal's process gives nothing; CODEX_HOME replaces ~/.codex", async () => {
  assert.equal(await reading(setup({ env: { HC_TERMINAL_ID: "t9" } })), null);
  const moved = FILE.replace("/Users/a/.codex/", "/Users/a/.codex-alt/");
  const r = await reading(setup({ files: { [moved]: rollout }, env: { HC_TERMINAL_ID: "t8", CODEX_HOME: "/Users/a/.codex-alt" } }));
  assert.equal(r.used, 18_298);
});

// Direct mode on repeated looks with the reader's memo (PR #38 review, finding 9).
const OTHER = `${DIR}/rollout-2026-11-14T00-50-00-01a1d750-bbbb-7190-914d-111111111111.jsonl`;
const heads = (io) => io.calls.filter((c) => c[0] === "head").map((c) => c[1]);
const look = async (io, memo) => {
  const src = await codex.locate({ terminal: "t8" }, io, memo);
  return src && codex.read(src, io);
};

test("direct mode: whose thread a rollout is, is read once per path while it stays open", async () => {
  const guardian = rollout.replace('"thread_source":"user"', '"thread_source":"guardian_review"');
  const g = `${DIR}/rollout-2026-11-14T00-49-00-01a1d750-aaaa-7190-914d-000000000000.jsonl`;
  const open = { [PID]: [FILE, g] };
  const io = setup({ title: "Codex", files: { [FILE]: rollout, [g]: guardian }, open });
  const memo = {};
  for (let i = 0; i < 3; i++) assert.equal((await look(io, memo)).used, 18_298);
  assert.deepEqual(heads(io), [FILE, g], "each head once");
  assert.equal(io.calls.filter((c) => c[0] === "openFiles").length, 3, "the open files are asked on every look");
  open[PID] = [FILE];
  await look(io, memo);
  assert.deepEqual([...memo.threadSources.keys()], [FILE], "a path no longer open is forgotten");
});

test("direct mode: a failed head or a first line still being written is asked again on the next look", async () => {
  const open = { [PID]: [FILE] };
  const io = setup({ title: "Codex", files: {}, open });
  const memo = {};
  assert.equal(await look(io, memo), null, "head failed (no file yet)");
  io.files[FILE] = rollout.slice(0, 300); // the first line, cut
  assert.equal(await look(io, memo), null);
  io.files[FILE] = rollout;
  assert.equal((await look(io, memo)).used, 18_298);
  assert.equal(heads(io).length, 3);
});

test("direct mode: the same process on another thread (`/new`) reads the new rollout; two user threads open give nothing", async () => {
  const other = rollout.replace(/"total_tokens":18298/g, '"total_tokens":777');
  const open = { [PID]: [FILE] };
  const io = setup({ title: "Codex", files: { [FILE]: rollout, [OTHER]: other }, open });
  const memo = {};
  assert.equal((await look(io, memo)).used, 18_298);
  open[PID] = [OTHER]; // the old file is still on disk, no longer open
  const r = await look(io, memo);
  assert.equal(r.used, 777);
  assert.equal(r.session, "01a1d750-bbbb-7190-914d-111111111111");
  open[PID] = [FILE, OTHER];
  assert.equal(await look(io, memo), null, "ambiguous");
});

test("direct mode: an empty open list forgets what was known, and a file gone is classified again once back", async () => {
  const open = { [PID]: [FILE] };
  const io = setup({ title: "Codex", files: { [FILE]: rollout }, open });
  const memo = {};
  assert.equal((await look(io, memo)).used, 18_298);
  open[PID] = [];
  assert.equal(await look(io, memo), null);
  assert.equal(memo.threadSources.size, 0, "an empty list forgets");
  open[PID] = [FILE];
  await look(io, memo);
  open[PID] = null; // lsof failed: proves nothing
  await look(io, memo);
  assert.equal(memo.threadSources.size, 1);
  open[PID] = [FILE];
  delete io.files[FILE]; // gone (replaced) while still listed
  assert.equal(await look(io, memo), null);
  assert.equal(memo.threadSources.size, 0);
  io.files[FILE] = rollout.replace('"thread_source":"user"', '"thread_source":"guardian_review"');
  assert.equal(await look(io, memo), null, "classified again: now a guardian's");
});
