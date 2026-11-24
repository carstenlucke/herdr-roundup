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

// Names from before Herdr could name a pane (Roundup up to 0.11): a terminal's core label
// `roundup-pane.name`, a mod pane's entry in shared `roundup-pane.names` (pane id -> name).
export const OLD_LABEL = "roundup-pane.name";
export const OLD_NAMES = "roundup-pane.names";

// What such a name asks for, or null without one: "give" it to a pane that has no name, "drop" it
// once the pane has one (or it is blank). Two looks, so a rename that didn't arrive keeps the old name.
export function oldName(p, labels, names) {
  const old = (p.terminal ? labels?.[OLD_LABEL] : names?.[p.pane]) ?? "";
  if (!old) return null;
  const name = old.trim();
  return { name, step: p.name || !name ? "drop" : "give" };
}
