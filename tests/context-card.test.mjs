// node --test 'tests/*.test.mjs'
// roundup-pane's context meter as drawn (context-view.js, through the gpui stub) and its hover
// card's rows (context/card.js), and the header showing it (main.js, through the herdr stub).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, pane, agentProgram, program, findAll, texts, walk, element, clock } from "./support/harness.mjs";

const { cardModel } = await import("../mods/roundup-pane/context/card.js");
const { meter, BAR_W, PILL_H } = await import("../mods/roundup-pane/context-view.js");
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
  assert.equal(full.style("h")[0], PILL_H, "the pill of the mockup: 20 px high");
  assert.equal(full.has("border_1"), true, "framed");
  assert.equal(full.style("border_color")[0], "border");
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

const line = (r) => [r.label, r.value, r.extra].filter(Boolean).join(" | ");

test("the card: the tokens in use big with the window and percent; free, model, when and where it was read; empty under an open menu", () => {
  const m = cardModel(R, { agent: "claude" });
  assert.deepEqual(m.big, { used: "97.6k", of: "of 200k", percent: "49%", sev: "ok" });
  const rows = m.rows.map(line);
  assert.equal(rows[0], "Free | 102k | 51%");
  assert.equal(rows[1], "Model | claude-opus-5-5");
  assert.match(rows[2], /^Read \| \d\d:\d\d \| status line$/);
  assert.deepEqual(m.notes, []);
  const card = meter(t, { pane: "p1", reading: R, tier: "full", covered: true });
  assert.equal(card.style("content")[0].kids.length, 0, "an overlay above it: the card is empty");
});

test("the card's head as in the mockup: the pane's icon, name and id chip; the percent with its mark from 65 %", () => {
  const pic = element("image", "icons/claude.svg");
  const head = { pic, name: "Claude Code", id: "t119", font: "JetBrains Mono" };
  const content = meter(t, { pane: "p1", reading: R, tier: "full", agent: "claude", head }).style("content")[0];
  assert.match(words(content), /^Claude Code t119 97\.6k of 200k 49% Free 102k 51%/);
  assert.ok(all(content).includes(pic), "the header's icon heads the card");
  const tight = meter(t, { pane: "p1", reading: { ...R, used: 130_000 }, tier: "full", head }).style("content")[0];
  assert.ok(all(tight).some((e) => e.type === "svg" && e.arg === "mods/roundup-pane/alert.svg"), "an alert mark before 65%");
  const plain = meter(t, { pane: "p1", reading: R, tier: "full" }).style("content")[0];
  assert.match(words(plain), /^Context 97\.6k/, "without a head: a plain title");
});

test("the card names the idle compaction as an estimate, the last compaction, a rounded window and how to get one", () => {
  const hint = Date.UTC(2026, 10, 14, 14, 32);
  let m = cardModel({ ...R, compaction: { pre: 267_421, post: 20_693, at: R.at } }, { agent: "claude", hint });
  assert.ok(m.rows.map(line).some((r) => /^Idle compact \| ~\d\d:\d\d \| estimate$/.test(r)));
  assert.equal(m.rows.find((r) => r.label === "Idle compact").kind, "warn");
  assert.ok(m.notes.includes("Expected about 55 min after the last answer, as observed on this machine"));
  assert.ok(m.rows.map(line).some((r) => /^Compacted \| \d\d:\d\d \| 267k → 20.7k$/.test(r)));
  m = cardModel({ ...R, window: 1_000_000, windowRounded: true }, { agent: "claude" });
  assert.deepEqual([m.big.of, m.big.percent], ["of ~1M", "~10%"]);
  assert.ok(m.notes.includes("Window from this session's /context, which rounds it"));
  m = cardModel({ ...R, window: null }, { agent: "claude" });
  assert.deepEqual(m.big, { used: "97.6k", of: "in use · window unknown", percent: "", sev: "ok" });
  assert.ok(m.notes.some((r) => r.includes("scripts/agent-integrations.sh install claude")));
  m = cardModel({ ...R, source: "rollout", model: "gpt-6.1-sol" }, { agent: "codex" });
  assert.ok(m.notes.some((r) => r.includes("12k baseline")));
  m = cardModel({ ...R, used: 210_000 }, {});
  assert.equal(line(m.rows[0]), "Over | 10k | beyond the window");
  assert.equal(cardModel(null), null);
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

test("the header tells its reader every 2 s whether its tab is shown, also while it doesn't render", async () => {
  clock.reset();
  herdr.set({ panes: [pane("p1", "tb1", { terminal: "t1", program: agentProgram("claude"), status: "idle", cwd: "/x" })], focused: { tab: "tb1" }, props: { pane: "p1", terminal: "t1" } });
  const { view, render } = mount(Pane, { props: { pane: "p1", terminal: "t1" } });
  render();
  const seen = [];
  const see = view.context.see.bind(view.context);
  view.context.see = (p, shown, c) => { seen.push([p.status, shown]); see(p, shown, c); };
  herdr.set({ focused: { tab: "tb2" } }); // another tab: this header no longer renders
  await clock.advance(2000);
  herdr.set({ panes: [pane("p1", "tb1", { terminal: "t1", program: agentProgram("claude"), status: "working", cwd: "/x" })] });
  await clock.advance(2000);
  herdr.set({ focused: { tab: "tb1" } });
  await clock.advance(2000);
  view.close();
  view.context.cancel();
  assert.deepEqual(seen.slice(0, 3), [["idle", false], ["working", false], ["working", true]]);
  assert.equal(view.context.shown, true);
});

test("the header: under the pointer the buttons come before the meter, so the meter and the status stay put", () => {
  herdr.set({ panes: [pane("p1", "tb1", { terminal: "t1", program: agentProgram("claude"), status: "working", cwd: "/x" })], focused: { tab: "tb1" } });
  const { view, render } = mount(Pane, { props: { pane: "p1", terminal: "t1" } });
  render();
  view.context.reading = R;
  const tail = (root) => root.kids.slice(-2).map((k) => (k.type === "HoverCard" ? k.arg : k.type));
  const before = tail(render());
  view.hovered = true;
  const root = render();
  assert.deepEqual(tail(root), before, "the last two children, meter and spinner, are the same with and without hover");
  const ids = root.kids.map((k) => (k.type === "HoverCard" ? k.arg : k.elementId ?? k.type));
  assert.ok(ids.indexOf("ph-x-p1") < ids.indexOf("ph-ctx-card-p1"), `close before the meter: ${ids}`);
  assert.equal(root.kids[ids.indexOf("ph-n-p1") - 1].has("flex_1"), true, "the buttons right after the folder");
  view.close();
});
