// node --test 'tests/*.test.mjs'
// roundup-pane's context meter: what it writes, the tail reading, the ways from a terminal to a
// source, and which strategy a pane gets (mods/roundup-pane/context/).
import { test } from "node:test";
import assert from "node:assert/strict";
import { tokens, share, percentText, severity, tier, headerTier, TIERS, usedText } from "../mods/roundup-pane/context/text.js";
import { completeLines, fromEnd, scanTail, FIRST, NO_READING } from "../mods/roundup-pane/context/tail.js";
import { byTitle, uuid7Time, byTerminalFile, integrationFile, localParts } from "../mods/roundup-pane/context/locate.js";
import { strategyFor, STRATEGIES } from "../mods/roundup-pane/context/registry.js";
import { contextIo } from "./support/context-io.mjs";

test("tokens: 940, 9.4k, 97.6k, 200k, 475k, 1M, 1.2M; nothing for a number that isn't one", () => {
  assert.equal(tokens(940), "940");
  assert.equal(tokens(9400), "9.4k");
  assert.equal(tokens(97_640), "97.6k");
  assert.equal(tokens(200_000), "200k");
  assert.equal(tokens(475_000), "475k");
  assert.equal(tokens(999_400), "999k");
  assert.equal(tokens(999_600), "1M");
  assert.equal(tokens(1_000_000), "1M");
  assert.equal(tokens(1_234_567), "1.2M");
  assert.equal(tokens(-1), "");
  assert.equal(tokens(NaN), "");
});

test("the share of the window and its percent; above 0 and below 1 is <1%", () => {
  assert.equal(share({ used: 97_600, window: 200_000 }), 48.8);
  assert.equal(share({ percent: 8.6 }), 8.6);
  assert.equal(share({ used: 5, window: 0 }), null);
  assert.equal(share(null), null);
  assert.equal(percentText(48.8), "49%");
  assert.equal(percentText(0.4), "<1%");
  assert.equal(percentText(0), "0%");
  assert.equal(percentText(null), "");
});

test("severity: tight from 65 %, critical from 80 %, by the percent the person reads", () => {
  assert.equal(severity(64.4), "ok");
  assert.equal(severity(64.5), "tight");
  assert.equal(severity(79.4), "tight");
  assert.equal(severity(79.5), "critical");
  assert.equal(severity(120), "critical");
  assert.equal(severity(null), "ok");
});

test("the meter's tiers: the tokens go first, then the bar, the percent stays longest", () => {
  assert.equal(tier(TIERS.full), "full");
  assert.equal(tier(TIERS.full - 1), "bar");
  assert.equal(tier(TIERS.bar - 1), "percent");
  assert.equal(tier(TIERS.percent - 1), "none");
  assert.equal(tier(undefined), "full");
  assert.ok(TIERS.full > TIERS.bar && TIERS.bar > TIERS.percent);
});

test("headerTier: on_size_change's window px divided by the zoom; no width yet stays full", () => {
  assert.equal(headerTier(TIERS.full, 1), "full");
  assert.equal(headerTier(TIERS.full * 1.5 - 1, 1.5), "bar", "zoom 1.5: 600 window px are 400 of the mod's");
  assert.equal(headerTier(TIERS.full * 1.5, 1.5), "full");
  assert.equal(headerTier(TIERS.bar * 0.8, 0.8), "bar", "zoom 0.8: fewer window px, the same tier");
  assert.equal(headerTier(TIERS.bar * 0.8 - 1, 0.8), "percent");
  assert.equal(headerTier(null, 1.5), "full", "null / zoom would be 0: none");
  assert.equal(headerTier(undefined, 2), "full");
  assert.equal(headerTier(TIERS.full, undefined), "full", "no zoom: 1");
  assert.equal(headerTier(TIERS.full, 0), "full");
});

test("usedText: used / window, or tokens alone without a window", () => {
  assert.equal(usedText({ used: 97_600, window: 200_000 }), "97.6k / 200k");
  assert.equal(usedText({ used: 265_000, window: null }), "265k");
  assert.equal(usedText({ percent: 8 }), "");
});

test("completeLines: a chunk from the middle drops its first piece, a line still being written goes", () => {
  assert.deepEqual(completeLines('l":1}\n{"a":2}\n{"a":3}\n', false), ['{"a":2}', '{"a":3}']);
  assert.deepEqual(completeLines('{"a":1}\n{"a":2}\n{"a":', true), ['{"a":1}', '{"a":2}']);
  assert.deepEqual(completeLines('{"a":1}\n', true), ['{"a":1}']);
  assert.deepEqual([...fromEnd(['{"a":1}', "not json", "", '{"a":2}'])].map((l) => l.a), [2, 1]);
});

