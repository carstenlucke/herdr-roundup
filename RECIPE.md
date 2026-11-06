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
  `Herdr Roundup 0.3.0 · based on Herdr 0.1.13`. On the right, two 26px icon
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

- **Tabs** (42px, drags the window): Herdr's shipped `tabs`.
- **Body** with 8px padding and an 8px gap: the active tab's panes, each one
  rounded 10px on `background` with a 1px `border` (1px `accent` when
  focused), 8px apart, each with Herdr's `pane`
  header (30px, on top, always shown). Terminal padding 14 × 12px.
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
- **Version tooltip:** follows the layout file. After a new release is
  installed, it shows the new version without a restart.

## Built from

**Layout** `layouts/Herdr-Roundup.json`, cloned from Herdr's `main` 0.1.13
(`cloned_from`) with a root `"version"` (`0.3.0`). Root `row` (`titlebar:
"none"`, `traffic_lights: [12, 16]`, `background: "canvas"`,
`terminal_padding: [14, 12]`, divider 1px `border`):

- `sidebar` column (px 268, min 44, max 480, `chrome`, `resizable: false`):
  - `brand` block (px 46, `window_drag`): `roundup-workspace-chrome`
  - `sidebar-lists` column:
    - `spaces` block (weight 1, min 90): `roundup-spaces`
    - `agents` block (weight 1, min 90): shipped `agents`
  - `sidebar-footer` block (px 69): `roundup-workspace-chrome` with
    `props: { footer: true }`
- `work` column (`resizable: false`):
  - `tabs` block (px 42, `window_drag`): shipped `tabs`
  - `work-body` row (padding 8, gap 8):
    - `main` block: `tab: "active"`, `pane: { gap 8, radius 10, background
      "background", lone: true, border 1 "border", focus 1 "accent",
      header { mod "pane", height 30, top, reveal "always" } }`
    - `panel` column (hidden, px 368, min 280, max 900) → `panel-body`
      stack (active `files`): shipped `files`, shipped `changes`
  - `status` block (px 28): shipped `workspace-status`

The only difference from `main` is that `brand`, `sidebar-footer` and
`spaces` point at the two `roundup-` mods.

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

**Shipped mods used:** `agents`, `tabs`, `pane`, `files`, `changes`,
`workspace-status`, plus `picker`, `menu` and `machine-add` as overlays.

**Keys:** `keys.json` has an empty `layout:Herdr-Roundup` section.

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
- **Mods can't import from each other:** `find()` and `narrow()` are copied
  into both mods.
- **Install by copying, not symlinking:** Herdr App doesn't load a mod's own
  SVGs through a symlink.

## Done when

- `herdr-app check` passes for both `roundup-` mods, `herdr-app status`
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
- In a light and a dark theme, every avatar's letter and every badge count
  can be read.
