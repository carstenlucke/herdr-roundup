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
import { asOf, severity, names, passed, worst, elapsed, pace, duration, when, whenClock, dayClock, stale, staleWindow, shownState, STALE_MS } from "../mods/roundup-pane/limits/text.js";
import { fromClaude, fromCodex, codexLimits, snapMinutes, CODEX_EVENTS } from "../mods/roundup-pane/limits/parse.js";
import { makeStore, SAME_MS } from "../mods/roundup-pane/limits/store.js";
import { limitsModel } from "../mods/roundup-pane/limits/card.js";
import { clock as clockText } from "../mods/roundup-pane/context/text.js";
import { integrationFile, localParts } from "../mods/roundup-pane/context/locate.js";
import { ContextReader, makeQueue } from "../mods/roundup-pane/context/reader.js";
import claude, { offPlan } from "../mods/roundup-pane/context/strategies/claude.js";
import codex from "../mods/roundup-pane/context/strategies/codex.js";

beforeEach(() => clock.reset());

const MIN = 60_000, H = 60 * MIN, DAY = 24 * H;
const NOW = Date.UTC(2026, 10, 15, 12, 0);
// A 5-hour window `gone` minutes old at NOW, read at NOW, and a week with two days gone.
const five = (used, gone = 150, at = NOW) => ({ minutes: 300, used, resetsAt: NOW + (300 - gone) * MIN, at });
const week = (used, goneDays = 2, at = NOW) => ({ minutes: 10080, used, resetsAt: NOW + (7 - goneDays) * DAY, at });
// A reading as store.get() gives it: as old as its oldest window, null as soon as one's time is unknown.
const oldest = (windows) => (windows.some((w) => !Number.isFinite(w.at)) ? null : Math.min(...windows.map((w) => w.at)));
const reading = (windows, extra = {}) => ({ at: oldest(windows), plan: null, source: "status-line", rev: 1, windows, ...extra });

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
  assert.equal(pace({ ...five(78, 205), at: null }, NOW), null, "a reading without a time has no pace");
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

test("a window whose time is unknown is old, and so is its reading; a reading is as old as its oldest window", () => {
  assert.equal(staleWindow({ ...five(31), at: null }, NOW), true);
  assert.equal(staleWindow(five(31), NOW + STALE_MS), false);
  const mixed = reading([{ ...five(31), at: null }, week(38)]);
  assert.equal(stale(mixed, NOW), true, "one window nobody knows the age of: the reading is shown as old");
  assert.equal(stale(reading([five(31, 150, NOW - 16 * MIN), week(38)]), NOW), true, "one window old: the reading is");
  // The card's age (asOf): the oldest window's time, none as soon as one is unknown.
  const store = makeStore();
  store.offer("claude:/x", { at: NOW - 5 * MIN, windows: [five(31)] });
  store.offer("claude:/x", { at: NOW, windows: [week(38)] });
  assert.equal(asOf(store.get("claude:/x"), NOW), NOW - 5 * MIN, "the oldest window's time");
  assert.equal(limitsModel(store.get("claude:/x"), NOW + 11 * MIN, {}).age, "16m old", "the card says the oldest window's age");
  store.offer("claude:/y", { at: null, windows: [five(31)] });
  store.offer("claude:/y", { at: NOW, windows: [week(38)] });
  assert.equal(asOf(store.get("claude:/y"), NOW), null);
  assert.equal(limitsModel(store.get("claude:/y"), NOW, {}).age, "age unknown");
  assert.notEqual(shownState(mixed, NOW), shownState(reading([five(31), week(38)]), NOW), "the pill is drawn again when the time gets known");
});

test("a window that has reset doesn't make its reading old: the age is the oldest live window's, all reset: all of them", () => {
  const fresh = five(31); // read now
  const gone = { ...week(38, 2, NOW - 3 * DAY), resetsAt: NOW - MIN }; // read three days ago, reset a minute ago
  const r = reading([fresh, gone]);
  assert.equal(stale(r, NOW), false, "the 5h is fresh; the weekly reads –");
  assert.equal(asOf(r, NOW), NOW);
  assert.deepEqual([limitsModel(r, NOW, {}).old, limitsModel(r, NOW, {}).age], [false, `as of ${clockText(NOW)}`]);
  // At its reset a window has reset; a moment before, it still counts.
  assert.equal(stale(reading([fresh, { ...gone, resetsAt: NOW }]), NOW), false);
  assert.equal(stale(reading([fresh, { ...gone, resetsAt: NOW + 1 }]), NOW), true);
  // A window that has reset without a time doesn't make a live one's unknown; a live one without does.
  assert.equal(asOf(reading([fresh, { ...gone, at: null }]), NOW), NOW);
  assert.equal(asOf(reading([{ ...fresh, at: null }, gone]), NOW), null);
  assert.equal(stale(reading([{ ...fresh, at: null }, gone]), NOW), true);
  // All have reset: as old as all of them.
  const all = reading([{ ...fresh, resetsAt: NOW - MIN, at: NOW - 20 * MIN }, gone]);
  assert.equal(asOf(all, NOW), NOW - 3 * DAY);
  assert.equal(stale(all, NOW), true);
  // In the store: newer readings carry only the 5h, the weekly kept from before has reset.
  const store = makeStore();
  store.offer(A, { at: NOW - 3 * DAY, windows: [{ minutes: 300, used: 50, resetsAt: NOW - 3 * DAY + H }, { minutes: 10080, used: 38, resetsAt: NOW - MIN }] });
  store.offer(A, { at: NOW, windows: [five(31)] });
  assert.equal(stale(store.get(A), NOW), false, "the pill isn't dimmed");
  assert.equal(limitsModel(store.get(A), NOW, {}).age, `as of ${clockText(NOW)}`, "the card says the 5h's time");
});

// --- the parsers ---

const stdin = JSON.parse(fixture("claude-status-stdin.json"));
const AT = Date.parse("2026-11-13T23:46:03Z");
// `at`: when the script wrote the file; `limitsAt`: when it saw the answer the limits are from.
const file = (claudeJson, limitsAt = AT) => ({ v: 1, terminal: "t7", pid: 1, at: AT + 90 * MIN, limitsAt, claude: claudeJson });

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
  assert.equal(fromClaude(file(stdin)).at, AT, "the time the script saw the answer, not the time it wrote the file");
  assert.equal(fromClaude(file(stdin, null)).at, null, "the script couldn't tell: a reading without a time");
  assert.equal(fromClaude({ v: 1, at: AT, claude: stdin }).at, null, "a file of the script before limitsAt: no time, not the file's");
  assert.equal(fromClaude(file(stdin, "soon")).at, null);
  assert.deepEqual(fromClaude({ claude: stdin }).windows.map((w) => w.used), [13, 28], "the windows count without a time");
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
  assert.equal(fromCodex(line(p.rate_limits, { timestamp: "never" })).at, null, "no time of the line: a reading without a time");
  assert.equal(fromCodex(line({ primary: { used_percent: 12, window_minutes: 300, resets_in_seconds: 600 } }, { timestamp: "never" })), null, "seconds until the reset from no time: no window");
  assert.equal(fromCodex(line({ primary: { used_percent: 12, window_minutes: 0, resets_at: 1794762296 } })), null, "a window without a length");
  assert.equal(fromCodex({ ...tokenCount, type: "response_item" }), null);
  assert.equal(fromCodex({ ...tokenCount, payload: { ...p, type: "agent_message" } }), null);
  assert.equal(fromCodex(null), null);
  // A daily window sorts before a weekly one, whichever is primary.
  const swapped = fromCodex(line({ primary: p.rate_limits.secondary, secondary: { used_percent: 3, window_minutes: 1440, resets_at: 1794762296 } }));
  assert.deepEqual(swapped.windows.map((w) => w.minutes), [1440, 10080]);
});

