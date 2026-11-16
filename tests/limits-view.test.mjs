// node --test 'tests/*.test.mjs'
// The plan limits as drawn: the limit part of roundup-pane's meter and the hover card's section
// (context-view.js, through the gpui stub), and the header showing its account's limits from the
// store all headers share (main.js, through the herdr stub).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, pane, agentProgram, program, findAll, texts, walk, clock, fire } from "./support/harness.mjs";

const { meter, hasContext, BAR_W, CARD_W, CARD_W_LIMITS, STALE_OPACITY } = await import("../mods/roundup-pane/context-view.js");
const { sharedStore } = await import("../mods/roundup-pane/limits/store.js");
const { LIMIT_TIERS, TIERS, tier, headerTier } = await import("../mods/roundup-pane/context/text.js");
const Pane = (await import("../mods/roundup-pane/main.js")).default;

beforeEach(() => { reset(); sharedStore.clear(); });
const t = new Proxy({}, { get: (_o, k) => String(k) }); // theme(): each color its own name
const MIN = 60_000, H = 60 * MIN, DAY = 24 * H;
const NOW = Date.UTC(2026, 10, 15, 12, 0);
const R = { used: 76_500, window: 1_000_000, at: NOW, source: "status-line", exact: true, model: "claude-fable-5-2" };
const five = (used, gone = 150, at = NOW) => ({ minutes: 300, used, resetsAt: NOW + (300 - gone) * MIN, at });
const week = (used, goneDays = 5, at = NOW) => ({ minutes: 10080, used, resetsAt: NOW + (7 - goneDays) * DAY, at });
// A reading as store.get() gives it: as old as its oldest window, null as soon as one's time is unknown.
const oldest = (windows) => (windows.some((w) => !Number.isFinite(w.at)) ? null : Math.min(...windows.map((w) => w.at)));
const L = (windows, extra = {}) => ({ at: oldest(windows), plan: null, source: "status-line", rev: 1, windows, ...extra });
const all = (el) => [...walk(el)];
const words = (el) => texts(el).join(" ");
const trigger = (card) => card.style("trigger")[0];
const content = (card) => card.style("content")[0];
const byId = (el, id) => all(el).find((e) => e.elementId === id);
const pill = (limits, tierName = "full", reading = R, now = NOW) => trigger(meter(t, { pane: "p1", reading, tier: tierName, agent: "claude", limits, now, program: "Claude Code" }));
const marks = (el) => all(el).filter((e) => e.type === "svg").map((e) => [e.arg.split("/").pop(), e.style("text_color")[0]]);

test("the pill: the context as before, a divider, then each limit as its short name and percent, without a bar", () => {
  const el = pill(L([five(4), week(38)]));
  assert.equal(words(el), "8% 76.5k / 1M 5h 4% wk 38%");
  assert.equal(all(el).filter((e) => e.style("w")?.[0] === BAR_W).length, 1, "one bar, the context's");
  const kids = el.kids.map((k) => k.elementId ?? k.type);
  assert.deepEqual(kids.slice(-2), ["ph-lim-sep-p1", "ph-lim-p1"], "after the context: the divider, the limits");
  assert.equal(byId(el, "ph-lim-sep-p1").style("bg")[0], "border");
  const lim = byId(el, "ph-lim-p1");
  assert.deepEqual(marks(lim), [], "below 70 %: no mark");
  const numbers = all(lim).filter((e) => e.kids.includes("4%") || e.kids.includes("38%"));
  assert.deepEqual(numbers.map((e) => e.style("text_color")[0]), ["muted", "muted"]);
  assert.equal(lim.has("opacity"), false);
});

test("a limit from 70 % has the alert mark in working and its number in foreground, from 90 % in blocked, at 100 % the no-entry mark", () => {
  const tight = byId(pill(L([five(78), week(41)])), "ph-lim-p1");
  assert.deepEqual(marks(tight), [["alert.svg", "working"]]);
  assert.equal(all(tight).find((e) => e.kids.includes("78%")).style("text_color")[0], "foreground");
  assert.equal(all(tight).find((e) => e.kids.includes("41%")).style("text_color")[0], "muted");
  assert.deepEqual(marks(byId(pill(L([five(22), week(93)])), "ph-lim-p1")), [["alert.svg", "blocked"]]);
  const reached = byId(pill(L([five(100), week(64)])), "ph-lim-p1");
  assert.deepEqual(marks(reached), [["ban.svg", "blocked"]]);
  assert.match(words(reached), /5h 100% wk 64%/);
});

