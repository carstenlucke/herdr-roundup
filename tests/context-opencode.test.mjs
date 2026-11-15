// node --test 'tests/*.test.mjs'
// opencode in roundup-pane's context meter: the strategy (its plugin's file, else nothing) against
// an io stub, and the plugin itself (integrations/opencode/tui.js) run in node against a stub of
// opencode 2's TUI plugin context, writing into a temp HOME.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import opencode from "../mods/roundup-pane/context/strategies/opencode.js";
import { strategyFor } from "../mods/roundup-pane/context/registry.js";
import { NO_READING } from "../mods/roundup-pane/context/tail.js";
import { cardModel } from "../mods/roundup-pane/context/card.js";
import plugin, { usageOf, windowOf, record as pluginRecord, setup as pluginSetup, writeAtomic, removeOwn, SETTLE_MS, ROUTE_MS } from "../mods/roundup-pane/integrations/opencode/tui.js";
import * as piExtension from "../mods/roundup-pane/integrations/pi-context.js";
import { contextIo } from "./support/context-io.mjs";

const PID = 777;
const FILE = "/Users/a/.cache/herdr-roundup/context/opencode/t5.json";
const file = (over = {}) => JSON.stringify({ v: 1, terminal: "t5", pid: PID, at: 1_700_000_000_000, session: "ses_1", model: "claude-sonnet-5-5", used: 42_000, window: 200_000, percent: 21, ...over });
const setup = ({ files = { [FILE]: file() }, env = { HC_TERMINAL_ID: "t5" } } = {}) =>
  contextIo({ files: { ...files }, terminals: { t5: { pid: PID, created: 1, title: "OpenCode", cwd: "/Users/a/src/demo" } }, envs: { [PID]: env } });
const reading = async (io) => {
  const src = await opencode.locate({ terminal: "t5" }, io, {});
  return src && opencode.read(src, io, {});
};

test("the strategy for opencode's program key", () => {
  assert.equal(strategyFor({ terminal: "t5", program: { key: "opencode" }, app: null }), opencode);
});

test("opencode with its plugin: its own numbers for the shown session, exact", async () => {
  const r = await reading(setup());
  assert.deepEqual(r, { used: 42_000, window: 200_000, percent: 21, model: "claude-sonnet-5-5", at: 1_700_000_000_000, source: "plugin", exact: true, session: "ses_1" });
  const card = cardModel(r, { agent: "opencode" });
  assert.equal(card.big.of, "of 200k");
  assert.ok(card.rows.some((row) => row.label === "Read" && row.extra === "oc plugin"));
});

test("opencode without its plugin, or a file of another process or terminal: no meter", async () => {
  assert.equal(await reading(setup({ files: {} })), null);
  assert.equal(await reading(setup({ files: { [FILE]: file({ pid: PID + 1 }) } })), null);
  assert.equal(await reading(setup({ files: { [FILE]: file({ terminal: "t6" }) } })), null);
  assert.equal(await reading(setup({ env: { HC_TERMINAL_ID: "t6" } })), null);
});

test("opencode with a footer of a larger window (ChatGPT's gpt-6.1-sol: 500k to compact against, 628k in its footer): the meter's of 500k, the card says the footer's", async () => {
  const r = await reading(setup({ files: { [FILE]: file({ used: 400_000, window: 500_000, footerWindow: 628_000, percent: 80 }) } }));
  assert.equal(r.window, 500_000);
  assert.equal(r.percent, 80);
  assert.equal(r.footerWindow, 628_000);
  const card = cardModel(r, { agent: "opencode" });
  assert.equal(card.big.of, "of 500k");
  assert.ok(card.notes.some((n) => /compacts against; its own footer counts of 628k/.test(n)), JSON.stringify(card.notes));
  // Not larger than the window, or not a number: no footer's window, no note.
  for (const footerWindow of [200_000, 150_000, null, "628k"]) { // the file's window: 200k
    const x = await reading(setup({ files: { [FILE]: file({ footerWindow }) } }));
    assert.equal(x.footerWindow, undefined, String(footerWindow));
    assert.equal(cardModel(x, { agent: "opencode" }).notes.length, 0);
  }
});

