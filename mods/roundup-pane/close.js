// When closing a tab or a pane asks first. Herdr's own tab.close asks only when the space would close
// with it, and Herdr's Settings have no switch for it, so every way this layout closes one comes here:
// a tab's × and menu and cmd-w (roundup-tabs), a pane's × and menu (roundup-pane) and cmd-shift-w (roundup-tabs).
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

// A tab's lead pane: its agent's, else its first. Its program is the tab's.
export function tabLead(c) {
  const mine = panes().filter(p => p.tab === c.id);
  return mine.find(p => p.program?.agent) ?? mine[0];
}
export const tabProgram = (c) => tabLead(c)?.program;

// An agent's title as a name, by the rule of roundup-agents' clean() (mods can't import from each
// other): a title item that is only a Codex thread id goes (what roundup-pane's context meter
// integration adds to Codex's title), then what an agent puts in front, a status glyph or spinner
// with its separator and Codex's blinking "[ ! ] " / "[ . ] "; an opening bracket, a quote or an
// emoji of the title's own stays.
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{1,12}(?:\.\.\.)?$/i;
const MARK = /^(?:[\u2800-\u28ff\u2733\u273b\u273d\u2736\u2722\u00b7][\uFE0E\uFE0F]?\s+)+/u;
export function liveTitle(s) {
  const title = s ?? "", mark = MARK.exec(title)?.[0] ?? "";
  const kept = title.slice(mark.length).split(" | ").filter((part) => !THREAD_ID.test(part.trim())).join(" | ");
  return (kept ? mark + kept : "").replace(/^(?:\[ [!.] \] |[✋⏳]\uFE0F?(?=\s)|(?!(?:\p{Emoji}\uFE0F|[#*]\u20E3))[^\p{L}\p{N}\p{Ps}\p{Pi}\p{Emoji_Presentation}])+/u, "").trim();
}

// A tab's name as the tab bar draws it and the close dialog says it (Herdr's tabs 0.1.16): a name
// the person gave stays. A tab Herdr named (unnamed, or after its program) shows its program, and
// follows its agent's live title where that tells something, as the agents list does.
export function tabName(c, lead = tabLead(c)) {
  const prog = lead?.program?.name;
  const base = c.named ? c.name : prog ?? "Terminal";
  if (!lead?.program?.agent) return base;
  const live = liveTitle(lead.title);
  // liveTitle() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((lead.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== lead.terminal && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== lead.program.key;
  return (c.name === prog || !c.named) && telling ? live : base;
}

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

// One dialog at a time, across both mods: a held key or the other mod's close replaces it rather than
// stacking another. Shared, as each mod has its own copy of this file; roundup-confirm clears it on closing.
const OPEN = "roundup-confirm.open";

// `kind`'s choice decides. `never`: runs `command` at once, a space with its last tab too. `agents`: asks while one of
// `agents` is busy, otherwise runs Herdr's own close (`command` without `confirmed`), which still asks before a space goes.
// `always`: asks every time. `ends` says what closing ends when no agent is busy, `more` what else goes;
// with neither, the dialog says nothing runs in it.
function closeAsking({ kind, agents, title, ends, more, command }) {
  const mode = confirmMode(kind);
  if (mode === "never") return run(command.name, command.args);
  if (mode === "agents" && agents.length === 0) {
    const { confirmed, ...args } = command.args;
    return run(command.name, args);
  }
  const names = [...new Set(agents.map(a => a.program?.name ?? a.app ?? "An agent"))].join(", ");
  const why = agents.length === 0 ? ends
    : agents.length === 1 ? `${names} is still running in it. Closing ends it.`
    : `${agents.length} agents are still running in it (${names}). Closing ends them.`;
  if (shared(OPEN)) closeOverlay(shared(OPEN));
  setShared(OPEN, openOverlay({ mod: "roundup-confirm", kind: "dialog", width: 400, height: 170,
    props: { title, detail: [why, more].filter(Boolean).join(" ") || "Nothing runs in it.", command } }));
}

export function closeTab(id) {
  const space = spaces().find(s => s.tabs.some(c => c.id === id));
  if (!space) return;
  const tab = space.tabs.find(c => c.id === id), name = tabName(tab);
  closeAsking({
    kind: "tab",
    // Sub-agents belong to their parent's tab, and closing the tab ends them as well.
    agents: busy(a => a.tab === id),
    title: tab.named ? `Close tab "${fit(name)}"?` : `Close tab ${fit(name)}?`,
    ends: panes().some(p => p.tab === id && p.terminal) ? "Its terminals end." : "",
    more: space.tabs.length === 1 ? "It's the space's last tab, so the space closes too." : "",
    command: { name: "tab.close", args: { id, confirmed: true } },
  });
}

// The name someone gave the pane with Herdr's `pane.rename` (`panes()[i].name`, kept with the
// pane's tab; Herdr 0.1.17), or "". roundup-pane's header shows it.
export const givenName = (p) => p.name ?? "";

export const fallbackName = (p) => ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";

// Its given name, else the program's.
export const paneName = (p) => givenName(p) || fallbackName(p);

// A tab's only pane takes the tab with it, so closing it closes the tab, and asks as closing a tab
// does: a pane's × shouldn't end a tab more quietly than cmd-w would. (tab.close, too: pane.close
// has no `confirmed` and asks before a space goes anyway.)
// cmd-shift-w comes through roundup-tabs, not the pane headers: a key command reaches every shown
// copy, and each header checking focus in turn would close one pane after the other as focus moves.
export function closePane(pane) {
  const all = panes(), p = all.find(q => q.pane === pane);
  if (!p) return;
  const name = paneName(p);
  const lone = all.filter(q => q.tab === p.tab).length === 1;
  const last = lone && spaces().find(s => s.tabs.some(c => c.id === p.tab))?.tabs.length === 1;
  // Its terminal's sub-agents (and theirs) end with it; a lone pane's tab takes every agent in the tab.
  const parent = new Map(terminals().map(t => [t.address, t.parent]));
  const under = (address) => {
    for (let a = parent.get(address), seen = new Set(); a && !seen.has(a); seen.add(a), a = parent.get(a))
      if (a === p.terminal) return true;
    return false;
  };
  const close = lone ? { name: "tab.close", args: { id: p.tab, confirmed: true } } : { name: "pane.close", args: { pane } };
  closeAsking({
    kind: lone ? "tab" : "pane",
    agents: busy(a => lone ? a.tab === p.tab : a.pane === pane || (p.terminal && under(a.address))),
    title: `Close pane "${fit(name)}"?`,
    ends: p.terminal ? "Its terminal ends." : "",
    more: last ? "It's the space's last pane, so the space closes too." : lone ? "It's the tab's only pane, so the tab closes too." : "",
    command: close,
  });
}