test("Codex: a window a minute off a known length is that window, any other length stays", () => {
  assert.deepEqual([299, 300, 301, 1439, 1441, 10079, 10081].map(snapMinutes), [300, 300, 300, 1440, 1440, 10080, 10080]);
  assert.deepEqual([298, 302, 60, 90, 10078, 10082, 4320].map(snapMinutes), [298, 302, 60, 90, 10078, 10082, 4320]);
  const p = tokenCount.payload;
  const off = fromCodex({ ...tokenCount, payload: { ...p, rate_limits: { primary: { used_percent: 12, window_minutes: 299, resets_at: 1794762296 }, secondary: { used_percent: 40, window_minutes: 10081, resets_at: 1795122098 } } } });
  assert.deepEqual(off.windows.map((w) => [w.minutes, names(w.minutes).short, w.resetsAt]), [[300, "5h", 1794762296_000], [10080, "wk", 1795122098_000]], "named and kept as the 5-hour and the weekly window, their resets untouched");
  // An older build's 299 and a newer one's 300 are one window in the store.
  const store = makeStore();
  store.offer("codex:/Users/a/.codex", off);
  store.offer("codex:/Users/a/.codex", fromCodex({ ...tokenCount, timestamp: "2026-11-15T15:12:00.000Z" }));
  assert.deepEqual(store.get("codex:/Users/a/.codex").windows.map((w) => [w.minutes, w.used]), [[300, 87], [10080, 21]]);
});

test("Codex: another bucket than the default pool gives nothing; no limit_id (older lines) and \"codex\" are the pool", () => {
  const p = tokenCount.payload;
  const bucket = (limit_id) => fromCodex({ ...tokenCount, payload: { ...p, rate_limits: { ...p.rate_limits, limit_id } } });
  assert.equal(bucket("codex_bengalfox"), null, "a model's own bucket is not the account's pool");
  assert.equal(bucket("codex_secondary"), null);
  assert.equal(bucket(""), null);
  assert.equal(bucket("codex").windows[0].used, 87);
  assert.equal(bucket(null).windows[0].used, 87);
  const { limit_id: _none, ...older } = p.rate_limits;
  assert.equal(fromCodex({ ...tokenCount, payload: { ...p, rate_limits: older } }).windows[0].used, 87);
});

test("Codex: of a rollout's last token_counts the newest with default-pool limits counts; events without any say the session has none", () => {
  const p = tokenCount.payload;
  const count = (timestamp, rate_limits) => ({ ...tokenCount, timestamp, payload: { ...p, rate_limits } });
  const older = count("2026-11-15T14:00:00.000Z", { ...p.rate_limits, primary: { used_percent: 50, window_minutes: 300, resets_at: 1794762296 } });
  const noLimits = count("2026-11-15T16:00:00.000Z", null);
  const foreign = count("2026-11-15T16:05:00.000Z", { ...p.rate_limits, limit_id: "codex_bengalfox", primary: { used_percent: 12, window_minutes: 300, resets_at: 1794762296 } });
  // Not a token_count though it names one: an answer quoting the words.
  const quote = { timestamp: "2026-11-15T16:06:00.000Z", type: "event_msg", payload: { type: "agent_message", message: 'the "token_count" event' } };
  const raw = (...lines) => jsonl(...lines).trimEnd().split("\n");
  const got = codexLimits(raw(older, tokenCount, noLimits, foreign, quote, "not json"));
  assert.equal(got.reading.windows[0].used, 87, "the newest with the pool's limits: the null and the other bucket after it are passed over");
  assert.equal(got.reading.at, Date.parse(tokenCount.timestamp), "with its own time");
  assert.equal(got.events, 3, "three token_counts looked at; the quote and the broken line are none");
  // An API-key session (the fixture): events, and no limits in any.
  const key = codexLimits(fixture("codex-rollout.jsonl").trimEnd().split("\n"));
  assert.equal(key.reading, null);
  assert.ok(key.events > 0);
  assert.deepEqual(codexLimits(raw(foreign, foreign)), { events: 2, reading: null }, "only another bucket: no pool limits");
  // Nothing to go by: no lines, or none that is a token_count.
  assert.deepEqual(codexLimits([]), { events: 0, reading: null });
  assert.deepEqual(codexLimits(raw(quote, { type: "turn_context", payload: {} })), { events: 0, reading: null });
  // The walk stops after CODEX_EVENTS events: limits further back count as none.
  const many = raw(tokenCount, ...Array.from({ length: CODEX_EVENTS }, () => noLimits));
  assert.deepEqual(codexLimits(many), { events: CODEX_EVENTS, reading: null });
  assert.equal(codexLimits(many.slice(0, CODEX_EVENTS)).reading.windows[0].used, 87, "one event fewer after it: found");
  // Only lines naming a token_count are parsed: the others may be anything.
  let parsed = 0;
  const parse = JSON.parse;
  JSON.parse = (text) => { parsed++; return parse(text); };
  try { codexLimits(raw({ type: "response_item", payload: { text: "x".repeat(1000) } }, tokenCount, { type: "response_item", payload: {} })); } finally { JSON.parse = parse; }
  assert.equal(parsed, 1);
});

// --- the store ---

const A = "claude:/Users/a/.claude";
// `at`: the time the reading is from (null: unknown).
const offer = (store, account, windows, at = NOW, extra = {}) => store.offer(account, { at, plan: null, source: "status-line", windows, ...extra });