test("opencode on its home screen or before an answer: no number; a window unknown: tokens alone", async () => {
  assert.equal(await reading(setup({ files: { [FILE]: file({ session: null, used: null, window: null, percent: null }) } })), NO_READING);
  const r = await reading(setup({ files: { [FILE]: file({ window: null, percent: null }) } }));
  assert.equal(r.used, 42_000);
  assert.equal(r.window, null);
  assert.equal(r.percent, null);
  for (const over of [{ used: -1 }, { used: "42k" }]) {
    const x = await reading(setup({ files: { [FILE]: file({ ...over, percent: null }) } }));
    assert.equal(x, NO_READING, JSON.stringify(over));
  }
  assert.equal(await reading(setup({ files: { [FILE]: file({ at: null }) } })), null, "no time: not a file of the plugin's");
});

// --- opencode's own count -------------------------------------------------------------------------

const assistant = (id, tokens, model = { providerID: "anthropic", id: "claude-sonnet-5-5" }, time = { created: 10, completed: 20 }) => ({ id, type: "assistant", model, tokens, time });
const T = (input, output = 0, reasoning = 0, read = 0, write = 0) => ({ input, output, reasoning, cache: { read, write } });
const MODELS = [{ providerID: "anthropic", id: "claude-sonnet-5-5", limit: { context: 200_000, output: 64_000 } }, { providerID: "openai", id: "claude-sonnet-5-5", limit: { context: 1, output: 1 } }];

test("as opencode counts it: the last answer with tokens, all five parts, of its own model's limit", () => {
  const messages = [{ id: "u1", type: "user" }, assistant("a1", T(1000, 100)), { id: "u2", type: "user" }, assistant("a2", T(2000, 300, 50, 30_000, 700)), { id: "a3", type: "assistant", model: MODELS[0].id }];
  assert.deepEqual(usageOf(messages, MODELS), { used: 33_050, window: 200_000, footerWindow: null, model: "claude-sonnet-5-5", at: 20 });
});

test("the window is the one opencode compacts against: min(limit.input, limit.context), or the one the model has; the footer's limit.context beside it when larger", () => {
  // Logged in with ChatGPT (opencode's openai-context-caps): input capped, context = input + output.
  assert.deepEqual(windowOf({ input: 500_000, context: 628_000, output: 128_000 }), { window: 500_000, footerWindow: 628_000 });
  assert.deepEqual(windowOf({ input: 272_000, context: 400_000, output: 128_000 }), { window: 272_000, footerWindow: 400_000 });
  // The API's catalog: an input limit below the context.
  assert.deepEqual(windowOf({ input: 922_000, context: 1_050_000, output: 128_000 }), { window: 922_000, footerWindow: 1_050_000 });
  // Most models have no input limit: the context, as before.
  assert.deepEqual(windowOf({ context: 1_000_000, output: 128_000 }), { window: 1_000_000, footerWindow: null });
  // An input limit above the context can't be used in full (opencode's inputWindow): the context.
  assert.deepEqual(windowOf({ input: 2_000_000, context: 1_000_000 }), { window: 1_000_000, footerWindow: null });
  assert.deepEqual(windowOf({ input: 500_000 }), { window: 500_000, footerWindow: null });
  for (const limit of [undefined, {}, { context: 0, input: 0 }, { context: -1 }, { context: "1M" }]) {
    assert.deepEqual(windowOf(limit), { window: null, footerWindow: null }, JSON.stringify(limit));
  }
  const sol = [{ providerID: "openai", id: "gpt-6.1-sol", limit: { input: 500_000, context: 628_000, output: 128_000 } }];
  const u = usageOf([assistant("a1", T(12_000, 800), { providerID: "openai", id: "gpt-6.1-sol" })], sol);
  assert.equal(u.window, 500_000);
  assert.equal(u.footerWindow, 628_000);
});

