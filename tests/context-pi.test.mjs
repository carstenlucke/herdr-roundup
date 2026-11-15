// node --test 'tests/*.test.mjs'
// pi in roundup-pane's context meter: the strategy (its extension's file, else its footer on screen)
// against an io stub, and the extension itself (integrations/pi-context.js) run in node against a
// pi stub, writing into a temp HOME.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pi, { parseFooter, footerTokens } from "../mods/roundup-pane/context/strategies/pi.js";
import { strategyFor } from "../mods/roundup-pane/context/registry.js";
import { NO_ANSWER } from "../mods/roundup-pane/context/locate.js";
import { NO_READING } from "../mods/roundup-pane/context/tail.js";
import { ContextReader, makeQueue } from "../mods/roundup-pane/context/reader.js";
import { cardModel } from "../mods/roundup-pane/context/card.js";
import extension, { record } from "../mods/roundup-pane/integrations/pi-context.js";
import { contextIo, fixture } from "./support/context-io.mjs";

const PID = 4242;
const EXT = "/Users/a/.cache/herdr-roundup/context/pi/t8.json";
// pi 1.5.0's footer at the bottom of its screen: the folder line, then the stats line with the
// context item and the model on the right (footer.js), under the editor's frame.
const FOOTER = [
  "",
  "  Done: the tests pass.",
  "",
  "────────────────────────────────────────────────────────────────────────────",
  "",
  "────────────────────────────────────────────────────────────────────────────",
  "~/src/demo (main)",
  "↑12k ↓1.4k R40k W2.1k CH95.0% $0.012 8.6%/66k (auto)          gpt-6.1-mini • high",
  "",
  "",
].join("\n");
const file = (over = {}) => JSON.stringify({ v: 1, terminal: "t8", pid: PID, at: 1_700_000_000_000, session: "s-1", model: "claude-opus-5-5", used: 97_600, window: 200_000, percent: 48.8, ...over });

function setup({ files = {}, screen = FOOTER, env = { HC_TERMINAL_ID: "t8" }, pid = PID } = {}) {
  return contextIo({ files: { ...files }, terminals: { t8: { pid, created: 1, title: "π - demo", cwd: "/Users/a/src/demo" } }, envs: { [pid]: env }, screens: screen === null ? {} : { t8: screen } });
}
const reading = async (io, memo = {}) => {
  const src = await pi.locate({ terminal: "t8" }, io, memo);
  if (!src || src === NO_ANSWER) return src;
  return pi.read(src, io, memo);
};

test("the strategy for pi's program key", () => {
  assert.equal(strategyFor({ terminal: "t8", program: { key: "pi" }, app: null }), pi);
  assert.equal(strategyFor({ terminal: "t8", program: { key: "agent" }, app: "pi" }), pi);
});

test("pi with its extension: pi's own unrounded number, the model and the session, exact", async () => {
  const r = await reading(setup({ files: { [EXT]: file() } }));
  assert.equal(r.used, 97_600);
  assert.equal(r.window, 200_000);
  assert.equal(r.percent, 48.8);
  assert.equal(r.model, "claude-opus-5-5");
  assert.equal(r.session, "s-1");
  assert.equal(r.source, "extension");
  assert.equal(r.exact, true);
  assert.equal(r.at, 1_700_000_000_000);
});

test("pi's extension file right after a compaction (tokens unknown): no number, and not the footer either", async () => {
  const io = setup({ files: { [EXT]: file({ used: null, percent: null }) } });
  assert.equal(await reading(io), NO_READING);
  assert.equal(io.calls.some((c) => c[0] === "screen"), false, "the extension's file decides");
});

test("an extension file of another process or terminal doesn't count: then pi's footer", async () => {
  for (const over of [{ pid: PID + 1 }, { terminal: "t9" }, { v: 2 }]) {
    const r = await reading(setup({ files: { [EXT]: file(over) } }));
    assert.equal(r.source, "screen", JSON.stringify(over));
  }
  // The agent's environment names another terminal: another terminal's agent, nothing.
  assert.equal(await reading(setup({ files: { [EXT]: file() }, env: { HC_TERMINAL_ID: "t9" } })), null);
});

