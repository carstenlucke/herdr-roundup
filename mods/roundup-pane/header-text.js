// What the pane's header writes: its folder and its id chip, and what becomes of a name from
// before Herdr named panes. Pure, so tests/header-text.test.mjs runs it in node: `home` comes in
// as a parameter.

// A folder under home as ~/…; null as "".
export function folder(cwd, home) {
  if (!cwd) return "";
  const h = home;
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// What the id chip shows and what a double-click copies.
export function paneId(p) {
  if (p.terminal) return { shown: p.terminal, copied: p.terminal };
  const short = p.pane.replace(/^((?:[^/]+\/)?p[0-9a-f]{6})[0-9a-f]+$/, "$1…");
  return { shown: short, copied: p.pane };
}

// Names from before Herdr could name a pane (Roundup 0.11.0-beta.3 and earlier): a terminal's core
// label `roundup-pane.name`, a mod pane's entry in shared `roundup-pane.names` (pane id -> name).
export const OLD_LABEL = "roundup-pane.name";
export const OLD_NAMES = "roundup-pane.names";
// Shared: the terminals whose old label is to go (address -> true), written before the label is
// removed and kept until it is visibly gone. Their pane is never given the old name again, so a
// removal that failed can't bring back a name the person cleared meanwhile, after a restart neither.
export const MOVED = "roundup-pane.moved";

// What such a name asks for, or null: "give" it to a pane that has no name, "drop" it once the pane
// has one (or it is blank, or its terminal is in `moved`), "forget" the terminal in `moved` once
// its label is gone. `source`: the terminal's address, a mod pane's id.
export function oldName(p, labels, names, moved) {
  const source = p.terminal ?? p.pane;
  const old = (p.terminal ? labels?.[OLD_LABEL] : names?.[p.pane]) ?? "";
  if (!old) return p.terminal && moved?.[source] ? { source, step: "forget" } : null;
  const name = old.trim();
  return { source, name, step: p.name || !name || (p.terminal && moved?.[source]) ? "drop" : "give" };
}

// The layout's first visible tab frame (`content.tab` with its `pane`), the active child of a
// stack included (Herdr's pane 0.1.15): its `header.position` says where this header sits.
export function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter((child) => !child.hidden);
    children = [visible.find((child) => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}
