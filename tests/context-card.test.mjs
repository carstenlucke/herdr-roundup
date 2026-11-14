// node --test 'tests/*.test.mjs'
// roundup-pane's context meter as drawn (context-view.js, through the gpui stub) and its hover
// card's rows (context/card.js), and the header showing it (main.js, through the herdr stub).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, pane, agentProgram, program, findAll, texts, walk } from "./support/harness.mjs";

const { cardRows } = await import("../mods/roundup-pane/context/card.js");
const { meter, BAR_W } = await import("../mods/roundup-pane/context-view.js");
const Pane = (await import("../mods/roundup-pane/main.js")).default;

beforeEach(reset);
const t = new Proxy({}, { get: (_o, k) => String(k) }); // theme(): each color its own name
const R = { used: 97_600, window: 200_000, at: Date.UTC(2026, 10, 14, 13, 2), source: "status-line", exact: true, model: "claude-opus-5-5" };
const all = (el) => [...walk(el)];
const words = (el) => texts(el).join(" ");
const trigger = (card) => card.style("trigger")[0];

test("the meter: bar, percent and tokens at full width; the tokens go, then the bar; the percent stays", () => {
  const full = trigger(meter(t, { pane: "p1", reading: R, tier: "full", agent: "claude" }));
  assert.match(words(full), /49%.*97\.6k \/ 200k/);
  const bars = all(full).filter((e) => e.style("w")?.[0] === BAR_W);
  assert.equal(bars.length, 1);
  assert.equal(bars[0].style("bg")[0], "accent40", "the track: the bar's color at low alpha");
  assert.equal(bars[0].kids[0].style("w")[0], Math.round(BAR_W * 0.488));
  const bar = trigger(meter(t, { pane: "p1", reading: R, tier: "bar" }));
  assert.doesNotMatch(words(bar), /97\.6k/);
  assert.equal(all(bar).filter((e) => e.style("w")?.[0] === BAR_W).length, 1);
  const pct = trigger(meter(t, { pane: "p1", reading: R, tier: "percent" }));
  assert.equal(words(pct), "49%");
  assert.equal(meter(t, { pane: "p1", reading: R, tier: "none" }), null);
  assert.equal(meter(t, { pane: "p1", reading: null, tier: "full" }), null);
});

test("from 65 % working with an alert mark and the number in foreground, from 80 % blocked", () => {
  const at = (used) => trigger(meter(t, { pane: "p1", reading: { ...R, used }, tier: "full" }));
  const low = at(100_000), tight = at(130_000), critical = at(160_000);
  const color = (el) => all(el).find((e) => e.style("w")?.[0] === BAR_W).kids[0].style("bg")[0];
  assert.deepEqual([color(low), color(tight), color(critical)], ["accent", "working", "blocked"]);
  const hasAlert = (el) => all(el).some((e) => e.type === "svg" && e.arg === "mods/roundup-pane/alert.svg");
  assert.equal(hasAlert(low), false);
  assert.equal(hasAlert(tight), true);
  assert.equal(hasAlert(critical), true);
  const number = (el) => all(el).find((e) => e.kids.includes("65%") || e.kids.includes("80%") || e.kids.includes("50%"));
  assert.equal(number(tight).style("text_color")[0], "foreground");
  assert.equal(number(low).style("text_color")[0], "muted");
});

test("Claude without a window: its tokens alone, no bar and no percent; a rounded window reads ~", () => {
  const only = trigger(meter(t, { pane: "p1", reading: { ...R, window: null, used: 265_000 }, tier: "full", agent: "claude" }));
  assert.equal(words(only), "265k");
  assert.equal(all(only).filter((e) => e.style("w")?.[0] === BAR_W).length, 0);
  const rounded = trigger(meter(t, { pane: "p1", reading: { ...R, window: 1_000_000, windowRounded: true, used: 48_321 }, tier: "percent" }));
  assert.equal(words(rounded), "~5%");
});