test("without the extension: pi's footer, rounded, no tokens and no model; marked as such on the card", async () => {
  const io = setup();
  const r = await reading(io);
  assert.deepEqual({ ...r, at: 0 }, { used: null, window: 66_000, percent: 8.6, model: null, at: 0, source: "screen", exact: false, windowRounded: true });
  assert.equal(r.at, io.now(), "the time it was read off the screen");
  const card = cardModel(r, { agent: "pi" });
  assert.equal(card.big.used, "~9%");
  assert.equal(card.big.of, "of ~66k");
  assert.equal(card.rows.some((row) => row.label === "Free" || row.label === "Model"), false);
  assert.ok(card.rows.some((row) => row.label === "Read" && row.extra === "pi's footer"));
  assert.ok(card.notes.some((n) => /install pi/.test(n)));
});

test("pi's footer: its stats line below its folder line, at the screen's end, in every form pi draws it", () => {
  assert.deepEqual(parseFooter(FOOTER), { percent: 8.6, window: 66_000 });
  const at = (stats, folder = "~/src/demo") => parseFooter(`text\n${folder}\n${stats}\n`);
  assert.deepEqual(at("0.0%/200k (auto)  claude-opus-5-5"), { percent: 0, window: 200_000 }, "no usage yet");
  assert.deepEqual(at("?/66k (auto)  gpt-6.1-mini"), { percent: null, window: 66_000 }, "unknown after a compaction");
  assert.deepEqual(at("↑1.2M ↓80k $1.234 (sub) 71.3%/1.0M"), { percent: 71.3, window: 1_000_000 }, "no auto, no room for the model");
  assert.deepEqual(at("↑9.4k 12.0%/9.4k (auto) • xp  (anthropic) claude-opus-5-5 • thinking off"), { percent: 12, window: 9400 });
  assert.deepEqual(at("8.6%/66k (auto)  m", "/srv/app (dev) • my session"), { percent: 8.6, window: 66_000 }, "outside the home, a session name");
  // A line pi has cut with "..." (too narrow), or anything else: no footer.
  assert.equal(at("↑12k ↓1.4k R40k W2.1k CH95..."), null);
  assert.equal(at("8.6%/66k (auto)", "not a folder"), null, "no folder line above it");
  assert.equal(at("the context is at 8.6%/66k (auto) now"), null);
  assert.equal(parseFooter("8.6%/66k (auto)\n"), null, "a stats line alone");
});

test("a percent in the conversation is never pi's footer: only the screen's last lines count", () => {
  const screen = `~/src/demo\n8.6%/66k (auto)\nsome answer\nmore lines\nand more\nthe editor\n────\n`;
  assert.equal(parseFooter(screen), null);
});

test("a real pi 1.5.0 screen in Herdr (hc read, half a window wide: pi cut the model on the right): its footer", async () => {
  const screen = fixture("pi-screen.txt");
  assert.deepEqual(parseFooter(screen), { percent: 0.3, window: 500_000 });
  const r = await reading(setup({ screen }));
  assert.equal(r.percent, 0.3);
  assert.equal(r.model, null, "the footer's model may be cut: never taken");
});

test("pi before its first answer counts 0 (its system prompt isn't in it): no meter, from the extension or the footer", async () => {
  assert.equal(await reading(setup({ files: { [EXT]: file({ used: 0, percent: 0 }) } })), NO_READING);
  assert.equal(await reading(setup({ screen: FOOTER.replace("↑12k ↓1.4k R40k W2.1k CH95.0% $0.012 8.6%", "$0.000 (sub) 0.0%") })), NO_READING);
});

test("pi's window back from its formatTokens", () => {
  assert.equal(footerTokens("940"), 940);
  assert.equal(footerTokens("9.4k"), 9400);
  assert.equal(footerTokens("66k"), 66_000);
  assert.equal(footerTokens("1.2M"), 1_200_000);
  assert.equal(footerTokens("10M"), 10_000_000);
  assert.equal(footerTokens("1.23k"), null);
  assert.equal(footerTokens("k"), null);
});

test("a footer covered by a dialog: the reading of the same pi stands; of another pi, or before any, none", async () => {
  const memo = {};
  const io = setup();
  assert.equal((await reading(io, memo)).percent, 8.6);
  io.screens.t8 = "a model selector\n> claude-opus-5-5\n  gpt-6.1-mini\n";
  assert.equal(await reading(io, memo), NO_ANSWER, "the same process: the last reading stands");
  assert.equal(await reading(setup({ screen: "a dialog\n" }), {}), null, "none before");
  const other = setup({ screen: "a dialog\n", pid: PID + 1 });
  assert.equal(await reading(other, memo), null, "another pi in the terminal");
  // No screen from hc at all: nothing known.
  assert.equal(await pi.locate({ terminal: "t8" }, setup({ screen: null }), {}), NO_ANSWER);
});

