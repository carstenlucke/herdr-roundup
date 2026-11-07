// How a file opens in roundup-preview: a new tab, or a split beside the focused
// pane, or the pane already showing it, or the floating window. Pure, so node --test covers it.

// Shared keys. OPEN: "<on>:<file>" -> the pane the opener made for it. MOVED:
// "<on>:<file>" -> what that preview shows now, once it followed a link.
export const OPEN = "roundup-preview.open", MOVED = "roundup-preview.moved";
export const previewId = (file, on) => `${on ?? ""}:${file}`;

/** The pane already showing `file`, or null. `open`, `moved`: the shared maps; `alive`: pane ids that exist. */
export function shownIn(open, moved, file, on, alive) {
  const id = previewId(file, on), pane = open?.[id];
  return pane && alive.has(pane) && (moved?.[id] ?? file) === file ? pane : null;
}

/** OPEN and MOVED once `pane` was made for `file`: it shows the file itself (no MOVED entry),
 *  and entries for panes no longer in `alive` are dropped, so neither map only grows. */
export function remember(open, moved, file, on, pane, alive) {
  const id = previewId(file, on);
  const keep = (map) => Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => k !== id && alive.has(open?.[k])));
  return { open: { ...keep(open), [id]: pane }, moved: keep(moved) };
}

// The floating preview: one window (kind "window", one key), which opening again replaces
// in its place. FLOAT: { id, file, on, token } of the open one, null when none is; the
// token tells the window's own copy that it is still the one FLOAT names.
export const FLOAT = "roundup-preview.float";
export function floatSpec({ file, on = null, token }) {
  return { kind: "window", key: "roundup-preview", mod: "roundup-preview", width: 0.6, height: 0.75, props: { file, on, float: token } };
}

/** The app command, as [name, args], that shows `file` (on machine `on`) in roundup-preview. */
export function openCommand({ file, on = null, mode = "tab" }) {
  const props = { file, on };
  if (mode === "split-right" || mode === "split-down") {
    return ["pane.split", { direction: mode === "split-down" ? "down" : "right", mod: "roundup-preview", props }];
  }
  return ["tab.new", { name: file.split(/[\\/]/).pop(), mod: "roundup-preview", props }];
}