test("narrower headers: the context's tokens go, then the looser limit (the tighter only from 70 %), then all but a mark from 90 %", () => {
  const calm = L([five(4), week(38)]), tight = L([five(78), week(41)]), critical = L([five(22), week(93)]);
  assert.equal(words(pill(tight, "bar")), "8% 5h 78% wk 41%");
  assert.equal(words(pill(tight, "narrow")), "8% 5h 78%", "only the tighter one");
  assert.equal(words(pill(critical, "narrow")), "8% wk 93%");
  assert.equal(words(pill(calm, "narrow")), "8%", "nothing tight: the context alone");
  assert.equal(byId(pill(calm, "narrow"), "ph-lim-sep-p1"), undefined, "and no divider");
  assert.equal(all(pill(tight, "narrow")).filter((e) => e.style("w")?.[0] === BAR_W).length, 1, "the context keeps its bar");
  const mark = pill(critical, "percent");
  assert.equal(words(mark), "8% wk");
  assert.deepEqual(marks(byId(mark, "ph-lim-p1")), [["alert.svg", "blocked"]]);
  assert.equal(words(pill(tight, "percent")), "8%", "78 %: no mark at this width");
  assert.equal(meter(t, { pane: "p1", reading: R, tier: "none", limits: critical, now: NOW }), null);
});

test("the tiers with limits: wider thresholds and one step more; without limits as before", () => {
  assert.deepEqual([LIMIT_TIERS.full, LIMIT_TIERS.full - 1, LIMIT_TIERS.bar - 1, LIMIT_TIERS.narrow - 1, LIMIT_TIERS.percent - 1].map((w) => tier(w, true)),
    ["full", "bar", "narrow", "percent", "none"]);
  assert.equal(tier(TIERS.full, false), "full");
  assert.equal(tier(TIERS.full, true), "bar", "the same width holds less with the limits beside");
  assert.equal(tier(TIERS.bar - 1, false), "percent", "no narrow step without limits");
  assert.equal(tier(undefined, true), "full");
  assert.equal(headerTier(LIMIT_TIERS.full * 1.5 - 1, 1.5, true), "bar");
  assert.ok(LIMIT_TIERS.full > LIMIT_TIERS.bar && LIMIT_TIERS.bar > LIMIT_TIERS.narrow && LIMIT_TIERS.narrow > LIMIT_TIERS.percent);
});

test("normal states: an old reading is dimmed, a window that has reset since reads –, no limits leave today's pill", () => {
  const at = NOW - 42 * MIN;
  const old = byId(pill(L([five(31, 140, at), week(38, 5, at)])), "ph-lim-p1");
  assert.equal(old.style("opacity")[0], STALE_OPACITY);
  const gone = pill(L([{ ...five(61), resetsAt: NOW - 12 * MIN }, week(38)]));
  assert.equal(words(gone), "8% 76.5k / 1M 5h – wk 38%");
  assert.deepEqual(marks(byId(gone, "ph-lim-p1")), [], "no mark for a number that is gone");
  const none = pill(null);
  assert.equal(words(none), "8% 76.5k / 1M");
  assert.equal(byId(none, "ph-lim-p1"), undefined);
  assert.equal(byId(none, "ph-lim-sep-p1"), undefined);
  assert.equal(content(meter(t, { pane: "p1", reading: R, tier: "full", limits: null, now: NOW })).style("w")[0], CARD_W, "and today's card");
});

test("limits without a context reading: the pill holds the limits alone, the card its head and the section", () => {
  const card = meter(t, { pane: "p1", reading: null, tier: "full", agent: "codex", limits: L([five(87), week(21)], { plan: "plus" }), now: NOW, program: "Codex", head: { name: "Codex", id: "t14s" } });
  assert.equal(words(trigger(card)), "5h 87% wk 21%");
  assert.equal(byId(trigger(card), "ph-lim-sep-p1"), undefined, "no divider without a context part");
  assert.match(words(content(card)), /^Codex t14s Limits plus as of \d\d:\d\d 5-hour 87%/);
  assert.equal(byId(content(card), "ph-lim-rule"), undefined, "no rule: nothing above it");
  assert.equal(meter(t, { pane: "p1", reading: null, tier: "full", limits: null, now: NOW }), null, "neither: no pill");
  // Tokens alone (Claude without a window) beside limits: both.
  assert.equal(words(pill(L([five(4), week(38)]), "full", { ...R, window: null })), "76.5k 5h 4% wk 38%");
});