test("the reader reads pi's footer on every look (no file to compare) and its numbers follow the screen", async () => {
  const io = setup();
  const reader = new ContextReader(io, { strategies: [pi], queue: makeQueue(2) });
  reader.terminal = "t8";
  reader.strategy = pi;
  assert.equal(await reader.look(reader.gen), true);
  assert.equal(reader.reading.percent, 8.6);
  io.screens.t8 = FOOTER.replace("8.6%", "9.1%");
  assert.equal(await reader.look(reader.gen), true);
  assert.equal(reader.reading.percent, 9.1);
  assert.equal(reader.key, null, "nothing kept to skip the next look");
});

test("pi's footer unchanged: the same reading with the time it first showed, so the header isn't drawn again; a new value or another pi: a new time", async () => {
  const io = setup();
  const reader = new ContextReader(io, { strategies: [pi], queue: makeQueue(2) });
  reader.terminal = "t8";
  reader.strategy = pi;
  const t0 = io.now();
  assert.equal(await reader.look(reader.gen), true);
  io.clock += 15_000;
  assert.equal(await reader.look(reader.gen), false, "the same footer later: no change");
  assert.equal(reader.reading.at, t0);
  io.screens.t8 = FOOTER.replace("8.6%", "9.1%");
  assert.equal(await reader.look(reader.gen), true);
  assert.equal(reader.reading.at, t0 + 15_000, "a new value: its own time");
  io.clock += 15_000;
  io.screens.t8 = FOOTER.replace("8.6%/66k", "9.1%/128k");
  assert.equal(await reader.look(reader.gen), true, "the same percent of another window");
  assert.equal(reader.reading.window, 128_000);
  assert.equal(reader.reading.at, t0 + 30_000, "another window: its own time");
  // Another pi in the terminal with the same numbers: its own time, not the old process's.
  const memo = {};
  const a = setup();
  await reading(a, memo);
  const b = setup({ pid: PID + 1 });
  b.clock += 60_000;
  assert.equal((await reading(b, memo)).at, b.now());
  // The extension in between: back on the footer later, the time starts again.
  const c = setup({ files: { [EXT]: file({ pid: PID + 1 }) }, pid: PID + 1 });
  await reading(c, memo);
  assert.equal(memo.footer, null);
});

// --- the extension, as pi runs it --------------------------------------------------------------

let home;
beforeEach(() => { home = mkdtempSync(join(realpathSync(tmpdir()), "pi-ext-")); });
afterEach(() => rmSync(home, { recursive: true, force: true }));

function fakePi() {
  const handlers = {};
  return { handlers, on(event, f) { (handlers[event] ??= []).push(f); }, emit(event, e, ctx) { for (const f of handlers[event] ?? []) f(e, ctx); } };
}
const ctxWith = (usage, { mode = "tui", session = "s-1", model = "claude-opus-5-5" } = {}) => ({
  mode,
  getContextUsage: () => usage,
  sessionManager: { getSessionId: () => session },
  model: model && { id: model, provider: "anthropic" },
});
const written = () => join(home, ".cache/herdr-roundup/context/pi/t8.json");

test("the extension writes pi's own numbers for its terminal on session start and after a turn, only when they change", () => {
  const p = fakePi();
  let now = 1000;
  extension(p, { env: { HOME: home, HC_TERMINAL_ID: "t8" }, pid: PID, now: () => now });
  p.emit("session_start", { reason: "startup" }, ctxWith({ tokens: null, contextWindow: 200_000, percent: null }));
  assert.deepEqual(JSON.parse(readFileSync(written(), "utf8")), { v: 1, terminal: "t8", pid: PID, at: 1000, session: "s-1", model: "claude-opus-5-5", used: null, window: 200_000, percent: null });
  now = 2000;
  p.emit("turn_end", {}, ctxWith({ tokens: 97_612, contextWindow: 200_000, percent: 48.806 }));
  const f = JSON.parse(readFileSync(written(), "utf8"));
  assert.equal(f.used, 97_612);
  assert.equal(f.percent, 48.806);
  assert.equal(f.at, 2000);
  now = 3000;
  p.emit("agent_settled", {}, ctxWith({ tokens: 97_612, contextWindow: 200_000, percent: 48.806 }));
  assert.equal(JSON.parse(readFileSync(written(), "utf8")).at, 2000, "unchanged: not written again");
  assert.deepEqual(readdirSync(join(home, ".cache/herdr-roundup/context/pi")), ["t8.json"], "no temp file left");
  // What it writes reads back through the strategy as pi's own number.
  const io = setup({ files: { [EXT]: readFileSync(written(), "utf8") } });
  return reading(io).then((r) => { assert.equal(r.used, 97_612); assert.equal(r.source, "extension"); });
});

