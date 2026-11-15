// node --test 'tests/*.test.mjs'
// roundup-pane's plan limits (mods/roundup-pane/limits/): the texts, the two parsers against a real
// status line stdin (Claude Code 2.1.325) and a real token_count line (Codex 0.169.0, 2026-11-15),
// the store all headers share, the hover card's section, and the strategies and the reader
// handing limits and the account on.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { clock } from "./support/clock.mjs";
import { makeCx } from "./support/cx.mjs";
import { contextIo, fixture, jsonl } from "./support/context-io.mjs";
import { severity, names, passed, worst, elapsed, pace, duration, when, whenClock, dayClock, stale, shownState, STALE_MS } from "../mods/roundup-pane/limits/text.js";
import { fromClaude, fromCodex, newestCodex } from "../mods/roundup-pane/limits/parse.js";
import { makeStore, SAME_MS } from "../mods/roundup-pane/limits/store.js";
import { limitsModel } from "../mods/roundup-pane/limits/card.js";
import { clock as clockText } from "../mods/roundup-pane/context/text.js";
import { fromEnd } from "../mods/roundup-pane/context/tail.js";
import { integrationFile, localParts } from "../mods/roundup-pane/context/locate.js";
import { ContextReader, makeQueue } from "../mods/roundup-pane/context/reader.js";
import claude from "../mods/roundup-pane/context/strategies/claude.js";
import codex from "../mods/roundup-pane/context/strategies/codex.js";

beforeEach(() => clock.reset());

const MIN = 60_000, H = 60 * MIN, DAY = 24 * H;
const NOW = Date.UTC(2026, 10, 15, 12, 0);
// A 5-hour window `gone` minutes old at NOW, read at NOW, and a week with two days gone.
const five = (used, gone = 150, at = NOW) => ({ minutes: 300, used, resetsAt: NOW + (300 - gone) * MIN, at });
const week = (used, goneDays = 2, at = NOW) => ({ minutes: 10080, used, resetsAt: NOW + (7 - goneDays) * DAY, at });
const reading = (windows, extra = {}) => ({ at: Math.max(...windows.map((w) => w.at)), plan: null, source: "status-line", rev: 1, windows, ...extra });

test("a limit is ok below 70 %, tight from 70, critical from 90, reached at 100, by the rounded percent", () => {
  assert.deepEqual([0, 69, 69.4, 69.5, 70, 89, 90, 99.4, 99.5, 100, 104].map(severity),
    ["ok", "ok", "ok", "tight", "tight", "tight", "critical", "critical", "reached", "reached", "reached"]);
  assert.equal(severity(undefined), "ok");
  assert.equal(severity(NaN), "ok");
});

test("a window's names come from its length: 5h, wk, and any other in days, hours or minutes", () => {
  assert.deepEqual(names(300), { short: "5h", label: "5-hour" });
  assert.deepEqual(names(10080), { short: "wk", label: "Weekly" });
  assert.deepEqual(names(1440), { short: "1d", label: "Daily" });
  assert.deepEqual(names(4320), { short: "3d", label: "3-day" });
  assert.deepEqual(names(60), { short: "1h", label: "1-hour" });
  assert.deepEqual(names(90), { short: "90m", label: "90-minute" });
});

test("a window past its reset has reset since; the tightest window is one that hasn't", () => {
  const old = { ...five(95), resetsAt: NOW - MIN };
  assert.equal(passed(old, NOW), true);
  assert.equal(passed(five(10), NOW), false);
  assert.equal(passed({ ...five(10), resetsAt: NOW }, NOW), true, "at its reset time it has reset");
  assert.equal(worst([old, week(40)], NOW).minutes, 10080, "the passed 95 % doesn't count");
  assert.equal(worst([five(80), week(40)], NOW).minutes, 300);
  assert.equal(worst([old], NOW), null);
  assert.equal(worst(undefined, NOW), null);
  assert.equal(elapsed(five(10, 150), NOW), 50);
  assert.equal(elapsed(five(10, 0), NOW), 0);
  assert.equal(elapsed(old, NOW), 100);
});