test("limits alone keep a window down to the narrowest step: the tighter one whatever it stands at, the first when all have reset", () => {
  const alone = (limits, tierName) => { const m = meter(t, { pane: "p1", reading: null, tier: tierName, limits, now: NOW }); return m && words(trigger(m)); };
  const calm = L([five(4), week(38)]);
  assert.equal(alone(calm, "full"), "5h 4% wk 38%");
  assert.equal(alone(calm, "bar"), "5h 4% wk 38%");
  assert.equal(alone(calm, "percent"), "wk 38%", "nothing tight, and still there: no context number stands for it");
  assert.equal(alone(L([five(78), week(41)]), "percent"), "5h 78%");
  assert.equal(alone(L([{ ...five(96), resetsAt: NOW - MIN }, week(41)]), "percent"), "wk 41%", "a window that has reset isn't the tighter one");
  const gone = L([{ ...five(61), resetsAt: NOW - MIN }, { ...week(38), resetsAt: NOW - MIN }]);
  assert.equal(alone(gone, "percent"), "5h –", "all have reset: the first, so the pill and its card are there");
  assert.equal(alone(gone, "bar"), "5h – wk –");
  assert.equal(alone(calm, "none"), null);
  // Beside a context part the narrow steps are as they were: nothing tight, the context alone.
  assert.equal(words(pill(calm, "percent")), "8%");
  // What counts as a context part: a share of a window, or tokens alone.
  assert.deepEqual([null, R, { ...R, window: null }, { at: NOW }, { ...R, used: null, window: null }].map(hasContext), [false, true, true, false, false]);
  assert.deepEqual([{ used: 0, window: 200_000 }, { used: null, window: 200_000, percent: 0 }, { used: null, window: null, percent: 40 }].map(hasContext), [true, true, false], "0 % is a share; a percent without a window none");
});

test("a reading whose time is unknown: dimmed like an old one, and the card says so", () => {
  const unknown = L([{ ...five(31), at: null }, { ...week(38), at: null }]);
  assert.equal(byId(pill(unknown), "ph-lim-p1").style("opacity")[0], STALE_OPACITY);
  const sec = byId(content(meter(t, { pane: "p1", reading: R, tier: "full", limits: unknown, now: NOW, program: "Claude Code" })), "ph-lim-card");
  assert.match(words(sec), /^Limits age unknown 5-hour 31% resets .* As Claude Code last reported them: how old shows with its next answer$/);
  assert.equal(byId(sec, "ph-lim-age").style("text_color")[0], "working");
});

