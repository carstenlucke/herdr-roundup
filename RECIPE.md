# Herdr-Roundup

Herdr's default window, made quieter and more informative about where each
space stands. On the left a sidebar with the Herdr Roundup name and its
three-sheep logo, the spaces list and the agents list. Each space shows a
softly tinted initial, its name and, under it, its repo, branch,
ahead/behind and uncommitted changes, plus a badge with the number of agents
running in it. A repo and its worktrees sit together on one card. On the
right, the terminals of the active tab in rounded panes, with tabs above and
a status bar below. Built for light and dark themes alike.

![Herdr-Roundup](preview.png)

## What you see

Left to right, the window is a row on the theme's `canvas`, with no system
titlebar (on macOS the traffic lights sit at 12, 16 px) and 1px dividers in
`border`.

**Sidebar** (268px wide, `chrome` background; narrows to a rail of 44px, 76px
on macOS, and can be dragged between 44 and 480px). Top to bottom:

- **Brand row** (46px, drags the window). On macOS, 76px of space on the
  left for the traffic lights, then a 20px logo (three black sheep on a light
  ground, corners rounded 5px) and **Herdr Roundup** in semibold `foreground`
  at 13.5px. Hovering the logo or name shows a tooltip such as
  `Herdr Roundup 0.4.0 · based on Herdr 0.1.13`. On the right, two 26px icon
  buttons in `muted`: search (opens the space picker) and sidebar toggle. On
  the rail the logo, name and search go away; on the macOS rail the toggle
  goes too.
- **Spaces** (half of the remaining height, at least 90px):
  - Header row 31px: "Spaces" in `dim` at 11.5px and a `+` button that makes
    a new space.
  - One row per space, 8px rounded, `selected` background when active,
    `hover` otherwise. Left: a 22px square avatar, rounded 6px, with the
    space name's first letter in bold 11.5px. Letter and background are the
    space's color (a theme name `ansi1`..`ansi6`, or a hex), the background at
    14% opacity in light themes (`24` alpha) and 18% in dark ones (`2e`). Then
    the name in medium `foreground`, truncated.
  - The **git line** under the name, in `dim` at 11.5px: a branch icon, then
    `repo · branch`, then `↑2` `↓1` in `muted`, then `±3` (hover: "3
    uncommitted changes"). The repo is left out when the space has the repo's
    name, and in a worktree row. The branch is left out when the space has the
    branch's name, and when it is `main` or `master`. A row with a git line is
    44px high, one without it 32px. A space that isn't in a repo, or is clean
    on main under its repo's name, has no git line.
  - An **agent badge** on the right when agents run in the space: an 18px
    pill, rounded 9px, with a small robot icon and the count in semibold 11px.
  - **Worktrees** of one repo share a card: 1px `border`, rounded 10px, 3px
    padding, 6px apart from the rows around it. Each worktree row is indented
    12px and has a branch icon in `dim` where the avatar would be. A space in
    the repo's main checkout heads the card. Without one (Herdr makes each
    worktree its own space, so this is the usual case), a 24px header heads
    it: a folder icon in `dim` and the repo's name in medium `muted` 11.5px.
    A single worktree whose main checkout has no space is an ordinary row
    with an avatar and no card.
  - Once a remote machine is known, spaces are grouped under a header per
    machine (26px, `dim` 11px): a monitor or server icon, "This computer" or
    the machine's name, its state when not connected, `+` (a new space
    there), a green (`ansi2`) or gray dot, and a fold chevron. An empty
    machine shows "New space there"; one still loading, "Loading…".
  - On the rail a space is a 26px row with its number and a glyph: `●` in
    the status color when an agent there is blocked or done, else `·`.
- **Agents** (Herdr's shipped `agents` list, the other half, at least 90px).
- **Footer** (69px, `border` line on top): "Settings" (with a small `accent`
  dot when an app update is ready) and "Add machine" in `dim`, each with a
  14px icon; on the rail only the icons.

**Work area**, top to bottom:

- **Tabs** (42px, drags the window): Herdr's tab bar, as `roundup-tabs`.
  Right-clicking a tab shows Rename, New tab and Close, then "Ask before
  closing a tab" with three choices, a check in `accent` on the chosen one:
  Never, While an agent works, Always.
- **Body** with 8px padding and an 8px gap: the active tab's panes, each one
  rounded 10px on `background` with a 1px `border` (1px `accent` when
  focused), 8px apart, each with a `roundup-pane`
  header (30px, on top, always shown): the program's icon, the pane's name
  (`foreground`, medium), its id in a small mono chip (10.5px, `dim` on
  `hover`: the terminal's address such as `t5j`, or a mod pane's id shortened
  to `p` and 6 hex digits), the folder in `dim`, the agent's status, and on
  hover the buttons rename, split right, split down, zoom and close. Terminal padding 14 × 12px.
  Right-clicking a terminal shows Herdr's pane menu (Split right, Split
  down, Zoom, where right-clicks go, Close pane), then "Ask before closing
  a pane" with the same three choices, for panes only.
