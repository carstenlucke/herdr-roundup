# Herdr-Roundup

Herdr's default window, quieter and more telling. Panes carry names you
give them. Files open in a floating preview or a tab of their own:
Markdown rendered, code, CSV, JSON, pictures and PDFs. A files panel shows
Symbols icons and git state, filters to the changed files and searches
folders not yet opened. Every space shows its repo, branch, ahead/behind,
changes and how many agents run in it; hovering that count shows them by
tab with a map of each tab's panes, a click goes to one. A repo's worktrees
share a card.
Closing a tab or pane asks first while an agent works, and a new release
installs through an agent. Light and dark themes alike.

![Herdr-Roundup: name, claim and main features beside the window, with Claude Code working beside Codex (done) and a shell, their space's agent card open, and a README in the floating preview](preview.png)

## What you see

Left to right, the window is a row on the theme's `canvas`, with no system
titlebar (on macOS the traffic lights sit at 12, 16 px) and 1px dividers in
`border`.

**Sidebar** (268px wide, `chrome` background; narrows to a rail of 44px, 76px
on macOS, and can be dragged between 44 and 480px). Top to bottom:

- **Brand row** (46px, drags the window). On macOS, 76px left free for the
  traffic lights, then a 20px logo (three black sheep on a light ground,
  rounded 5px) and two lines: **Herdr Roundup** in semibold `foreground`
  13px (16px line), under it at 11px (14px line) the installed version
  (`0.7.0`) in `dim`. With a newer release out and not skipped, the second
  line reads `0.8.0 available` in `accent`, and a 10px `accent` point with a
  2px `chrome` ring sits on the logo's top right (3px out). During a check:
  `0.7.0 · checking…`; before the layout's file is read, no second line.
  Logo and name sit on a 36px area, rounded 8px, `hover` under the pointer,
  with a hand cursor. On the right two 26px icon buttons in `muted`: search
  (the space picker) and sidebar toggle. The rail drops logo, name and
  search; the macOS rail the toggle too.
- **Details card** (hover over logo or name, after 500ms): 236px wide, 12px
  padding, `popover`, 1px `border`, radius 10, large shadow, 4px under the
  row. "Herdr Roundup" semibold 13px, then four 12px lines, label `dim`
  left, value `foreground` right: Installed `0.7.0`, Based on `Herdr
  0.1.14`, Latest `0.8.0` (`accent` when newer, `0.8.0 · skipped` when
  skipped), Checked `today 09:12` / `yesterday 18:40` / `Nov 3 09:12`
  (Latest and Checked `–` before the first answer). Only when there is
  something to say, a status line at 11.5px with a 12px icon: a spinner and
  "Checking for updates…" in `muted`, or a circled `!` and "Couldn't check:
  <reason>" in `working` (wrapping). Last, under a 1px `border` line,
  "Click the Roundup title for update options" at 11.5px, `dim`, `accent`
  when an update is available.
- **Spaces** (half of the remaining height, at least 90px):
  - Header row 31px: "Spaces" in `dim` 11.5px and a `+` (new space).
  - One row per space, rounded 8px, `selected` when active, `hover`
    otherwise: a 22px avatar, rounded 6px, with the name's first letter in
    bold 11.5px. Letter and background take the space's color (`ansi1`..
    `ansi6` or a hex), the background at 14% opacity in light themes (`24`
    alpha), 18% in dark (`2e`). Then the name in medium `foreground`,
    truncated.
  - The **git line** under the name, `dim` 11.5px: a branch icon, `repo ·
    branch`, `↑2` `↓1` in `muted`, `±3` (hover: "3 uncommitted changes").
    The repo is left out when the space has its name, and in a worktree
    row; the branch when the space has its name, or it is `main` or
    `master`. A row with a git line is 44px, without 32px. A space outside a
    repo, or clean on main under its repo's name, has none.
  - An **agent badge** on the right while agents run in the space: an 18px
    pill, rounded 9px, a small robot icon and the count in semibold 11px.
  - With two or more agents, hovering the badge shows the **agent
    quicklook**: a card (`popover`, 1px `border`, rounded 10px, large
    shadow, 6px padding) 330px wide, scrolling past 360px. Agents grouped by
    tab in tab order, each tab under a `dim` 11px header: its number in
    semibold `muted`, its name if it has one. A row (26px, 12px): a 7px
    status dot (idle: a ring in `idle`), the program's 14px icon, the
    terminal's title (else the program's name), truncated, and right the
    status word in 11px in the status color ("needs you", "done",
    "working"; "idle" in `dim`). Beside a tab's rows a **pane map**,
    60×40px (2px padding, 1px `border`, rounded 5px): the tab's panes split
    as they are, in proportion, 2px apart; an agent's pane in its status
    color, other terminals `selected`, a mod pane a `selected` outline.
    Without maps the card is 286px wide.
  - **Worktrees** of one repo share a card: 1px `border`, rounded 10px, 3px
    padding, 6px from the rows around. Worktree rows are indented 12px, with
    a `dim` branch icon for an avatar. A space in the repo's main checkout
    heads the card; without one (the usual case) a 24px header does: a
    `dim` folder icon and the repo's name in medium `muted` 11.5px. A single
    worktree without a main-checkout space is an ordinary row.
  - Once a remote machine is known, spaces group under a header per machine
    (26px, `dim` 11px): a monitor or server icon, "This computer" or the
    machine's name, its state when not connected, `+` (new space there), a
    green (`ansi2`) or gray dot, a fold chevron. An empty machine shows "New
    space there"; one loading, "Loading…".
  - On the rail every item sits centred in a 32px cell, rounded 6px. A
    space is a 26px cell (`selected` when active, else `hover`) with its
    number centred in the left 18px and, 3px from the right edge, `●` in
    the status color when an agent there is blocked or done, else `·`; 9 and
    10 stand in one column, clear of the mark. A machine header is its icon
    alone, 4px down, with a 6px dot (green or gray, `chrome` ring, `blocked`
    after a failed Connect) at its lower right for a remote machine, name
    and state as tooltip; "New space there" is a `+` in an 18px box with a
    1px `dim` border.