test("the card: tokens of the window, free, model, when and where it was read; empty under an open menu", () => {
  const rows = cardRows(R, { agent: "claude" }).map((r) => r.text);
  assert.equal(rows[0], "Context window");
  assert.equal(rows[1], "97.6k of 200k in use · 49%");
  assert.equal(rows[2], "102k free");
  assert.equal(rows[3], "Model claude-opus-5-5");
  assert.match(rows[4], /^Read \d\d:\d\d, from Claude Code's status line$/);
  const card = meter(t, { pane: "p1", reading: R, tier: "full", covered: true });
  assert.equal(card.style("content")[0].kids.length, 0, "an overlay above it: the card is empty");
});

test("the card names the idle compaction as an estimate, the last compaction, a rounded window and how to get one", () => {
  const hint = Date.UTC(2026, 10, 14, 14, 32);
  let rows = cardRows({ ...R, compaction: { pre: 267_421, post: 20_693, at: R.at } }, { agent: "claude", hint }).map((r) => r.text);
  assert.ok(rows.some((r) => /^Idle compaction expected around \d\d:\d\d \(about 55 min after the last answer; observed on this machine\)$/.test(r)));
  assert.ok(rows.some((r) => /^Compacted \d\d:\d\d: 267k → 20.7k$/.test(r)));
  rows = cardRows({ ...R, window: 1_000_000, windowRounded: true }, { agent: "claude" }).map((r) => r.text);
  assert.ok(rows.includes("97.6k of ~1M in use · 10%"));
  assert.ok(rows.includes("Window from this session's /context, which rounds it"));
  rows = cardRows({ ...R, window: null }, { agent: "claude" }).map((r) => r.text);
  assert.equal(rows[1], "97.6k in use · window unknown");
  assert.ok(rows.some((r) => r.includes("scripts/agent-integrations.sh install claude")));
  rows = cardRows({ ...R, source: "rollout", model: "gpt-6.1-sol" }, { agent: "codex" }).map((r) => r.text);
  assert.ok(rows.some((r) => r.includes("12k baseline")));
  rows = cardRows({ ...R, used: 210_000 }, {}).map((r) => r.text);
  assert.equal(rows[2], "10k over the window");
  assert.deepEqual(cardRows(null), []);
});

test("the header: no meter for a shell, nor in the rename dialog or the terminal menu (no reader there)", () => {
  herdr.set({ panes: [pane("p1", "tb1", { terminal: "t1", program: program("shell") })], focused: { tab: "tb1" }, props: { pane: "p1", terminal: "t1" } });
  const { view, render } = mount(Pane, { props: { pane: "p1", terminal: "t1" } });
  assert.ok(view.context, "a header copy has a reader");
  assert.equal(findAll(render(), (e) => String(e.elementId ?? "").startsWith("ph-ctx")).length, 0);
  assert.equal(view.context.strategy, null);
  const dialog = mount(Pane, { props: { rename: { pane: "p1", terminal: "t1", value: "", fallback: "zsh" }, overlay: "o1" } });
  assert.equal(dialog.view.context, undefined);
  const menu = mount(Pane, { props: { tab: "pane", target: { pane: "p1", terminal: "t1" }, overlay: "o2" } });
  assert.equal(menu.view.context, undefined);
});

test("the header: a Claude pane with a reading shows the meter between the folder and the status", () => {
  herdr.set({ panes: [pane("p1", "tb1", { terminal: "t1", program: agentProgram("claude"), status: "working", cwd: "/x" })], focused: { tab: "tb1" } });
  const { view, render } = mount(Pane, { props: { pane: "p1", terminal: "t1" } });
  render(); // the reader learns its pane on render
  assert.equal(view.context.strategy.id, "claude");
  view.context.reading = R;
  const root = render();
  const ids = root.kids.map((k) => (k.type === "HoverCard" ? k.arg : k.elementId ?? k.type));
  const at = ids.indexOf("ph-ctx-card-p1");
  assert.ok(at > 0, `the card trigger is a child of the header: ${ids}`);
  assert.equal(root.kids[at - 1].has("flex_1"), true, "right after the folder");
  view.close();
});
