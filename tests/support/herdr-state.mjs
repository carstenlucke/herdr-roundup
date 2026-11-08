// What the `herdr` stub answers and what it was asked: one object a test sets up and reads back.
// `stub` is reset before each test (harness.reset()); every field has a default a mod can live with.
import { tmpdir } from "node:os";
import { join } from "node:path";

const COLORS = [
  "background", "surface", "canvas", "chrome", "popover", "raised", "hover", "selected", "border", "input",
  "foreground", "muted", "dim", "accent", "accent_foreground", "solid", "solid_foreground", "selection",
  "working", "blocked", "done", "idle", "unknown", ...Array.from({ length: 16 }, (_, i) => `ansi${i}`),
];

// theme(): every color is its own name ("chrome" → "chrome"), so a recorded style reads as the theme
// name the mod asked for. A test that needs hex sets `stub.theme`.
const namedTheme = () => Object.fromEntries(COLORS.map((c) => [c, c]));

function defaults() {
  const home = join(tmpdir(), "roundup-test-home");
  return {
    home,
    appHome: join(home, ".config", "herdr-app"),
    spaces: [],
    panes: [],
    agents: [],
    terminals: [],
    machines: [{ name: null, layout: "ready" }],
    focused: null,
    layout: { type: "column", id: "root", children: [] },
    layouts: ["main", "Herdr-Roundup"],
    commands: [],
    keys: [],
    window: { platform: "macos", titlebar: "none", buttons: false, maximized: false, fullscreen: false, active: true },
    placement: null,
    theme: namedTheme(),
    themes: [],
    fonts: ["Menlo"],
    settings: { zoom: 1, dark: true, font_family: "Menlo", font_size: 13 },
    updates: {
      app: { version: "0.1.13", ready: null, updates: true }, notes: [],
      core: { version: "0.1.13", managed: null, ready: null, updating: false, error: null },
      checked: null, checks: true, checking: false,
    },
    props: {},
    // exec()'s environment; null: this process's.
    env: null,
    // An array, a function (options) → array, or an Error (knownAgents rejects).
    knownAgents: [],
    pickFolder: null,
    // Herdr keeps shared state as JSON: values go in and come out as copies.
    shared: new Map(),
    // Hooks a test adds: each gets the call and answers undefined (go on as usual) or what to do.
    hooks: { exec: [], hc: [], run: [], readTextFile: [] },
    // Every call, in order: { fn, args }. Per function: calls.<fn> (the same entries).
    log: [],
    calls: {},
    // nextCommand(): commands not taken yet ({ command, handled }), loops waiting for one, and the
    // `handled` callbacks of commands taken, called when the loop asks again.
    commandQueue: [],
    commandWaiters: [],
    commandsTaken: [],
    // watchFolder(): folder → waiting loops.
    watchers: new Map(),
    ids: 0,
  };
}

export const stub = defaults();

export function resetStub() {
  for (const w of stub.commandWaiters) w.reject?.(Object.assign(new Error("reset"), { reset: true }));
  Object.assign(stub, defaults());
}

export function record(fn, ...args) {
  const entry = { fn, args };
  stub.log.push(entry);
  (stub.calls[fn] ??= []).push(entry);
  return entry;
}

// The calls to `fn`, as argument lists.
export const calls = (fn) => (stub.calls[fn] ?? []).map((e) => e.args);

// Runs the hooks for `kind`, the one added last first; the first that answers (not undefined) wins,
// so a test's own hook overrides a catch-all from beforeEach. A hook added with `times` stops
// answering after that many answers.
export function hook(kind, call) {
  for (const h of [...stub.hooks[kind]].reverse()) {
    if (h.times === 0) continue;
    const answer = h.fn(call);
    if (answer === undefined) continue;
    if (h.times !== undefined) h.times--;
    return { answer };
  }
  return null;
}

export const nextId = (prefix) => `${prefix}${++stub.ids}`;

export const json = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
