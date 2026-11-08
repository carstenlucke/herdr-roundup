// Which folder the panel shows: the focused pane's. Pure, so tests/location.test.mjs runs
// it in node: Herdr's spaces, panes and focused come in as functions ({ spaces, panes,
// focused } from "herdr", or fixtures), and `lastRoot` is the panel's memory of them.

// The focused pane's folder { cwd, on }; when the focused pane is a mod, the first terminal of
// its tab; in a tab without one, the folder last shown in this space; before any, the space's
// first terminal with a cwd, else space.folder. lastRoot: Map space id → { cwd, on }, the last
// terminal folder shown per space, with its machine: for a tab of mod panes only (a preview
// tab), which has no folder. space.folder is only where the space's first shell started, so
// without it a click on a file would send the tree to another folder. Written here.
export function location({ spaces, panes, focused }, lastRoot) {
  const space = spaces().find((s) => s.active), f = focused();
  let pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  if (pane && !pane.terminal) pane = panes().find((p) => p.tab === pane.tab && p.terminal && p.cwd) ?? null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const cwd = pane?.cwd || f?.cwd;
  if (cwd) { if (space) lastRoot.set(space.id, { cwd, on }); return { cwd, on }; }
  if (!space) return { cwd: null, on };
  const tabs = new Set(space.tabs.map((t) => t.id));
  return lastRoot.get(space.id) ?? { cwd: panes().find((p) => p.terminal && p.cwd && tabs.has(p.tab))?.cwd || space.folder || null, on };
}