test("scanTail reads 256 KiB, then four times more while nothing is found, and stops at the whole file", async () => {
  const big = '{"keep":1}\n' + JSON.stringify({ blob: "x".repeat(300 * 1024) }) + "\n";
  const io = contextIo({ files: { "/f": big } });
  const find = (lines, whole) => {
    const hit = [...fromEnd(lines)].find((l) => l.keep);
    return hit ? hit.keep : whole ? null : undefined;
  };
  assert.equal(await scanTail(io, "/f", find), 1);
  assert.deepEqual(io.calls.filter((c) => c[0] === "tail").map((c) => c[2]), [FIRST, FIRST * 4]);
  assert.equal(await scanTail(io, "/missing", find), null, "no file: an error");
  const none = contextIo({ files: { "/g": '{"other":1}\n' } });
  assert.equal(await scanTail(none, "/g", find), NO_READING, "find said null: read, no number");
  assert.equal(await scanTail(none, "/g", () => undefined), NO_READING, "the whole file read, nothing found");
});

test("byTitle: the thread id whole or as Codex cuts it; none, two or a shorter one is null", () => {
  assert.equal(byTitle("01a1d750-0653-7190-914d-7c804... | Antworte nur mit ok"), "01a1d750-0653-7190-914d-7c804");
  assert.equal(byTitle("⠋ 01A1D750-0653-7190-914D-7C804D23545C"), "01a1d750-0653-7190-914d-7c804d23545c");
  assert.equal(byTitle("Claude Code"), null);
  assert.equal(byTitle("01a1d750-0653-7190-914d"), null);
  assert.equal(byTitle("01a1d750-0653-7190-914d-7c804... | about 01a1d751-9827-7f61-959e-cedf8619ef8d"), null);
  assert.equal(byTitle(null), null);
});

test("uuid7Time: a UUIDv7's first 12 hex digits are its creation time in ms; another version is null", () => {
  assert.equal(uuid7Time("01a1d750-0653-7190-914d-7c804"), 1794613708371);
  assert.equal(uuid7Time("0fbf3e48-42ea-40d5-b3ed-40730f7e7b44"), null);
  const p = localParts(1794613708371);
  assert.match(`${p.y}-${p.mo}-${p.d}T${p.h}-${p.mi}-${p.s}`, /^\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d$/);
});

test("byTerminalFile: only this terminal's file, written by this pid in this format", async () => {
  const io = contextIo();
  const path = integrationFile(io, "claude", "t7");
  assert.equal(path, "/Users/a/.cache/herdr-roundup/context/claude/t7.json");
  const put = (v) => (io.files[path] = JSON.stringify(v));
  put({ v: 1, terminal: "t7", pid: 42, at: 1 });
  assert.equal((await byTerminalFile(io, "claude", "t7", 42)).pid, 42);
  assert.equal(await byTerminalFile(io, "claude", "t7", 43), null, "an earlier process in the same terminal");
  put({ v: 1, terminal: "t8", pid: 42, at: 1 });
  assert.equal(await byTerminalFile(io, "claude", "t7", 42), null, "another terminal's");
  put({ v: 2, terminal: "t7", pid: 42, at: 1 });
  assert.equal(await byTerminalFile(io, "claude", "t7", 42), null, "another version");
  io.files[path] = "{ half";
  assert.equal(await byTerminalFile(io, "claude", "t7", 42), null, "half written");
});

test("registry: the strategy for a program.key or app, none for a shell, a mod pane or an unknown program", () => {
  const pane = (key, app = null, terminal = "t1") => ({ terminal, app, program: { key } });
  assert.equal(strategyFor(pane("claude")).id, "claude");
  assert.equal(strategyFor(pane("agent", "claude-code")).id, "claude");
  assert.equal(strategyFor(pane("codex")).id, "codex");
  assert.equal(strategyFor(pane("shell")), null);
  assert.equal(strategyFor(pane("vim")), null);
  assert.equal(strategyFor(pane("claude", null, null)), null, "a mod pane has no terminal");
  assert.equal(strategyFor(pane("claude", null, "vps/t7")), null, "an agent of another machine");
  for (const s of STRATEGIES) {
    assert.equal(typeof s.id, "string");
    assert.ok(Array.isArray(s.matches) && s.matches.length);
    assert.equal(typeof s.locate, "function");
    assert.equal(typeof s.read, "function");
  }
});