test("the pace: from 50 % used, a window that would be empty before its reset says when; else nothing", () => {
  // 78 % after 205 of 300 minutes: 22 % left at 0.38 %/min are about 58 minutes, the reset is in 95.
  const left = pace(five(78, 205), NOW);
  assert.ok(Math.abs(left / MIN - 57.8) < 0.1, `about 58 minutes: ${left / MIN}`);
  assert.equal(pace(five(60, 250), NOW), null, "60 % after 250 of 300 minutes lasts");
  assert.equal(pace(five(49, 60), NOW), null, "below 50 %: an early burst says nothing");
  assert.equal(pace(five(100, 200), NOW), null, "reached: no pace");
  assert.equal(pace({ ...five(80), resetsAt: NOW - 1 }, NOW), null, "has reset");
  assert.equal(pace(five(80, 0), NOW), null, "no time gone: no pace");
  // The pace is the reading's: read 30 minutes ago, the same window is 30 minutes nearer its end.
  const earlier = { ...five(78, 235), at: NOW - 30 * MIN };
  assert.ok(Math.abs(pace(earlier, NOW) / MIN - 27.8) < 0.1, "counted on from the reading, less the time since");
  assert.equal(pace({ ...five(99, 299), at: NOW - 200 * MIN }, NOW), 0, "already due: now, never negative");
});

test("times: a duration, a time ahead within a day or by weekday, in the machine's zone", () => {
  assert.deepEqual([0, 59_000, MIN, 47 * MIN, 122 * MIN, 23 * H + 59 * MIN, DAY + 13 * H + 10 * MIN, NaN].map(duration),
    ["<1m", "<1m", "1m", "47m", "2h 02m", "23h 59m", "1d 13h", "<1m"]);
  assert.equal(when(NOW + 122 * MIN, NOW), "in 2h 02m");
  assert.equal(when(NOW + 2 * DAY, NOW), dayClock(NOW + 2 * DAY));
  assert.match(dayClock(NOW + 2 * DAY), /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:\d\d$/);
  assert.equal(whenClock(NOW + 3 * H, NOW), clockText(NOW + 3 * H));
  assert.equal(whenClock(NOW + 2 * DAY, NOW), dayClock(NOW + 2 * DAY));
});

test("a reading older than 15 minutes is stale; what the pill shows changes with it, a passed reset and, live, each minute", () => {
  const r = reading([five(31), week(38)]);
  assert.equal(stale(r, NOW + STALE_MS), false);
  assert.equal(stale(r, NOW + STALE_MS + 1), true);
  assert.equal(stale(null, NOW), false);
  const s0 = shownState(r, NOW);
  assert.equal(shownState(r, NOW + 5 * MIN), s0, "nothing changed: the header isn't drawn again");
  assert.notEqual(shownState(r, NOW + STALE_MS + 1), s0, "gone stale");
  assert.notEqual(shownState(r, NOW + 151 * MIN), shownState(r, NOW + 149 * MIN), "the 5-hour window passed its reset");
  assert.notEqual(shownState({ ...r, rev: 2 }, NOW), s0, "a new reading");
  assert.equal(shownState(r, NOW + 20_000, true), shownState(r, NOW + 40_000, true), "live: the same minute");
  assert.notEqual(shownState(r, NOW + 61_000, true), shownState(r, NOW, true), "live: the next minute");
  assert.equal(shownState(null, NOW), "");
});

// --- the parsers ---

const stdin = JSON.parse(fixture("claude-status-stdin.json"));
const AT = Date.parse("2026-11-13T23:46:03Z");
const file = (claudeJson) => ({ v: 1, terminal: "t7", pid: 1, at: AT, claude: claudeJson });

test("Claude Code: the status line's rate_limits give the 5-hour and the weekly window, in ms, without a plan", () => {
  assert.deepEqual(fromClaude(file(stdin)), {
    at: AT, plan: null, source: "status-line",
    windows: [{ minutes: 300, used: 13, resetsAt: 1794621000_000 }, { minutes: 10080, used: 28, resetsAt: 1794866400_000 }],
  });
});

