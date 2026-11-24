// What the logo menu's section "Agent integrations" decides without asking anyone (issue #48): what
// roundup-pane's integrations script says per agent, which agents the menu lists, its rows, the dialog
// before switching one on, and the toasts. No `herdr` import, so tests run it in node; integrate.js runs
// the script.

// Shared state under this mod's name, read by roundup-pane's card too:
// STATE: { <agent>: { state, detail, file, installed } } after the first read, null before it.
//   state "on" | "off" | "broken" | "unknown" (the script's word); detail its words in brackets, or null;
//   file what install changes (`where`); installed what knownAgents() said (null: it couldn't tell).
// BUSY: the agent whose install or uninstall runs, else null.
// TOLD: the agents the toast after an install or an update has named (each at most once, ever).
export const STATE = "roundup-workspace-chrome.integrations";
export const BUSY = "roundup-workspace-chrome.integrations.busy";
export const TOLD = "roundup-workspace-chrome.integrations.told";

// Where a person finds the section, for the card's notes and the toast.
export const MENU = "the Herdr Roundup menu (top left)";

// The agents the script knows, in its order. `key` is the script's word, roundup-pane's strategy id and
// the program table's key alike. `changes(file)`: what the dialog says install does to that file.
export const AGENTS = [
  { key: "claude", name: "Claude Code",
    changes: (f) => `Roundup's status line goes into ${f}; one of yours keeps running after it. A backup is kept, and switching off restores the file.` },
  { key: "codex", name: "Codex",
    changes: (f) => `"thread-id" joins tui.terminal_title in ${f}, so Codex's titles end in the thread's id. A backup is kept, and switching off restores the file.` },
  { key: "pi", name: "Pi",
    changes: (f) => `A link to Roundup's extension at ${f}. No file of yours changes.` },
  { key: "opencode", name: "OpenCode",
    changes: (f) => `A link to Roundup's plugin at ${f}. No file of yours changes.` },
];
export const agentOf = (key) => AGENTS.find((a) => a.key === key) ?? null;
const nameOf = (key) => agentOf(key)?.name ?? key;

// The script's lines ("claude: on", "codex: broken (terminal_title was changed since install: …)"), per
// agent: { state, detail }. Lines for agents it doesn't know, or in another form, are left out.
const LINE = /^(claude|codex|pi|opencode): (on|off|broken|unknown)(?: \((.*)\))?$/;
export function parseStatus(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n")) {
    const m = LINE.exec(line.trim());
    if (m) out[m[1]] = { state: m[2], detail: m[3] ?? null };
  }
  return out;
}

