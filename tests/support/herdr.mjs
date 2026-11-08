// The `herdr` module as mods see it in tests: the names and signatures of ~/.config/herdr-app/herdr.d.ts,
// answered from `stub` (herdr-state.mjs). exec() and readTextFile() reach the real machine; hc(), run(),
// notify(), overlays and everything that would touch the person's Herdr only record.
import { spawn } from "node:child_process";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve as resolvePath, relative, isAbsolute, dirname, basename, join } from "node:path";
import { tmpdir } from "node:os";
import { realpathSync } from "node:fs";
import { stub, record, hook, nextId, json } from "./herdr-state.mjs";

const EXEC_LIMIT = 30_000;
const EXEC_OUTPUT = 8 * 1024 * 1024;

const value = (v, ...args) => (typeof v === "function" ? v(...args) : v);

// Runs a real process: { code, stdout, stderr }; rejects when it can't start (no such program, no such
// folder), as Herdr's does. `on` runs on this machine too: a test that needs another machine adds a hook.
function realExec(command, args, options) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, args, { cwd: options?.cwd, env: stub.env ?? process.env, stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) { reject(e); return; }
    const out = [], err = [];
    let size = 0, settled = false;
    const take = (list) => (chunk) => { size += chunk.length; if (size <= EXEC_OUTPUT) list.push(chunk); };
    child.stdout.on("data", take(out));
    child.stderr.on("data", take(err));
    const timer = setTimeout(() => child.kill("SIGKILL"), EXEC_LIMIT);
    child.on("error", (e) => { clearTimeout(timer); if (!settled) { settled = true; reject(new Error(`cannot start ${command}: ${e.message}`)); } });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code: code ?? (signal ? 128 : 1), stdout: Buffer.concat(out).toString("utf8"), stderr: Buffer.concat(err).toString("utf8") });
    });
  });
}

// A hook answers with { code, stdout?, stderr? } (resolves), an Error (rejects), a function
// (called with the call, its answer used the same way), or a promise of one of those.
async function answer(a, call, fallback) {
  const v = await (typeof a === "function" ? a(call) : a);
  if (v instanceof Error) throw v;
  if (v === undefined) return fallback();
  return { code: 0, stdout: "", stderr: "", ...v };
}

export function exec(command, args = [], options = {}) {
  const call = { command, args: [...args], options: { ...options } };
  record("exec", command, call.args, call.options);
  const h = hook("exec", call);
  if (h) return answer(h.answer, call, () => realExec(command, args, options));
  return realExec(command, args, options);
}

// Never the real hc: it would act on the person's terminals. Answers { code: 0 } unless a hook says otherwise.
export function hc(args) {
  const call = { args: [...args] };
  record("hc", call.args);
  const h = hook("hc", call);
  if (h) return answer(h.answer, call, () => ({ code: 0, stdout: "", stderr: "" }));
  return Promise.resolve({ code: 0, stdout: "", stderr: "" });
}

export const home = () => stub.home;
export const appHome = () => stub.appHome;

export async function readTextFile(path, options) {
  record("readTextFile", path, options);
  const h = hook("readTextFile", { path, options });
  if (h) return value(h.answer, { path, options });
  try {
    const text = await readFile(path, "utf8");
    return text.length > 1024 * 1024 ? text.slice(0, 1024 * 1024) : text;
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return null;
    throw e;
  }
}

// Writes only below the system's temp folder: a test never writes into the person's home.
export async function writeTextFile(path, text, expected) {
  record("writeTextFile", path, text, expected);
  const tmp = realpathSync(tmpdir()), abs = resolvePath(path);
  const real = (() => { try { return realpathSync(dirname(abs)); } catch { return dirname(abs); } })();
  const rel = relative(tmp, join(real, basename(abs)));
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`writeTextFile stub: ${path} is outside ${tmp}`);
  let now = null;
  try { now = await readFile(abs, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  if (now !== expected) throw new Error("stale snapshot");
  const part = `${abs}.${process.pid}.tmp`;
  await writeFile(part, text, "utf8");
  await rename(part, abs);
  return null;
}

export async function knownAgents(options) {
  record("knownAgents", options);
  const v = value(stub.knownAgents, options);
  if (v instanceof Error) throw v;
  return json(await v);
}

export async function pickFolder(options) {
  record("pickFolder", options);
  return value(stub.pickFolder, options);
}

export function playSound(sound) { record("playSound", sound); return null; }

// Records the command; a hook may throw (run() throwing) or change the fixtures (a tab.close removing the tab).
export function run(name, args) {
  record("run", name, args);
  hook("run", { name, args });
  return null;
}

export const machines = () => json(value(stub.machines));
export const spaces = () => json(value(stub.spaces));
export const agents = () => json(value(stub.agents));
export const panes = () => json(value(stub.panes));
export const terminals = () => json(value(stub.terminals));
export const focused = () => json(value(stub.focused));
export const layout = () => json(value(stub.layout));
export const layouts = () => json(value(stub.layouts));
export const commands = () => json(value(stub.commands));
export const keys = () => json(value(stub.keys));
export const window = () => json(value(stub.window));
export const placement = () => json(value(stub.placement));
export const theme = () => ({ ...value(stub.theme) });
export const themes = () => json(value(stub.themes));
export const fonts = () => json(value(stub.fonts));
export const updates = () => json(value(stub.updates));
export const telemetry = () => null;
export const settings = () => json(value(stub.settings));
export const props = () => json(value(stub.props));

export function setAgentOrder(addresses) { record("setAgentOrder", addresses); return null; }
export function presentUpdateNotes(versions) { record("presentUpdateNotes", versions); return null; }

export function openOverlay(spec) {
  const id = nextId("overlay-");
  record("openOverlay", json(spec), id);
  return id;
}
export function closeOverlay(id) { record("closeOverlay", id); return null; }

export function notify(n) {
  const id = nextId("toast-");
  record("notify", json(n), id);
  return id;
}

export function shared(key) {
  return stub.shared.has(key) ? json(stub.shared.get(key)) : null;
}
export function setShared(key, v) {
  record("setShared", key, json(v));
  stub.shared.set(key, json(v));
  return null;
}

// The next command for this mod: what the test queued with harness `command()`, else it waits for one.
// A command the loop took counts as handled when the loop asks for the next one.
export function nextCommand() {
  for (const handled of stub.commandsTaken.splice(0)) handled();
  if (stub.commandQueue.length) {
    const { command, handled } = stub.commandQueue.shift();
    stub.commandsTaken.push(handled);
    return Promise.resolve(command);
  }
  return new Promise((resolve, reject) => stub.commandWaiters.push({ resolve, reject }));
}

// Resolves when the test calls harness `change(path, paths)`, rejects on `failWatch(path)`.
export function watchFolder(path) {
  record("watchFolder", path);
  return new Promise((resolve, reject) => {
    const list = stub.watchers.get(path) ?? [];
    list.push({ resolve, reject });
    stub.watchers.set(path, list);
  });
}

// Frame-only feedback functions: present so a module importing them loads; they do nothing.
export const feedbackPreview = () => ({ body: null, available: false });
export const feedbackPasteImage = () => null;
export const feedbackPickImages = async () => [];
export const feedbackAttachImages = () => [];
export const feedbackClearImages = () => null;
export const sendFeedback = async () => null;