- **Side panel** on the right, hidden at first (368px, 280–900px): a stack
  of Herdr's `files` and `changes`.
- **Status bar** (28px): Herdr's shipped `workspace-status`.

## How it behaves

- **Agent badge:** gray (`dim` on `selected`) while every agent in the space
  is idle. Otherwise it takes the color of the most urgent one, ranked
  blocked > done > working: text in `blocked`, `done` or `working`, the
  background the same color at about 15% opacity. The tooltip counts them,
  most urgent first: "3 agents: 1 blocked, 2 idle".
- **On the rail** a space speaks up only when it needs you: `●` for blocked
  or done, `·` otherwise.
- **Click** a space to switch to it. **Right-click** opens Herdr's space
  menu. **Drag** a space onto another one of the same machine to move it
  there; the dragged row fades to half and a 2px `accent` bar marks where it
  lands. Dragging a card's top row, or the repo name heading a card without
  a main-checkout space, moves the whole card (the card fades instead); any
  other worktree moves within its card and snaps back if dragged out.
- **New spaces** get the color used least among the six (`ansi6`, `ansi3`,
  `ansi4`, `ansi5`, `ansi2`, `ansi1`). The home space `~` gets none and shows
  `ansi6`. A new space waits up to 1.5s for its git, so a worktree appears
  on its repo's card instead of jumping there.
- **At start** the list waits up to 1.5s for the git of every space already
  there ("Loading…" meanwhile), then shows them all at once, already on
  their cards. It reorders nothing before that
  (`docs/adr/0001-first-draw-waits-for-git.md`).
- **The git line refreshes** when something under a local repo's `.git`
  changes (a commit, a checkout, a fetch), when a command or an agent's turn
  in that space ends, when a space's terminal moves to another folder, when a
  remote machine comes back, when the window comes back to the front, and
  while the window is in front every 10s for the active space, every 60s for
  the others. A commit refreshes every space of the same repo. An agent's
  turn counts by its `turn` number, so a turn too short to be seen working
  still refreshes; a shell reports no command end, so a quick command there
  (`echo x >> file`) shows within 10s.
- **Machine headers:** click to fold or unfold. A machine that was rebuilt or
  replaced shows "rebuilt · Connect"; Connect removes it and adds it again
  under the same name.
- **Sidebar toggle:** narrows the sidebar to the rail and widens it back to
  the width it had. Below 160px the sidebar counts as the rail, however it
  got there. On the macOS rail the agents list's `»` unfolds it.
- **Pane header:** double-click the id chip to copy the id (a mod pane's
  whole id) to the clipboard; the chip shows "copied" in `accent` for 1.2s.
  Double-click the name, or click the pencil, to rename the pane in a dialog
  (Enter saves, Esc cancels). An empty name goes back to the program's name.
  A click anywhere else on the header focuses the pane. Tooltips: the id
  chip shows the whole id, the name shows the given and the program's name.