test("Claude Code: an expired window is missing, an API key has no rate_limits, and nothing sane gives nothing", () => {
  const only = fromClaude(file({ ...stdin, rate_limits: { seven_day: stdin.rate_limits.seven_day } }));
  assert.deepEqual(only.windows.map((w) => w.minutes), [10080]);
  const { rate_limits: _none, ...apiKey } = stdin;
  assert.equal(fromClaude(file(apiKey)), null, "no rate_limits: an API key, or no answer yet");
  assert.equal(fromClaude(file({ ...stdin, rate_limits: null })), null);
  assert.equal(fromClaude(file({ ...stdin, rate_limits: {} })), null);
  assert.equal(fromClaude(file({ ...stdin, rate_limits: { five_hour: { used_percentage: "13", resets_at: 1 } } })), null, "a string is no percent");
  assert.equal(fromClaude(file({ ...stdin, rate_limits: { five_hour: { used_percentage: -1, resets_at: 1794621000 } } })), null);
  assert.equal(fromClaude(file({ ...stdin, rate_limits: { five_hour: { used_percentage: 5 } } })), null, "no reset time");
  assert.equal(fromClaude({ claude: stdin }), null, "no time of the reading");
  assert.equal(fromClaude(null), null);
  assert.equal(fromClaude("text"), null);
  const over = fromClaude(file({ ...stdin, rate_limits: { five_hour: { used_percentage: 104, resets_at: 1794621000 } } }));
  assert.equal(over.windows[0].used, 104, "above 100 stays what the agent said");
});

const tokenCount = JSON.parse(fixture("codex-token-count-limits.jsonl"));

test("Codex: a token_count line's rate_limits give both windows by their own length, the plan and the line's time", () => {
  assert.deepEqual(fromCodex(tokenCount), {
    at: Date.parse("2026-11-15T15:11:14.906Z"), plan: "plus", source: "rollout",
    windows: [{ minutes: 300, used: 87, resetsAt: 1794762296_000 }, { minutes: 10080, used: 21, resetsAt: 1795122098_000 }],
  });
});

test("Codex: an API key's rate_limits are null, a window may be missing, older lines give seconds until the reset", () => {
  const p = tokenCount.payload;
  const line = (rate_limits, extra = {}) => ({ ...tokenCount, ...extra, payload: { ...p, rate_limits } });
  assert.equal(fromCodex(line(null)), null);
  assert.equal(fromCodex(line({ ...p.rate_limits, primary: null, secondary: null })), null);
  assert.deepEqual(fromCodex(line({ ...p.rate_limits, secondary: null })).windows.map((w) => w.minutes), [300]);
  const old = fromCodex(line({ primary: { used_percent: 12, window_minutes: 300, resets_in_seconds: 600 } }));
  assert.equal(old.windows[0].resetsAt, Date.parse(tokenCount.timestamp) + 600_000);
  assert.equal(old.plan, null);
  assert.equal(fromCodex(line(p.rate_limits, { timestamp: "never" })), null, "no time of the reading");
  assert.equal(fromCodex(line({ primary: { used_percent: 12, window_minutes: 0, resets_at: 1794762296 } })), null, "a window without a length");
  assert.equal(fromCodex({ ...tokenCount, type: "response_item" }), null);
  assert.equal(fromCodex({ ...tokenCount, payload: { ...p, type: "agent_message" } }), null);
  assert.equal(fromCodex(null), null);
  // A daily window sorts before a weekly one, whichever is primary.
  const swapped = fromCodex(line({ primary: p.rate_limits.secondary, secondary: { used_percent: 3, window_minutes: 1440, resets_at: 1794762296 } }));
  assert.deepEqual(swapped.windows.map((w) => w.minutes), [1440, 10080]);
});

test("Codex: of a rollout's lines the newest with limits counts; the fixture of an API-key session has none", () => {
  const older = { ...tokenCount, timestamp: "2026-11-15T14:00:00.000Z", payload: { ...tokenCount.payload, rate_limits: { ...tokenCount.payload.rate_limits, primary: { used_percent: 50, window_minutes: 300, resets_at: 1794762296 } } } };
  const noLimits = { ...tokenCount, timestamp: "2026-11-15T16:00:00.000Z", payload: { ...tokenCount.payload, rate_limits: null } };
  const lines = jsonl(older, tokenCount, noLimits, "not json").trimEnd().split("\n");
  assert.equal(newestCodex(fromEnd(lines)).windows[0].used, 87);
  assert.equal(newestCodex(fromEnd(fixture("codex-rollout.jsonl").trimEnd().split("\n"))), null);
  assert.equal(newestCodex([]), null);
});

// --- the store ---

const A = "claude:/Users/a/.claude";
const offer = (store, account, windows, at = NOW, extra = {}) => store.offer(account, { at, plan: null, source: "status-line", windows, ...extra });