// `where`'s lines ("pi: /Users/x/.pi/agent/extensions/roundup-context.js"), per agent: the path.
export function parseWhere(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n")) {
    const m = /^(claude|codex|pi|opencode): (\/.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// A path under the home folder as ~/…, for people.
export const tilde = (path, home) => home && (path === home || path?.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path;

// STATE from one read: the script's status and where, and knownAgents() (null when it failed). An agent
// the script said nothing about is left out, so the menu doesn't offer what can't be read.
export function survey(status, where, known) {
  const st = parseStatus(status), files = parseWhere(where), out = {};
  for (const { key } of AGENTS) {
    if (!st[key]) continue;
    const entry = Array.isArray(known) ? known.find((k) => k?.key === key) : undefined;
    out[key] = { ...st[key], file: files[key] ?? null, installed: Array.isArray(known) ? Boolean(entry?.installed) : null };
  }
  return out;
}

// The agents the menu lists: the installed ones, and any whose integration isn't off (an agent removed
// with its integration still on can be switched off). When knownAgents() couldn't tell, all.
export const listed = (state) => AGENTS.map((a) => a.key).filter((k) => state?.[k] && (state[k].installed !== false || state[k].state !== "off"));

// The section's rows for the agents fixed when the menu opened (`keys`: listed(), or null before the first
// read; `windows` where the script can't run). Each row: { key, label, check, icon, warn, spin, dim, does },
// `does` what a click does: "on" (ask, then install), "off" (uninstall), "why" (say what is wrong), or null.
export function sectionRows(keys, state, busy, windows = false) {
  if (windows) return [{ key: null, label: "Not on Windows yet", dim: true, does: null }];
  if (keys === null || keys === undefined) return [{ key: null, label: "Reading…", dim: true, does: null }];
  if (!keys.length) return [{ key: null, label: "No agent installed that has one", dim: true, does: null }];
  return keys.map((key) => {
    const s = state?.[key]?.state ?? null, name = nameOf(key);
    if (busy === key) return { key, label: name, icon: "spinner", spin: true, dim: true, does: null };
    // Another one running: this row waits, as the script edits one agent at a time.
    if (busy) return { key, label: name, check: s === "on", dim: true, does: null };
    if (s === "on") return { key, label: name, check: true, does: "off" };
    if (s === "off") return { key, label: name, check: false, does: "on" };
    if (s === "broken" || s === "unknown") return { key, label: `${name} · ${s}`, icon: "circle-alert", warn: true, does: "why" };
    return { key, label: name, dim: true, does: null }; // gone from the last read
  });
}

// The dialog before install: what changes, in which file (`file` as people read it, ~/…).
export function confirmProps(key, file) {
  const a = agentOf(key);
  if (!a) return null;
  return {
    title: `Switch on ${a.name}'s integration?`,
    detail: a.changes(file ?? "its config"),
    yes: "Switch on",
    command: { name: `roundup-workspace-chrome.install@${key}` },
  };
}

// The toast after install or uninstall from the script's answer ({ code, stdout, stderr }). Its last line
// says what happened ("claude: on (…)", "pi: already off"); a failure gives its own words.
export function resultToast(key, action, r) {
  const name = nameOf(key), on = action === "install";
  const words = (s) => String(s ?? "").trim().split("\n").filter(Boolean);
  const last = words(r?.stdout).at(-1) ?? "";
  const said = last.startsWith(`${key}: `) ? last.slice(key.length + 2) : "";
  if (!r || r.code !== 0 || !said) {
    const why = words(r?.stderr).at(-1) ?? (last || `The script ended with ${r?.code ?? "an error"}`);
    return { level: "warning", title: `Couldn't switch ${on ? "on" : "off"} ${name}'s integration`, body: why.replace(new RegExp(`^${key}: `), "") };
  }
  const note = /\((.*)\)$/.exec(said)?.[1] ?? null;
  if (said.startsWith("already")) return { level: "info", title: `${name}'s integration is already ${on ? "on" : "off"}`, ...(note ? { body: note } : {}) };
  return on
    ? { level: "success", title: `${name}'s integration is on`, body: `New ${name} sessions pass on their own numbers. One already running may need a restart.` }
    : { level: "success", title: `${name}'s integration is off`, body: `A ${name} session already running keeps it until it restarts.` };
}

// What a click on a broken or unknown row says.
export function whyToast(key, state) {
  const s = state?.[key], name = nameOf(key);
  return {
    level: "warning",
    title: s?.state === "unknown" ? `Whether ${name}'s integration is on can't be told` : `${name}'s integration is broken`,
    body: s?.detail ?? "Run the script's status in a terminal: mods/roundup-pane/integrations/agent-integrations.sh",
  };
}

// The toast after an install or an update: the installed agents whose integration is off and that no toast
// has named yet. → { toast, told } (told: TOLD afterwards), or null. Not while knownAgents() can't tell.
export function introToast(state, told) {
  const before = Array.isArray(told) ? told : [];
  const off = AGENTS.map((a) => a.key).filter((k) => state?.[k]?.installed === true && state[k].state === "off");
  const fresh = off.filter((k) => !before.includes(k));
  if (!fresh.length) return null;
  const names = fresh.map(nameOf);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return {
    toast: {
      level: "info", title: `Exact numbers for ${list}`,
      body: `${fresh.length === 1 ? "Its integration is" : "Their integrations are"} off. Switch ${fresh.length === 1 ? "it" : "them"} on in ${MENU}: click to open it.`,
      action: { name: "roundup-workspace-chrome.menu" },
    },
    told: [...before, ...fresh],
  };
}