test("after a completed compaction only answers after it count; a failed one changes nothing; a revert point ends the list", () => {
  const before = assistant("a1", T(150_000));
  assert.equal(usageOf([before, { id: "c1", type: "compaction", status: "completed" }], MODELS), null, "compacted, no answer since");
  assert.equal(usageOf([before, { id: "c1", type: "compaction", status: "failed" }], MODELS).used, 150_000);
  assert.equal(usageOf([before, { id: "c1", type: "compaction", status: "completed" }, assistant("a2", T(9000))], MODELS).used, 9000);
  const reverted = [assistant("a1", T(1000)), { id: "u2", type: "user" }, assistant("a2", T(5000))];
  assert.equal(usageOf(reverted, MODELS, "u2").used, 1000);
  assert.equal(usageOf(reverted, MODELS, "gone"), null, "a revert point not in the list: nothing");
});

test("a model not in the list, or with limit 0: tokens without a window; zero tokens or no messages: nothing", () => {
  assert.equal(usageOf([assistant("a", T(10), { providerID: "x", id: "y" })], MODELS).window, null);
  assert.equal(usageOf([assistant("a", T(10))], [{ ...MODELS[0], limit: { context: 0 } }]).window, null);
  assert.equal(usageOf([assistant("a", T(0))], MODELS), null);
  assert.equal(usageOf(undefined, MODELS), null);
  assert.equal(usageOf([], undefined), null);
});

// --- the plugin, as opencode's TUI runs it -----------------------------------------------------

let home;
beforeEach(() => { home = mkdtempSync(join(realpathSync(tmpdir()), "oc-plugin-")); });
afterEach(() => rmSync(home, { recursive: true, force: true }));
const written = () => join(home, ".cache/herdr-roundup/context/opencode/t5.json");
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

function fakeContext() {
  const state = { route: { type: "home" }, messages: {}, sessions: {}, models: MODELS, listeners: [] };
  const context = {
    ui: { router: { current: () => state.route } },
    data: {
      listen(f) { state.listeners.push(f); return () => { state.listeners = state.listeners.filter((g) => g !== f); }; },
      session: {
        get: (id) => state.sessions[id],
        message: { list: (id) => state.messages[id] ?? [] },
      },
      location: { model: { list: () => state.models } },
    },
  };
  const emit = (type) => { for (const f of state.listeners) f({ details: { type, data: {} } }); };
  return { state, context, emit };
}

test("the plugin is an opencode 2 TUI plugin: an id and setup", () => {
  assert.equal(typeof plugin.id, "string");
  assert.equal(typeof plugin.setup, "function");
});

test("the plugin writes the shown session's numbers a moment after an event, the home screen as no number, and removes its file at cleanup", async () => {
  const { state, context, emit } = fakeContext();
  const cleanup = pluginSetup(context, { env: { HOME: home, HC_TERMINAL_ID: "t5" }, pid: PID, now: () => 5 });
  assert.deepEqual(JSON.parse(readFileSync(written(), "utf8")), { v: 1, terminal: "t5", pid: PID, at: 5, session: null, model: null, used: null, window: null, footerWindow: null, percent: null });
  state.route = { type: "session", sessionID: "ses_1" };
  state.sessions.ses_1 = { id: "ses_1", location: {} };
  state.messages.ses_1 = [assistant("a1", T(40_000, 2000))];
  emit("session.step.ended");
  emit("message.part.delta");
  await tick(SETTLE_MS + 100);
  const f = JSON.parse(readFileSync(written(), "utf8"));
  assert.equal(f.session, "ses_1");
  assert.equal(f.used, 42_000);
  assert.equal(f.window, 200_000);
  assert.equal(f.percent, 21);
  assert.equal(f.at, 20, "the answer's time");
  // What it writes reads back through the strategy.
  const r = await reading(setup({ files: { [FILE]: readFileSync(written(), "utf8") } }));
  assert.equal(r.used, 42_000);
  await cleanup();
  assert.equal(existsSync(written()), false);
  assert.equal(state.listeners.length, 0, "unsubscribed");
});

