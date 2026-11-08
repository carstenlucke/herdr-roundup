// The L2 harness: import this first, then load mod code with `await import(...)`.
//
//   import { herdr, reset, mount } from "./support/harness.mjs";
//   const { closeTab } = await import("../mods/roundup-tabs/close.js");
//
// Importing it registers the module hooks (loader.mjs) that send `herdr`, `gpui-kit` and `gpui-base`
// to the stubs beside it, puts a fake `fetch` and `localStorage` on globalThis, and starts a fresh
// state. Call `reset()` in beforeEach so every test starts from the defaults.
import * as nodeModule from "node:module";
import { resolveSync } from "./loader.mjs";
import { stub, resetStub, calls } from "./herdr-state.mjs";
import { clock, flush } from "./clock.mjs";
import { makeCx } from "./cx.mjs";
import { fake as fetchFake, response } from "./fetch.mjs";

// In this thread: module.registerHooks, from Node 22.15 on (README, CI), which the tests are written for.
if (typeof nodeModule.registerHooks !== "function")
  throw new Error(`the tests need Node 22.15 or later (module.registerHooks); this is Node ${process.versions.node}`);
nodeModule.registerHooks({ resolve: resolveSync });

// localStorage: per mod copy in Herdr; here one for the test, emptied by reset().
class MemoryStorage {
  #items = new Map();
  get length() { return this.#items.size; }
  key(i) { return [...this.#items.keys()][i] ?? null; }
  getItem(k) { return this.#items.has(String(k)) ? this.#items.get(String(k)) : null; }
  setItem(k, v) { this.#items.set(String(k), String(v)); }
  removeItem(k) { this.#items.delete(String(k)); }
  clear() { this.#items.clear(); }
}
globalThis.localStorage = new MemoryStorage();

const addHook = (kind, fn, opts = {}) => { stub.hooks[kind].push({ fn, times: opts.times }); };

// How a test sets up and reads the `herdr` stub. `herdr.stub` is the raw state (herdr-state.mjs).
export const herdr = {
  stub,
  calls,
  // The whole log, in call order: [{ fn, args }].
  get log() { return stub.log; },
  // Forgets the calls so far (fixtures and hooks stay).
  clear() { stub.log = []; stub.calls = {}; },
  // Sets fixtures: herdr.set({ spaces: [...], panes: [...], focused: {...}, props: {...} }).
  set(fields) {
    for (const [k, v] of Object.entries(fields)) {
      if (k === "shared") for (const [key, value] of Object.entries(v)) stub.shared.set(key, JSON.parse(JSON.stringify(value)));
      else stub[k] = v;
    }
  },
  shared: (key) => (stub.shared.has(key) ? JSON.parse(JSON.stringify(stub.shared.get(key))) : null),

  // exec(): fn(call) with call = { command, args, options }. Answer undefined to run the real
  // process, { code, stdout, stderr } to resolve with that, an Error to reject.
  onExec: (fn, opts) => addHook("exec", fn, opts),
  // exec() of `command` (a name, or a predicate on the call) rejects as a program that can't start.
  failExec(match, error = new Error("cannot start: program not found"), opts) {
    const hit = typeof match === "function" ? match : (c) => c.command === match;
    addHook("exec", (c) => (hit(c) ? error : undefined), opts);
  },
  onHc: (fn, opts) => addHook("hc", fn, opts),
  // run(): fn({ name, args }); throw to make run() throw, or change fixtures.
  onRun: (fn, opts) => addHook("run", fn, opts),
  onReadTextFile: (fn, opts) => addHook("readTextFile", fn, opts),

  // Delivers a command to the mod's nextCommand() loop. Resolves once the loop asks for the next
  // one, i.e. has handled this one (or after `wait` ms, failing then).
  command(c, wait = 2000) {
    let done;
    const handled = new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`command ${c} wasn't handled: no loop asked for the next command`)), wait);
      done = () => { clearTimeout(t); resolve(); };
    });
    const w = stub.commandWaiters.shift();
    if (w) { stub.commandsTaken.push(done); w.resolve(c); } else stub.commandQueue.push({ command: c, handled: done });
    return handled;
  },
  // Resolves the watchFolder(path) calls waiting now with `paths`.
  change(path, paths = [path]) {
    const list = stub.watchers.get(path) ?? [];
    stub.watchers.delete(path);
    for (const w of list) w.resolve(paths);
    return list.length;
  },
  failWatch(path, error = new Error("watch failed")) {
    const list = stub.watchers.get(path) ?? [];
    stub.watchers.delete(path);
    for (const w of list) w.reject(error);
    return list.length;
  },
  watching: (path) => (stub.watchers.get(path) ?? []).length,
};

export const fetch = fetchFake;
export { response, clock, flush, makeCx };
export * from "./gpui-tree.mjs";

// Waits until cond() is truthy (checked after each turn of the event loop), at most `ms`; answers its value.
export async function waitFor(cond, ms = 2000, what = String(cond)) {
  const end = performance.now() + ms; // not Date.now: a test may have faked it
  for (;;) {
    const v = await cond();
    if (v) return v;
    if (performance.now() > end) throw new Error(`waitFor: still not true after ${ms} ms: ${what}`);
    await new Promise((r) => setTimeout(r, 1));
  }
}

export function reset() {
  resetStub();
  clock.reset();
  fetchFake.reset();
  globalThis.localStorage.clear();
}
reset();

// Creates a View as Herdr does: new Class(props), init(props, cx). `render()` renders it again and
// returns the tree; `cx` is the one fake context it got.
export function mount(Class, { props, cx = makeCx() } = {}) {
  if (props !== undefined) stub.props = props;
  const view = new Class(stub.props);
  view.init?.(stub.props, cx);
  return { view, cx, render: () => view.render(cx) };
}

// Fixtures shaped as herdr.d.ts describes them; pass what matters to the test.
export const program = (key = "shell", extra = {}) => ({
  key, name: key === "shell" ? "zsh" : key, icon: null, tint: false, tile: null, color: null,
  shell: key === "shell", agent: false, ...extra,
});
export const agentProgram = (key = "claude", name = "Claude Code") => program(key, { name, agent: true });
export const tab = (id, extra = {}) => ({
  id, index: 1, name: "1", named: false, active: false, status: null, panes: 1, zoomed: false,
  settled: false, settled_at: null, changed_at: null, working_since: null, ...extra,
});
export const space = (id, tabs = [], extra = {}) => ({
  id, index: 1, name: id, named: false, folder: "", machine: null, branch: null, active: false, status: null,
  tabs: tabs.map((t, i) => ({ ...t, index: i + 1 })), ...extra, // a tab's index is its place in the list
});
export const pane = (paneId, tabId, extra = {}) => ({
  pane: paneId, terminal: null, tab: tabId, title: "", cwd: null, branch: null, status: null, app: null,
  program: program(), focused: false, zoomed: false, movable: false, ...extra,
});
export const agent = (address, extra = {}) => ({
  address, pane: "", space: "", space_name: "", tab: "", tab_index: 1, tab_name: "", status: "idle", app: null,
  program: agentProgram(), title: "", seq: 0, pinned: false, focused: false, ...extra,
});
export const terminal = (address, extra = {}) => ({ address, name: "", argv: [], parent: null, labels: {}, state: "running", ...extra });