test("the store keeps an account's windows; an unchanged offer changes nothing", () => {
  const store = makeStore();
  assert.equal(store.get(A), null);
  assert.equal(offer(store, A, [five(34), week(41)]), true);
  const r = store.get(A);
  assert.deepEqual(r.windows.map((w) => [w.minutes, w.used]), [[300, 34], [10080, 41]]);
  assert.equal(r.at, NOW);
  assert.equal(r.source, "status-line");
  assert.equal(offer(store, A, [five(34), week(41)]), false, "the same again");
  assert.equal(store.get(A).rev, r.rev, "its rev stands: no header is drawn again");
  assert.equal(store.offer(A, null), false);
  assert.equal(store.offer(null, r), false);
  assert.equal(store.offer(A, { at: NOW }), false, "no windows");
  assert.equal(store.get(null), null);
  store.clear();
  assert.equal(store.get(A), null);
});

test("the same window only ever fills: an idle session's old numbers, handed on later, don't lower it", () => {
  const store = makeStore();
  offer(store, A, [five(34), week(41)]);
  // Another session of the account answers: more used.
  assert.equal(offer(store, A, [five(52), week(43)], NOW + 10 * MIN), true);
  // The first session's status line runs again (a mode change), with what it knew and a new time.
  assert.equal(offer(store, A, [five(34), week(41)], NOW + 20 * MIN), false);
  const r = store.get(A);
  assert.deepEqual(r.windows.map((w) => w.used), [52, 43]);
  assert.equal(r.at, NOW + 10 * MIN, "as of the answer that said it");
  // The same numbers from a later answer: the time moves on, so the reading doesn't go stale.
  assert.equal(offer(store, A, [five(52), week(43)], NOW + 25 * MIN), true);
  assert.equal(store.get(A).at, NOW + 25 * MIN);
  // A reset time a few seconds off is still the same window.
  const jitter = { ...five(60), resetsAt: five(60).resetsAt + SAME_MS - 1 };
  offer(store, A, [jitter], NOW + 26 * MIN);
  assert.equal(store.get(A).windows[0].used, 60);
  assert.equal(store.get(A).windows[0].resetsAt, five(60).resetsAt, "the kept reset time stands");
});

test("a window with a later reset is the next one and replaces the kept one, whatever it says; an earlier one is ignored", () => {
  const store = makeStore();
  offer(store, A, [five(96), week(41)]);
  const next = { ...five(3), resetsAt: five(3).resetsAt + 5 * H };
  assert.equal(offer(store, A, [next], NOW + 3 * H), true);
  assert.deepEqual(store.get(A).windows.map((w) => w.used), [3, 41], "the new 5-hour window, the week as it was");
  assert.equal(offer(store, A, [five(99)], NOW + 4 * H), false, "the old window again, from a session that slept through the reset");
  assert.equal(store.get(A).windows[0].used, 3);
  // A window missing from an offer (Claude leaves an expired one out) keeps what was known.
  offer(store, A, [week(45)], NOW + 4 * H);
  assert.deepEqual(store.get(A).windows.map((w) => w.used), [3, 45]);
});

test("two accounts never mix, and a third source is one offer with its own window", () => {
  const store = makeStore();
  const B = "claude:/Users/a/.claude-work", C = "codex:/Users/a/.codex";
  offer(store, A, [five(10), week(20)]);
  offer(store, B, [five(80), week(90)]);
  store.offer(C, { at: NOW, plan: "plus", source: "rollout", windows: [five(87), week(21)] });
  assert.deepEqual(store.get(A).windows.map((w) => w.used), [10, 20]);
  assert.deepEqual(store.get(B).windows.map((w) => w.used), [80, 90]);
  assert.equal(store.get(C).plan, "plus");
  assert.equal(store.get(A).plan, null);
  // A made-up agent with a single daily window: nothing else to change.
  const daily = { minutes: 1440, used: 64, resetsAt: NOW + 9 * H };
  store.offer("made-up:/Users/a/.made-up", { at: NOW, plan: "team", source: "made-up", windows: [daily] });
  const r = store.get("made-up:/Users/a/.made-up");
  assert.deepEqual(r.windows.map((w) => [names(w.minutes).short, w.used]), [["1d", 64]]);
  const m = limitsModel(r, NOW, { agent: "Made Up" });
  assert.deepEqual(m.rows.map((x) => [x.label, x.value, x.extra]), [["Daily", "64%", "resets in 9h 00m"]]);
  assert.equal(m.plan, "team");
});

// --- the card's section ---