test("the card's section: Limits, the plan and the time; per window a row and a bar with its fill and the tick; notes below", () => {
  const card = content(meter(t, { pane: "p1", reading: R, tier: "full", agent: "claude", limits: L([five(78, 205), week(41, 2)], { plan: "max" }), now: NOW, program: "Claude Code", head: { name: "Claude Code", id: "t119" } }));
  assert.equal(card.style("w")[0], CARD_W_LIMITS, "wider, for the reset time");
  const ids = card.kids.map((k) => k.elementId);
  assert.ok(ids.indexOf("ph-lim-rule") > ids.indexOf("ph-ctx-big") && ids.indexOf("ph-lim-card") === ids.indexOf("ph-lim-rule") + 1, `the rule, then the section, below the context: ${ids}`);
  const sec = byId(card, "ph-lim-card");
  assert.match(words(sec), /^Limits max as of \d\d:\d\d 5-hour 78% resets in 1h 35m Weekly 41% resets (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d\d:\d\d At this pace the 5-hour limit runs out about \d\d:\d\d, 37m before it resets$/);
  const inner = CARD_W_LIMITS - 24;
  const bar0 = byId(sec, "ph-lim-bar-0"), bar1 = byId(sec, "ph-lim-bar-1");
  assert.equal(bar0.style("w")[0], inner);
  assert.equal(bar0.style("bg")[0], "working40");
  assert.equal(bar0.kids[0].style("w")[0], Math.round(inner * 0.78));
  assert.equal(bar0.kids[0].style("bg")[0], "working");
  assert.equal(bar0.has("relative"), true);
  const tick = byId(sec, "ph-lim-tick-0");
  assert.equal(tick.has("absolute"), true);
  assert.equal(tick.style("left")[0], Math.round((inner * 205) / 300), "where the window's time stands");
  assert.equal(bar1.style("bg")[0], "accent40");
  assert.deepEqual(marks(byId(sec, "ph-lim-row-0")), [["alert.svg", "working"]]);
  assert.equal(byId(sec, "ph-lim-note-0").style("text_color")[0], "working", "the pace note warns");
  assert.equal(byId(sec, "ph-lim-age").style("text_color")[0], "dim");
});

test("the card's section for an old reading and a window that has reset: its age in working, dimmed rows, no fill and no tick", () => {
  const at = NOW - 42 * MIN;
  const card = content(meter(t, { pane: "p1", reading: R, tier: "full", limits: L([{ ...five(61, 290, at), resetsAt: NOW - 12 * MIN }, week(38, 5, at)]), now: NOW, program: "Claude Code" }));
  const sec = byId(card, "ph-lim-card");
  assert.match(words(sec), /^Limits 42m old 5-hour – has reset since Weekly 38% resets /);
  assert.equal(byId(sec, "ph-lim-age").style("text_color")[0], "working");
  assert.equal(byId(sec, "ph-lim-bar-0").kids[0].style("w")[0], 0);
  assert.equal(byId(sec, "ph-lim-tick-0"), undefined);
  assert.ok(byId(sec, "ph-lim-tick-1"));
  assert.equal(byId(sec, "ph-lim-row-1").has("opacity"), true);
  assert.match(words(byId(sec, "ph-lim-notes")), /Read with the last answer of Claude Code in this window/);
  const covered = meter(t, { pane: "p1", reading: R, tier: "full", covered: true, limits: L([five(4), week(38)]), now: NOW });
  assert.equal(content(covered).kids.length, 0, "an overlay above it: the card is empty");
});

// --- the header ---

const ACC = "claude:/Users/a/.claude";
// Windows as of the real clock: the header draws with Date.now().
const live = (used5, usedWk) => {
  const now = Date.now();
  return { at: now, plan: null, source: "status-line", windows: [{ minutes: 300, used: used5, resetsAt: now + 2 * H }, { minutes: 10080, used: usedWk, resetsAt: now + 2 * DAY }] };
};
function header(key = "claude", name = "Claude Code", account = ACC) {
  herdr.set({ panes: [pane("p1", "tb1", { terminal: "t1", program: key === "shell" ? program("shell") : agentProgram(key, name), status: "idle", cwd: "/x" })], focused: { tab: "tb1" }, props: { pane: "p1", terminal: "t1" } });
  const m = mount(Pane, { props: { pane: "p1", terminal: "t1" } });
  m.render();
  if (m.view.context.strategy) {
    m.view.context.reading = { ...R, at: Date.now() };
    // As after a look of the reader: the account its strategy named.
    m.view.context.account = m.view.context.memo.account = account;
  }
  return m;
}
const cardOf = (root) => root.kids.find((k) => k.type === "HoverCard");

test("the header: a Claude pane shows its account's limits beside the context, with the program's name in the card", () => {
  sharedStore.offer(ACC, live(100, 64));
  const { view, render } = header();
  const root = render();
  assert.equal(words(trigger(cardOf(root))), "8% 76.5k / 1M 5h 100% wk 64%");
  assert.match(words(content(cardOf(root))), /5-hour limit reached: Claude Code answers again in /);
  view.close();
});

test("the header: another account's limits, an agent without an account and a shell show none", () => {
  sharedStore.offer("claude:/Users/a/.claude-work", live(80, 90));
  let m = header();
  assert.equal(words(trigger(cardOf(m.render()))), "8% 76.5k / 1M", "the other account's limits are not this pane's");
  m.view.close();
  sharedStore.offer(ACC, live(4, 38));
  m = header("pi", "pi", null);
  assert.equal(m.view.context.strategy.id, "pi");
  assert.equal(words(trigger(cardOf(m.render()))), "8% 76.5k / 1M", "pi names no account: today's pill");
  m.view.close();
  m = header("shell");
  assert.equal(findAll(m.render(), (e) => String(e.elementId ?? "").startsWith("ph-")).filter((e) => /^ph-(ctx|lim)/.test(e.elementId)).length, 0);
  m.view.close();
});

test("the header's tier counts the limits: a width that held the tokens without them holds the limits instead", () => {
  const { view, render, cx } = header();
  let root = render();
  fire(root, "size_change", { width: 600, height: 28 }, cx);
  root = render();
  assert.equal(words(trigger(cardOf(root))), "8% 76.5k / 1M", "600 px without limits: full");
  sharedStore.offer(ACC, live(4, 38));
  root = render();
  assert.equal(words(trigger(cardOf(root))), "8% 5h 4% wk 38%", "with limits: the tokens go first");
  const before = cx.notified;
  fire(root, "size_change", { width: 500, height: 28 }, cx);
  assert.equal(cx.notified, before + 1, "the limits leave the pill: it re-renders");
  assert.equal(words(trigger(cardOf(render()))), "8%", "nothing tight: the context alone");
  view.close();
});

test("a header too narrow for the limits it would show keeps the context's own tiers: its bar stays, the pill holds no limits, the card still has them", () => {
  const pillOf = (root) => trigger(cardOf(root));
  const bars = (root) => all(pillOf(root)).filter((e) => e.style("w")?.[0] === BAR_W).length;
  const limitIds = (root) => all(pillOf(root)).map((e) => e.elementId).filter((id) => /^ph-lim(-sep)?-p1$/.test(id ?? ""));
  const at = (width, used5, usedWk, { reading = { ...R, used: 400_000, at: Date.now() }, zoom = 1, gone = false } = {}) => {
    sharedStore.clear();
    const l = live(used5, usedWk);
    if (gone) l.windows[0].resetsAt = Date.now() - MIN;
    sharedStore.offer(ACC, l);
    herdr.set({ settings: { zoom, dark: true, font_family: "Menlo", font_size: 13 } });
    const m = header();
    m.view.context.reading = reading;
    fire(m.render(), "size_change", { width: width * zoom, height: 28 }, m.cx);
    const root = m.render();
    m.view.close();
    return root;
  };
  // 425 px, the context at 40 %, the limits low: the bar as without limits, no limit part, no divider.
  let root = at(425, 12, 30);
  assert.equal(words(pillOf(root)), "40%");
  assert.equal(bars(root), 1, "the context's bar");
  assert.deepEqual(limitIds(root), []);
  assert.match(words(content(cardOf(root))), /5-hour 12% .*Weekly 30%/, "the card still has them");
  // The narrow step (430..540) with low limits: the same.
  root = at(480, 12, 30);
  assert.deepEqual([words(pillOf(root)), bars(root), limitIds(root)], ["40%", 1, []]);
  // The same at zoom 1.5.
  root = at(425, 12, 30, { zoom: 1.5 });
  assert.deepEqual([words(pillOf(root)), bars(root), limitIds(root)], ["40%", 1, []]);
  // A limit that fits: at 425 px from 90 % its mark, and the context without its bar, as before.
  root = at(425, 92, 30);
  assert.deepEqual([words(pillOf(root)), bars(root), limitIds(root)], ["40% 5h", 0, ["ph-lim-sep-p1", "ph-lim-p1"]]);
  root = at(480, 75, 30);
  assert.deepEqual([words(pillOf(root)), bars(root)], ["40% 5h 75%", 1], "narrow: the tighter one from 70 %, the context's bar");
  // A window that has reset counts for nothing: 95 % before its reset fits no step.
  root = at(425, 95, 30, { gone: true });
  assert.deepEqual([words(pillOf(root)), bars(root), limitIds(root)], ["40%", 1, []]);
  // Limits alone keep theirs (PAN-103), below the narrowest step nothing.
  assert.equal(words(pillOf(at(425, 12, 30, { reading: null }))), "5h 12% wk 30%");
  assert.equal(cardOf(at(250, 95, 30)), undefined, "none below 300 px");
});

test("the header's tier for limits alone is the context's own: a session before its first answer shows its limits in a split pane, at any zoom", () => {
  sharedStore.offer(ACC, live(4, 38));
  const { view, render, cx } = header();
  view.context.reading = null; // no answer yet
  let root = render();
  fire(root, "size_change", { width: 480, height: 28 }, cx);
  root = render();
  assert.equal(words(trigger(cardOf(root))), "5h 4% wk 38%", "480 px: both windows, though nothing is tight");
  fire(root, "size_change", { width: 350, height: 28 }, cx);
  root = render();
  assert.equal(words(trigger(cardOf(root))), "wk 38%", "350 px: the tighter one");
  herdr.set({ settings: { zoom: 1.5, dark: true, font_family: "Menlo", font_size: 13 } });
  fire(root, "size_change", { width: 480 * 1.5, height: 28 }, cx);
  root = render();
  assert.equal(words(trigger(cardOf(root))), "5h 4% wk 38%", "zoom 1.5: 720 window px are the same 480");
  herdr.set({ settings: { zoom: 1, dark: true, font_family: "Menlo", font_size: 13 } });
  fire(root, "size_change", { width: 480, height: 28 }, cx);
  // Its first answer: a context number beside the limits needs the wider tiers. on_size_change
  // sees the new tier for the width it has, and the header draws again.
  view.context.reading = { ...R, at: Date.now() };
  const before = cx.notified;
  fire(root, "size_change", { width: 480, height: 28 }, cx);
  assert.equal(cx.notified, before + 1, "beside a context number nothing tight fits 480 px: the pill changes");
  assert.equal(words(trigger(cardOf(render()))), "8%", "nothing tight: the context alone");
  view.close();
});

test("a header that doesn't render (a hidden tab) asks for one draw per change of its account's limits, not one per look", async () => {
  clock.reset();
  const { view, render, cx } = header();
  render();
  view.context.cancel(); // no look of its own in this test
  await clock.advance(2000);
  const calm = cx.notified;
  sharedStore.offer(ACC, live(4, 38));
  await clock.advance(8000); // four looks, and no render between them
  assert.equal(cx.notified, calm + 1, "once for the change");
  sharedStore.offer(ACC, live(9, 38));
  await clock.advance(8000);
  assert.equal(cx.notified, calm + 2, "once for the next");
  // Its tab is shown again: it draws what the store has, and asks for nothing more.
  assert.equal(words(trigger(cardOf(render()))), "8% 76.5k / 1M 5h 9% wk 38%");
  await clock.advance(6000);
  assert.equal(cx.notified, calm + 2);
  view.close();
});

test("the header draws again within 2 s when another pane's read changes its account's limits, and not while nothing changed", async () => {
  clock.reset();
  const { view, render, cx } = header();
  render();
  view.context.cancel(); // no look of its own in this test
  await clock.advance(2000);
  const calm = cx.notified;
  await clock.advance(6000);
  assert.equal(cx.notified, calm, "no limits, nothing changed: not drawn again");
  sharedStore.offer(ACC, live(4, 38)); // another header's strategy read them
  await clock.advance(2000);
  assert.equal(cx.notified, calm + 1, "drawn again at the next look");
  assert.equal(words(trigger(cardOf(render()))), "8% 76.5k / 1M 5h 4% wk 38%");
  await clock.advance(6000);
  assert.equal(cx.notified, calm + 1, "the same reading: not again");
  sharedStore.offer("codex:/Users/a/.codex", live(87, 21));
  await clock.advance(2000);
  assert.equal(cx.notified, calm + 1, "another account's change is not this header's");
  view.close();
});

// --- a session that has just started ---

test("a Claude Code session before its first answer: no context yet, but its account's limits from another pane show at once", async () => {
  const { ContextReader, makeQueue } = await import("../mods/roundup-pane/context/reader.js");
  const { makeStore } = await import("../mods/roundup-pane/limits/store.js");
  const { contextIo } = await import("./support/context-io.mjs");
  const { makeCx } = await import("./support/cx.mjs");
  const claude = (await import("../mods/roundup-pane/context/strategies/claude.js")).default;
  clock.reset();
  const PID = 700, STARTED = 1794613515093;
  // The new session: its session file is there, no status line file with numbers, no transcript.
  const io = contextIo({ terminals: { t9: { pid: PID, created: STARTED - 4000, title: "Claude Code", cwd: "/Users/a/src/demo" } }, envs: { [PID]: { HC_TERMINAL_ID: "t9" } } });
  io.now = () => clock.now;
  io.files[`/Users/a/.claude/sessions/${PID}.json`] = JSON.stringify({ pid: PID, sessionId: "0fbf3e48-42ea-40d5-b3ed-40730f7e7b44", cwd: "/Users/a/src/demo", startedAt: STARTED, kind: "interactive" });
  io.limits = makeStore();
  io.limits.offer(ACC, L([five(4), week(38)])); // read by another pane of the account
  const reader = new ContextReader(io, { strategies: [claude], queue: makeQueue(2) });
  const cx = makeCx();
  reader.see({ terminal: "t9", program: { key: "claude" }, app: null, status: "idle" }, true, cx);
  await clock.advance(3000);
  assert.equal(reader.reading, null, "nothing answered yet: no context number");
  assert.equal(reader.account, ACC);
  assert.ok(cx.notified >= 1, "the header draws again once its account is known");
  const card = meter(t, { pane: "p9", reading: reader.reading, tier: "full", agent: "claude", limits: io.limits.get(reader.account), now: NOW, program: "Claude Code" });
  assert.equal(words(trigger(card)), "5h 4% wk 38%");
  // No other pane has read the account's limits: nothing to show until this session answers.
  assert.equal(meter(t, { pane: "p9", reading: reader.reading, tier: "full", limits: makeStore().get(reader.account), now: NOW }), null);
  reader.close();
  assert.deepEqual(cx.errors, []);
});

// --- review 4 of #45 ---

test("limits that have all reset don't cost the context its tokens: beside a context part they draw nothing, one live window is enough, alone they stay", () => {
  const pillOf = (root) => trigger(cardOf(root));
  const at = (width, gone, reading = { ...R, used: 400_000, at: Date.now() }) => {
    sharedStore.clear();
    const l = live(12, 30);
    for (const i of gone) l.windows[i].resetsAt = Date.now() - MIN;
    sharedStore.offer(ACC, l);
    const m = header();
    m.view.context.reading = reading;
    fire(m.render(), "size_change", { width, height: 28 }, m.cx);
    const root = m.render();
    m.view.close();
    return root;
  };
  let root = at(600, [0, 1]);
  assert.equal(words(pillOf(root)), "40% 400k / 1M", "both reset: the context's full tier, its tokens, no limit part");
  assert.match(words(content(cardOf(root))), /5-hour – has reset since .*Weekly – has reset since/, "the card still has them");
  assert.equal(words(pillOf(at(600, [0]))), "40% 5h – wk 30%", "one live window: the limits as before");
  assert.equal(words(pillOf(at(600, [0, 1], null))), "5h – wk –", "limits alone: the pill stays for its card");
});

test("a limit's number has the context number's least width (PCT_MIN_W), both windows' numbers", async () => {
  const { PCT_MIN_W } = await import("../mods/roundup-pane/context-view.js");
  const lim = byId(pill(L([five(9), week(41)])), "ph-lim-p1");
  const nums = all(lim).filter((e) => e.style("min_w")?.[0] === PCT_MIN_W);
  assert.equal(nums.length, 2, "both windows' numbers");
  assert.deepEqual(nums.map((e) => words(e)), ["9%", "41%"]);
});

test("size events take the limits of their render: a drag reads nothing from the store, the next render the store's new reading", () => {
  sharedStore.offer(ACC, live(4, 38));
  const { view, render, cx } = header();
  let root = render();
  const get = sharedStore.get;
  let gets = 0;
  sharedStore.get = (...a) => { gets++; return get.apply(sharedStore, a); };
  try {
    for (let w = 700; w > 600; w -= 10) fire(root, "size_change", { width: w, height: 28 }, cx);
    assert.equal(gets, 0, "no store read per size event");
  } finally { sharedStore.get = get; }
  sharedStore.offer(ACC, { ...live(75, 38), at: Date.now() + 1 });
  root = render();
  assert.match(words(trigger(cardOf(root))), /5h 75%/, "the render takes the store's new reading");
  view.close();
});