test("the plugin takes the models of the session's location, else of the TUI's current one, else lets the list use its default", () => {
  const A = { directory: "/a" }, B = { directory: "/b" };
  const calls = [];
  const withModels = (sessionInfo, current) => ({
    ui: { router: { current: () => ({ type: "session", sessionID: "ses_1" }) } },
    location: current,
    data: {
      session: { get: () => sessionInfo, message: { list: () => [assistant("a1", T(50_000))] } },
      // Only B's list has the model; the default location (A) none.
      location: { model: { list: (loc) => { calls.push(loc); return (loc ?? A) === B ? MODELS : []; } } },
    },
  });
  const rec = (ctx) => pluginRecord(ctx, { terminal: "t5", pid: PID, now: 1 });
  assert.equal(rec(withModels(undefined, B)).window, 200_000, "session info not loaded yet: the current location");
  assert.equal(rec(withModels({ id: "ses_1", location: A }, B)).window, null, "the session's own location first");
  assert.equal(rec(withModels(undefined, undefined)).window, null, "neither: the list's default");
  assert.deepEqual(calls, [B, A, undefined]);
});

test("the plugin's file helpers are pi's extension's, copied on purpose (pi's loader can't import a shared one): the copies stay the same", () => {
  const src = (f) => Function.prototype.toString.call(f);
  assert.equal(src(writeAtomic), src(piExtension.writeAtomic));
  assert.equal(src(removeOwn), src(piExtension.removeOwn));
  const terminalRe = (path) => {
    const m = readFileSync(new URL(path, import.meta.url), "utf8").match(/^const TERMINAL = .+;$/m);
    assert.ok(m?.[0], `${path}: its TERMINAL line`);
    return m[0];
  };
  assert.equal(terminalRe("../mods/roundup-pane/integrations/opencode/tui.js"), terminalRe("../mods/roundup-pane/integrations/pi-context.js"));
});

test("the plugin notices a route change without an event, within its poll", async () => {
  const { state, context } = fakeContext();
  const cleanup = pluginSetup(context, { env: { HOME: home, HC_TERMINAL_ID: "t5" }, pid: PID });
  state.route = { type: "session", sessionID: "ses_2" };
  state.sessions.ses_2 = { id: "ses_2" };
  state.messages.ses_2 = [assistant("a9", T(1234))];
  await tick(ROUTE_MS + SETTLE_MS + 200);
  assert.equal(JSON.parse(readFileSync(written(), "utf8")).used, 1234);
  await cleanup();
});

test("the plugin writes nothing outside Herdr, leaves another process's file at cleanup, and never throws into opencode", async () => {
  let { context, state } = fakeContext();
  assert.equal(pluginSetup(context, { env: { HOME: home }, pid: PID }), undefined);
  assert.equal(state.listeners.length, 0);
  assert.equal(existsSync(written()), false);
  ({ context } = fakeContext());
  const cleanup = pluginSetup(context, { env: { HOME: home, HC_TERMINAL_ID: "t5" }, pid: PID });
  writeFileSync(written(), file({ pid: PID + 1 }));
  await cleanup();
  assert.equal(JSON.parse(readFileSync(written(), "utf8")).pid, PID + 1);
  // A context whose calls throw: setup and its timers stay quiet.
  const bad = { ui: { router: { current() { throw new Error("x"); } } }, data: { listen() { throw new Error("y"); } } };
  const c2 = pluginSetup(bad, { env: { HOME: home, HC_TERMINAL_ID: "t5" }, pid: PID });
  await tick(ROUTE_MS + SETTLE_MS + 100);
  await c2();
  // A HOME that can't be written.
  mkdirSync(join(home, "ro"));
  const c3 = pluginSetup(fakeContext().context, { env: { HOME: "/dev/null", HC_TERMINAL_ID: "t5" }, pid: PID });
  await c3();
});