- **Closing a tab** (its ×, its menu's Close, `cmd-w`) **or a pane** (its
  header's ×, Close pane in the terminal's menu, `cmd-shift-w`) asks first
  as that kind's choice says: tabs as the tab menu's, panes as the
  terminal menu's. A tab's only pane closes the tab, so it follows the
  choice for tabs: a pane's × never ends a tab more quietly than `cmd-w`
  would. Never: it closes
  at once, and the last tab takes its space with it unasked. While an agent
  works (the default): it asks while an agent in the tab (or pane, with its
  sub-agents) is working or blocked ("Claude Code is still running in it.
  Closing ends it."), otherwise Herdr's own close runs, which asks "Close
  space?" before a space's last tab goes. Always: it asks every time. A
  tab's only pane closes the tab, and the question says so ("It's the tab's
  only pane, so the tab closes too."), as it says when the space closes too.
  The choice stays after a restart.
- **The question** has Cancel and Confirm, and Cancel holds the keyboard
  when it opens (a 2px `accent` ring around it): Enter cancels, so a second
  `cmd-w` or Enter too many closes nothing. Tab and Shift-Tab move between
  the two, Enter or Space presses the one with the ring, Esc cancels.
- **Version tooltip:** follows the layout file. After a new release is
  installed, it shows the new version without a restart.

## Built from

**Layout** `layouts/Herdr-Roundup.json`, cloned from Herdr's `main` 0.1.13
(`cloned_from`) with a root `"version"` (`0.5.0`). Root `row` (`titlebar:
"none"`, `traffic_lights: [12, 16]`, `background: "canvas"`,
`terminal_padding: [14, 12]`, `terminal_menu: "roundup-pane"`, divider 1px
`border`):

- `sidebar` column (px 268, min 44, max 480, `chrome`, `resizable: false`):
  - `brand` block (px 46, `window_drag`): `roundup-workspace-chrome`
  - `sidebar-lists` column:
    - `spaces` block (weight 1, min 90): `roundup-spaces`
    - `agents` block (weight 1, min 90): shipped `agents`
  - `sidebar-footer` block (px 69): `roundup-workspace-chrome` with
    `props: { footer: true }`
- `work` column (`resizable: false`):
  - `tabs` block (px 42, `window_drag`): `roundup-tabs`
  - `work-body` row (padding 8, gap 8):
    - `main` block: `tab: "active"`, `pane: { gap 8, radius 10, background
      "background", lone: true, border 1 "border", focus 1 "accent",
      header { mod "roundup-pane", height 30, top, reveal "always" } }`
    - `panel` column (hidden, px 368, min 280, max 900) → `panel-body`
      stack (active `files`): shipped `files`, shipped `changes`
  - `status` block (px 28): shipped `workspace-status`

The only difference from `main` is that `brand`, `sidebar-footer`,
`spaces`, `tabs` and the pane header point at the `roundup-` mods.

**`roundup-workspace-chrome`** (clone of `workspace-chrome` 0.1.13, `place:
"none"`). Two looks by `props().footer`. The brand row reads the layout's own
file with `readTextFile(appHome() + "/layouts/" + shared("layout") +
".json")`, because `layout()` leaves out the root's `version`. It re-reads
the file when `watchFolder(appHome() + "/layouts")` reports that file (it
ignores `layouts/.state/`). Search runs `mod.open {name: "picker"}`. The
toggle stores the width in shared `sidebar.width`, sets
`sidebar.collapsed`, and runs `layout.resize {id: "sidebar", px}`. Footer:
`app.settings`, `mod.open {name: "machine-add"}`, `updates().app.ready`. Its
own art: `logo.png` (160×160, three black sheep), `search.svg`,
`sidebar.svg`, `settings.svg`, `plus.svg`.

**`roundup-pane`** (clone of `pane` 0.1.13, `place: "none"`, title "Pane
header"). One copy per pane, with `props()` `{pane, terminal}`; it finds its
pane in `panes()`. herdr-core can't rename a running terminal (`hc run
--name` only at start), so a terminal pane's name is its core label
`roundup-pane.name`, read from `terminals()[i].labels` and written with
`hc(["label", terminal, "roundup-pane.name=<name>"])` (`…=` removes it). A mod
pane has no terminal: its name is in shared `roundup-pane.names` (pane id →
name). See `docs/adr/0002-pane-names-in-core-labels.md`. The id chip copies
with `cx.write_to_clipboard` on `click_count === 2`. The rename dialog is the
same mod, opened with `openOverlay({ mod: "roundup-pane", kind: "dialog",
width: 380, height: 196, props: { rename: { pane, terminal, value, fallback }
} })`; it is shaped like Herdr's `prompt`. It is also the layout's
`terminal_menu`: a popup (`mod.json` `overlay` 240×296) with `props()`
`{tab: "pane", target: {pane, terminal}, overlay}`, Herdr's pane menu item
for item, drawn by `menu.js`. Closing goes through `closePane(pane, name)`
from `close.js` (see `roundup-tabs`): a tab's only pane runs `tab.close`,
another `pane.close`. Its key command `close` reaches every shown header;
only the copy whose pane is `focused().pane` acts. Commands: `pane.focus`,
`pane.split`, `pane.zoom`, `pane.close`, `tab.close`,
`terminal.right_click`, `terminal.park`. Its own art: `rename.svg` (a
pencil) and the shipped header's `split-right`, `split-down`, `zoom`,
`unzoom`, `close`; the working spinner is Herdr's
`mods/workspace-chrome/spinner.svg`.

**`roundup-spaces`** (clone of `spaces` 0.1.13, `place: "none"`, title
"Spaces"). Reads `spaces()`, `panes()`, `terminals()` (each agent's `turn`),
`agents()`, `machines()`, `theme()`,
`settings().dark`, `window()?.active` and shared `space.colors` (shared with
Herdr's mods; it fills in colors for new spaces and drops those of deleted
ones). A space's place is its first terminal's `cwd`, else the space's
`folder`, on its `machine`. For each place it runs, through `exec` (on the
space's machine):

- `git --no-optional-locks -c core.fsmonitor=false status --porcelain=v2
  --branch`: branch (`# branch.head`), ahead/behind (`# branch.ab`),
  uncommitted changes (lines starting with `1`, `2`, `u` or `?`)
- `git rev-parse --show-toplevel --path-format=absolute --git-common-dir`
  (one process): the repo's name, and whether this is a linked worktree. A
  git before 2.31 echoes the unknown `--path-format` and answers a relative
  `.git`; then the checkout counts as its own repo, never as a worktree

It watches each local repo's git folder with `watchFolder` and polls every
250ms for what is due. Through `hc` it runs `machine ls --json`, and for
Connect, `machine rm` and `machine add`. Commands: `space.select`,
`space.move`, `space.new`. Menu: `openOverlay({ mod: "menu", kind: "popup",
props: { tab: "space", target: { id } } })`. `localStorage` keeps
`machines.folded` and `machines.reconnecting`. Its own art: `bot.svg` (a
robot head in `currentColor`). It also draws icons from Herdr's shipped
`mods/workspace-chrome/` folder: `branch`, `plus`, `monitor`, `server`,
`chevron-down`, `chevron-right`, `folder`.

**`roundup-tabs`** (clone of `tabs` 0.1.13, `place: "none"`, title "Tabs").
Herdr's tab bar, except how a tab closes (`close.js`). The choice for tabs is
shared `roundup-tabs.confirm-close`, for panes `roundup-pane.confirm-close`:
`never`, `agents` (also when unset) or `always`; a tab's only pane goes by
the one for tabs. A tab's busy agents are `agents()` with its `tab` and status
`working` or `blocked`. Asking opens `roundup-confirm` as a dialog (400×170)
with `command: { name: "tab.close", args: { id, confirmed: true } }`; not
asking runs `tab.close {id, confirmed: true}` (never) or `tab.close {id}`
(agents). A tab's right-click menu is the mod itself as a popup (220×237,
`props: { menu: { id, space } }`), not Herdr's `menu`, whose Close would run
`tab.close` past the choice; `menu.js` draws it like Herdr's. Its key
commands: `close` (the shown tab) and `close:<id>`. `close.js` and `menu.js`
are copied as-is into `roundup-pane`.

**`roundup-confirm`** (clone of `confirm` 0.1.13, `place: "none"`). Herdr's
question dialog, props `{ title, detail, command: { name, args } }`; Confirm
runs `command`. Each button tracks its own focus handle with `tab_index(0)`;
the dialog keeps which one is chosen (Cancel in `init`), moves it on Tab and
Shift-Tab, focuses its handle and draws the ring on it. Herdr's own questions ("Close space?") still use
the shipped `confirm`.

**Shipped mods used:** `agents`, `files`, `changes`,
`workspace-status`, plus `picker`, `menu` and `machine-add` as overlays.

**Keys:** the `layout:Herdr-Roundup` section binds `cmd-w` to
`roundup-tabs.close` and `cmd-shift-w` to `roundup-pane.close`, in place of
global `tab.close` and `pane.close`.

## Watch out

- **Name:** the layout file must be `Herdr-Roundup.json`. Settings shows the
  file name, and a name with a space can't be switched to. Mod folders keep
  the `roundup-` prefix, because a folder's name is the mod's identity.
- **Block ids** must stay unique; a duplicate crashes Herdr App.
- **Programs and files:** `roundup-spaces` runs `git` in every space's
  folder, on remote machines too, and runs `hc`. `roundup-workspace-chrome`
  reads the layout's file outside its own folder. Neither reaches the
  network itself (`machine add` connects to a machine you already had).
- **`git status` must not write under `.git`**: without
  `--no-optional-locks` and `core.fsmonitor=false`, each status touches the
  index or an fsmonitor cookie, which wakes the watch, which runs status
  again, forever.
- **Don't watch working trees for `±n`:** on macOS `watchFolder` is
  recursive, ignored folders included, so build output and `node_modules`
  would fire it constantly. That is why `±n` refreshes when a turn ends,
  every 10s in the active space and when the window comes back to the front,
  not on every save.
- **`window()` can be `null`** (for instance under `herdr-app check`): read
  it with `?.`, and not in `init`.
- **Colors** are theme names, not hex, so the layout works light and dark.
  `alpha()` adds transparency only to hex (`#rgb`, `#rrggbb`, `#rrggbbaa`)
  and returns null for anything else; then the avatar and the badge sit on
  `selected`, so a letter is never drawn on its own color.
- **Known gap:** Herdr's shipped `picker` still turns `ansi1`..`ansi6` into
  fixed hex colors, so a space's color in the picker can differ from its
  avatar in the sidebar.
- **Pane names don't reach Herdr's other lists:** the shipped `agents` list
  and the tab bar (`roundup-tabs`) still show the program's or the tab's name; only the pane
  header reads `roundup-pane.name`. A name ends with its terminal.
- **A double-click is two clicks:** the first one of a double-click on the
  name or the id still focuses the pane; only `click_count === 2` acts.
- **Herdr's `tab.close` asks only before a space's last tab goes**, and
  Herdr's Settings have no switch for it nor room for a mod's. So the choice
  sits in the tab's own menu, and every way this layout closes a tab goes
  through `roundup-tabs` or `roundup-pane`. Not covered: the command
  palette's `tab.close` and `pane.close`.
- **`pane.close` has no `confirmed`**, and on a space's last pane Herdr asks
  anyway. So a tab's only pane closes with `tab.close`, which takes it.
- **Mods can't import from each other:** `find()` and `narrow()` are copied
  into both chrome mods, and `close.js` and `menu.js` into `roundup-tabs`
  and `roundup-pane`. `scripts/sync.sh` stops when the two copies differ.
- **Tab doesn't move a dialog's keyboard by itself:** with two `tab_index`
  buttons, Tab left the keyboard where it was. The dialog hears Tab go down
  and moves it itself (`stop_propagation`).
- **Install by copying, not symlinking:** Herdr App doesn't load a mod's own
  SVGs through a symlink.

## Done when

- `herdr-app check` passes for every `roundup-` mod, `herdr-app status`
  shows no errors, and `layout.switch {"name": "Herdr-Roundup"}` shows the
  window.
- The top left shows the sheep logo and "Herdr Roundup", and hovering it
  shows `Herdr Roundup <version> · based on Herdr 0.1.13`.
- A space in a repo whose name differs from the space, on branch `feat/x`,
  shows `repo · feat/x` under its name in a 44px row. A space named after its
  repo, clean on `main`, is a single 32px row.
- Editing a file in that space's terminal shows `±1` within 10s (at once
  after an agent's turn or a longer command); editing it in an outside
  editor shows `±1` when you switch back to Herdr.
- With two worktree spaces of one repo and no space in its main checkout,
  both sit on one card under a header with the repo's name, each with a
  branch icon instead of an avatar. Opening a space in the main checkout
  puts that space at the top of the card instead of the header.
- Starting an agent in a space shows a badge with `1`: gray while it is
  idle, in `working` while it works, in `blocked` while it waits for you.
- The sidebar toggle narrows to the rail (numbers and `●`/`·`) and widens
  back to the width it had.
- Every pane header shows its terminal's address (`t5j`); double-clicking it
  puts `t5j` on the clipboard. `hc label t5j roundup-pane.name=Build` shows
  "Build" in that header within a second; renaming in the dialog does the
  same, and saving an empty name shows the program's name again.
- With "While an agent works", `cmd-w` on a tab whose agent is working asks
  "Close tab …?" and Cancel keeps it; on a tab with only a shell it closes
  at once. With "Always" the shell's tab asks too; with "Never" neither
  asks.
- With "While an agent works" for panes, in a tab split into an agent and a
  shell, `cmd-shift-w` on the working agent's pane asks "Close pane …?", on
  the shell's closes it at once. With "Never" for panes and "Always" for
  tabs, a tab's only pane still asks. On a
  space's last pane the question adds that the space closes too. Right-
  clicking a terminal shows Close pane and "Ask before closing a pane";
  choosing there leaves the tab menu's choice as it was.
- In the question, Enter right away cancels; Tab, then Enter closes.
- In a light and a dark theme, every avatar's letter and every badge count
  can be read.