test("the card: per window its name, percent and reset (within a day as a duration, else the weekday), fill and tick", () => {
  const m = limitsModel(reading([five(4, 178), week(38, 5.45)], { plan: "plus" }), NOW, { agent: "Codex" });
  assert.equal(m.plan, "plus");
  assert.equal(m.old, false);
  assert.equal(m.age, `as of ${clockText(NOW)}`);
  assert.deepEqual(m.rows.map((r) => [r.label, r.value, r.sev, r.extra]), [
    ["5-hour", "4%", "ok", "resets in 2h 02m"],
    ["Weekly", "38%", "ok", `resets ${dayClock(week(38, 5.45).resetsAt)}`],
  ]);
  assert.equal(m.rows[0].fill, 4);
  assert.ok(Math.abs(m.rows[0].tick - (178 / 300) * 100) < 1e-9, "the tick: the share of the window's time gone");
  assert.deepEqual(m.notes, []);
  assert.equal(limitsModel(null, NOW), null);
  assert.equal(limitsModel({ windows: [] }, NOW), null);
});

test("the card: ahead of the pace says when the limit runs out; a reached one says when the agent answers again", () => {
  const tight = limitsModel(reading([five(78, 205), week(41)]), NOW, { agent: "Claude Code" });
  assert.deepEqual(tight.rows.map((r) => r.sev), ["tight", "ok"]);
  assert.equal(tight.notes.length, 1);
  assert.equal(tight.notes[0].kind, "warn");
  assert.equal(tight.notes[0].text, `At this pace the 5-hour limit runs out about ${clockText(NOW + pace(five(78, 205), NOW))}, 37m before it resets`);
  const weekly = limitsModel(reading([five(22, 60), week(93, 5.96)]), NOW, {});
  assert.deepEqual(weekly.rows.map((r) => r.sev), ["ok", "critical"]);
  assert.match(weekly.notes[0].text, /^At this pace the weekly limit runs out about /);
  assert.equal(weekly.notes.length, 1, "22 % of the 5-hour window: no pace note below 50 %");
  const reached = limitsModel(reading([five(100, 253), week(64, 5)]), NOW, { agent: "Claude Code" });
  assert.equal(reached.rows[0].sev, "reached");
  assert.equal(reached.rows[0].fill, 100);
  assert.deepEqual(reached.notes, [{ kind: "plain", text: "5-hour limit reached: Claude Code answers again in 47m" }]);
});

test("the card: an old reading says its age, a window that has reset since says so and has no number", () => {
  const at = NOW - 42 * MIN;
  const old = limitsModel(reading([five(31, 140, at), week(38, 2, at)]), NOW, { agent: "Claude Code" });
  assert.equal(old.old, true);
  assert.equal(old.age, "42m old");
  assert.equal(old.notes.at(-1).text, "Read with the last answer of Claude Code in this window");
  const gone = limitsModel(reading([{ ...five(61, 290, at), resetsAt: NOW - 12 * MIN }, week(38, 2, at)]), NOW, {});
  assert.deepEqual(gone.rows[0], { label: "5-hour", value: "–", sev: "ok", extra: "has reset since", fill: 0, tick: null });
  assert.equal(gone.rows[1].value, "38%");
  assert.equal(gone.notes.some((n) => n.kind === "warn"), false, "no pace for a window that has reset");
});

// --- the strategies and the reader hand the limits on ---

const SID = stdin.session_id, CPID = 52896, STARTED = 1794613515093;
function claudeIo({ env = { HC_TERMINAL_ID: "t7" }, statusPid = CPID, status = stdin } = {}) {
  const io = contextIo({ terminals: { t7: { pid: CPID, created: STARTED - 4000, title: "Claude Code", cwd: "/Users/a/src/demo" } }, envs: { [CPID]: env } });
  const home = env.CLAUDE_CONFIG_DIR ?? "/Users/a/.claude";
  io.files[`${home}/sessions/${CPID}.json`] = JSON.stringify({ pid: CPID, sessionId: SID, cwd: "/Users/a/src/demo", startedAt: STARTED, kind: "interactive" });
  if (status) io.files[integrationFile(io, "claude", "t7")] = JSON.stringify({ v: 1, terminal: "t7", pid: statusPid, at: AT, claude: status });
  io.limits = makeStore();
  return io;
}

