// When closing a tab asks first. Herdr's own tab.close asks only when the space would close with it,
// and Herdr's Settings have no switch for it, so every way this layout closes a tab comes here:
// the tab's ×, its right-click menu, and cmd-w (`roundup-tabs.close` in keys.json).
import { spaces, panes, agents, run, openOverlay, closeOverlay, shared, setShared } from "herdr";

// In shared state, so it outlives a restart and every copy of the mod sees one choice.
const KEY = "roundup-tabs.confirm-close";
export const MODES = [
  ["never", "Never"],
  ["agents", "While an agent works"],
  ["always", "Always"],
];
export const confirmMode = () => (MODES.some(([m]) => m === shared(KEY)) ? shared(KEY) : "agents");
export const setConfirmMode = (mode) => setShared(KEY, mode);

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

// One dialog at a time: a held cmd-w replaces it rather than stacking another.
let asking = null;

// `never`: closes at once, the space with its last tab too. `agents`: asks while an agent in the tab
// works or waits on the person (blocked); otherwise Herdr's own tab.close runs, which still asks
// before a space's last tab takes the space with it. `always`: asks every time.
export function closeTab(id) {
  const space = spaces().find(s => s.tabs.some(c => c.id === id));
  if (!space) return;
  const tab = space.tabs.find(c => c.id === id), mode = confirmMode();
  if (mode === "never") return run("tab.close", { id, confirmed: true });
  // Sub-agents belong to their parent's tab, and closing the tab ends them as well.
  const busy = agents().filter(a => a.tab === id && (a.status === "working" || a.status === "blocked"));
  if (mode === "agents" && busy.length === 0) return run("tab.close", { id });
  const names = [...new Set(busy.map(a => a.program?.name ?? a.app ?? "An agent"))].join(", ");
  const terminals = panes().some(p => p.tab === id && p.terminal);
  const detail = (busy.length === 0 ? (terminals ? "Its terminals end." : "")
    : busy.length === 1 ? `${names} is still running in it. Closing ends it.`
    : `${busy.length} agents are still running in it (${names}). Closing ends them.`)
    + (space.tabs.length === 1 ? " It's the space's last tab, so the space closes too." : "");
  const name = tabName(tab);
  if (asking) closeOverlay(asking);
  asking = openOverlay({ mod: "confirm", kind: "dialog", width: 400, height: 170,
    props: { title: tab.named ? `Close tab "${fit(name)}"?` : `Close tab ${name}?`, detail: detail.trim(), command: { name: "tab.close", args: { id, confirmed: true } } } });
}