test("the store keeps an account's windows; an unchanged offer changes nothing", () => {
  const store = makeStore();
  assert.equal(store.get(A), null);
  assert.equal(offer(store, A, [five(34), week(41)]), true);
  const r = store.get(A);
  assert.deepEqual(r.windows.map((w) => [w.minutes, w.used]), [[300, 34], [10080, 41]]);
  assert.equal(asOf(r, NOW), NOW);
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

test("the newer reading stays, whatever it says: a lower percent and an earlier reset too; an older one never comes back", () => {
  const store = makeStore();
  offer(store, A, [five(80), week(41)]);
  // A later answer says less (the plan changed, the provider reset the limits): it counts.
  assert.equal(offer(store, A, [five(16), week(41)], NOW + 10 * MIN), true);
  assert.deepEqual(store.get(A).windows.map((w) => w.used), [16, 41]);
  assert.equal(asOf(store.get(A), NOW), NOW + 10 * MIN, "as of the answer that said it");
  // A session that hasn't answered since hands its old numbers on again (a mode change runs the
  // status line): they are as old as they were, however often and whenever they come.
  for (let i = 0; i < 3; i++) assert.equal(offer(store, A, [five(80), week(41)], NOW), false);
  assert.equal(offer(store, A, [five(95), week(60)], NOW + 5 * MIN), false, "older and higher: still older");
  assert.deepEqual(store.get(A).windows.map((w) => w.used), [16, 41]);
  // A newer reading with an earlier reset (another login in the same folder) replaces the kept one.
  const earlier = { ...five(30), resetsAt: five(30).resetsAt - 90 * MIN };
  assert.equal(offer(store, A, [earlier], NOW + 12 * MIN), true);
  assert.equal(store.get(A).windows[0].resetsAt, earlier.resetsAt);
  // And the next window, with a later reset, when its answer comes.
  const next = { ...five(3), resetsAt: five(3).resetsAt + 5 * H };
  assert.equal(offer(store, A, [next], NOW + 3 * H), true);
  assert.deepEqual(store.get(A).windows.map((w) => w.used), [3, 41], "the new 5-hour window, the week as it was");
  assert.equal(offer(store, A, [five(99)], NOW + 2 * H), false, "the old window again, from a session that slept through the reset");
  // A window missing from an offer (Claude leaves an expired one out) keeps what was known.
  offer(store, A, [week(45)], NOW + 4 * H);
  assert.deepEqual(store.get(A).windows.map((w) => w.used), [3, 45]);
});

test("at the same time the higher percent stays: a correction within the second of what it corrects loses", () => {
  const store = makeStore();
  offer(store, A, [five(52)], NOW);
  assert.equal(offer(store, A, [five(60)], NOW), true, "the same time, more used");
  assert.equal(offer(store, A, [five(16)], NOW), false, "the same time, less used: Claude's time is in whole seconds");
  assert.equal(store.get(A).windows[0].used, 60);
  assert.equal(offer(store, A, [five(16)], NOW + 1000), true, "a second later it counts");
});

test("a reading without a time is a stopgap: it never replaces one with a time, and one with a time always replaces it", () => {
  const store = makeStore();
  // Nothing kept: taken, and its time stays unknown, for the window and the reading.
  assert.equal(offer(store, A, [five(34), week(41)], null), true);
  assert.equal(asOf(store.get(A), NOW), null);
  assert.deepEqual(store.get(A).windows.map((w) => w.at), [null, null]);
  // Among readings without a time the window decides: the same one only fills, a later reset is the next.
  assert.equal(offer(store, A, [five(52)], null), true);
  assert.equal(offer(store, A, [five(34)], null), false, "the same window, less used");
  const jitter = { ...five(60), resetsAt: five(60).resetsAt + SAME_MS - 1 };
  assert.equal(offer(store, A, [jitter], null), true, "a reset a few seconds off is the same window");
  assert.equal(offer(store, A, [{ ...five(99), resetsAt: five(99).resetsAt - 5 * H }], null), false, "an earlier window");
  assert.equal(offer(store, A, [{ ...five(3), resetsAt: five(3).resetsAt + 5 * H }], null), true, "the next window");
  // A reading with a time replaces it, even an old one that says less: it is known, the other isn't.
  assert.equal(offer(store, A, [five(20)], NOW - 3 * H), true);
  assert.deepEqual(store.get(A).windows.map((w) => [w.used, w.at]), [[20, NOW - 3 * H], [41, null]]);
  assert.equal(asOf(store.get(A), NOW), null, "one window's time unknown: the reading's is");
  // And then no reading without a time comes back, whatever it says.
  assert.equal(offer(store, A, [five(99)], null), false);
  assert.equal(offer(store, A, [{ ...five(99), resetsAt: five(99).resetsAt + 5 * H }], null), false, "nor with a later reset: a stale file of another login");
  assert.equal(store.offer(A, { plan: null, source: "status-line", windows: [five(99)] }), false, "no time given is no time");
  offer(store, A, [week(44)], NOW);
  assert.equal(asOf(store.get(A), NOW), NOW - 3 * H, "all known: the oldest window's time");
});

test("a kept window whose reset has passed stays until a newer reading: an older one with a later reset is not the next window", () => {
  const store = makeStore();
  // Read an hour ago: 16 %, a window that reset half an hour ago (the correction of what follows).
  const corrected = { ...five(16), resetsAt: NOW - 30 * MIN };
  offer(store, A, [corrected], NOW - H);
  // Read two hours ago: 80 %, said to reset in an hour. Handed on again now, and again.
  const before = { ...five(80), resetsAt: NOW + H };
  for (let i = 0; i < 3; i++) assert.equal(offer(store, A, [before], NOW - 2 * H), false, "older: it doesn't come back as the next window");
  assert.equal(offer(store, A, [before], null), false, "nor without a time, which would take the known one away");
  assert.deepEqual(store.get(A).windows.map((w) => [w.used, w.resetsAt, w.at]), [[16, NOW - 30 * MIN, NOW - H]], "it reads as reset since, until an answer");
  // The next answer brings the window that runs now.
  assert.equal(offer(store, A, [{ ...five(3), resetsAt: NOW + 5 * H }], NOW), true);
  assert.equal(store.get(A).windows[0].used, 3);
  // Readings without a time among themselves: a later reset is the next window, passed or not.
  const loose = makeStore();
  offer(loose, A, [{ ...five(96), resetsAt: NOW - MIN }], null);
  assert.equal(offer(loose, A, [{ ...five(3), resetsAt: NOW + 5 * H }], null), true);
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

test("the card: a reading whose time is unknown says so instead of an age, is old, and has no pace", () => {
  const m = limitsModel(reading([{ ...five(78, 205), at: null }, { ...week(41), at: null }]), NOW, { agent: "Claude Code" });
  assert.equal(m.old, true);
  assert.equal(m.age, "age unknown");
  assert.deepEqual(m.rows.map((r) => r.value), ["78%", "41%"], "the numbers stand");
  assert.deepEqual(m.notes, [{ kind: "plain", text: "As Claude Code last reported them: how old shows with its next answer" }], "no pace note: 78 % after 205 minutes would have one");
  // One window known and fresh, one unknown: unknown as a whole.
  assert.equal(limitsModel(reading([five(31), { ...week(41), at: null }]), NOW, {}).age, "age unknown");
});

// --- the strategies and the reader hand the limits on ---

const SID = stdin.session_id, CPID = 52896, STARTED = 1794613515093;
function claudeIo({ env = { HC_TERMINAL_ID: "t7" }, statusPid = CPID, status = stdin } = {}) {
  const io = contextIo({ terminals: { t7: { pid: CPID, created: STARTED - 4000, title: "Claude Code", cwd: "/Users/a/src/demo" } }, envs: { [CPID]: env } });
  const home = env.CLAUDE_CONFIG_DIR ?? "/Users/a/.claude";
  io.files[`${home}/sessions/${CPID}.json`] = JSON.stringify({ pid: CPID, sessionId: SID, cwd: "/Users/a/src/demo", startedAt: STARTED, kind: "interactive" });
  if (status) io.files[integrationFile(io, "claude", "t7")] = JSON.stringify({ v: 1, terminal: "t7", pid: statusPid, at: AT, limitsAt: AT, claude: status });
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

test("Claude: a process told to use Bedrock, Vertex or Foundry is off the plan; a key, a token or another endpoint alone decides nothing", () => {
  assert.equal(offPlan({ CLAUDE_CODE_USE_BEDROCK: "1" }), true);
  assert.equal(offPlan({ CLAUDE_CODE_USE_VERTEX: "true" }), true);
  assert.equal(offPlan({ CLAUDE_CODE_USE_FOUNDRY: " Yes " }), true);
  assert.equal(offPlan({ ANTHROPIC_BASE_URL: "https://gateway.example/v1" }), false, "a pass-through proxy may carry the subscription: its session's own status decides");
  assert.equal(offPlan({ CLAUDE_CODE_USE_BEDROCK: "0" }), false, "named, but switched off");
  assert.equal(offPlan({ CLAUDE_CODE_USE_BEDROCK: "" , ANTHROPIC_BASE_URL: " " }), false);
  assert.equal(offPlan({ ANTHROPIC_API_KEY: "sk-x", ANTHROPIC_AUTH_TOKEN: "y" }), false, "Claude Code may still use the subscription");
  assert.equal(offPlan({}), false);
  assert.equal(offPlan(null), false, "no environment read: nothing known");
});

test("Claude's strategy: a pane off the plan shows no limits and offers none; the account stays the other panes'", async () => {
  const io = claudeIo({ env: { HC_TERMINAL_ID: "t7", CLAUDE_CODE_USE_BEDROCK: "1" } });
  const memo = {};
  assert.ok(await claude.locate({ terminal: "t7" }, io, memo));
  assert.equal(memo.account, "claude:/Users/a/.claude", "the account is still named");
  assert.deepEqual(memo.plan, { pid: CPID, key: null, on: false }, "but this pane has none of it");
  assert.equal(io.limits.get(memo.account), null, "and its file's numbers aren't offered");
  // A key in the environment: the account's limits until the session's own answer says otherwise.
  const key = claudeIo({ env: { HC_TERMINAL_ID: "t7", ANTHROPIC_API_KEY: "sk-x" } });
  const m2 = {};
  await claude.locate({ terminal: "t7" }, key, m2);
  assert.notEqual(m2.plan?.on, false);
  assert.ok(key.limits.get(m2.account));
});

test("Claude's strategy: a session that has answered and whose status has no limits shows none; before its first answer it shows its account's", async () => {
  const { rate_limits: _none, ...bare } = stdin;
  const answered = { ...bare, cost: { ...bare.cost, total_api_duration_ms: 4200 } };
  // `limitsAt`: the integration saw the API time grow in this process (an answer here), or null.
  const put = (io, claudeJson, limitsAt = AT) => { io.files[integrationFile(io, "claude", "t7")] = JSON.stringify({ v: 1, terminal: "t7", pid: CPID, at: AT, limitsAt, claude: claudeJson }); };
  const io = claudeIo({ status: { ...bare, cost: { ...bare.cost, total_api_duration_ms: 0 } } });
  put(io, { ...bare, cost: { ...bare.cost, total_api_duration_ms: 0 } }, null);
  const memo = {};
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(memo.plan, null, "no answer yet: no limits in the status says nothing");
  put(io, answered);
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.deepEqual(memo.plan, { pid: CPID, key: SID, on: false }, "answered, and no limits: not on the plan");
  // Kept from look to look: the file not there this time changes nothing.
  delete io.files[integrationFile(io, "claude", "t7")];
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(memo.plan?.on, false, "what the session said stands");
  // Another session's file says nothing about this one.
  const other = claudeIo({ status: { ...answered, session_id: "another-session" } });
  const m2 = {};
  await claude.locate({ terminal: "t7" }, other, m2);
  assert.equal(m2.plan, null);
  // Limits in its status after all (it logged in): shown again.
  put(io, { ...stdin, cost: { ...stdin.cost, total_api_duration_ms: 9000 } });
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(memo.plan?.on, true);
  assert.ok(io.limits.get(memo.account));
  // Another process in the terminal starts without the last one's word, also before its session file.
  const next = claudeIo({ status: null });
  const m3 = { plan: { pid: 1, key: SID, on: false } };
  await claude.locate({ terminal: "t7" }, next, m3);
  assert.equal(m3.plan, null);
  const early = claudeIo({ status: null });
  delete early.files[`/Users/a/.claude/sessions/${CPID}.json`];
  const m4 = { plan: { pid: 1, key: SID, on: false } };
  assert.equal(await claude.locate({ terminal: "t7" }, early, m4), null, "no session yet");
  assert.equal(m4.plan, null);
  // Another session of the same process (/clear) starts without the last one's word, also without a file.
  const cleared = claudeIo({ status: null });
  const m5 = { plan: { pid: CPID, key: "an-earlier-session", on: false } };
  await claude.locate({ terminal: "t7" }, cleared, m5);
  assert.equal(m5.plan, null);
});

test("Claude's strategy: a pane with ANTHROPIC_BASE_URL shows the limits its own status line carries, and none once it answers without them", async () => {
  const proxy = { HC_TERMINAL_ID: "t7", ANTHROPIC_BASE_URL: "http://127.0.0.1:4000" };
  const io = claudeIo({ env: proxy });
  const memo = {};
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(memo.plan?.on, true, "its own session has limits: on the plan");
  assert.deepEqual(io.limits.get(memo.account).windows.map((w) => w.used), [13, 28], "and offered");
  const { rate_limits: _none, ...bare } = stdin;
  const off = claudeIo({ env: proxy, status: { ...bare, cost: { ...bare.cost, total_api_duration_ms: 4200 } } });
  const m2 = {};
  await claude.locate({ terminal: "t7" }, off, m2);
  assert.deepEqual(m2.plan, { pid: CPID, key: SID, on: false }, "another endpoint indeed: answered without limits");
});

test("Claude's strategy: once its own status carried limits, a session stays on the plan; another process of the same session starts afresh", async () => {
  const { rate_limits: _none, ...bare } = stdin;
  const put = (io, claudeJson) => { io.files[integrationFile(io, "claude", "t7")] = JSON.stringify({ v: 1, terminal: "t7", pid: CPID, at: AT, limitsAt: AT, claude: claudeJson }); };
  const io = claudeIo();
  const memo = {};
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.deepEqual(memo.plan, { pid: CPID, key: SID, on: true });
  // A later status without limits (a call that brought no limit headers): still on the plan.
  put(io, { ...bare, cost: { ...bare.cost, total_api_duration_ms: 9000 } });
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(memo.plan?.on, true, "the limits stay shown");
  // The same session resumed in another process: what the last process said is not its word.
  const resumed = { plan: { pid: 1, key: SID, on: true } };
  await claude.locate({ terminal: "t7" }, io, resumed);
  assert.deepEqual(resumed.plan, { pid: CPID, key: SID, on: false }, "its own answer without limits decides");
});

test("Claude's account and its paths: one config folder however it is spelled", async () => {
  const { normalizeFolder } = await import("../mods/roundup-pane/context/locate.js");
  assert.equal(normalizeFolder("/Users/a/.claude-work/"), "/Users/a/.claude-work");
  assert.equal(normalizeFolder("/Users/a//.claude-work//"), "/Users/a/.claude-work");
  assert.equal(normalizeFolder("/"), "/", "the root stays");
  assert.equal(normalizeFolder("~/.claude"), "~/.claude", "a tilde stays as written, as the agent takes it");
  const io = claudeIo({ env: { HC_TERMINAL_ID: "t7", CLAUDE_CONFIG_DIR: "/Users/a/.claude-work/" } });
  io.files[`/Users/a/.claude-work/sessions/${CPID}.json`] = JSON.stringify({ pid: CPID, sessionId: SID, cwd: "/Users/a/src/demo", startedAt: STARTED, kind: "interactive" });
  const memo = {};
  assert.ok(await claude.locate({ terminal: "t7" }, io, memo));
  assert.equal(memo.account, "claude:/Users/a/.claude-work", "a slash at the end makes no second account");
  // Another terminal's file of this folder, its transcript path spelled with a double slash.
  const dir = "/Users/a/.cache/herdr-roundup/context/claude";
  io.files[`${dir}/t3.json`] = JSON.stringify({ v: 1, terminal: "t3", pid: 9, at: AT, limitsAt: AT, claude: { ...stdin, transcript_path: "/Users/a/.claude-work//projects/-x/s.jsonl" } });
  const fresh = makeStore();
  io.limits = fresh;
  await claude.accountLimits(io, memo);
  assert.ok(fresh.get(memo.account), "found under the folder");
  // The root as the config folder: its transcripts lie under /projects/.
  const root = claudeIo({ status: null });
  root.files[`${dir}/t3.json`] = JSON.stringify({ v: 1, terminal: "t3", pid: 9, at: AT, limitsAt: AT, claude: { ...stdin, transcript_path: "/projects/-x/s.jsonl" } });
  await claude.accountLimits(root, { account: "claude:/", home: "/" });
  assert.ok(root.limits.get("claude:/"), "the root's files are its account's");
});

test("Claude's account limits: every file of the folder is read, the account's among many others' too, a few at a time", async () => {
  const { ACCOUNT_AT_ONCE } = await import("../mods/roundup-pane/context/locate.js");
  const io = claudeIo({ status: null });
  const dir = "/Users/a/.cache/herdr-roundup/context/claude";
  for (let i = 0; i < 70; i++) io.files[`${dir}/a${String(i).padStart(2, "0")}.json`] = JSON.stringify({ v: 1, terminal: `a${i}`, pid: 9, at: AT, limitsAt: AT, claude: { ...stdin, transcript_path: "/Users/b/.claude/projects/-x/s.jsonl" } });
  io.files[`${dir}/z9.json`] = JSON.stringify({ v: 1, terminal: "z9", pid: 9, at: AT, limitsAt: AT, claude: stdin });
  let open = 0, most = 0;
  const readText = io.readText;
  io.readText = async (p) => { open++; most = Math.max(most, open); await Promise.resolve(); try { return await readText(p); } finally { open--; } };
  const memo = {};
  await claude.locate({ terminal: "t7" }, io, memo);
  most = 0;
  await claude.accountLimits(io, memo);
  assert.deepEqual(io.limits.get(memo.account).windows.map((w) => w.used), [13, 28], "the 71st file, the only one of this account");
  assert.ok(most > 1 && most <= ACCOUNT_AT_ONCE, `at most ${ACCOUNT_AT_ONCE} at a time (${most})`);
  // One that can't be read stops none of the others.
  const io2 = claudeIo({ status: null });
  io2.files[`${dir}/a1.json`] = "x";
  io2.files[`${dir}/z9.json`] = io.files[`${dir}/z9.json`];
  const rt = io2.readText;
  io2.readText = async (p) => (p.endsWith("/a1.json") ? Promise.reject(new Error("gone")) : rt(p));
  const m2 = {};
  await claude.locate({ terminal: "t7" }, io2, m2);
  await claude.accountLimits(io2, m2);
  assert.ok(io2.limits.get(m2.account));
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

test("Codex's strategy: a session whose last token_counts have no default-pool limits shows none; one that has them, or says nothing, shows its account's", async () => {
  // An API-key session: events, no limits in any.
  const key = codexIo(fixture("codex-rollout.jsonl"));
  const memo = {};
  const src = await codex.locate({ terminal: "t8" }, key, memo);
  await codex.read(src, key, memo);
  assert.deepEqual(memo.plan, { pid: XPID, key: ROLLOUT, on: false });
  assert.equal(memo.account, "codex:/Users/a/.codex", "the account stays named: it is the other panes'");
  await codex.locate({ terminal: "t8" }, key, memo);
  assert.equal(memo.plan?.on, false, "kept from look to look for the same process");
  // Its next token_count has the pool's limits (it logged in): shown again, and offered.
  key.files[ROLLOUT] += JSON.stringify(tokenCount) + "\n";
  await codex.read(src, key, memo);
  assert.notEqual(memo.plan?.on, false);
  assert.equal(key.limits.get(src.account).windows[0].used, 87);
  // Only another bucket's limits: none of the pool's, and nothing offered.
  const p = tokenCount.payload;
  const foreign = { ...tokenCount, payload: { ...p, rate_limits: { ...p.rate_limits, limit_id: "codex_bengalfox" } } };
  const other = codexIo(jsonl(foreign));
  const m2 = {};
  const s2 = await codex.locate({ terminal: "t8" }, other, m2);
  await codex.read(s2, other, m2);
  assert.equal(m2.plan?.on, false);
  assert.equal(other.limits.get(s2.account), null);
  // A rollout without a token_count says nothing: what this rollout said before stands, what
  // another one said doesn't.
  const fresh = codexIo(jsonl({ timestamp: "2026-11-15T15:00:00.000Z", type: "turn_context", payload: { model: "gpt-6.1-sol" } }));
  const s3 = await codex.locate({ terminal: "t8" }, fresh, {});
  const same = { plan: { pid: XPID, key: ROLLOUT, on: false } }, another = { plan: { pid: XPID, key: "/Users/a/.codex/sessions/other.jsonl", on: false } };
  await codex.read(s3, fresh, same);
  assert.equal(same.plan?.on, false);
  await codex.read(s3, fresh, another);
  assert.notEqual(another.plan?.on, false);
  // Another process in the terminal starts without the last one's word.
  const m4 = { plan: { pid: 1, key: ROLLOUT, on: false } };
  await codex.locate({ terminal: "t8" }, fresh, m4);
  assert.notEqual(m4.plan?.on, false);
});

test("Codex's strategy: another thread in the same process (/new) starts without the last thread's word, also before its rollout is there", async () => {
  const titled = (title) => {
    const io = contextIo({ terminals: { t8: { pid: XPID, created: 1, title, cwd: "/Users/a/src/demo" } }, envs: { [XPID]: { HC_TERMINAL_ID: "t8" } } });
    io.limits = makeStore();
    return io;
  };
  const said = () => ({ plan: { pid: XPID, key: ROLLOUT, on: false } });
  // The title names a new thread, which has no rollout yet: no source, and no word against it.
  let memo = said();
  assert.equal(await codex.locate({ terminal: "t8" }, titled("01a1e0cd-a605-7880-8cf9-4473b... | new"), memo), null);
  assert.notEqual(memo.plan?.on, false, "the new thread shows its account's limits");
  // The title still names the thread that said it, or names none (starting, another title item): it stands.
  memo = said();
  await codex.locate({ terminal: "t8" }, titled("01a1d750-0653-7190-914d-7c804... | ok"), memo);
  assert.equal(memo.plan?.on, false);
  memo = said();
  await codex.locate({ terminal: "t8" }, titled("Codex"), memo);
  assert.equal(memo.plan?.on, false, "no thread named: nothing known against it");
});

test("Codex's strategy: only a read that came to an end, over all the walk looks at, says the session has no limits", async () => {
  const p = tokenCount.payload;
  const filler = { timestamp: "2026-11-15T15:20:00.000Z", type: "response_item", payload: { text: "x".repeat(300 * 1024) } };
  const bare = (info) => ({ ...tokenCount, timestamp: "2026-11-15T15:30:00.000Z", payload: { ...p, info, rate_limits: null } });
  // The pool's limits, 300 KB of an answer, then a token_count without a context number or
  // limits: the first end of the file holds the last event only, the context read asks for more.
  const long = jsonl(tokenCount, filler, bare(null));
  const failing = codexIo(long);
  const tail = failing.tail;
  let tails = 0;
  failing.tail = async (...args) => (++tails === 2 ? null : tail(...args));
  const memo = {};
  const src = await codex.locate({ terminal: "t8" }, failing, memo);
  assert.equal(await codex.read(src, failing, memo), null, "the larger end couldn't be read");
  assert.equal(tails, 2);
  assert.notEqual(memo.plan?.on, false, "a walk of the smaller end proves nothing: the pane keeps its account's limits");
  // The same file read to its end: the limits are there.
  const fine = codexIo(long);
  const m2 = {};
  await codex.read(await codex.locate({ terminal: "t8" }, fine, m2), fine, m2);
  assert.notEqual(m2.plan?.on, false);
  assert.equal(fine.limits.get("codex:/Users/a/.codex").windows[0].used, 87);
  // A read that ends in the first end of the file (its last event has a context number), having
  // seen one event of many and not the whole file: nothing said either.
  const short = codexIo(jsonl(tokenCount, filler, bare(p.info)));
  const m3 = {};
  const s3 = await codex.locate({ terminal: "t8" }, short, m3);
  assert.ok(await codex.read(s3, short, m3));
  assert.equal(short.calls.filter((c) => c[0] === "tail").length, 1);
  assert.notEqual(m3.plan?.on, false);
  assert.equal(short.limits.get(s3.account), null, "and nothing offered: the limits lie further back than was read");
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

test("the reader names no account for a pane whose own session has no plan limits, and asks nothing for it", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  let none = true, asks = 0;
  const strategy = {
    id: "fake", matches: ["fake"],
    async locate(_a, _io, memo) { memo.account = "fake:/Users/a/.fake"; memo.home = "/Users/a/.fake"; memo.plan = none ? { pid: 10, key: null, on: false } : null; return null; },
    async read() { return null; },
    async accountLimits() { asks++; },
  };
  const reader = new ContextReader(io, { strategies: [strategy], queue: makeQueue(2) });
  const cx = makeCx();
  reader.see({ terminal: "t1", program: { key: "fake" }, app: null, status: "idle" }, true, cx);
  await clock.advance(2000);
  assert.equal(reader.account, null, "the account is the other panes': this one shows none");
  assert.equal(asks, 0, "and reads nothing for it");
  // Its session has limits after all: the account, and the ask it hadn't made.
  none = false;
  await clock.advance(5 * 60_000);
  assert.equal(reader.account, "fake:/Users/a/.fake");
  assert.equal(asks, 1);
  reader.close();
  assert.deepEqual(cx.errors, []);
});

test("an environment that couldn't be read leaves the account unknown: nothing shown, offered or asked, until a look reads it", async () => {
  // Codex, its rollout unchanged between the looks, and no ask that could bring its limits: the
  // second look reads the file again, as its account is new, and offers them.
  const io = codexIo(fixture("codex-rollout.jsonl") + JSON.stringify(tokenCount) + "\n");
  io.now = () => clock.now;
  let envOk = false;
  io.env = async () => (envOk ? { HC_TERMINAL_ID: "t8" } : null);
  const tails = () => io.calls.filter((c) => c[0] === "tail").length;
  const reader = new ContextReader(io, { strategies: [{ ...codex, accountLimits: async () => {} }], queue: makeQueue(2) });
  const cx = makeCx();
  reader.see({ terminal: "t8", program: { key: "codex" }, app: null, status: "idle" }, true, cx);
  await clock.advance(2000);
  assert.ok(reader.reading, "the context reads all the same");
  assert.equal(reader.account, null, "no account from a failed ps");
  assert.equal(io.limits.get("codex:/Users/a/.codex"), null, "and nothing offered under a guessed one");
  const read = tails();
  envOk = true;
  await clock.advance(5 * 60_000);
  assert.equal(reader.account, "codex:/Users/a/.codex");
  assert.ok(tails() > read, "read again, though the file is the same");
  assert.equal(io.limits.get("codex:/Users/a/.codex").windows[0].used, 87);
  reader.close();
  // Claude with its own config folder: the ask goes to that account once its environment is read,
  // never to the default one.
  const cio = contextIo({ terminals: { t7: { pid: CPID, created: STARTED - 4000, title: "Claude Code", cwd: "/Users/a/src/demo" } } });
  cio.now = () => clock.now;
  cio.limits = makeStore();
  let cenv = null;
  cio.env = async () => cenv;
  const asked = [];
  const r2 = new ContextReader(cio, { strategies: [{ ...claude, accountLimits: async (_io, about) => { asked.push(about.account); } }], queue: makeQueue(2) });
  const cx2 = makeCx();
  r2.see({ terminal: "t7", program: { key: "claude" }, app: null, status: "idle" }, true, cx2);
  await clock.advance(2000);
  assert.deepEqual([r2.account, asked], [null, []], "no source, no account, no ask");
  cenv = { HC_TERMINAL_ID: "t7", CLAUDE_CONFIG_DIR: "/Users/a/.claude-work" };
  await clock.advance(5 * 60_000);
  assert.equal(r2.account, "claude:/Users/a/.claude-work");
  assert.deepEqual(asked, ["claude:/Users/a/.claude-work"]);
  r2.close();
  assert.deepEqual([...cx.errors, ...cx2.errors], []);
});

test("another account in the pane is asked once more, and the last ask's place in the queue goes", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  let account = "fake:/Users/a/.one";
  const asked = [], holds = [];
  const strategy = {
    id: "fake", matches: ["fake"],
    async locate(_a, _io, memo) { memo.account = account; memo.home = account.slice(5); return null; },
    async read() { return null; },
    // Each ask runs until the test lets it go, with a resolver of its own.
    async accountLimits(_io, about) { asked.push(about.account); await new Promise((r) => holds.push(r)); },
  };
  const queue = makeQueue(4);
  const reader = new ContextReader(io, { strategies: [strategy], queue });
  const cx = makeCx();
  reader.see({ terminal: "t1", program: { key: "fake" }, app: null, status: "idle" }, true, cx);
  await clock.advance(2000);
  assert.deepEqual(asked, ["fake:/Users/a/.one"]);
  assert.equal(queue.running, 1, "the first ask holds its place");
  account = "fake:/Users/a/.two";
  await clock.advance(5 * 60_000);
  assert.deepEqual(asked, ["fake:/Users/a/.one", "fake:/Users/a/.two"]);
  assert.equal(queue.running, 1, "the first ask's place went before the second took one");
  await clock.advance(5 * 60_000);
  assert.equal(asked.length, 2, "the same account isn't asked again");
  reader.close();
  assert.equal(queue.running, 0, "close() reaches the ask that is still running");
  for (const r of holds) r();
  await clock.advance(1000);
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
  const kept = (terminal, extra, limitsAt = AT) => { io.files[`${dir}/${terminal}.json`] = JSON.stringify({ v: 1, terminal, pid: 9, at: AT + 2 * H, limitsAt, claude: { ...stdin, ...extra } }); };
  kept("t3", {}); // 13 % and 28 %, this account (the transcript lies under /Users/a/.claude)
  kept("t4", { rate_limits: { five_hour: { used_percentage: 9, resets_at: 1794621000 }, seven_day: { used_percentage: 30, resets_at: 1794866400 } } }, AT + 60_000);
  kept("t5", { transcript_path: "/Users/a/.claude-work/projects/-x/s.jsonl", rate_limits: { five_hour: { used_percentage: 99, resets_at: 1794621000 } } });
  io.files[`${dir}/t6.json`] = "{ not json";
  io.files[`${dir}/.t7.123`] = "a temp file of the status line script";
  io.files[`${dir}/t8.json`] = JSON.stringify({ v: 2, terminal: "t8", claude: stdin });
  const memo = {};
  await claude.locate({ terminal: "t7" }, io, memo);
  assert.equal(io.limits.get(memo.account), null, "the new session has nothing of its own");
  await claude.accountLimits(io, memo);
  assert.deepEqual(io.limits.get(memo.account).windows.map((w) => w.used), [9, 30], "the newest of this account's files, though it says less; the other account's 99 % is not it");
  assert.equal(asOf(io.limits.get(memo.account), AT + 60_000), AT + 60_000, "as of the answer the script saw, not of the file");
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
  assert.equal(l.windows[0].used, 87, "the newest of them: the thread that answered last");
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
  assert.equal(asks, 1, "asked with the first look, though it found no source");
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

test("an agent restarted in the pane on the same account asks the account's files again, once a minute per account at most", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  let pid = 100, asks = 0, looks = 0;
  const strategy = {
    id: "fake", matches: ["fake"],
    async locate(_a, io_, memo) {
      looks++;
      // Another pane of the account asked in the same moment (the restart within a minute of it).
      if (pid === 102) io_.limits.due("fake:/Users/a/.fake", clock.now);
      memo.account = "fake:/Users/a/.fake"; memo.home = "/Users/a/.fake"; memo.pid = pid;
      return null;
    },
    async read() { return null; },
    async accountLimits() { asks++; },
  };
  const reader = new ContextReader(io, { strategies: [strategy], queue: makeQueue(2) });
  const cx = makeCx();
  reader.see({ terminal: "t1", program: { key: "fake" }, app: null, status: "idle" }, true, cx);
  await clock.advance(2000);
  assert.equal(asks, 1);
  await clock.advance(5 * 60_000);
  assert.equal(asks, 1, "the same process: not again");
  // Restarted between two looks (the program never changed as panes() has it): another pid.
  pid = 101;
  await clock.advance(5 * 60_000);
  assert.equal(asks, 2, "another process on the account: asked again");
  // Another restart, the account asked by another pane just before: the store's throttle holds.
  pid = 102;
  const before = looks;
  while (looks === before) await clock.advance(1000);
  await clock.advance(1000);
  assert.equal(asks, 2, "within a minute of the account's last ask: not again");
  reader.close();
  assert.deepEqual(cx.errors, []);
});

test("the ask for the account's limits is a job of its own after the pane's look: the pane's own number and its header don't wait for it", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  let open = null, got = null, done = 0;
  const strategy = {
    id: "fake", matches: ["fake"], keepsNoReading: false,
    async locate(_a, _io, memo) { memo.account = "fake:/Users/a/.fake"; memo.home = "/Users/a/.fake"; return { id: "fake", pid: 10, files: [], fresh: true }; },
    async read() { return { used: 1000, window: 200_000, at: clock.now, source: "fake" }; },
    // An ask that takes its time: it ends when the test says so.
    accountLimits(_io, about) { got = about; return new Promise((resolve) => { open = () => { done++; resolve(); }; }); },
  };
  const queue = makeQueue(2);
  const reader = new ContextReader(io, { strategies: [strategy], queue });
  const cx = makeCx();
  reader.see({ terminal: "t1", program: { key: "fake" }, app: null, status: "idle" }, true, cx);
  await clock.advance(2000);
  assert.ok(open, "the ask is under way");
  assert.equal(reader.reading?.used, 1000, "the pane's own number is there before the ask ends");
  assert.equal(reader.account, "fake:/Users/a/.fake");
  assert.ok(cx.notified >= 1, "and its header was told");
  assert.deepEqual(got, { account: "fake:/Users/a/.fake", home: "/Users/a/.fake" }, "the ask works on the account as it was, not on the pane's memo");
  assert.notEqual(got, reader.memo);
  assert.equal(queue.running, 1, "it holds a place in the queue of its own");
  // The pane's later looks go on beside it.
  await clock.advance(61_000);
  assert.equal(queue.running, 1);
  // Closed while the ask runs: its place is free at once; its late end changes nothing.
  reader.close();
  assert.equal(queue.running, 0);
  open();
  await clock.advance(10);
  assert.equal(done, 1);
  assert.equal(queue.running, 0);
  assert.deepEqual(cx.errors, []);
});

test("another program in the pane frees the last one's ask: no place in the queue is left behind at close, and an ask still waiting never starts", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  const asked = [];
  const slow = (id) => ({
    id, matches: [id],
    async locate(_a, _io, memo) { memo.account = `${id}:/Users/a/.${id}`; memo.home = `/Users/a/.${id}`; return null; },
    async read() { return null; },
    accountLimits() { asked.push(id); return new Promise(() => {}); }, // never ends
  });
  const pane = (key) => ({ terminal: "t1", program: { key }, app: null, status: "idle" });
  const queue = makeQueue(2);
  const reader = new ContextReader(io, { strategies: [slow("one"), slow("two")], queue });
  const cx = makeCx();
  reader.see(pane("one"), true, cx);
  await clock.advance(2000);
  assert.deepEqual([asked, queue.running], [["one"], 1]);
  reader.see(pane("two"), true, cx);
  assert.equal(queue.running, 0, "the first program's ask gives its place back with the switch");
  await clock.advance(2000);
  assert.deepEqual([asked, queue.running], [["one", "two"], 1]);
  reader.close();
  assert.equal(queue.running, 0, "nothing left in the queue: both places are free for other headers");
  // An ask that waits for a place when the program changes never runs.
  const one = makeQueue(1);
  let free = null;
  const waiting = new ContextReader(io, { strategies: [{ ...slow("three"), async locate(_a, _io, memo) {
    memo.account = "three:/Users/a/.three"; memo.home = "/Users/a/.three";
    // Something else takes the queue's only place right after this look.
    if (!free) one.enter(() => new Promise((resolve) => { free = resolve; }));
    return null;
  } }], queue: one });
  waiting.see(pane("three"), true, cx);
  await clock.advance(2000);
  assert.equal(one.waiting, 1, "the ask waits behind it");
  waiting.see(pane("shell"), true, cx);
  assert.equal(one.waiting, 0);
  free();
  await clock.advance(2000);
  assert.equal(asked.includes("three"), false);
  waiting.close();
  assert.deepEqual(cx.errors, []);
});

test("an ask released while it waits for its place takes no other pane's turn: the next pane of the account asks", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" }, t2: { pid: 11, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  const asked = [];
  let free = null;
  const one = makeQueue(1);
  const strategy = {
    id: "fake", matches: ["fake"],
    async locate(agent, _io, memo) {
      memo.account = "fake:/Users/a/.fake"; memo.home = "/Users/a/.fake";
      // Something else takes the queue's only place right after the first pane's look.
      if (agent.terminal === "t1" && !free) one.enter(() => new Promise((resolve) => { free = resolve; }));
      return null;
    },
    async read() { return null; },
    async accountLimits() { asked.push("ask"); },
  };
  const pane = (terminal, key) => ({ terminal, program: { key }, app: null, status: "idle" });
  const cx = makeCx();
  const first = new ContextReader(io, { strategies: [strategy], queue: one });
  first.see(pane("t1", "fake"), true, cx);
  await clock.advance(2000);
  assert.equal(one.waiting, 1, "its ask waits");
  first.see(pane("t1", "shell"), true, cx); // released before it ran
  free();
  await clock.advance(1000);
  const second = new ContextReader(io, { strategies: [strategy], queue: one });
  second.see(pane("t2", "fake"), true, cx);
  await clock.advance(2000);
  assert.deepEqual(asked, ["ask"], "the second pane asks: the released one never noted the account");
  // A pane starting later within the minute doesn't ask again.
  const third = new ContextReader(io, { strategies: [strategy], queue: one });
  third.see(pane("t1", "fake"), true, cx);
  await clock.advance(2000);
  assert.deepEqual(asked, ["ask"], "within the minute: not again");
  first.close(); second.close(); third.close();
  assert.deepEqual(cx.errors, []);
});

test("two panes of an account starting at once ask once, though both asks run side by side", async () => {
  const io = contextIo({ terminals: { t1: { pid: 10, created: 0, title: "" }, t2: { pid: 11, created: 0, title: "" } } });
  io.now = () => clock.now;
  io.limits = makeStore();
  let asks = 0, open = null;
  const strategy = {
    id: "fake", matches: ["fake"],
    async locate(_a, _io, memo) { memo.account = "fake:/Users/a/.fake"; memo.home = "/Users/a/.fake"; return null; },
    async read() { return null; },
    // The first ask holds its place until the test lets it go.
    accountLimits() { asks++; return new Promise((resolve) => { open = resolve; }); },
  };
  const queue = makeQueue(2); // room for both asks at once
  const pane = (terminal) => ({ terminal, program: { key: "fake" }, app: null, status: "idle" });
  const cx = makeCx();
  const a = new ContextReader(io, { strategies: [strategy], queue });
  const b = new ContextReader(io, { strategies: [strategy], queue });
  a.see(pane("t1"), true, cx);
  b.see(pane("t2"), true, cx);
  await clock.advance(2000);
  assert.ok(open, "the first ask is under way and still open");
  assert.equal(asks, 1, "the second pane's ask ran beside it and found the account just asked");
  open();
  await clock.advance(2000);
  assert.equal(asks, 1);
  a.close(); b.close();
  assert.deepEqual(cx.errors, []);
});

// --- review 4 of #45 ---

test("a window at a rounded 100 % is reached: no pace beside it, one note that says when the agent answers again", () => {
  assert.notEqual(pace(five(99.49, 180), NOW), null, "99.49 % reads 99 %: the pace still counts");
  for (const used of [99.5, 99.6, 100]) assert.equal(pace(five(used, 180), NOW), null, `${used} % reads 100 %: reached, no pace`);
  const card = limitsModel(reading([five(99.6, 180), week(41)]), NOW, { agent: "Claude Code" });
  assert.equal(card.rows[0].sev, "reached");
  assert.deepEqual(card.notes, [{ kind: "plain", text: "5-hour limit reached: Claude Code answers again in 2h 00m" }]);
});

test("a reset about a week ahead on today's weekday reads as a duration, not as a time today; another day keeps its weekday", () => {
  const tue = new Date(2026, 10, 17, 10, 0).getTime(); // a Tuesday in the machine's zone
  assert.equal(new Date(tue).getDay(), 2);
  const nextTue = new Date(2026, 10, 24, 8, 48).getTime();
  assert.equal(when(nextTue, tue), "in 6d 22h");
  assert.equal(when(new Date(2026, 10, 23, 11, 0).getTime(), tue), "Mon 11:00");
  assert.equal(when(tue + DAY - MIN, tue), "in 23h 59m", "within a day: a duration");
  assert.equal(when(tue + DAY, tue), "Wed 10:00", "a day on: the weekday");
  const card = limitsModel(reading([{ minutes: 10080, used: 12, resetsAt: nextTue, at: tue }]), tue, {});
  assert.equal(card.rows[0].extra, "resets in 6d 22h");
  const reached = limitsModel(reading([{ minutes: 10080, used: 100, resetsAt: nextTue, at: tue }]), tue, { agent: "Codex" });
  assert.equal(reached.notes[0].text, "Weekly limit reached: Codex answers again in 6d 22h");
});

test("Codex's account limits: the rollouts written last, whenever they started, by one find; equal times by name; a failed find walks the day folders", async () => {
  const { newestRollouts } = await import("../mods/roundup-pane/context/strategies/codex.js");
  const now = Date.parse("2026-11-15T16:00:00Z");
  const io = codexIo(null);
  io.clock = now;
  const root = "/Users/a/.codex/sessions";
  const name = (i) => `${root}/2026/11/15/rollout-2026-11-15T${String(i % 24).padStart(2, "0")}-${String(i).padStart(2, "0")}-00-n${i}.jsonl`;
  // An old thread resumed today behind 55 newer-named ones written earlier.
  const resumed = `${root}/2026/10/01/rollout-2026-10-01T09-00-00-old.jsonl`;
  let asked = null;
  io.recentFiles = async (r, pattern, minutes) => {
    asked = [r, pattern, minutes];
    return [...Array.from({ length: 55 }, (_, i) => ({ path: name(i), mtime: now - (60 + i) * MIN })), { path: resumed, mtime: now - MIN }];
  };
  const got = await newestRollouts(io, "/Users/a/.codex");
  assert.deepEqual(asked, [root, "rollout-*.jsonl", 8 * 1440]);
  assert.deepEqual(got, [resumed, name(0), name(1), name(2), name(3)]);
  // Equal times: the later name first; a path that isn't a rollout by name is left out.
  io.recentFiles = async () => [{ path: `${root}/x/rollout-a.jsonl`, mtime: 5 }, { path: `${root}/x/rollout-b.jsonl`, mtime: 5 }, { path: `${root}/x/other.jsonl`, mtime: 9 }];
  assert.deepEqual(await newestRollouts(io, "/Users/a/.codex"), [`${root}/x/rollout-b.jsonl`, `${root}/x/rollout-a.jsonl`]);
  // None written within the time: none, and no walk.
  io.recentFiles = async () => [];
  io.files[`${root}/2026/11/15/rollout-2026-11-15T09-00-00-w.jsonl`] = "{}\n";
  assert.deepEqual(await newestRollouts(io, "/Users/a/.codex"), []);
  // find failed: the day folders by name, as before.
  io.recentFiles = async () => null;
  assert.deepEqual(await newestRollouts(io, "/Users/a/.codex"), [`${root}/2026/11/15/rollout-2026-11-15T09-00-00-w.jsonl`]);
  // accountLimits reads the ends of those it gives.
  io.recentFiles = async () => [{ path: `${root}/2026/11/15/rollout-2026-11-15T09-00-00-w.jsonl`, mtime: now }];
  io.files[`${root}/2026/11/15/rollout-2026-11-15T09-00-00-w.jsonl`] = JSON.stringify(tokenCount) + "\n";
  await codex.accountLimits(io, { account: "codex:/Users/a/.codex", home: "/Users/a/.codex" });
  assert.equal(io.limits.get("codex:/Users/a/.codex").windows[0].used, 87);
});

test("a process that proves not to be the pane's agent takes its account and plan along: nothing shown or asked; a failed hc get keeps them", async () => {
  const cases = [
    ["claude", () => claudeIo(), "t7", CPID, "claude:/Users/a/.claude"],
    ["codex", () => codexIo(fixture("codex-rollout.jsonl") + JSON.stringify(tokenCount) + "\n"), "t8", XPID, "codex:/Users/a/.codex"],
  ];
  for (const [key, make, t, pid, account] of cases) {
    for (const how of ["no foreground", "another terminal's", "no answer"]) {
      const io = make();
      io.now = () => clock.now;
      const base = io.terminal;
      let fg = "same";
      io.terminal = async (x) => {
        const real = await base(x);
        if (fg === "same") return real;
        if (fg === "none") return { ...real, pid: null };
        if (fg === "other") return { ...real, pid: pid + 1 };
        return null;
      };
      const env = io.env;
      io.env = async (p) => (p === pid + 1 ? { HC_TERMINAL_ID: "t99" } : env(p));
      const asked = [];
      const strategy = (await import("../mods/roundup-pane/context/registry.js")).STRATEGIES.find((s) => s.id === key);
      const reader = new ContextReader(io, { strategies: [{ ...strategy, accountLimits: async (_io, about) => { asked.push(about.account); } }], queue: makeQueue(2) });
      const cx = makeCx();
      reader.see({ terminal: t, program: { key }, app: null, status: "idle" }, true, cx);
      await clock.advance(2000);
      assert.equal(reader.account, account, `${key}: the account after the first look`);
      assert.deepEqual(asked, [account]);
      fg = how === "no foreground" ? "none" : how === "another terminal's" ? "other" : "silent";
      await clock.advance(5 * 60_000);
      if (how === "no answer") {
        assert.equal(reader.account, account, `${key}, ${how}: proves nothing, the account stays`);
      } else {
        assert.equal(reader.account, null, `${key}, ${how}: no account`);
        assert.equal(reader.memo.plan, null, `${key}, ${how}: no plan`);
        assert.equal(reader.reading, null);
      }
      assert.deepEqual(asked, [account], "no other ask");
      reader.close();
      assert.deepEqual(cx.errors, []);
    }
  }
});

test("a look whose process is gone by its end forgets that process's account and plan; another thread of the same process keeps them", async () => {
  for (const [endPid, still, expect] of [[11, undefined, null], [10, () => false, "fake:/a"]]) {
    const io = contextIo({ terminals: { t1: { pid: endPid, created: 0, title: "" } } });
    io.now = () => clock.now;
    const strategy = {
      id: "fake", matches: ["fake"],
      async locate(_a, _io, memo) { memo.account = "fake:/a"; memo.home = "/a"; memo.plan = { pid: 10, key: "s", on: true }; return { id: "fake", terminal: "t1", pid: 10, files: [] }; },
      async read() { return { used: 5, window: 100, at: 0 }; },
      ...(still && { stillSame: still }),
    };
    const reader = new ContextReader(io, { strategies: [strategy], queue: makeQueue(2) });
    const cx = makeCx();
    reader.see({ terminal: "t1", program: { key: "fake" }, app: null, status: "idle" }, true, cx);
    await clock.advance(2000);
    assert.equal(reader.reading, null, "the late answer is dropped");
    assert.equal(reader.account, expect);
    assert.equal(reader.memo.plan?.pid ?? null, expect ? 10 : null);
    reader.close();
    assert.deepEqual(cx.errors, []);
  }
});