test("Claude's strategy offers the status line's limits to the store, under the account of its config folder", async () => {
  const io = claudeIo();
  const memo = {};
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(memo.account, "claude:/Users/a/.claude");
  assert.deepEqual(io.limits.get(memo.account).windows.map((w) => [w.minutes, w.used]), [[300, 13], [10080, 28]]);
  // Another config folder is another account.
  const work = claudeIo({ env: { HC_TERMINAL_ID: "t7", CLAUDE_CONFIG_DIR: "/Users/a/.claude-work" } });
  const m2 = {};
  await claude.locate({ terminal: "t7" }, work, m2);
  assert.equal(m2.account, "claude:/Users/a/.claude-work");
  assert.ok(work.limits.get("claude:/Users/a/.claude-work"));
  assert.equal(work.limits.get("claude:/Users/a/.claude"), null);
});

test("Claude's strategy offers nothing from another process's file or an API key's, and works without a store", async () => {
  const other = claudeIo({ statusPid: 1 });
  const memo = {};
  await claude.locate({ terminal: "t7" }, other, memo);
  assert.equal(other.limits.get(memo.account), null, "a file of an earlier process in this terminal");
  const { rate_limits: _none, ...apiKey } = stdin;
  const key = claudeIo({ status: apiKey });
  await claude.locate({ terminal: "t7" }, key, {});
  assert.equal(key.limits.get("claude:/Users/a/.claude"), null);
  const bare = claudeIo();
  delete bare.limits;
  assert.ok(await claude.locate({ terminal: "t7" }, bare, {}), "no store (a test's io): located all the same");
});

const TID = "01a1d750-0653-7190-914d-7c804d23545c", XPID = 55080;
const parts = localParts(1794613708371);
const ROLLOUT = `/Users/a/.codex/sessions/${parts.y}/${parts.mo}/${parts.d}/rollout-${parts.y}-${parts.mo}-${parts.d}T${parts.h}-${parts.mi}-${parts.s}-${TID}.jsonl`;
function codexIo(text, { env = { HC_TERMINAL_ID: "t8" } } = {}) {
  const io = contextIo({ files: text === null ? {} : { [ROLLOUT]: text }, terminals: { t8: { pid: XPID, created: 1, title: "01a1d750-0653-7190-914d-7c804... | ok", cwd: "/Users/a/src/demo" } }, envs: { [XPID]: env } });
  io.limits = makeStore();
  return io;
}

test("Codex's strategy offers the rollout's newest limits while it reads the context, under the account of CODEX_HOME", async () => {
  const io = codexIo(fixture("codex-rollout.jsonl") + JSON.stringify(tokenCount) + "\n");
  const memo = {};
  const src = await codex.locate({ terminal: "t8" }, io, memo);
  assert.equal(src.account, "codex:/Users/a/.codex");
  assert.equal(memo.account, src.account);
  assert.equal(io.limits.get(src.account), null, "nothing before the read");
  const tails = () => io.calls.filter((c) => c[0] === "tail").length;
  const r = await codex.read(src, io);
  assert.equal(r.used, 193_460, "the context of the same line");
  assert.equal(tails(), 1, "one read of the file for both");
  const l = io.limits.get(src.account);
  assert.deepEqual(l.windows.map((w) => [w.minutes, w.used]), [[300, 87], [10080, 21]]);
  assert.equal(l.plan, "plus");
  // An API-key session (the fixture's rate_limits are null): a context reading, no limits.
  const key = codexIo(fixture("codex-rollout.jsonl"));
  const s2 = await codex.locate({ terminal: "t8" }, key, {});
  assert.ok(await codex.read(s2, key));
  assert.equal(key.limits.get(s2.account), null);
});

test("Codex: limits count where a compaction after them leaves no context number, and the account is known without a rollout", async () => {
  const compacted = { timestamp: "2026-11-15T15:12:00.000Z", type: "compacted", payload: {} };
  const io = codexIo(fixture("codex-rollout.jsonl") + jsonl(tokenCount, compacted));
  const src = await codex.locate({ terminal: "t8" }, io, {});
  const r = await codex.read(src, io);
  assert.equal(typeof r, "symbol", "no context number after the compaction");
  assert.equal(io.limits.get(src.account).windows[0].used, 87);
  const none = codexIo(null, { env: { HC_TERMINAL_ID: "t8", CODEX_HOME: "/Users/a/.codex-work" } });
  const memo = {};
  assert.equal(await codex.locate({ terminal: "t8" }, none, memo), null);
  assert.equal(memo.account, "codex:/Users/a/.codex-work", "limits are the account's: a pane without a rollout still names it");
});

