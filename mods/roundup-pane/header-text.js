// What the pane's header writes: its folder, its id chip, and a name as it is saved. Pure,
// so tests/header-text.test.mjs runs it in node: `home` comes in as a parameter.

export const MAX_NAME = 48;

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

// A typed name as it is saved: trimmed, at most MAX_NAME characters, by code point, so a cut
// never leaves half an emoji. "" goes back to the program's name.
export const cutName = (raw) => Array.from(raw.trim()).slice(0, MAX_NAME).join("").trim();