- **Agents** (Herdr's shipped `agents` list, the other half, at least 90px).
- **Footer** (69px, `border` line on top): "Settings" (a small `accent` dot
  when an app update is ready) and "Add machine" in `dim`, each with a 14px
  icon; on the rail only the icons, centred in 32px cells, label as
  tooltip, the dot on the Settings icon's top right.

**Work area**, top to bottom:

- **Tabs** (42px, drags the window): Herdr's tab bar, as `roundup-tabs`.
  Right-clicking a tab shows Rename, New tab and Close, then "Ask before
  closing a tab" with Never, While an agent works and Always, an `accent`
  check on the chosen one.
- **Body** (8px padding, 8px gap): the active tab's panes, 8px apart, each
  rounded 10px on `background` with a 1px `border` (`accent` when focused)
  and a `roundup-pane` header (30px, on top, always shown): the program's
  icon, the pane's name (medium `foreground`), its id in a small mono chip
  (10.5px, `dim` on `hover`: a terminal's address such as `t5j`, or a mod
  pane's id shortened to `p` and 6 hex digits), the folder in `dim`, the
  agent's status, and on hover rename, split right, split down, zoom and
  close. Terminal padding 14 × 12px. Right-clicking a terminal shows Herdr's
  pane menu (Split right, Split down, Zoom, where right-clicks go, Close
  pane), then "Ask before closing a pane" with the same three choices. A
  terminal outside a tab has no pane: its menu leaves out Split, Zoom and
  Close pane.
- **Side panel** on the right, hidden at first (368px, 280–900px): a stack
  of `roundup-files` and Herdr's `changes`, picked with the Files and
  Changes buttons at the right of the tab bar. `roundup-files` is a card
  (radius 10, 1px `border`, `background`), top to bottom:
  - **Header** (42px): "Files" in semibold, a switch **All | Changed** (24px,
    `raised` behind, the chosen one on `background`; Changed carries the
    number of entries `git status` lists), and right the folder's name in
    `dim` with Symbols' root-folder icon. While a file previews: a back
    arrow, the file's icon and its path.
  - **Branch row** (46px): a branch glyph, the branch in medium, `↑ahead`
    `↓behind` in `muted`, "upstream gone" when its upstream was deleted,
    "clean" or the lines changed against `HEAD` (`+N` `ansi2`, `−N`
    `ansi1`); under it a 4px bar of modified (`ansi3`), new (`ansi2`) and
    deleted (`ansi1`) paths by count, the counts at its right. Outside a
    repo: "Not a git repository"; when status fails: "Git can't read this
    folder"; before git answers: "Reading git…".
  - **Search field** (28px, `canvas`, `border`, `accent` while typing):
    "Search files". In All, inside a repo, outside ignored folders and where
    search can read the disk, a 20px switch at its right end, the branch
    glyph: lit (`accent` on `raised`) while search reads git's files, `dim`
    while it reads the disk.
  - **Tree** (26px rows, 14px indent per level): a chevron for folders, a
    16px Symbols icon (one set for light and dark; an open folder keeps its
    icon), the name, the git marks. Names take their status color: new or
    added `ansi2`, modified `ansi3`, deleted or conflicted `ansi1`, renamed
    `ansi4`; ignored paths `dim` with a half-faded icon. Files end with `+N
    −N` and their letter (`?`, `A`, `M`, `D`, `U`, `R`, `T`) in a 12px
    column; folders show a colored dot and count for each of new, modified
    and deleted below them, and from 360px of width their `+N −N`. A symlink
    read from disk has its name in italics and a 14px `accent` arrow (Lucide
    `arrow-up-right`, stroke 2.5) after it, hover "Link to <target>"; a
    broken one has a `dim` name, a half-faded icon, the arrow in `ansi1` and
    "Broken link to <target>"; one whose target can't be checked (no access)
    shows as a link with "(no access to check it)". `roundup-files` brings
    `fonts/Geist-Italic.ttf` (Geist 1.8.2, OFL), as Herdr's Geist has no
    italic. Selected row `selected`, hovered `hover`.
  - **Footer** (only when needed, 11px `dim`): "Folders show their first 500
    entries", "First 200 matches", "Changed shows the first 2,000 paths",
    "Search covers the first 40,000 files" (or "the first 20,000 folders").
- **Preview tab** (`roundup-preview`, opened from a file in `roundup-files`):
  a tab named after the file, one pane on `background`, 13px text. A 42px
  header over a 1px `border` line: ← (only after following a link), the
  file name in semibold, its folder and size in 12px `dim`, the viewer's
  controls on the right, then ⋯. Below, the file by extension: Markdown
  rendered in a column up to 920px (local images inline, a 240px ToC,
  Preview | Raw); PDF pages on `canvas` with ‹ N / M ›, Go to and − Fit +;
  images fitted on `canvas` with their pixel size and − Fit +; CSV and TSV
  as a table with a fixed header, row numbers and Table | Raw; JSON as a
  tree (keys `ansi4`, strings `ansi2`, numbers `ansi1`, true/false/null
  `ansi6`) with Tree | Raw; anything else as read-only code. "Loading…" in
  `dim` while it loads, an error in `ansi1`.
- **Status bar** (28px): Herdr's shipped `workspace-status`.

## How it behaves

- **Agent badge:** gray (`dim` on `selected`) while every agent in the space
  is idle, else in the color of the most urgent (blocked > done > working):
  text in `blocked`, `done` or `working`, background the same at about 15%.
  Tooltip, most urgent first: "3 agents: 1 blocked, 2 idle"; with two or
  more agents the quicklook takes its place. With one agent a click goes to
  its pane; with more it switches to the space, as the row does.
- **Agent quicklook:** opens after 400ms on the badge and stays while the
  pointer is on badge or card (150ms to cross). It reads the pane maps only
  after 300ms of rest on the badge, so a pointer passing by reads nothing;
  200ms after leaving both, the card is forgotten. Rows always come from
  the space's agents; the read tree only orders them within a tab and gives
  the tab its map, when every agent of that tab is in its tree. Otherwise
  that tab has no map and keeps the order of `agents()`; no hint, no error.
  Terminal titles lose only a program's mark in front (a Braille spinner,
  or one of Claude Code's `✳ ✻ ✽ ✶ ✢ ·`, with its space). Hovering a row
  lights its pane in the map (full color, `foreground` outline; the others
  at 45%). A click on a row or an agent's pane goes there, space and tab
  with it, and empties the card until the badge is entered again. The card
  is empty while the space menu is open and during a space drag. Not on
  the rail.
- **Badge presses** start no space drag; a drag of another row let go on the
  badge still drops there.
- **Click** a space to switch to it, **right-click** for Herdr's space menu.
  **Drag** a space onto another of the same machine to move it: the row
  fades to half, a 2px `accent` bar marks where it lands. Dragging a card's
  top row (or its repo header) moves the whole card; any other worktree
  moves within its card and snaps back if dragged out.
- **New spaces** get the color used least among `ansi6`, `ansi3`, `ansi4`,
  `ansi5`, `ansi2`, `ansi1`; the home space `~` gets none and shows `ansi6`.
  A new space waits up to 1.5s for its git, so a worktree appears on its
  card instead of jumping there. **At start** the list waits up to 1.5s for
  every space's git ("Loading…"), then shows them all at once.
- **The git line refreshes** when something under a local repo's `.git`
  changes, when a command or an agent's turn in that space ends (by its
  `turn` number, so a very short turn counts), when a terminal changes
  folder, when a remote machine comes back, when the window comes to the
  front, and while in front every 10s for the active space, 60s for the
  others. A commit refreshes every space of its repo.
- **Machine headers:** click to fold or unfold; folds stay after a restart.
  A rebuilt or replaced machine shows "rebuilt · Connect" and its old
  spaces aren't listed; Connect removes it and adds it again under the same
  name. On the rail a click on its icon connects instead of folding, the
  tooltip saying "<name> · rebuilt", "connecting…" or the error.
- **Sidebar toggle:** narrows to the rail and widens back to the width it
  had. Below 160px the sidebar counts as the rail. On the macOS rail the
  agents list's `»` unfolds it.
- **Pane header:** double-click the id chip to copy the id (a mod pane's
  whole id); the chip shows "copied" in `accent` for 1.2s. Double-click the
  name, or click the pencil, to rename the pane in a dialog (Enter saves,
  Esc cancels); an empty name goes back to the program's. A click elsewhere
  focuses the pane. Tooltips: the whole id on the chip, the given and the
  program's name on the name.
- **Closing** asks first as its kind's choice says: the tab menu's for tabs,
  the terminal menu's for panes; both stay after a restart. A tab closes by
  its ×, its menu's Close or `cmd-w`; a pane by its header's ×, Close pane
  or `cmd-shift-w`. A tab's only pane closes the tab, so it follows the
  choice for tabs.
  - **Never:** closes at once; the last tab takes its space unasked.
  - **While an agent works** (the default): asks while an agent in the tab
    (or the pane, with its sub-agents) is working or blocked ("Claude Code
    is still running in it. Closing ends it."); otherwise Herdr's own close
    runs, which asks "Close space?" before a space's last tab goes.
  - **Always:** asks every time.

  The question also says when the tab or the space closes too.
- **The question** has Cancel and Confirm. Cancel holds the keyboard (a 2px
  `accent` ring): Enter cancels, so a second `cmd-w` closes nothing. Tab and
  Shift-Tab move the ring, Enter or Space press, Esc cancels.
- **Version** follows the layout file: after an update the new one shows
  without a restart.
- **Update check:** once a day the brand row asks GitHub for the latest
  release (at start, then hourly it looks whether a day has passed). A
  request counts as made before it is sent, so failures and restarts still
  ask at most once a day. The automatic check is quiet: no toast on errors,
  and for a new version exactly one, never for a skipped one: "Herdr
  Roundup 0.8.0 is out" / "You have 0.7.0 · Click to update with an agent"
  (`info`). Clicking it starts the update.
- **Pre-releases:** off by default (only tags without a suffix). With
  **Include pre-releases** on, the newest of all releases counts, alpha,
  beta and rc included (`0.10.0-beta.1`), offered as any update. Versions
  order as SemVer (`0.10.0-alpha.1` < `-beta.1` < `-rc.1` < `0.10.0`), so
  from a beta its release is an update, also with the switch off again. A
  second line too long for the row is cut. Switching during a check throws
  that check's answer away; the switch's own check follows.
- **Click on logo or name** opens the menu (a popup at the pointer, 300px,
  like the tab menus: `popover`, 5px padding, 12.8px). A press that moves
  the window is a drag, not a click; a double-click maximizes. While the
  menu is open, or right after the click, the details card stays away. Top
  to bottom:
  - The card's details (without the hint), a divider.
  - **Check for updates** (refresh icon): asks at once and always answers
    with a toast: the new-version toast (also for a skipped version, which
    it un-skips), "Herdr Roundup is up to date" / "0.7.0 is the latest
    release" (`success`; ", pre-releases included" when on), or "Couldn't
    check for updates" / the reason (`warning`: no connection, rate limit,
    no release yet, a tag that isn't `v1.2.3`).
  - Only with an update available and not skipped: **Update to 0.8.0 with an
    agent…** (bot icon, `accent`), **Release notes 0.8.0** (the release page
    in the browser), **Skip 0.8.0** (point, line and toast stay away until
    a newer version).
  - Divider, heading "Check for updates" (`dim` 11px), **Daily** and **Only
    when I ask**, an `accent` check on the chosen one.
  - Divider, **Include pre-releases**, checked when on. Switching forgets the
    latest release found and checks at once, with a toast.
  - Divider, **Show details on hover**, checked when on (the default).
  - ↑/↓ move, Enter runs, Esc closes. The choices and Check leave the menu
    open, so a choice shows its check at once and a check its answer;
    Update, Release notes and Skip close it.
  - Its size is fixed at the opening: a check under way shows as
    "checking…" in the Checked line, a failure as "failed" (`working`), a
    release found meanwhile in Latest and the toast, not as rows. Update
    rows with nothing on offer any more are `dim` and do nothing.
- **Updating with an agent** opens a tab "Update Herdr Roundup" in a space
  on this computer (the shown one if it is here, else the first here, else
  a new one), in the app's folder, with the first installed agent (most
  picked first) and a brief as its first message: update from v0.7.0 to
  v0.8.0, read AGENTS.md, clone the repo at the tag into a new empty
  folder, read the release notes and README, then tell what changes and
  whether keys in `layout:Herdr-Roundup` or changed `roundup-*` mods would
  be replaced; only after a yes run the clone's `scripts/sync.sh` and check
  `herdr-app status`. The mod never writes the install itself. Without an
  installed agent a `warning` toast says what to tell one's own.
- **The files panel follows the focused pane's folder** (for a mod pane, the
  first terminal of its tab), on its machine. Each folder keeps its open
  folders, selection and preview (the last 50). Files show at once; git
  fills in its marks without moving a row. A local folder refreshes when
  anything under it changes (`watchFolder`), any folder every 10s.