test("the reader names its pane's account after a look, drops it for another program, and its header draws again", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  let account = "fake:/Users/a/.fake";
  const strategy = { id: "fake", matches: ["fake"], async locate(_a, _io, memo) { memo.account = account; return null; }, async read() { return null; } };
  const reader = new ContextReader(io, { strategies: [strategy], queue: makeQueue(2) });
  const cx = makeCx();
  const pane = (key) => ({ terminal: "t1", program: { key }, app: null, status: "idle" });
  assert.equal(reader.account, null);
  reader.see(pane("fake"), true, cx);
  await clock.advance(2000);
  assert.equal(reader.account, "fake:/Users/a/.fake", "known though no source was found");
  assert.ok(cx.notified >= 1, "the header draws: its account's limits may be in the store already");
  reader.see(pane("shell"), true, cx);
  assert.equal(reader.account, null, "a shell now: no account");
  account = "fake:/Users/a/.other";
  reader.see(pane("fake"), true, cx);
  await clock.advance(2000);
  assert.equal(reader.account, "fake:/Users/a/.other");
  reader.close();
  assert.deepEqual(cx.errors, []);
});

// --- an agent starts in a pane: the account's kept files are asked once ---

test("the store lets an account's kept files be asked once a minute, each account by itself", () => {
  const store = makeStore();
  assert.equal(store.due(A, NOW), true);
  assert.equal(store.due(A, NOW + 59_000), false);
  assert.equal(store.due("codex:/Users/a/.codex", NOW + 1000), true, "another account");
  assert.equal(store.due(A, NOW + 60_000), true);
  assert.equal(store.due(null, NOW), false);
  store.clear();
  assert.equal(store.due(A, NOW + 61_000), true);
});

test("Claude's account limits: what the integration kept for other terminals of the same config folder, nothing of another's", async () => {
  const io = claudeIo({ status: null }); // this pane's session has no status line file yet
  const dir = "/Users/a/.cache/herdr-roundup/context/claude";
  const kept = (terminal, extra, at = AT) => { io.files[`${dir}/${terminal}.json`] = JSON.stringify({ v: 1, terminal, pid: 9, at, claude: { ...stdin, ...extra } }); };
  kept("t3", {}); // 13 % and 28 %, this account (the transcript lies under /Users/a/.claude)
  kept("t4", { rate_limits: { five_hour: { used_percentage: 40, resets_at: 1794621000 }, seven_day: { used_percentage: 30, resets_at: 1794866400 } } }, AT + 60_000);
  kept("t5", { transcript_path: "/Users/a/.claude-work/projects/-x/s.jsonl", rate_limits: { five_hour: { used_percentage: 99, resets_at: 1794621000 } } });
  io.files[`${dir}/t6.json`] = "{ not json";
  io.files[`${dir}/.t7.123`] = "a temp file of the status line script";
  io.files[`${dir}/t8.json`] = JSON.stringify({ v: 2, terminal: "t8", claude: stdin });
  const memo = {};
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(io.limits.get(memo.account), null, "the new session has nothing of its own");
  await claude.accountLimits(io, memo);
  assert.deepEqual(io.limits.get(memo.account).windows.map((w) => w.used), [40, 30], "the fullest of this account's files; the other account's 99 % is not it");
  assert.equal(io.calls.some((c) => c[0] === "readText" && c[1].endsWith("/.t7.123")), false, "temp files aren't read");
  // No folder (the integration never ran), or no home known: nothing, and no error.
  const bare = claudeIo({ status: null });
  await claude.accountLimits(bare, { account: "claude:/Users/a/.claude", home: "/Users/a/.claude" });
  await claude.accountLimits(bare, {});
  assert.equal(bare.limits.get("claude:/Users/a/.claude"), null);
});