test("the extension removes its file whenever its session ends (quit, /reload, /new, /resume, /fork); the next session start writes it again at once", () => {
  for (const reason of ["new", "resume", "fork", "reload"]) {
    const p = fakePi();
    extension(p, { env: { HOME: home, HC_TERMINAL_ID: "t8" }, pid: PID, now: () => 1 });
    p.emit("session_start", { reason: "startup" }, ctxWith({ tokens: 5000, contextWindow: 200_000, percent: 2.5 }));
    p.emit("session_shutdown", { reason }, ctxWith(undefined));
    assert.equal(existsSync(written()), false, `${reason}: removed`);
    // A /reload whose extension is gone (uninstalled) ends here: no file stands frozen.
    if (reason === "reload") continue;
    p.emit("session_start", { reason }, ctxWith({ tokens: 5000, contextWindow: 200_000, percent: 2.5 }, { session: "s-2" }));
    assert.equal(JSON.parse(readFileSync(written(), "utf8")).session, "s-2", `${reason}: written again, the same numbers too`);
    p.emit("session_shutdown", { reason: "quit" }, ctxWith(undefined));
    assert.equal(existsSync(written()), false);
  }
});

test("the extension leaves another process's file alone, writes nothing headless or outside Herdr, and never throws into pi", () => {
  let p = fakePi();
  extension(p, { env: { HOME: home }, pid: PID });
  assert.deepEqual(p.handlers, {}, "outside a Herdr terminal: no handlers at all");
  p = fakePi();
  extension(p, { env: { HOME: home, HC_TERMINAL_ID: "t8;rm" }, pid: PID });
  assert.deepEqual(p.handlers, {}, "a terminal id that isn't one");
  p = fakePi();
  extension(p, { env: { HOME: home, HC_TERMINAL_ID: "t8" }, pid: PID });
  p.emit("session_start", { reason: "startup" }, ctxWith({ tokens: 1, contextWindow: 2, percent: 50 }, { mode: "print" }));
  assert.equal(existsSync(written()), false, "pi -p: no file");
  // Another pi wrote the file since: quitting doesn't remove it.
  const q = fakePi();
  extension(q, { env: { HOME: home, HC_TERMINAL_ID: "t8" }, pid: PID + 1 });
  q.emit("session_start", { reason: "startup" }, ctxWith({ tokens: 1, contextWindow: 2, percent: 50 }));
  const r = fakePi();
  extension(r, { env: { HOME: home, HC_TERMINAL_ID: "t8" }, pid: PID });
  r.emit("session_start", { reason: "startup" }, { mode: "tui" });
  q.emit("session_start", { reason: "startup" }, ctxWith({ tokens: 1, contextWindow: 2, percent: 50 }));
  r.emit("session_shutdown", { reason: "quit" }, {});
  assert.equal(JSON.parse(readFileSync(written(), "utf8")).pid, PID + 1);
  // A ctx whose calls throw, or a pi without a model: no error, null fields.
  const broken = { mode: "tui", getContextUsage() { throw new Error("x"); }, sessionManager: { getSessionId() { throw new Error("y"); } }, model: undefined };
  assert.deepEqual(record(broken, { terminal: "t8", pid: 1, now: 5 }), { v: 1, terminal: "t8", pid: 1, at: 5, session: null, model: null, used: null, window: null, percent: null });
  assert.doesNotThrow(() => r.emit("turn_end", {}, broken));
  // A HOME that can't be written: nothing, no error.
  const s = fakePi();
  extension(s, { env: { HOME: "/dev/null", HC_TERMINAL_ID: "t8" }, pid: PID });
  assert.doesNotThrow(() => s.emit("session_start", { reason: "startup" }, ctxWith({ tokens: 1, contextWindow: 2, percent: 50 })));
});