- **All** lists the disk: folders first, natural order ("file2" before
  "file10"), dotfiles included, `.git` left out; folders load when opened.
  **Changed** lists exactly what `git status` lists, the first 2,000 paths,
  as a tree with every folder open: files not on disk struck through with a
  faded icon, an untracked folder or a submodule as one row that opens from
  disk. When the shown folder itself is new to git, Changed says so and
  every row in All shows `?`. The view stays after a restart.
- **Search** (type in the field, or `/`): in All it searches every path
  below the folder, opened or not, and shows the matches as a tree, names
  that match first, at most 200. The switch picks what it reads, and stays
  after a restart:
  - **Git's files** (the default): tracked and new files, without what
    `.gitignore` leaves out, at most 40,000. "No matches · ignored files
    left out" says where else to look. Outside a repo, in an ignored folder
    or where git can't run, it reads the disk instead.
  - **The disk:** everything but the folders `.git`, `node_modules`,
    `target`, `.venv`, `venv`, `__pycache__`, `dist`, `build`, `.next`,
    `.nuxt`, `.cache`, `.gradle`, `.idea`, `vendor`, `Pods`, `.tox`,
    `.mypy_cache`, `.pytest_cache` and `coverage`, ignored files included,
    and `Library`, `AppData` and `.Trash` at the top of home; 12 levels deep
    (5 at home or `/`), at most 20,000 folders and 40,000 other paths. Not
    on Windows yet, nor without `sh`: there it reads git's files and, where
    git has none, says why ("Not a git repository · Search can't read the
    disk on Windows yet").

  Links to folders aren't followed. The index is read on the first search
  and again when a `.gitignore` changes, at 5 minutes old, or when what it
  holds changes: a new path is checked and added on its own, a changed file
  reads it again at most every 30s, a changed folder every 3s. In Changed,
  search filters git's paths. `×` or Esc clears it.
- **Click** a folder to open or close it, a file to select it. A
  **double-click** shows a file in the floating preview, a
  **Cmd-double-click** (Ctrl on Windows and Linux) in a preview tab, closing
  the floating one if it shows that file; a file already open in a tab
  brings that tab to the front. While open, the floating preview follows
  the selection (at once on a click, after 150ms of rest on ↑ ↓). While the
  preview tab shows, the tree keeps the terminal's folder. **Keys**, once
  the panel has the keyboard: ↑ ↓ select, PgUp PgDn Home End jump, → opens
  or steps into a folder, ← closes it or goes to its parent, Space toggles
  the floating preview, Enter opens the preview tab (both toggle a folder),
  `/` goes to search, Esc closes the floating preview, leaves the panel's
  own preview or clears the search; in the field ↑ ↓ move the selection
  and Enter acts on it (on a folder: shows it, search cleared).
- **Right-click** a row (or Menu key, Shift-F10, the `menu` command; ↑ ↓
  Home End pick, Enter runs, Esc or ← closes): Quick look, Open in tab,
  Preview in panel, Open with default app, Reveal in Finder ("Show in
  folder" elsewhere) / Copy relative path, Copy absolute path / Send @path
  to agent. Send types `@path ` into the shown tab's agent (the focused
  pane's, else the tab's focused or first agent), relative to its folder,
  focuses it, and after 600ms puts the clipboard back if it still holds
  the path (text only); with no agent: "No agent in this tab". On another
  machine Open and Reveal are left out; for a deleted file all but the
  copy and send items.
- **Floating preview:** the preview tab's view in a window over the layout,
  60% × 75% of the window, centered the first time, then where it was
  dropped. Its header drags it. Beside ⋯: Open in tab (then the window
  closes) and Close. Esc closes it once it has the keyboard.
- **Preview in panel:** the file inside the panel, read-only, highlighted
  by extension, the first 400,000 characters; binary files say so. Esc, ←
  or the back arrow go back.
- **Preview tab:** read-only; it reloads when the file changes, keeping Raw,
  zoom and open JSON rows, and after a restart shows the file it showed. A
  click on the name copies the file name, on the folder the full path. ⋯:
  Open in editor (`$VISUAL` or `$EDITOR` without `--wait`/`-w`, else the
  default app), Open with default app, Reveal in Finder, Copy path, Copy
  relative path. Markdown: web links open in the system, a local file in
  the same tab (← returns), `#heading` jumps, web images load only after
  "Load them". PDF: ‹ › and Go to jump, pages render 6 at a time, up to
  500. Zoom steps 25 to 400%, the middle returns to Fit. JSON: a click
  opens or closes a row, alt-click the whole branch. Files from another
  machine show in the text viewers only.

## Built from

**Layout** `layouts/Herdr-Roundup.json`, cloned from Herdr's `main` 0.1.14
(`cloned_from`) with a root `"version"` (`0.7.0`). Root `row` (`titlebar:
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
      stack (active `files`): `files` block with `roundup-files`, shipped
      `changes`
  - `status` block (px 28): shipped `workspace-status`

Only `brand`, `sidebar-footer`, `spaces`, `tabs`, `files` and the pane
header differ from `main`. The block ids stay Herdr's, so the tab bar's
Files button (`layout.select {stack: "panel-body", child: "files"}`) finds
it.

**`roundup-workspace-chrome`** (clone of `workspace-chrome` 0.1.14, `place:
"none"`), two looks by `props().footer`. The brand row reads the version
from `readTextFile(appHome() + "/layouts/" + shared("layout") + ".json")`
(`layout()` leaves the root's `version` out), again when
`watchFolder(appHome() + "/layouts")` reports that file. Search runs
`mod.open {name: "picker"}`; the toggle stores the width in shared
`sidebar.width`, sets `sidebar.collapsed`, runs `layout.resize {id:
"sidebar", px}`. Footer: `app.settings`, `mod.open {name: "machine-add"}`,
`updates().app.ready`.

The update check (`update.js`, brand copy only) GETs
`https://api.github.com/repos/carstenlucke/herdr-roundup/releases?per_page=30`
with `Accept: application/vnd.github+json` and `User-Agent: herdr-roundup`
(no token), up to 5 pages; the highest version over the pages read wins. A
tag is `v1.2.3`, with pre-releases on also `-alpha`, `-beta` or `-rc` with
an optional `.N`; without them a suffix or GitHub's `prerelease` flag
leaves a release out, and a flagged one without a suffix is left out
always. Shared state under `roundup-workspace-chrome.update.`: `lastCheck`
(set before the request), `checked`, `latest` (`{version, url}`),
`dismissed`, `notified`, `auto`, `error`, `checking`, `prerelease`. The
brand copy takes the commands `roundup-workspace-chrome.check`, `.update`,
`.notes` and `.auto` through `nextCommand()`, sent by the toast's `action`
and the menu. `.update` calls `knownAgents()` and runs `tab.new {name,
folder: appHome(), argv: agent.run, task}` in a space on this computer;
the brief's commands set `HERDR_APP_HOME`. `.notes` runs `open`,
`xdg-open` or `cmd /c start "" <url>` by `window().platform`. Toasts are
`notify()`.

The card is gpui-base's `HoverCard` (anchor `top_left`, open delay 500,
close 150), content `info.js`. The menu is the mod again as a popup,
`openOverlay({mod: "roundup-workspace-chrome", kind: "popup", width: 300,
height, props: {menu: {installed, herdr, release, error}}})`, drawn by
`menu.js`; its height is summed from fixed line heights at the click.
While open it sets shared `roundup-workspace-chrome.menu`; shared
`roundup-workspace-chrome.details` false turns the card off. Own art:
`logo.png` (160×160), `search.svg`, `sidebar.svg`, `settings.svg`,
`plus.svg`, Lucide's `refresh`, `bot`, `notes`, `skip`, `check`,
`circle-alert`, and `spinner.svg` from `workspace-chrome`.

**`roundup-pane`** (clone of `pane` 0.1.14, `place: "none"`, title "Pane
header"). One copy per pane, `props()` `{pane, terminal}`. herdr-core can't
rename a running terminal, so a terminal pane's name is its core label
`roundup-pane.name`, read from `terminals()[i].labels`, written with
`hc(["label", terminal, "roundup-pane.name=<name>"])` (`…=` removes it); a
mod pane's is in shared `roundup-pane.names` (pane id → name); see
`docs/adr/0001-pane-names-in-core-labels.md`. The chip copies with
`cx.write_to_clipboard` on `click_count === 2`. The rename dialog is the
same mod, `openOverlay({mod: "roundup-pane", kind: "dialog", width: 380,
height: 196, props: {rename: {pane, terminal, value, fallback}}})`. It is
also the `terminal_menu`: a popup (`mod.json` `overlay` 240×332),
`props()` `{tab: "pane", target: {pane, terminal}, overlay}`, Herdr's pane
menu item for item; Split, Zoom and Close pane, and the closing choice,
only when `target.pane` is in `panes()`. Closing is `closePane(pane)` from
`close.js` (as in `roundup-tabs`); `cmd-shift-w` goes to
`roundup-tabs.close-pane`, as a command here would reach every header.
Commands: `pane.focus`, `pane.split`, `pane.zoom`, `pane.close`,
`tab.close`, `terminal.right_click`, `terminal.park`. Own art:
`rename.svg`, and the shipped header's `split-right`, `split-down`,
`zoom`, `unzoom`, `close`.

**`roundup-spaces`** (clone of `spaces` 0.1.14, `place: "none"`, title
"Spaces"). Reads `spaces()`, `panes()`, `terminals()` (each agent's `turn`),
`agents()`, `machines()`, `theme()`, `settings().dark`, `window()?.active`
and shared `space.colors` (Herdr's). A space's place is its first
terminal's `cwd`, else its `folder`, on its `machine`. For each place it
runs through `exec`, on the space's machine:

- `git --no-optional-locks -c core.fsmonitor=false status --porcelain=v2
  --branch`: branch, ahead/behind, uncommitted changes (lines starting with
  `1`, `2`, `u` or `?`)
- `git rev-parse --show-toplevel --path-format=absolute --git-common-dir`:
  the repo's name, and whether this is a linked worktree (a git before 2.31
  answers a relative `.git`: then never a worktree)

It watches each local repo's git folder with `watchFolder`. Through `hc` it
runs `machine ls --json`, and for Connect `machine rm` and `machine add`.
Commands: `space.select`, `space.move`, `space.new`, `pane.focus {pane}`.
Menu: `openOverlay({mod: "roundup-menu", kind: "popup", props: {tab:
"space", target: {id}}})`. Own art: `bot.svg`; from Herdr's
`mods/workspace-chrome/`: `branch`, `plus`, `monitor`, `server`,
`chevron-down`, `chevron-right`, `folder`.

The quicklook is a gpui-base `HoverCard` (`top_left`, open 400, close 150)
around the badge. Its pane maps come from the space machine's core
document `herdr-app` (macOS and Linux only), through `exec` with a 3s
timeout:

```sh
sh -c 'printf "%s\n" "$1" | hc connect' sh \
  '{"jsonrpc":"2.0","id":1,"method":"doc.get","params":{"name":"herdr-app","on":null}}'
```

`pane-map.js` finds the tab in `result.value.spaces[].tabs[]` by its id
without the `<machine>/` prefix and reduces its `root` to the map:
`row`/`column` nodes with `children`, `block` leaves with
`content.terminal` (an agent's address) or `content.mod`, each with
`size.weight` (none: 1). It reads one machine at a time, keeps the last
readable answer per machine, logs the first failure per machine once, and
reads again for each new set of agents the tree doesn't hold. Programs'
icons as in `agents`: `svg(icon)` when `tint`, else `image(icon)`.

**`roundup-menu`** (clone of `menu` 0.1.14, `place: "none"`): Herdr's
context menu. Its one change: `init` writes its overlay id to shared
`roundup-menu.open`, and `close()` clears the key only while it still holds
that id.

**`roundup-tabs`** (clone of `tabs` 0.1.14, `place: "none"`, title "Tabs"):
Herdr's tab bar, except how a tab closes (`close.js`). The choice is shared
`roundup-tabs.confirm-close` for tabs, `roundup-pane.confirm-close` for
panes: `never`, `agents` (also when unset) or `always`. A tab's busy agents
are `agents()` with its `tab` and status `working` or `blocked`. Asking
opens `roundup-confirm` as a dialog (400×170) with `command: {name:
"tab.close", args: {id, confirmed: true}}`; not asking runs `tab.close {id,
confirmed: true}` (never) or `tab.close {id}` (agents). The tab menu is the
mod itself as a popup (220×237, `props: {menu: {id, space}}`), since
Herdr's `menu` would close past the choice. Key commands: `close` (the
shown tab), `close:<id>`, `close-pane`.

**`roundup-confirm`** (clone of `confirm` 0.1.14, `place: "none"`): props
`{title, detail, command: {name, args}}`; Confirm runs `command`. Each
button has its own focus handle with `tab_index(0)`; the dialog keeps the
chosen one (Cancel at start) and moves it on Tab and Shift-Tab.

**`roundup-preview`** (`place: "none"`, title "Preview"), from
gsydler/herdr-cria's `file-preview` at `82ce1eb`, renamed; its own brief is
that repo's `file-preview/RECIPE.md`. `main.js` draws `preview.js` or, with
`props().part == "menu"`, the ⋯ popup (`menu.js`, width 240). Viewers in
`viewers/` (`{id, load, start?, toolbar?, render, release?}`), picked by
extension in `kinds.js`. `image()` reads only from the Herdr home, so
pictures and PDF pages are staged in `data/roundup-preview/`, named by a
hash of path, modification time and size, pruned after 14 days (a cache
hit is touched first). Live reload through `watchFolder` on the file's
folder, under its path and its resolved folder (`pwd -P`); where the watch
fails, a look every 3s. A CSV is semicolon-separated when its first record
has more `;` than `,`. Programs on macOS: `sh` (`wc`, `head`, `stat`,
`cp`), `sips`, `osascript -l JavaScript` with PDFKit (pages 1600px wide),
`curl` and `file` (web images, after the click), `find`/`mv`/`rm` in its
cache only, `git rev-parse`, the login shell for `$EDITOR`, `open`. Key
commands for scripts (`scripts/smoke.sh`, none bound): `to-tab`, `raw`,
`state` (writes each copy's state to shared `roundup-preview.debug`).

**`roundup-files`** (clone of `files` 0.1.14, `place: "none"`, title
"Files", `focusable: true`). `main.js` draws the panel and, with
`props().menu`, the context menu; `disk.js` lists folders (`sh`, PowerShell
on Windows) and builds the disk's search index with `find`; `git.js` reads
git; `actions.js` opens, reveals, copies and sends; `icon.js` picks from
`icons.js`. The tree is a `v_virtual_list` (`on_item_click`,
`on_item_secondary_click`) with a `Scrollbar` and a
`VirtualListScrollHandle`. Git runs through `exec` on the folder's machine,
with `--no-optional-locks -c core.fsmonitor=false -c
diff.autoRefreshIndex=false`; on Windows, if `git` doesn't start, it tries
Git's usual install folders, else says "Git not found":

- `rev-parse --show-toplevel --show-prefix`, once per folder in a repo
- `status --porcelain=v2 -z --branch --no-renames --untracked-files=normal
  --ignored=no -- .`: each path's `XY` and the branch
- `ls-files -z --others --ignored --exclude-standard --directory -- .`
  (ignored paths, at most 5,000), `ls-files -z --cached --ignored
  --exclude-standard -- .` (tracked files an ignore rule matches, which
  don't count as ignored), `check-ignore -q --no-index -- ./`
- `diff HEAD --numstat -z --no-renames -- .` for `+N −N`
- for search from git's files, `ls-files -z --cached --others
  --exclude-standard -- .`

Open in tab runs `tab.new {name, mod: "roundup-preview", props: {file, on,
token}}` (`open-file.js`). `run()` names nothing it made, so the opener
takes the one new `roundup-preview` pane in `panes()` (looking every 200ms,
five times) and records it in shared `roundup-preview.open.v3` (token →
`{pane, file, on}`); opens in flight sit in `roundup-preview.opening`, and
overlapping opens record nothing. A tab that follows a link writes its
file to `roundup-preview.moved.v2` (token → file). The next click on a file
runs `pane.focus` on a live recorded pane that shows it now, compared by
`[on, pathKey(file)]`. The floating preview is `openOverlay(floatSpec(…))`
(`kind: "window"`, `key: "roundup-preview"`, so opening again replaces it)
plus shared `roundup-preview.float` (`{id, file, on, token, copy}`), which
the window's copy clears in `close()` while it still holds its token. The
window isn't saved, so a panel copy that starts with the key set writes a
`probe`, the window answers with `alive` within 500ms, and after 1500ms
unanswered the key is cleared. `open-file.js` and `paths.js` are copies of
`roundup-preview`'s; `sync.sh` refuses to install when they differ. The
click count comes from `on_mouse_down("left")` on the list's box, Cmd from
`modifiers.platform` on macOS, `modifiers.control` elsewhere. In the window
`preview.js` stops `mouse_down` on its controls and body, so only the
header drags. A mod pane has no folder, so the panel remembers the last
terminal folder per space. Previews in the panel use `readTextFile` and a
read-only `EditorState` + `Editor`. The right-click menu is
`openOverlay({mod: "roundup-files", kind: "popup", width: 228, props:
{menu}})`, 28px per item, 9px per divider; its actions go back through
shared `roundup-files.request` (`{n, action, from, root, on, rel}`), run
only by the copy whose id is `from`. The keyboard menu is the panel's own
`Popup` on a 1px point in the list's box; sizes from `on_size_change` are
divided by `settings().zoom`. Open and Reveal: `open` / `open -R`
(`Invoke-Item` / `explorer.exe /select` on Windows, `xdg-open` elsewhere).
Key commands (none bound): `focus`, `search`, `view:all`, `view:changed`,
`source:git`, `source:disk`, `menu`, and for scripts `tab:<rel>` and
`float:<rel>` (a path below the shown folder). Own art: Symbols 0.0.26 by
Miguel Solorio in `icons/` (245 SVGs, `icons/LICENSE`) and `icons.js`,
written by `scripts/build-icons.mjs` (`docs/adr/0002-file-icon-set.md`);
Herdr's `chevron-right`, `chevron-down`, `chevron-left`, `branch`,
`search`.

**Shipped mods used:** `agents`, `changes`, `workspace-status`, plus
`picker`, `menu` and `machine-add` as overlays.

**Keys:** the `layout:Herdr-Roundup` section binds `cmd-w` to
`roundup-tabs.close` and `cmd-shift-w` to `roundup-tabs.close-pane`, in place
of global `tab.close` and `pane.close`.

## Watch out

- **Name:** the layout file must be `Herdr-Roundup.json`: Settings shows the
  file name, and a name with a space can't be switched to. Mod folders keep
  the `roundup-` prefix; a folder's name is the mod's identity.
- **Block ids** must stay unique; a duplicate crashes Herdr App.
- **This brief stays under 64 KB:** herdr.dev's gallery skips a layout whose
  `RECIPE.md` is larger (`tests/layout.test.mjs`, LAY-23).
- **Programs, files, network:** `roundup-spaces` runs `git` in every space's
  folder, remote ones too, and `hc` (`hc connect`, only `doc.get`).
  `roundup-files` runs `git`, `sh` and `find` (PowerShell on Windows) in
  the shown folder. `roundup-preview` runs the programs in Built from,
  reads the file it shows and the local images a Markdown file names, and
  writes only to `data/roundup-preview/`; it fetches web images (https, 5
  MB, 10 s) only after "Load them". `roundup-workspace-chrome` reads the
  layout's file and, unless "Only when I ask", sends one GET a day to
  `api.github.com`. Nothing else reaches the network.
- **`run()` returns null:** a command names nothing it made, hence the
  before/after look at `panes()` (issue #17). Opens less than 10s apart may
  overlap and record nothing, so a second Cmd-double-click then opens
  another tab; and Open in tab keeps the window up to a second, as its
  timers end when it closes.
- **GitHub's API** allows 60 unauthenticated requests per hour per IP; over
  that it answers 403 or 429. Without a GitHub release (tags don't count)
  the list is empty, so every release needs one tagged `v` + the root
  `"version"`.
- **Click or drag:** in a `window_drag` block a press on logo and name moves
  the window, and its release still arrives as `on_click`. Stopping
  `mouse_down` would cost the drag, so the mod measures: a drag moves the
  pointer 3px or more, or 10 times. `click_count` 2 is the double-click
  that maximizes.
- **The HoverCard draws above popups**, so its content is empty while a menu
  it would cover is open. Herdr gives mods no signal for an open overlay,
  and its `menu` sets no shared state: so the space menu is `roundup-menu`,
  whose `roundup-menu.open` holds the open menu's id, and only that menu may
  clear it. A key left by a crash keeps the quicklook empty until the next
  space menu opens and closes.
- **The split arrangement isn't in the mod API:** `panes()` has no
  geometry. The core document `herdr-app` holds it as opaque JSON whose
  form can change with any herdr-core, so `pane-map.js` checks every node
  and draws no map for a tab with anything it doesn't know (`size.px`,
  another node type or `content`); never half a map. Not on Windows (no
  `sh`).
- **A press on the badge must not start the row's drag**, but its release
  must reach the row, or a drag let go on the badge wouldn't drop: stop
  only `mouse_down`, and forget a badge press when the pointer leaves it.
- **`line_height(16)` is 16 times the font size**, not 16px: write `"16px"`.
- **A text in an `h_flex` doesn't wrap** without `min_w(0)`.
- **`h_flex` centers its children across its axis:** the pane map's splits
  need `items_stretch()`, each tile `self_stretch()`, or they draw 0px high.
- **268px:** on macOS "Herdr Roundup" (92px) leaves 2px beside the search
  button, so the version goes under the name. The lit area's padding hangs
  into the row's margin (`pl(6).ml(-6).pr(4).mr(-4)`).
- **Only shown copies get commands:** with the sidebar hidden
  (`ctrl-shift-b`) the toast's action finds no brand row.
- **A popup ends when it closes**, timers and tasks included, and its size
  is fixed when it opens. What must outlive it goes to the copy that stays:
  from the brand menu as commands, from the file menu through
  `roundup-files.request`.
- **Git must not write under `.git`:** without `--no-optional-locks` and
  `core.fsmonitor=false`, each status touches the index or an fsmonitor
  cookie, which wakes the watch, which runs status again, forever.
- **Don't watch working trees for `±n`:** on macOS `watchFolder` is
  recursive, ignored folders included. `roundup-spaces` watches `.git`
  only. `roundup-files` watches its folder, but a batch touching only
  ignored paths doesn't refresh; a refresh during one only marks another
  due. A folder reached through a link is reported resolved
  (`/private/tmp`): the panel places the watch's paths against both.
- **Ignored paths come from `ls-files --directory`:** `status
  --ignored=traditional` walks every ignored folder on each refresh, and
  `--ignored=matching` lists a new ignored folder file by file.
- **`window()` can be `null`** (under `herdr-app check`): read it with `?.`,
  not in `init`.
- **Colors are theme names**, not hex. `alpha()` adds transparency only to
  hex and returns null for a theme name; then avatar and badge sit on
  `selected`, so a letter is never drawn on its own color.
- **Known gap:** Herdr's `picker` turns `ansi1`..`ansi6` into fixed hex
  colors, so a space's color there can differ from its avatar.
- **Pane names stay in the header:** the `agents` list and the tab bar show
  the program's or tab's name. A name ends with its terminal.
- **Herdr's `tab.close` asks only before a space's last tab goes**, and
  Settings have no room for a mod's switch, so the choice sits in the tab's
  menu and every way this layout closes a tab goes through `roundup-tabs`
  or `roundup-pane`. Not covered: the command palette's `tab.close` and
  `pane.close`. `pane.close` has no `confirmed`, so a tab's only pane
  closes with `tab.close`.
- **Mods can't import from each other:** `find()` and `narrow()` are copied
  into both chrome mods, `close.js` and `menu.js` from `roundup-tabs` into
  `roundup-pane`. `scripts/sync.sh` stops when those differ.
- **Tab doesn't move a dialog's keyboard by itself:** the dialog hears Tab
  go down and moves it (`stop_propagation`).
- **Read git's branch from `--porcelain=v2 --branch`:** v1's `[ahead 1]`
  follows the user's language (`[voraus 1]`), v2's `# branch.ab +1 -0`
  doesn't.
- **A deletion in git's index isn't a missing file:** after `git rm
  --cached`, status says `D.` as for a file really gone, and lists it as
  new too. Below a folder git lists whole, or an ignored one,
  `roundup-files` asks the disk (at most 2,000). A submodule is one path.
- **A refresh costs more git than `files`:** five reads where `files` runs
  status alone: 351 ms with 68,000 files. If that shows, a minimum of about
  1s between the watch's refreshes is the lever.
- **A virtual list's rows can't hold handlers:** `on_click` in the row
  renderer throws and the list draws nothing; use `on_item_click(key)` and
  `on_item_secondary_click(key, event)`, the path as key.
- **Icon colors are fixed:** Symbols' SVGs carry their own colors
  (`image()`), the one exception to theme colors.
- **Symbols leans on VS Code's language ids** (`.css`, `.html`, `.php`,
  `.vue`): `scripts/build-icons.mjs` maps them to extensions and drops the
  rules that name icons the release lacks.
- **Limits:** a folder shows its first 500 of the first 10,000 entries it
  reads; Changed stops at 2,000 paths, as its tree is built on every
  render; past the search limits a folder is searched in part.
- **No search from the disk on Windows yet** (issue #10): `Get-ChildItem
  -Recurse` walks into the pruned folders before dropping them.
- **A slow window answer drops the key:** a floating preview that doesn't
  answer a probe within 1500ms loses `roundup-preview.float`; the next
  Space or double-click replaces it.

## Done when

- `herdr-app check` passes for every `roundup-` mod, `herdr-app status`
  shows no errors, and `layout.switch {"name": "Herdr-Roundup"}` shows the
  window.
- The top left shows the logo, "Herdr Roundup" and the version under it; at
  268px nothing truncates the name, and dragging the name moves the window
  without opening the menu.
- Hovering logo or name shows the card (Installed, Based on `Herdr 0.1.14`,
  Latest, Checked); clicking opens the menu with those facts on top, no
  card over it.
- With a newer release on GitHub, the logo has the point, the second line
  says `<version> available`, and exactly one toast came; a restart brings
  no second. Skip <version> keeps them away until a newer version.
- Check for updates answers "up to date", "<version> is out" or "Couldn't
  check for updates"; the automatic check stays quiet on errors.
- The toast and "Update to <version> with an agent…" open a tab "Update
  Herdr Roundup" in the app's folder with an installed agent and the brief,
  in a space on this computer. The label names what the action installs,
  also when a check ends while the menu is open.
- `lastCheck` changes at most once a day across restarts, and not at all
  with Only when I ask. With Show details on hover off, hovering shows no
  card.
- A space in a repo of another name, on `feat/x`, shows `repo · feat/x`
  under its name in a 44px row; one named after its repo, clean on `main`,
  is a 32px row. Editing a file there shows `±1` within 10s (at once after
  an agent's turn).
- Two worktree spaces of one repo, without a main-checkout space, sit on
  one card under the repo's name, each with a branch icon for an avatar.
- An agent in a space shows a badge with `1`: gray while idle, `working`
  while it works, `blocked` while it waits; a click goes to its pane.
- With a second agent in a split of another tab, hovering the badge shows
  both under their tabs, each tab's map split as the panes are; hovering a
  row lights its pane; a click goes there. A right-click on the row shows
  the menu with no card over it.
- The sidebar toggle narrows to the rail (numbers and `●`/`·`) and widens
  back.
- Every pane header shows its terminal's address (`t5j`); double-clicking
  copies it. `hc label t5j roundup-pane.name=Build` shows "Build" within a
  second; so does renaming in the dialog, and an empty name shows the
  program's again.
- With "While an agent works", `cmd-w` on a tab whose agent works asks and
  Cancel keeps it; a shell's tab closes at once. "Always" asks for it too;
  "Never" for neither. In a tab split into a working agent and a shell,
  `cmd-shift-w` asks on the agent's pane and closes the shell's at once.
  In the question, Enter right away cancels; Tab, then Enter closes.
- In a light and a dark theme, every avatar letter and badge count can be
  read.
- The Files button shows `roundup-files`; Changes still shows Herdr's diff
  panel.
- In a repo with a modified, a new, a staged, a deleted and an ignored
  file, the branch row shows the branch and `↑n ↓n` as `git status -sb`
  does; the files show `M`, `?`, `A` and their `+N −N`, the ignored one is
  dim, folders show counts. Changed lists exactly what `git status -s`
  lists. An edit shows within a second.
- Files and folders show Symbols icons in light and dark themes
  (`package.json`, `Dockerfile`, `style.css`, `src/`, `.github/`).
- Typing the name of a file in a never-opened folder finds it;
  `node_modules` stays out. In a repo, an ignored `.env` is found only with
  the switch on the disk.
- A double-click on a file shows it in the floating preview, which then
  follows the selection. A Cmd-double-click on a `.md`, `.pdf`, `.png`,
  `.csv` and `.json` file opens a tab with the Markdown rendered, the PDF's
  pages, the picture with its size, a table and a JSON tree; another on
  the same file brings that tab back.
- `node --test 'tests/*.test.mjs'` passes (Node 22.15 or later).
- A folder without git shows "Not a git repository" and its files; one with
  more than 500 entries says so in the footer.