test("Codex's account limits: the ends of the rollouts started last, at most five, none older than eight days", async () => {
  const { newestRollouts } = await import("../mods/roundup-pane/context/strategies/codex.js");
  const now = Date.parse("2026-11-15T16:00:00Z");
  const day = (ms) => { const p = localParts(ms); return `/Users/a/.codex/sessions/${p.y}/${p.mo}/${p.d}`; };
  const used = (n, ts) => JSON.stringify({ ...tokenCount, timestamp: ts, payload: { ...tokenCount.payload, rate_limits: { ...tokenCount.payload.rate_limits, primary: { ...tokenCount.payload.rate_limits.primary, used_percent: n } } } }) + "\n";
  const io = codexIo(null);
  io.clock = now;
  const today = day(now), earlier = day(now - 3 * DAY), old = day(now - 12 * DAY);
  io.files[`${today}/rollout-2026-11-15T15-00-00-b.jsonl`] = used(60, "2026-11-15T15:05:00.000Z");
  io.files[`${today}/rollout-2026-11-15T09-00-00-a.jsonl`] = used(87, "2026-11-15T15:11:00.000Z"); // started earlier, answered last
  io.files[`${today}/notes.txt`] = "not a rollout";
  io.files[`${earlier}/rollout-2026-11-12T10-00-00-c.jsonl`] = fixture("codex-rollout.jsonl"); // an API-key thread: no limits
  io.files[`${old}/rollout-2026-11-03T10-00-00-d.jsonl`] = used(99, "2026-11-03T10:00:00.000Z");
  assert.deepEqual((await newestRollouts(io, "/Users/a/.codex")).map((f) => f.slice(f.lastIndexOf("-") + 1)), ["b.jsonl", "a.jsonl", "c.jsonl"], "newest first, the one of twelve days ago left out");
  assert.equal((await newestRollouts(io, "/Users/a/.codex", 1)).length, 1);
  assert.deepEqual(await newestRollouts(io, "/Users/a/.codex-none"), []);
  const memo = { account: "codex:/Users/a/.codex", home: "/Users/a/.codex" };
  await codex.accountLimits(io, memo);
  const l = io.limits.get(memo.account);
  assert.equal(l.windows[0].used, 87, "the fullest of them: the thread that answered last");
  assert.equal(l.plan, "plus");
  assert.equal(io.calls.filter((c) => c[0] === "tail").length, 3, "one read of each rollout's end");
  await codex.accountLimits(io, {});
});

test("the reader asks for the account's limits once when an agent starts in its pane, again for another program, once a minute per account at most", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" }, t2: { pid: 11, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  let asks = 0, fail = false;
  const strategy = {
    id: "fake", matches: ["fake"],
    async locate(_a, _io, memo) { memo.account = "fake:/Users/a/.fake"; memo.home = "/Users/a/.fake"; return null; },
    async read() { return null; },
    async accountLimits(io_, memo) { asks++; if (fail) throw new Error("boom"); io_.limits.offer(memo.account, { at: clock.now, plan: null, source: "fake", windows: [{ minutes: 300, used: 5, resetsAt: clock.now + H }] }); },
  };
  const pane = (terminal, key) => ({ terminal, program: { key }, app: null, status: "idle" });
  const reader = new ContextReader(io, { strategies: [strategy], queue: makeQueue(2) });
  const cx = makeCx();
  reader.see(pane("t1", "fake"), true, cx);
  await clock.advance(2000);
  assert.equal(asks, 1, "asked with the first look");
  assert.equal(io.limits.get("fake:/Users/a/.fake").windows[0].used, 5);
  await clock.advance(5 * 60_000);
  assert.equal(asks, 1, "not again on later looks");
  // A second pane of the account starting within the minute doesn't ask again; later it does.
  const second = new ContextReader(io, { strategies: [strategy], queue: makeQueue(2) });
  io.limits.due("fake:/Users/a/.fake", clock.now); // the account was just asked (by another pane)
  second.see(pane("t2", "fake"), true, cx);
  await clock.advance(2000);
  assert.equal(asks, 1, "within a minute of the last ask: not again");
  // The agent ends and another starts in the pane: asked again.
  reader.see(pane("t1", "shell"), true, cx);
  await clock.advance(61_000);
  fail = true;
  reader.see(pane("t1", "fake"), true, cx);
  await clock.advance(2000);
  assert.equal(asks, 2);
  assert.equal(reader.account, "fake:/Users/a/.fake", "a failing ask costs nothing but the limits");
  // Without a store (a test's io), or a strategy without accountLimits: never asked.
  const plain = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" } } });
  plain.now = () => clock.now;
  const third = new ContextReader(plain, { strategies: [strategy], queue: makeQueue(2) });
  third.see(pane("t1", "fake"), true, cx);
  await clock.advance(2000);
  assert.equal(asks, 2);
  reader.close(); second.close(); third.close();
  assert.deepEqual(cx.errors, []);
});
