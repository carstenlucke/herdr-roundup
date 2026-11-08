// What clicks and keys in the panel do: the context menu's entries and height, where the
// keyboard menu hangs and how its keys move, the cursor's moves, and what a click on a row
// asks for. Pure, so tests/input.test.mjs runs it in node: the platform (`mac`) and the
// list's measured height come in as parameters.

export const ROW = 26;

// The context menu's entries for one path, in groups. `local`: on this computer.
export function menuItems(m, mac) {
  return [
    [!m.dir && !m.gone && ["float", "Quick look"],
      !m.dir && !m.gone && ["tab", "Open in tab"],
      !m.dir && !m.gone && ["preview", "Preview in panel"],
      m.local && !m.dir && !m.gone && ["open", "Open with default app"],
      m.local && !m.gone && ["reveal", mac ? "Reveal in Finder" : "Show in folder"]],
    [["copy-rel", "Copy relative path"], ["copy-abs", "Copy absolute path"]],
    [["send", "Send @path to agent"]],
  ].map((g) => g.filter(Boolean)).filter((g) => g.length);
}

// The menu's height: 28 per entry, 9 per divider, 5 of padding above and below.
export const menuHeight = (groups) => groups.reduce((n, g) => n + g.length, 0) * 28 + (groups.length - 1) * 9 + 10;

// Where the keyboard menu (k: { m, row, depth }) hangs in the list's box: below its row's
// name. openKeyMenu centred the row, so with the list's height its place is known: in the
// middle, or at the top or bottom when the list can't scroll that far. n: the rows;
// listHeight: as on_size_change measured it, in the window's pixels (zoom: Herdr's); null
// before the list was measured.
export function keyMenuAt(k, n, listHeight, zoom) {
  if (!listHeight) return null;
  const h = listHeight / zoom - 4; // the list, inside the box's bottom padding
  const offset = Math.max(0, Math.min(k.row * ROW + ROW / 2 - h / 2, n * ROW - h));
  const top = k.row * ROW - offset, left = 4 + 8 + k.depth * 14 + 18;
  // Where it wouldn't fit below its row, it opens above it. The platform changes a label only.
  const tall = menuHeight(menuItems(k.m)) + 4; // with its 2px margin and 1px border
  return top + ROW + tall > h ? { top, left, up: true } : { top: top + ROW, left };
}

// A key while the keyboard menu is open, on entry `at` of n: { at } moves, { run } runs that
// entry, { close } closes it; {} for any other key (the menu takes it all the same).
export function menuKey(at, n, key, shift) {
  if (key === "down" || key === "tab") return { at: (at + 1) % n };
  if (key === "up") return { at: (at - 1 + n) % n };
  if (key === "home" || key === "pageup") return { at: 0 };
  if (key === "end" || key === "pagedown") return { at: n - 1 };
  if (key === "enter" || key === "space") return { run: at };
  if (key === "escape" || key === "left" || key === "menu" || (key === "f10" && shift)) return { close: true };
  return {};
}

// The row the cursor moves to, of `count`, from row `at` (-1: none selected) by delta,
// clamped. Without a selected row, down starts at the top and up at the bottom.
export function moveIndex(count, at, delta) {
  const from = at >= 0 ? at : delta > 0 ? -1 : count;
  return Math.max(0, Math.min(count - 1, from + delta));
}

// What a click on row r asks for, `n` the presses in a row, `tab` with Cmd (Ctrl off macOS)
// held, `floats(rel)` whether the floating window shows that file now. A folder opens or
// closes on the first; a file gets the cursor (and the floating window, when it is open,
// follows), the second shows it in the floating window. With `tab` the first only selects
// and the second opens a tab (closing the window if it shows that file). In order, of:
// "activate", "follow", "stopFollow", "closeFloat", "openPreview", "openFloat".
export function clickAction(r, n, tab, floats) {
  if (r.dir || r.gone) return n === 1 ? ["activate"] : [];
  if (n === 1) return [tab ? "stopFollow" : "follow"];
  if (n === 2 && tab) return floats(r.rel) ? ["closeFloat", "openPreview"] : ["openPreview"];
  if (n === 2) return floats(r.rel) ? [] : ["openFloat"];
  return [];
}

// The path a script command (`tab:<rel>`, `float:<rel>`) names, or null: one relative to the
// shown folder, with "/" (or "\") between its parts. Empty, absolute (`/x`, `\x`, `C:x`, UNC)
// and anything with a ".." part is refused; nothing is trimmed (a name may end in a space).
export function scriptRel(rel) {
  if (typeof rel !== "string" || rel === "" || /^[\\/]/.test(rel) || /^[A-Za-z]:/.test(rel)) return null;
  return rel.split(/[\\/]/).some((part) => part === "..") ? null : rel;
}
