// When closing a tab or a pane asks first. Herdr's own tab.close asks only when the space would close
// with it, and Herdr's Settings have no switch for it, so every way this layout closes one comes here:
// a tab's × and menu and cmd-w (roundup-tabs), a pane's × and menu and cmd-shift-w (roundup-pane).
// Mods can't import from each other: this file is copied as-is into both, and scripts/sync.sh
// refuses to install copies that differ.
import { spaces, panes, agents, terminals, run, openOverlay, closeOverlay, shared, setShared } from "herdr";

// One choice for tabs (the tab menu sets it) and one for panes (the terminal menu), each under the
// name of the mod whose menu sets it. In shared state, so it outlives a restart and both mods see it.
const KEYS = { tab: "roundup-tabs.confirm-close", pane: "roundup-pane.confirm-close" };
export const MODES = [
  ["never", "Never"],
  ["agents", "While an agent works"],
  ["always", "Always"],
];
export const confirmMode = (kind) => (MODES.some(([m]) => m === shared(KEYS[kind])) ? shared(KEYS[kind]) : "agents");
export const setConfirmMode = (kind, mode) => setShared(KEYS[kind], mode);

// A tab's program: its agent's, else its first pane's.
export function tabProgram(c) {
  const mine = panes().filter(p => p.tab === c.id);
  return mine.find(p => p.program?.agent)?.program ?? mine[0]?.program;
}

// A tab nobody named shows its program, as the tab bar draws it.
export const tabName = (c, program = tabProgram(c)) => /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;

// The dialog's title doesn't wrap: a long name is cut to what fits, a wide (CJK) character counting twice.
function fit(name, room = 26) {
  let used = 0, out = "";
  for (const ch of name) {
    used += ch.codePointAt(0) > 0x2e7f ? 2 : 1;
    if (used > room) return out.trimEnd() + "…";
    out += ch;
  }
  return out;
}

// An agent counts while it works or waits on the person (blocked); done and idle ones have finished.
const busy = (keep) => agents().filter(a => (a.status === "working" || a.status === "blocked") && keep(a));

// One dialog at a time: a held key replaces it rather than stacking another.
let asking = null;

// `kind`'s choice decides. `never`: closes at once (`now`), a space with its last tab too. `agents`: asks while one of `agents`
// is busy, otherwise runs Herdr's own close (`herdr`), which still asks before a space goes.
// `always`: asks every time. `ends` says what closing ends when no agent is busy, `more` what else goes.
function closeAsking({ kind, agents, title, ends, more, now, herdr, command }) {
  const mode = confirmMode(kind);
  if (mode === "never") return now();
  if (mode === "agents" && agents.length === 0) return herdr();
  const names = [...new Set(agents.map(a => a.program?.name ?? a.app ?? "An agent"))].join(", ");
  const why = agents.length === 0 ? ends
    : agents.length === 1 ? `${names} is still running in it. Closing ends it.`
    : `${agents.length} agents are still running in it (${names}). Closing ends them.`;
  if (asking) closeOverlay(asking);
  asking = openOverlay({ mod: "roundup-confirm", kind: "dialog", width: 400, height: 170,
    props: { title, detail: [why, more].filter(Boolean).join(" "), command } });
}

export function closeTab(id) {
  const space = spaces().find(s => s.tabs.some(c => c.id === id));
  if (!space) return;
  const tab = space.tabs.find(c => c.id === id), name = tabName(tab);
  closeAsking({
    kind: "tab",
    // Sub-agents belong to their parent's tab, and closing the tab ends them as well.
    agents: busy(a => a.tab === id),
    title: tab.named ? `Close tab "${fit(name)}"?` : `Close tab ${name}?`,
    ends: panes().some(p => p.tab === id && p.terminal) ? "Its terminals end." : "",
    more: space.tabs.length === 1 ? "It's the space's last tab, so the space closes too." : "",
    now: () => run("tab.close", { id, confirmed: true }),
    herdr: () => run("tab.close", { id }),
    command: { name: "tab.close", args: { id, confirmed: true } },
  });
}

// `name`: the pane as its header names it. A tab's only pane takes the tab with it, so closing it
// closes the tab, and asks as closing a tab does: a pane's × shouldn't end a tab more quietly than
// cmd-w would. (tab.close, too: pane.close has no `confirmed` and asks before a space goes anyway.)
export function closePane(pane, name) {
  const all = panes(), p = all.find(q => q.pane === pane);
  if (!p) return;
  const lone = all.filter(q => q.tab === p.tab).length === 1;
  const last = lone && spaces().find(s => s.tabs.some(c => c.id === p.tab))?.tabs.length === 1;
  // Its terminal's sub-agents end with it; a lone pane's tab takes every agent in the tab.
  const parent = new Map(terminals().map(t => [t.address, t.parent]));
  const close = lone ? { name: "tab.close", args: { id: p.tab, confirmed: true } } : { name: "pane.close", args: { pane } };
  closeAsking({
    kind: lone ? "tab" : "pane",
    agents: busy(a => lone ? a.tab === p.tab : a.pane === pane || (p.terminal && parent.get(a.address) === p.terminal)),
    title: `Close pane "${fit(name)}"?`,
    ends: p.terminal ? "Its terminal ends." : "",
    more: last ? "It's the space's last pane, so the space closes too." : lone ? "It's the tab's only pane, so the tab closes too." : "",
    now: () => run(close.name, close.args),
    herdr: () => lone ? run("tab.close", { id: p.tab }) : run("pane.close", { pane }),
    command: close,
  });
}
