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

![Herdr-Roundup: name, claim and main features beside the window, with two agents side by side, and a README in the floating preview](preview.png)

## What you see

Left to right, the window is a row on the theme's `canvas`, with no system
titlebar (on macOS the traffic lights sit at 12, 16 px) and 1px dividers in
`border`.

**Sidebar** (268px wide, `chrome` background; narrows to a rail of 44px, 76px
on macOS, and can be dragged between 44 and 480px). Top to bottom:

- **Brand row** (46px, drags the window). On macOS, 76px of space on the
  left for the traffic lights, then a 20px logo (three black sheep on a light
  ground, corners rounded 5px) and two lines beside it: **Herdr Roundup** in
  semibold `foreground` at 13px (16px line), and under it at 11px (14px
  line) the installed version (`0.7.0`) in `dim`. When a newer release is
  out and not skipped, the second line reads `0.8.0 available` in `accent`
  and a 10px `accent` point with a 2px `chrome` ring sits on the logo's top
  right corner (3px out). During a check it reads `0.7.0 · checking…`;
  before the layout's file is read there is no second line. Logo and name
  sit on a 36px area, rounded 8px, that turns `hover` under the pointer and
  shows a hand. On the right, two 26px icon buttons in `muted`: search
  (opens the space picker) and sidebar toggle. The rail drops logo, name and
  search; the macOS rail the toggle too.
- **Details card** (on hover over logo or name, after 500ms): 236px wide,
  12px padding, `popover`, 1px `border`, radius 10, a large shadow, 4px
  under the row. "Herdr Roundup" in semibold 13px, then four lines at 12px,
  label in `dim` left, value in `foreground` right: Installed `0.7.0`, Based
  on `Herdr 0.1.13`, Latest `0.8.0` (`accent` when newer, `0.8.0 · skipped`
  when skipped), Checked `today 09:12` / `yesterday 18:40` / `Nov 3 09:12`;
  Latest and Checked show `–` before the first answer. Then, only when it
  has something to say, a status line at 11.5px with a 12px icon: a turning
  spinner and "Checking for updates…" in `muted`, or a circle with `!` and
  "Couldn't check: <reason>" in `working` (it wraps). Last, under a 1px
  `border` line, "Click the Roundup title for update options" at 11.5px in
  `dim`, in `accent` when an update is available.
- **Spaces** (half of the remaining height, at least 90px):
  - Header row 31px: "Spaces" in `dim` at 11.5px and a `+` (new space).
  - One row per space, 8px rounded, `selected` when active, `hover`
    otherwise. Left a 22px square avatar, rounded 6px, with the name's first letter
    in bold 11.5px. Letter and background take the space's color (a theme
    name `ansi1`..`ansi6`, or a hex), the background at 14% opacity in light
    themes (`24` alpha), 18% in dark ones (`2e`). Then the name in medium
    `foreground`, truncated.
  - The **git line** under the name, `dim` 11.5px: a branch icon,
    `repo · branch`, `↑2` `↓1` in `muted`, `±3` (hover: "3 uncommitted
    changes"). The repo is left out when the space has its name, and in a
    worktree row; the branch when the space has its name, or it is `main` or
    `master`. A row with a git line is 44px high, one without 32px. A space
    outside a repo, or clean on main under its repo's name, has none.
  - An **agent badge** on the right when agents run in the space: an 18px
    pill, rounded 9px, a small robot icon and the count in semibold 11px.
  - With two or more agents, hovering the badge shows the **agent
    quicklook**: a card (`popover`, 1px `border`, rounded 10px, large
    shadow, 6px padding) 330px wide, its list at most 360px high before it
    scrolls. The agents are grouped by tab in tab order, each tab under a
    header in `dim` 11px: its number in semibold `muted`, its name when it
    has one. A row (26px, 12px) has a 7px status dot (idle: a ring in
    `idle`), the program's 14px icon, the terminal's title (else the
    program's name), truncated, and on the right the status word in 11px
    and the status color ("needs you", "done", "working"; "idle" in `dim`).
    Beside a tab's rows a **pane map**, 60×40px (2px padding, 1px `border`,
    rounded 5px): the tab's panes split as they are, in their proportions,
    2px apart; an agent's pane in its status color, other terminals in
    `selected`, a mod pane as a `selected` outline. Without maps the card is
    286px wide.
  - **Worktrees** of one repo share a card: 1px `border`, rounded 10px, 3px
    padding, 6px from the rows around it. Worktree rows are indented 12px,
    with a branch icon in `dim` in place of the avatar. A space in the
    repo's main checkout heads the card; without one (the usual case, as
    Herdr makes each worktree its own space) a 24px header does: a folder
    icon in `dim` and the repo's name in medium `muted` 11.5px. A single
    worktree whose main checkout has no space is an ordinary row with an avatar, no card.
  - Once a remote machine is known, spaces group under a header per machine
    (26px, `dim` 11px): a monitor or server icon, "This computer" or the
    machine's name, its state when not connected, `+` (a new space there),
    a green (`ansi2`) or gray dot, a fold chevron. An empty machine shows
    "New space there"; one still loading, "Loading…".
  - On the rail a space is a 26px row with its number and `●` in the status
    color when an agent there is blocked or done, else `·`: it speaks up
    only when it needs you.
- **Agents** (Herdr's shipped `agents` list, the other half, at least 90px).
- **Footer** (69px, `border` line on top): "Settings" (with a small `accent`
  dot when an app update is ready) and "Add machine" in `dim`, each with a
  14px icon; on the rail only the icons.

**Work area**, top to bottom:

- **Tabs** (42px, drags the window): Herdr's tab bar, as `roundup-tabs`.
  Right-clicking a tab shows Rename, New tab and Close, then "Ask before
  closing a tab" with Never, While an agent works and Always, an `accent`
  check on the chosen one.
- **Body** (8px padding, 8px gap): the active tab's panes, 8px apart, each
  rounded 10px on `background` with a 1px `border` (`accent` when focused)
  and a `roundup-pane` header (30px, on top, always shown): the program's
  icon, the pane's name (`foreground`, medium), its id in a small mono chip
  (10.5px, `dim` on `hover`: the terminal's address such as `t5j`, or a mod
  pane's id shortened to `p` and 6 hex digits), the folder in `dim`, the
  agent's status, and on hover rename, split right, split down, zoom and
  close. Terminal padding 14 × 12px. Right-clicking a terminal shows Herdr's
  pane menu (Split right, Split down, Zoom, where right-clicks go, Close
  pane), then "Ask before closing a pane" with the same three choices, for
  panes only.
- **Side panel** on the right, hidden at first (368px, 280–900px): a stack
  of `roundup-files` and Herdr's `changes`, picked with the Files and
  Changes buttons at the right of the tab bar. `roundup-files` is a card
  (radius 10, 1px `border`, `background`), top to bottom:
  - **Header** (42px): "Files" in semibold, a switch **All | Changed** (24px,
    `raised` behind, the chosen one on `background`; Changed carries the
    number of entries `git status` lists), and at the right the folder's
    name in `dim` with Symbols' root-folder icon. While a file previews: a
    back arrow, the file's icon and its path.
  - **Branch row** (46px): a branch glyph, the branch in medium weight,
    `↑ahead` `↓behind` in `muted`, "upstream gone" when its upstream was
    deleted, "clean" or the lines changed against `HEAD` (`+N` in `ansi2`,
    `−N` in `ansi1`); under it a 4px bar of modified (`ansi3`), new (`ansi2`)
    and deleted (`ansi1`) paths, sized by their counts, the counts at its
    right; when clean, only the bar's space. Outside a repo: "Not a git
    repository"; when status fails (too large or slow, a broken index): "Git
    can't read this folder", in Changed too; before git answers: "Reading
    git…".
  - **Search field** (28px, `canvas`, `border`, `accent` while typing):
    "Search files". In All, inside a repo, not in a folder git ignores and
    where search can read the disk, a 20px switch at its right end, the
    branch glyph: lit (`accent` on `raised`) while search reads git's files,
    `dim` while it reads the disk.
  - **Tree** (26px rows, 14px indent per level): a chevron for folders, a
    16px Symbols icon (one set for light and dark; an open folder keeps its
    icon, as in VS Code), the name, the git marks. Names take their status
    color: new or added `ansi2`, modified `ansi3`, deleted or conflicted
    `ansi1`, renamed `ansi4`; ignored paths are `dim` with a half-faded
    icon. Files end with `+N −N` and their letter (`?`, `A`, `M`, `D`, `U`,
    `R`, `T`) in a 12px column; folders show a colored dot and count for
    each of new, modified and deleted below them, and from 360px of width
    their `+N −N`. A symlink read from disk (All, and folders Changed opens
    from disk) has its name in italics and a 14px arrow (Lucide
    `arrow-up-right`, stroke 2.5) after it in `accent`, its hover "Link to
    <target>" as written; one that points nowhere has a `dim` name, a
    half-faded icon, the arrow in `ansi1` and "Broken link to <target>".
    One whose target lies past a folder you may not search isn't broken:
    it shows as a link, its hover "Link to <target> (no access to check
    it)"; the first 200 such links of a folder are told apart, the shell
    walking each target back to the nearest path there is and following
    links on the way (at most 8, each read once).
    A folder's listing prints at most 7 MiB (exec takes 8): a target that
    doesn't fit is left out whole, its hover just "Link", and entries past
    it end the folder as its 10,000 limit does.
    Herdr ships its UI font Geist without an italic, so `roundup-files`
    brings `fonts/Geist-Italic.ttf` (Geist 1.8.2, OFL); a `ui_font` without
    an italic shows link names upright.
    Selected row on `selected`, hovered on `hover`.
  - **Footer** (only when needed, 11px `dim`): "Folders show their first 500
    entries", "First 200 matches", "Changed shows the first 2,000 paths",
    "Search covers the first 40,000 files" (or "the first 20,000 folders",
    whichever limit cut the index short).
- **Preview tab** (`roundup-preview`, opened from a file in `roundup-files`):
  a tab named after the file with one pane on `background`, 13px text. A
  42px header with a 1px `border` line under it: ← (only after following a
  link to another file), the file name in semibold, its folder and size in
  12px `dim`, the viewer's own controls on the right, then ⋯. Below it the
  file, by its extension: Markdown rendered in a column up to 920px (local
  images drawn inline, a ToC column of 240px, Preview | Raw); PDF pages on
  `canvas` with ‹ N / M ›, Go to and − Fit +; images fitted on `canvas`
  with their pixel size and − Fit +; CSV and TSV as a table with a fixed
  header, row numbers and Table | Raw; JSON as a tree (keys `ansi4`,
  strings `ansi2`, numbers `ansi1`, true/false/null `ansi6`) with Tree |
  Raw; anything else as read-only code. "Loading…" in `dim` while it
  loads, an error in `ansi1`.
- **Status bar** (28px): Herdr's shipped `workspace-status`.

## How it behaves

- **Agent badge:** gray (`dim` on `selected`) while every agent in the space
  is idle, else in the color of the most urgent one (blocked > done >
  working): text in `blocked`, `done` or `working`, background the same at
  about 15% opacity. Tooltip, most urgent first: "3 agents: 1 blocked, 2
  idle"; with two or more agents the quicklook takes its place. With one
  agent a click on the badge goes to that agent's pane; with more it
  switches to the space, as a click on the row does.
- **Terminal titles** in the quicklook lose only a program's mark in front:
  a Braille spinner (codex) or one of Claude Code's stars (`✳ ✻ ✽ ✶ ✢ ·`),
  each followed by a space. `~/src`, `[WIP]`, `(venv)` or an emoji stay.
- **Agent quicklook:** opens after the pointer rests on the badge for 400ms
  and stays while it is on the badge or the card (150ms to cross between).
  It reads the pane maps only once the pointer has rested on the badge for
  300ms: a pointer crossing badges on its way reads nothing. 200ms after
  the pointer left both badge and card, the card is forgotten and reads no
  more.
  Rows always come from the space's agents now; the read tree orders them
  within a tab and gives the tab its map, only when every agent of that tab
  is in that tab's tree. Otherwise, or when the tree can't be read, that
  tab has no map and its rows keep the order of `agents()`; with no map at
  all the card is the narrow one. No hint, no error. Hovering a row lights
  its pane in the map (full color, a `foreground` outline; the others at
  45%). A click on a row or on an agent's pane goes there (space and tab
  with it); the card is then empty until the badge is entered or left
  again. While the space menu is open, the card is empty: from a
  right-click until the badge was left and the menu is closed, in either
  order. During a space drag it is empty too. Not on the rail.
- **Badge presses:** a press on the badge starts no space drag; a drag of
  another row let go on the badge still drops there. A badge press let go
  elsewhere is forgotten when the pointer leaves the badge.
- **Click** a space to switch to it, **right-click** for Herdr's space menu
  (from `roundup-menu`, the clone that says when it is open).
  **Drag** a space onto another of the same machine to move it there: the
  row fades to half, a 2px `accent` bar marks where it lands. Dragging a
  card's top row, or the repo name heading a card without a main-checkout
  space, moves the whole card (the card fades); any other worktree moves
  within its card and snaps back if dragged out.
- **New spaces** get the color used least among `ansi6`, `ansi3`, `ansi4`,
  `ansi5`, `ansi2`, `ansi1`; the home space `~` gets none and shows `ansi6`.
  A new space waits up to 1.5s for its git, so a worktree appears on its
  repo's card instead of jumping there. **At start** the list waits up to
  1.5s for every space's git ("Loading…"), then shows all of them on their
  cards at once, reordering nothing before.
- **The git line refreshes** when something under a local repo's `.git`
  changes (commit, checkout, fetch), when a command or an agent's turn in
  that space ends, when a space's terminal changes folder, when a remote
  machine comes back, when the window comes to the front, and while it is
  in front every 10s for the active space, 60s for the others. A commit
  refreshes every space of its repo. A turn counts by its `turn` number, so
  one too short to be seen working still refreshes; a shell reports no
  command end, so a quick command there (`echo x >> file`) shows within 10s.
- **Machine headers:** click to fold or unfold; folds stay after a restart.
  A rebuilt or replaced machine shows "rebuilt · Connect"; Connect removes
  it and adds it again under the same name.
- **Sidebar toggle:** narrows to the rail and widens back to the width it
  had. Below 160px the sidebar counts as the rail, however it got there. On
  the macOS rail the agents list's `»` unfolds it.
- **Pane header:** double-click the id chip to copy the id (a mod pane's
  whole id); the chip shows "copied" in `accent` for 1.2s. Double-click the
  name, or click the pencil, to rename the pane in a dialog (Enter saves,
  Esc cancels); an empty name goes back to the program's. A click elsewhere
  on the header focuses the pane. Tooltips: the whole id on the chip, the
  given and the program's name on the name.
- **Closing** asks first as its kind's choice says: the tab menu's for tabs,
  the terminal menu's for panes; both stay after a restart. A tab closes by
  its ×, its menu's Close or `cmd-w`; a pane by its header's ×, Close pane
  in the terminal's menu or `cmd-shift-w`. A tab's only pane closes the tab,
  so it follows the choice for tabs: a pane's × never ends a tab more
  quietly than `cmd-w` would.
  - **Never:** closes at once; the last tab takes its space with it unasked.
  - **While an agent works** (the default): asks while an agent in the tab
    (or in the pane, with its sub-agents) is working or blocked ("Claude
    Code is still running in it. Closing ends it."); otherwise Herdr's own
    close runs, which asks "Close space?" before a space's last tab goes.
  - **Always:** asks every time.

  The question also says when the tab closes too ("It's the tab's only
  pane, so the tab closes too.") or the space.
- **The question** has Cancel and Confirm. Cancel holds the keyboard when it
  opens (a 2px `accent` ring): Enter cancels, so a second `cmd-w` or Enter
  too many closes nothing. Tab and Shift-Tab move the ring, Enter or Space
  presses its button, Esc cancels.
- **Version** follows the layout file: after an update the second line and
  the details show the new one without a restart.
- **Update check:** once a day the brand row asks GitHub for the latest
  release (at start, and hourly it looks whether a day has passed). A
  request counts as made before it is sent, so failures, restarts and
  reloads still ask at most once a day. The automatic check is quiet: no toast on errors,
  and for a new version exactly one, never for a skipped one: "Herdr Roundup
  0.8.0 is out" / "You have 0.7.0 · Click to update with an agent" (`info`).
  Clicking it starts the update.
- **Click on logo or name** opens the menu (a popup at the pointer, 260px,
  like the tab menus: `popover`, 5px padding, 12.8px). A press that moves
  the window is a drag, not a click; a double-click maximizes, as anywhere
  in the row. While the menu is open, or right after the click, the details
  card stays away. Top to bottom:
  - The card's details (without the hint), a divider.
  - **Check for updates** (refresh icon): asks at once, whatever the day and
    the choice below, and always answers with a toast: the new-version toast
    (also for a skipped version, which it un-skips), "Herdr Roundup is up to
    date" / "0.7.0 is the latest release" (`success`), or "Couldn't check
    for updates" / the reason (`warning`): no connection to api.github.com,
    GitHub's rate limit, no release on GitHub yet (404), a tag that isn't
    `v1.2.3`.
  - Only with an update available and not skipped: **Update to 0.8.0 with an
    agent…** (bot icon, `accent`), **Release notes 0.8.0** (the release page
    in the browser), **Skip 0.8.0** (point, second line and toast stay away
    until a newer version).
  - Divider, heading "Check for updates" (`dim` 11px), **Daily** and **Only
    when I ask** (stops the automatic check), an `accent` check on the
    chosen one.
  - Divider, **Show details on hover**, checked when on (the default); off,
    hovering only lights the area.
  - ↑/↓ move, Enter runs, Esc closes; a choice closes the menu.
- **Updating with an agent** opens a tab "Update Herdr Roundup" in a space
  on this computer (the shown one if it is here, else the first one here,
  else a new one), in the app's folder, with the first installed agent
  (most picked first) and a brief as its first message: update from v0.7.0
  to v0.8.0, read AGENTS.md, clone the repo at the tag into a new empty
  folder, read the release notes and README, then tell what changes,
  whether keys the person changed in the `layout:Herdr-Roundup` section
  would be replaced and whether the installed `roundup-*` mods differ from
  the installed tag; only after a yes run the clone's `scripts/sync.sh` and
  check `herdr-app status`. The mod never writes the install itself.
  Without an installed agent a `warning` toast says what to tell one's own.
- **The files panel follows the focused pane's folder** (for a mod pane, the
  first terminal of its tab), on its machine. Each folder keeps its open
  folders, selection and preview while another shows (the last 50). Files
  show at once; git fills in its marks without moving a row, so unlike the
  spaces panel nothing waits. A local folder refreshes when anything under
  it changes (`watchFolder`), any folder every 10s.
- **All** lists the disk: folders first, natural order ("file2" before
  "file10"), dotfiles included, `.git` left out; folders load when opened.
  **Changed** lists exactly what `git status` lists, the first 2,000 paths
  in git's order (counts and branch row count all), as a tree with every
  folder open: deleted files struck through with a faded icon, an untracked
  folder or a submodule as one row that opens from disk. Such a folder also
  shows what git lists below it that isn't on disk (a file deleted next to
  new ones), and a search opens it for what it found there. A tracked folder
  folds and unfolds without reading the disk. Struck through means not on disk, not
  deleted in git: after `git rm --cached` the file is red but previews. When
  the shown folder is itself new to git, Changed says so and every row in
  All shows `?`. The view stays after a restart.
- **Search** (type in the field, or `/`): in All it searches every path
  below the folder, opened or not, and shows the matches as a tree, names
  that match first, at most 200. The switch picks what it reads, and the
  choice stays after a restart:
  - **Git's files** (the default): tracked and new files, without what
    `.gitignore` leaves out, at most 40,000, at any depth. A deleted, not yet
    committed file shows struck through. "No matches · ignored files left
    out" says where else to look. Outside a repo, in a folder git ignores
    (or inside one, even holding a tracked file), or where git can't run, it
    reads the disk instead.
  - **The disk:** everything but the folders `.git`, `node_modules`, `target`,
    `.venv`, `venv`, `__pycache__`, `dist`, `build`, `.next`, `.nuxt`,
    `.cache`, `.gradle`, `.idea`, `vendor`, `Pods`, `.tox`, `.mypy_cache`,
    `.pytest_cache` and `coverage` (a file of such a name is searched),
    ignored files included (`.env`, local settings), and `Library`,
    `AppData` and `.Trash` at the top of home (a project's `Library` is
    searched; at `/` they are skipped at any depth); 12 levels deep (5 at
    home or `/`, home being that of the folder's machine, read once per
    machine), at most 20,000 folders and 40,000 other paths. Not on Windows
    yet, nor without `sh`: there it reads git's files whatever the switch
    says, and where git has none it says why ("Not a git repository ·
    Search can't read the disk on Windows yet"), until git answers again
    (the next refresh), not again with every key.

  A link to a folder is a folder, as in the tree, and search doesn't follow
  it; from git's files only a tracked one is, a new one stays a file.

  The index is read on the first search, and again when a `.gitignore`
  changes (git's files), at 5 minutes old, or when what it holds changes. A
  new path is checked on its own and added (git's files: `ls-files` for it
  and what lies below a new folder; the disk: whether it is there, in a
  folder the index holds), and comes out if gone again, so saves through
  temporary files don't read the whole index. A new folder from the disk,
  more than 100 new paths at once or a failed check read it again; a folder
  named like a skipped one (a build's `dist`) doesn't. In an index a limit
  cut short, a new path can't be added and counts as a changed file. A
  changed file it knows (or a deleted one) reads it again once the index is
  30 s old, also without typing, a changed folder (or too many paths to
  list) at 3 s: at most one read per 30 s while an agent writes, per 3 s
  while a build makes folders. In Changed, search filters git's paths. `×`
  or Esc clears it.
- **Click** a folder to open or close it, a file to select it. A
  **double-click** on a file shows it in the floating preview (below), a
  **Cmd-double-click** (Ctrl on Windows and Linux) in a preview tab, closing
  the floating one if it shows that file; a file already open in a tab
  brings that tab to the front. While open, the floating preview follows
  the selection: at once on a click, after 150ms of rest on ↑ ↓, so holding
  a key opens it once where it stops. While the preview tab is shown, the
  tree keeps the terminal's folder. **Keys**, once the panel has the
  keyboard (a click on it, or `pane.go`): ↑ ↓ select, PgUp PgDn Home End
  jump, → opens a folder or steps into it, ← closes it or goes to its
  parent, Space opens or closes a file's floating preview, Enter opens a
  file in the preview tab, both toggle a folder, `/` goes to the search
  field, Esc closes the floating preview, leaves the panel's own preview or
  clears the search; in the field ↑ ↓ move the selection and Enter acts on
  it. In results, Enter on a folder shows it in the tree, search cleared.
- **Right-click** a row (or Menu key, Shift-F10, the `menu` command: it
  opens below the selected row, above where it doesn't fit; ↑ ↓ Home End
  pick, Enter runs, Esc or ← closes): Quick look, Open in tab, Preview in
  panel, Open with default app, Reveal in Finder ("Show in folder"
  elsewhere) / Copy relative path, Copy absolute path / Send @path to
  agent. Send types `@path ` into the shown tab's agent (the focused pane's
  if it is one, else the tab's focused or first agent), relative to that
  agent's folder, focuses it, and after 600ms puts the clipboard back if it
  still holds the path (text only: other content is lost, the clipboard
  emptied); with no agent: "No agent in this tab". On another machine Open
  and Reveal are left out; for a deleted file, Quick look, Open in tab,
  Preview in panel, Open and Reveal.
- **Floating preview:** the preview tab's view (below) in a window over the
  layout, 60% × 75% of the window, centered the first time, then where it
  was dropped. Its header drags it; the controls and the file don't. Beside
  ⋯: Open in tab (the tab, or the one already showing the file, then the
  window closes) and Close. Esc closes it once it has the keyboard (a click
  in it). The name and folder don't copy there: they are part of what
  drags.
- **Preview in panel:** the file inside the panel, read-only, highlighted
  by extension, the first 400,000 characters; binary files say so. Esc, ←
  or the back arrow go back.
- **Preview tab:** read-only; it reloads when the file changes on disk,
  keeping Raw, zoom and open JSON rows, and after a restart shows the file
  it showed (a link followed, not the one it opened with). A click on the
  name copies the file name, on the folder the full path. ⋯: Open in editor
  (`$VISUAL` or `$EDITOR` read with the shell's quoting, without
  `--wait`/`-w`, else the default app), Open with default app, Reveal in
  Finder, Copy path, Copy relative path. Markdown: web and mail links open
  in the system, a local file opens in the same tab (← returns),
  `#heading` shows the document from that heading, web images load only
  after "Load them". PDF: ‹ › and Go to jump, pages render 6 at a time, up
  to 500. Zoom steps 25 to 400%, the middle returns to Fit. JSON: a click
  opens or closes a row, alt-click the whole branch. Files from another
  machine show in the text viewers only.

## Built from

**Layout** `layouts/Herdr-Roundup.json`, cloned from Herdr's `main` 0.1.13
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
header differ from `main`: they point at the `roundup-` mods. The block ids
stay Herdr's, so the tab bar's Files button (`layout.select {stack:
"panel-body", child: "files"}`) finds it.

**`roundup-workspace-chrome`** (clone of `workspace-chrome` 0.1.13, `place:
"none"`), two looks by `props().footer`. The brand row reads the layout's
file with `readTextFile(appHome() + "/layouts/" + shared("layout") +
".json")`, as `layout()` leaves out the root's `version`, and again when
`watchFolder(appHome() + "/layouts")` reports that file (not
`layouts/.state/`). Search runs `mod.open {name: "picker"}`. The toggle
stores the width in shared `sidebar.width`, sets `sidebar.collapsed`, runs
`layout.resize {id: "sidebar", px}`. Footer: `app.settings`, `mod.open
{name: "machine-add"}`, `updates().app.ready`.

The update check is `update.js`, run by the brand copy only. `latest()` is
a `fetch` GET of
`https://api.github.com/repos/carstenlucke/herdr-roundup/releases/latest`
with `Accept: application/vnd.github+json` and `User-Agent: herdr-roundup`
(no token, nothing about the person); the version is `tag_name` without its
`v`, the link `html_url`; versions compare numerically by major, minor,
patch. Shared state under `roundup-workspace-chrome.update.`: `lastCheck`
(ms, set before the request), `checked` (ms of the last answer), `latest`
(`{version, url}`), `dismissed`, `notified`, `auto` (false: only when
asked), `error` (the last reason, null after an answer). The brand copy
takes the commands `roundup-workspace-chrome.check`, `.update`, `.notes`
and `.auto` (Daily chosen: check now if due) through `nextCommand()`, sent
by the toast's `action` and the menu. The automatic check runs from the
file-reading loop and an hourly `cx.timer.every`; a Check asked for during a check runs
after it, so it still answers with a toast. `.update` calls `knownAgents()`
and runs `tab.new {name, folder: appHome(), argv: agent.run, task}` in a
space on this computer, since a tab stays on its space's machine and the
agents and `appHome()` are looked up here. `appHome()` (`~/.config/herdr-app`
or `$HERDR_APP_HOME`) is the tab's folder and every path in the brief, so an
agent that asks whether to trust a folder asks once; the brief's commands
set `HERDR_APP_HOME` to it, as the agent's shell may not. `.notes` runs
`open` (macOS), `xdg-open` (Linux) or `cmd /c start "" <url>` (Windows) by
`window().platform`. Toasts are `notify()` (drawn by the shipped `toast`).

The card is gpui-base's `HoverCard` (anchor `top_left`, open delay 500,
close delay 150) around logo and name, content `info.js`. The menu is the
mod again as a popup, `openOverlay({mod: "roundup-workspace-chrome", kind:
"popup", width: 260, height, props: {menu: {installed, herdr, release,
error}}})`, drawn by `menu.js` after roundup-tabs' `menu.js`. Its height is
summed from fixed line heights (`menuHeight`, `infoHeight`) with the
release and error as they were at the click, so a check ending while it is
open can't add rows it has no room for; a reason is cut after two lines.
While open, the popup sets shared `roundup-workspace-chrome.menu` (cleared
by its `close()`, and by the brand copy at start); shared
`roundup-workspace-chrome.details` false turns the card off. Skip, Daily,
Only when I ask and Show details write shared state from the popup; Check,
Update and Release notes are commands to the brand copy.

Its own art: `logo.png` (160×160, three black sheep), `search.svg`,
`sidebar.svg`, `settings.svg`, `plus.svg`, Lucide's `refresh.svg`,
`bot.svg`, `notes.svg`, `skip.svg`, `check.svg`, `circle-alert.svg`, and
`spinner.svg` (copied from `workspace-chrome`).

**`roundup-pane`** (clone of `pane` 0.1.13, `place: "none"`, title "Pane
header"). One copy per pane, `props()` `{pane, terminal}`, its pane found
in `panes()`. herdr-core can't rename a running terminal (`hc run --name`
only at start), so a terminal pane's name is its core label
`roundup-pane.name`, read from `terminals()[i].labels`, written with
`hc(["label", terminal, "roundup-pane.name=<name>"])` (`…=` removes it); a
mod pane's is in shared `roundup-pane.names` (pane id → name). See
`docs/adr/0001-pane-names-in-core-labels.md`. The chip copies with
`cx.write_to_clipboard` on `click_count === 2`. The rename dialog is the
same mod, `openOverlay({ mod: "roundup-pane", kind: "dialog", width: 380,
height: 196, props: { rename: { pane, terminal, value, fallback } } })`,
shaped like Herdr's `prompt`. It is also the `terminal_menu`: a popup
(`mod.json` `overlay` 240×332), `props()` `{tab: "pane", target: {pane,
terminal}, overlay}`, Herdr's pane menu item for item, drawn by `menu.js`.
Closing is `closePane(pane)` from `close.js` (see `roundup-tabs`). It has no
key command: `cmd-shift-w` goes to `roundup-tabs.close-pane`, since a command
of this mod would reach every shown header. Commands: `pane.focus`, `pane.split`, `pane.zoom`,
`pane.close`, `tab.close`, `terminal.right_click`, `terminal.park`. Its own
art: `rename.svg` (a pencil) and the shipped header's `split-right`,
`split-down`, `zoom`, `unzoom`, `close`; the working spinner is Herdr's
`mods/workspace-chrome/spinner.svg`.

**`roundup-spaces`** (clone of `spaces` 0.1.13, `place: "none"`, title
"Spaces"). Reads `spaces()`, `panes()`, `terminals()` (each agent's `turn`),
`agents()`, `machines()`, `theme()`, `settings().dark`, `window()?.active`
and shared `space.colors` (Herdr's; it adds colors for new spaces and drops
deleted ones'). A space's place is its first terminal's `cwd`, else its
`folder`, on its `machine`. For each place it runs through `exec`, on the
space's machine:

- `git --no-optional-locks -c core.fsmonitor=false status --porcelain=v2
  --branch`: branch (`# branch.head`), ahead/behind (`# branch.ab`),
  uncommitted changes (lines starting with `1`, `2`, `u` or `?`)
- `git rev-parse --show-toplevel --path-format=absolute --git-common-dir`
  (one process): the repo's name, and whether this is a linked worktree. A
  git before 2.31 echoes the unknown `--path-format` and answers a relative
  `.git`; then the checkout counts as its own repo, never as a worktree

It watches each local repo's git folder with `watchFolder`. Through `hc` it
runs `machine ls --json`, and for Connect `machine rm` and `machine add`,
keeping the machine's address until the add succeeds, so a Connect that
failed after the remove can be tried again. Commands: `space.select`,
`space.move`, `space.new`, `pane.focus {pane}` (the quicklook and a lone
agent's badge). Menu: `openOverlay({ mod: "roundup-menu", kind: "popup",
props: { tab: "space", target: { id } } })`. Own art: `bot.svg` (a robot
head in `currentColor`); from Herdr's `mods/workspace-chrome/`: `branch`,
`plus`, `monitor`, `server`, `chevron-down`, `chevron-right`, `folder`.

The quicklook is a gpui-base `HoverCard` (`anchor("top_left")`,
`open_delay(400)`, `close_delay(150)`) around the badge. Its pane maps come
from the space machine's core document `herdr-app`, read when the badge is
entered (macOS and Linux only):

```sh
sh -c 'printf "%s\n" "$1" | hc connect' sh \
  '{"jsonrpc":"2.0","id":1,"method":"doc.get","params":{"name":"herdr-app","on":null}}'
```

through `exec` with a 3s timeout; `on` (the space's `machine`, null here)
goes in the request, not to `exec`. `pane-map.js` takes the answer to id 1
(`result: { value, version }`), finds the tab in `value.spaces[].tabs[]`
by its id without the app's `<machine>/` prefix, and reduces its `root` to
the map: `row`/`column` nodes with `children`, `block` leaves with
`content.terminal` (an agent's `address`, unprefixed) or `content.mod`,
each with `size.weight` (none: 1). It reads one machine at a time and
keeps the last readable answer per machine: a failed read (exit ≠ 0, an
exception or timeout, an answer without a document) keeps the one before,
which may show a tab's old arrangement of splits until a read works again
(a tab whose current agents aren't all in it still goes without a map).
The first failure per machine goes to the log once (`console.log`, the
exit code and first stderr line or the exception), again only after a read
worked; `hc` must be on the PATH that `exec` sees. It reads when a hover on
the badge has lasted 300ms and, while that card may be open (pointer on
badge or card, or less than 200ms away), once per new set of the space's
agents (address and tab) that the tree doesn't hold; a set that turns up
while that machine's read is still running is read for once it is done,
unless its answer already holds it. A new hover, a menu, a click on the
badge or a jump, a press on a row, or the space down to one agent or gone
ends the old one and its timers. Programs' icons as in
the shipped `agents` mod: `svg(icon)` when `tint`, else `image(icon)`.

**`roundup-menu`** (clone of `menu` 0.1.14, `place: "none"`): Herdr's
context menu, which `roundup-spaces` opens for a space. Its one change:
`init` writes its overlay id (`props().overlay`) to shared
`roundup-menu.open`, and `close()` clears the key only while it still holds
that id. `roundup-spaces` never writes the key: a menu open while it
reloads stays marked. A key left by a crash with the menu open keeps the
quicklook empty until the next space menu opens and closes (it writes its
own id, then clears it): a known gap, healed by that, not by waiting.

**`roundup-tabs`** (clone of `tabs` 0.1.13, `place: "none"`, title "Tabs"):
Herdr's tab bar, except how a tab closes (`close.js`). The choice is shared
`roundup-tabs.confirm-close` for tabs, `roundup-pane.confirm-close` for
panes: `never`, `agents` (also when unset) or `always`. A tab's busy agents
are `agents()` with its `tab` and status `working` or `blocked`. Asking
opens `roundup-confirm` as a dialog (400×170) with `command: { name:
"tab.close", args: { id, confirmed: true } }`; not asking runs `tab.close
{id, confirmed: true}` (never) or `tab.close {id}` (agents). The tab menu is
the mod itself as a popup (220×237, `props: { menu: { id, space } }`), drawn
like Herdr's by `menu.js`; Herdr's `menu` would run `tab.close` past the
choice. Key commands: `close` (the shown tab) and `close:<id>`.

**`roundup-confirm`** (clone of `confirm` 0.1.13, `place: "none"`): Herdr's
question dialog, props `{ title, detail, command: { name, args } }`; Confirm
runs `command`. Each button has its own focus handle with `tab_index(0)`;
the dialog keeps the chosen one (Cancel in `init`), moves it on Tab and
Shift-Tab, focuses its handle and rings it. Herdr's own questions ("Close
space?") still use the shipped `confirm`.

**`roundup-preview`** (`place: "none"`, title "Preview"), from
gsydler/herdr-cria's `file-preview` (the `cria-file-preview` mod) at
`82ce1eb`, renamed throughout; its own brief is that repo's
`file-preview/RECIPE.md`. `main.js` draws `preview.js` or, with
`props().part == "menu"`, the ⋯ popup (`menu.js`, `openOverlay({mod:
"roundup-preview", kind: "popup", width: 240})`). Viewers in `viewers/`
(`{id, load, start?, toolbar?, render, release?}`), picked by extension
in `kinds.js`. `image()` reads only from the Herdr home, so pictures are
copied and PDF pages rendered into `data/roundup-preview/`, named by a
hash of the path and its revision (modification time to the nanosecond, or
in ticks on Windows, and size, so a change within a second shows), pruned after 14 days.
The prune runs before an image, PDF or Markdown with images is staged, and a cache hit is
touched (dated now, never made anew; one a prune took meanwhile is copied or rendered again),
so a prune rarely takes a file just picked: one running at the same time may have chosen it
before the touch. A preview left open longer than 14 days can still lose its files to another
preview's prune. Each web-image download
gets names of its own, since two previews may fetch the same URL at once. Live
reload through `watchFolder` on the file's folder; a change counts under the
file's path and under its folder resolved (`pwd -P`: on macOS the watch reports
`/tmp` as `/private/tmp`). A watch that rejects (Linux, above 4096 folders)
gives way to a look at that revision every 3s. A CSV is semicolon-separated
when its first record has more `;` than `,` outside quoted cells. Programs on macOS:
`sh` (`wc -c`, `head -c`, `stat`, `cp`), `sips` (sizes), `osascript -l
JavaScript` with PDFKit (pages, 1600px wide), `curl` and `file` (web
images, after the click), `find`/`mv`/`rm` in its cache only, `git
rev-parse`, the login shell for `$EDITOR`, `open`. Key commands, for scripts
(`scripts/smoke.sh`; none bound), reach every shown copy: `to-tab` (the floating
window's Open in tab), `raw` (Raw on, where the viewer has it), `state` (each copy
writes `{float, loads, raw, length, hash, error, at}` of its text under `tab:<file>`
or `float:<file>` to shared `roundup-preview.debug`; two shown tabs of one file
share a record).

**`roundup-files`** (clone of `files` 0.1.13, `place: "none"`, title
"Files", `focusable: true`). `main.js` draws the panel and, with
`props().menu`, the context menu; `disk.js` lists folders (`sh` here and on
other machines, PowerShell on Windows, as `files` does) and builds the
disk's search index with `find`; `git.js` reads git and git's search index;
`actions.js` opens, reveals, copies and sends; `icon.js` picks from
`icons.js`. The tree is a `v_virtual_list` (clicks through `on_item_click`
and `on_item_secondary_click`) with a `Scrollbar` and a
`VirtualListScrollHandle`. Git runs through `exec` on the folder's machine.
When `git` doesn't start on this Windows machine (installed after Herdr App
started, which keeps the PATH of its start), it tries `C:\Program
Files\Git\cmd\git.exe` and `~\AppData\Local\Programs\Git\cmd\git.exe` and
keeps the one that starts; if none does, the panel says "Git not found",
not "Not a git repository":

- `git --no-optional-locks -c core.fsmonitor=false -c
  diff.autoRefreshIndex=false rev-parse --show-toplevel --show-prefix`,
  once per folder shown inside a repo: again when `.git` in it comes or
  goes, status fails, or status lists a path outside the prefix (a repo
  made between the folder and the one it was read in)
- the same options, `status --porcelain=v2 -z --branch --no-renames
  --untracked-files=normal --ignored=no -- .`: each path's `XY` and the
  branch (`# branch.head`, `# branch.upstream`, `# branch.ab`)
- alongside it, `ls-files -z --others --ignored --exclude-standard
  --directory -- .`: at most 5,000 ignored paths, a folder that is ignored
  or holds only ignored files as one path (what lies below it is left out),
  `ls-files -z --cached --ignored --exclude-standard -- .`: the tracked
  files an ignore rule matches (added with `git add -f`), which with their
  folders don't count as ignored, and `check-ignore -q --no-index -- ./`:
  whether the shown folder is ignored or lies in an ignored folder
- alongside status, `diff HEAD --numstat -z --no-renames -- .` for the
  `+N −N` of files, summed up for folders (it fails before the first commit:
  no lines then)
- for search from git's files, `ls-files -z --cached --others
  --exclude-standard -- .` (an untracked repo inside comes as `dir/`: one
  folder); when it fails (no repo, no git), search reads the disk

A Cmd-double-click, Enter or the menu's Open in tab on a file runs `tab.new {name, mod:
"roundup-preview", props: {file, on, token}}` (`open-file.js`'s `openTab` and
`openCommand`). `run()` names
nothing it made and a mod pane doesn't learn its own id (issue #17), so the
opener takes the one `roundup-preview` pane that wasn't in `panes()` before
(looking again every 200ms, five times) and records it in shared
`roundup-preview.open.v3` (token → `{pane, file, on}`, the file it opened with). Tabs
recorded under `roundup-preview.open.v2` (`previewId` → `{pane, token}`) count beside
them (`upgraded`) until the next record, which takes them over and clears that key. Opens in flight sit in
shared `roundup-preview.opening` (token → `{since, until}`): when another
open overlapped this one in time, or two new panes came, it records none, so
the next click opens another tab rather than focusing a wrong one.
A preview tab writes the file it shows, after a link or Back, under its own
token into `roundup-preview.moved.v2` (token → file); a tab without a token
(opened some other way) writes nothing. A record drops the dead panes' entries from both
keys; a `moved` entry whose token was never recorded stays, as its tab may be alive (an
overlap, or a pane that came after the opener's last look, left it out) and restores from it;
such an entry stays after its tab closed, for good (rare: it takes a tab left unrecorded that
then followed a link). The next click on a file runs
`pane.focus` on a recorded pane that is alive and shows that file now: its
token's `moved` entry, else the file it opened with (`shownIn`, compared by
`previewId` = `[on, pathKey(file)]`, so `C:\repo\b.md` and `c:/REPO/b.md`
are one file). So a tab that followed a link to `b.md` comes to the front for
`b.md`. A tab copy that starts again (a restart, the mod reloaded) shows
its `moved` file, and the window's copy the key's `file`, so neither record
names a file the pane no longer shows. `open-file.js` and `paths.js` are
copies of `roundup-preview`'s; `sync.sh` refuses to install when they differ. The click count comes from
`on_mouse_down("left")` on the list's box (`click_count`), since
`on_item_click` gives none; the row's click then reads it, and Cmd from
the same event's `modifiers.platform` on macOS, `modifiers.control`
elsewhere (`platform` is the Windows key there). A double-click,
Space or Quick look runs `openOverlay(floatSpec({file, on, token}))`
(`open-file.js`: `kind: "window"`, `key: "roundup-preview"`, so opening again
replaces it in place) and writes shared `roundup-preview.float` (`{id, file,
on, token, copy}`; `copy` is the window's running copy, which writes the key
too when it starts, only over its own token). So the panel writes the new
token before `openOverlay` and adds the `id` after it, keeping a `copy` the
window wrote meanwhile (`placed`): its copy may start inside `openOverlay`.
The window's copy (`props().float` = the token) clears that key
in `close()` only while it still holds its token and its `copy`, since a
replaced window closes after the new one wrote it, and a copy that starts
again (the mod reloaded) writes the key back with its own `copy` before the
copy before closes. When the
window follows a link or goes Back, it writes the file it shows into the
key's `file`, again only while it holds its token; the panel compares that
with a row's path by `samePath`, since a link's path comes with `/` on Windows.
The key is saved, the window isn't: it doesn't survive a restart, a layout
switch or a crash, and mods can't list overlays. So a panel copy that starts
while the key is set asks: it writes a fresh `probe` into the key (always,
since an answer may be saved from the last run), and the window's copy,
from a 500ms timer that ends with the window, answers with `alive` = that
probe, only while the key names its token and its `copy`; it writes nothing
when not asked. The panel follows the window only while the key has no
probe or an answered one (`isOpen`); a window opened, or a window copy
started, writes the key without either, so it counts at once. After 1500ms a
probe still in the key unanswered clears it (`unanswered`); a newer probe
(another panel copy asked since) or a window opened since is left alone,
the newer probe's own timer decides. A setShared re-renders every mod and is
saved, so the window answers when asked instead of writing a heartbeat.
The window's Open in tab opens the tab itself, in the space in front
(`openTab`): `tab.new` goes out at once, and the window closes only once the
record in `roundup-preview.open.v3` is settled (at most five looks, 200ms
apart), since its timers end when it closes.
In the window a press drags it unless stopped, so `preview.js` stops
`mouse_down` on its controls and its body and focuses its handle there, for
Esc, unless a field or editor in them took the keyboard on that press: the
PDF's Go to and the read-only `Editor` (code, Raw) sit in `keepsKeys`
(`viewers/text.js`), whose own `mouse_down` runs first and tells the
preview (`env.ownsKeys`). A mod pane has no folder, so the
panel remembers the last terminal folder per space (with its machine) and
shows it while a tab without a terminal is focused; before one was seen,
the first terminal of the space with a folder, else `space.folder`.
Previews in the panel use `readTextFile` and a read-only `EditorState` +
`Editor`. The right-click menu is `openOverlay({mod: "roundup-files", kind:
"popup", width: 228, props: {menu}})`, 28px per item, 9px per divider. Its
Quick look, Open in tab, Preview in panel, Open, Reveal and Send write shared `roundup-files.request` (`{n, action,
from, root, on, rel}`) for the panel to run; `from` is a random id of the
copy that opened the menu: every shown copy reads the request, only that
one runs it, so two windows on
one folder don't act twice. The keyboard menu is the panel's own `Popup`
(gpui-base) on a 1px point in the list's box, running its items itself.
Opening centres the row (`scroll_to_item(i, "center")`), so its place
follows from the list's height, row height and row count; `on_size_change`
reports window pixels, so the height is divided by `settings().zoom`, as in
Herdr's `picker`, and so is the panel's width (for `+N −N` and the bar). A
wheel scroll, a press outside (`on_mouse_down_out`) or its row moving
closes it. Copy uses `cx.write_to_clipboard` and `notify`; Send `focused()`,
`panes()`, `agents()`, `pane.focus {terminal}` and `terminal.paste`; Open
and Reveal `open` / `open -R` (PowerShell `Invoke-Item` / `explorer.exe
/select` on Windows, `xdg-open` elsewhere). Key commands (none bound):
`focus`, `search`, `view:all`, `view:changed`, `source:git`,
`source:disk`, `menu`, and for scripts (`scripts/smoke.sh`) `tab:<rel>` (as
Enter) and `float:<rel>` (as a double-click): every shown panel runs them, so a
script shows one, on the right folder; `rel` is a path below it, anything else
(absolute, `..`, no folder yet) does nothing. Own art: Symbols 0.0.26 by Miguel Solorio in
`icons/` (245 SVGs, with `icons/LICENSE`) and `icons.js`, all written by
`scripts/build-icons.mjs` (`docs/adr/0002-file-icon-set.md`); Herdr's
`chevron-right`, `chevron-down`, `chevron-left`, `branch` and `search`.

**Shipped mods used:** `agents`, `changes`, `workspace-status`, plus
`picker`, `menu` and `machine-add` as overlays.

**Keys:** the `layout:Herdr-Roundup` section binds `cmd-w` to
`roundup-tabs.close` and `cmd-shift-w` to `roundup-tabs.close-pane`, in place of
global `tab.close` and `pane.close`.

## Watch out

- **Name:** the layout file must be `Herdr-Roundup.json`: Settings shows the
  file name, and a name with a space can't be switched to. Mod folders keep
  the `roundup-` prefix; a folder's name is the mod's identity.
- **Block ids** must stay unique; a duplicate crashes Herdr App.
- **Programs, files, network:** `roundup-spaces` runs `git` in every space's
  folder, remote ones too, and `hc` (for the quicklook through `sh`: `hc
  connect`, only `doc.get`). `roundup-files` runs `git`, `sh` and
  `find` (PowerShell on Windows) in the shown folder, on its machine, and
  reads the files it previews. `roundup-preview` runs `sh`, `sips`,
  `osascript`, `git`, the login shell and the editor (Built from), reads
  the file it shows and the local images a Markdown file names, anywhere,
  and writes only to `data/roundup-preview/`; it fetches a Markdown file's
  web images (https, 5 MB, 10 s) only after "Load them".
  `roundup-workspace-chrome` reads the layout's file outside its folder
  and, unless "Only when I ask", sends one GET a day to `api.github.com`
  (generic User-Agent, nothing but the IP). Nothing else reaches the
  network (`machine add` connects to a machine you had).
- **A mod pane has no folder:** `panes()` gives a mod pane `cwd: null`, and
  `space.folder` is where the space's first shell started. Without the
  remembered folder, a click on a file would send `roundup-files`' tree to
  the space's starting folder as soon as the preview tab shows.
- **`run()` returns null:** a command names nothing it made, hence the
  before/after look at `panes()` to find the new preview pane.
- **GitHub's API** allows 60 unauthenticated requests per hour per IP,
  shared with all else on it; over that it answers 403 or 429. Without a
  release (tags don't count) `releases/latest` answers 404, so every release
  needs a GitHub release tagged `v` + the root `"version"`.
- **Click or drag:** in a `window_drag` block a press on logo and name moves
  the window, and its release still arrives as `on_click`. Stopping
  `mouse_down` would cost the drag, so the mod measures: a drag moves the
  pointer 3px or more, or 10 times. The window trails the pointer by only a
  few px, so the distance at release alone isn't enough. `click_count` 2 is
  the double-click that maximizes.
- **The HoverCard draws above popups**, so a card left open covers the menu.
  Its content is empty right after a click until the pointer leaves, and
  while shared `roundup-workspace-chrome.menu` says the menu is open (the
  pointer can come back to the name over it). Herdr gives mods no signal
  for an open overlay, and its `menu` sets no shared state: so the space
  menu is `roundup-menu`, whose `roundup-menu.open` holds the open menu's
  overlay id, and only that menu may clear it (a newer one may have taken
  it).
- **The split arrangement isn't in the mod API:** `panes()` has no
  geometry. The quicklook reads it from the core document `herdr-app`
  (`doc.get` over `hc connect`), whose schema calls it opaque JSON: its
  form can change with any herdr-core. `pane-map.js` therefore checks
  every node and draws no map for a tab with anything it doesn't know
  (`size.px`, another node type, another `content`); never half a map.
  Rows never come from the tree, only their order. Not on Windows (no
  `sh`). A tree read before a new split doesn't have its terminal: the
  tab goes without a map until a read has it.
- **A press on the badge must not start the row's drag**, but its release
  must still reach the row, or a drag of another space let go on the badge
  wouldn't drop: stop only `mouse_down`. A badge press released outside
  the list never reaches a handler here, so leaving the badge forgets it;
  otherwise a later drag let go on that badge would also jump.
- **`line_height(16)` is 16 times the font size**, not 16px, and pushes the
  text out of the 46px row: write `"16px"`.
- **A text in an `h_flex` doesn't wrap** without `min_w(0)`; the reason in
  the card ran past its edge.
- **`h_flex` centers its children across its axis:** the quicklook's pane
  map drew a row's panes 0px high (a line). Its frame and splits
  `items_stretch()`, each tile `self_stretch()`.
- **268px:** on macOS "Herdr Roundup" (92px) leaves 2px beside the search
  button, so nothing fits beside the name; the version goes under it. The
  lit area's padding hangs into the row's margin and gap
  (`pl(6).ml(-6).pr(4).mr(-4)`) so it takes no width.
- **Only shown copies get commands:** with the sidebar hidden
  (`ctrl-shift-b`) the brand row isn't shown, and the toast's action finds
  no one; the rail shows it, without logo, name or point.
- **A popup ends when it closes**, timers and tasks included, and the file
  menu closes on a click. What must outlive it goes to the copy that stays:
  from the brand menu as commands, from the file menu (a timer restoring the
  clipboard, `open`) through `roundup-files.request`.
- **Git must not write under `.git`:** without `--no-optional-locks` and
  `core.fsmonitor=false`, each status touches the index or an fsmonitor
  cookie, which wakes the watch, which runs status again, forever.
  `roundup-files` gives all its git reads these options.
- **Don't watch working trees for `±n`:** on macOS `watchFolder` is
  recursive, ignored folders included, so build output and `node_modules`
  would fire it constantly. `roundup-spaces` watches `.git` only.
- **`window()` can be `null`** (under `herdr-app check`, say): read it with
  `?.`, and not in `init`.
- **Colors are theme names**, not hex, so the layout works light and dark.
  `alpha()` adds transparency only to hex (`#rgb`, `#rrggbb`, `#rrggbbaa`)
  and returns null for a theme name; then avatar and badge sit on
  `selected`, so a letter is never drawn on its own color.
- **Known gap:** Herdr's shipped `picker` turns `ansi1`..`ansi6` into fixed
  hex colors, so a space's color there can differ from its avatar.
- **Pane names stay in the header:** the shipped `agents` list and the tab
  bar still show the program's or the tab's name. A name ends with its
  terminal.
- **A double-click is two clicks:** the first one on the name or the id
  still focuses the pane; only `click_count === 2` acts.
- **Herdr's `tab.close` asks only before a space's last tab goes**, and its
  Settings have no switch for it nor room for a mod's. So the choice sits in
  the tab's own menu, and every way this layout closes a tab goes through
  `roundup-tabs` or `roundup-pane`. Not covered: the command palette's
  `tab.close` and `pane.close`.
- **`pane.close` has no `confirmed`**, and on a space's last pane Herdr asks
  anyway. So a tab's only pane closes with `tab.close`, which takes it;
  another pane with `pane.close`.
- **Mods can't import from each other:** `find()` and `narrow()` are copied
  into both chrome mods, `close.js` and `menu.js` from `roundup-tabs` into
  `roundup-pane` unchanged. `scripts/sync.sh` stops when those two differ.
- **Tab doesn't move a dialog's keyboard by itself:** with two `tab_index`
  buttons it stayed put. The dialog hears Tab go down and moves it
  (`stop_propagation`).
- **Read git's branch from `--porcelain=v2 --branch`:** v1's
  `## main...origin/main [ahead 1]` follows the user's language
  (`[voraus 1]` in German), v2's `# branch.ab +1 -0` doesn't. Its entries
  mark an unchanged side with `.` where v1 has a space.
- **A deletion in git's index isn't a missing file:** after `git rm
  --cached`, status says `D.` with working-tree mode `000000`, as for a file
  really gone, and lists it as new (`?`) too. Not so below a folder git
  lists as a whole, or an ignored one: `roundup-files` asks the disk for
  those (at most 2,000; one not asked counts as there). A submodule is one
  path with `S` in `<sub>`, not a file.
- **`roundup-files` watches its whole folder**, on macOS `.git` and ignored
  folders included. A batch touching only what git ignores outside the open
  folders (a build in `node_modules` or `target`), or outside a repo only
  closed folders, doesn't refresh (a new `.git` in the shown folder does);
  the 10s timer still does. A tracked file an ignore rule matches isn't
  ignored: its edits refresh. A refresh while one runs only marks another
  due: while an agent keeps writing they run back to back, never two at
  once. Ignored paths come from `ls-files
  --directory`, not status: `--ignored=traditional` walks every ignored
  folder in full on each refresh (about four times as long with a
  23,000-file `node_modules`), and `--ignored=matching` lists a new folder
  of only ignored files file by file, so it isn't dimmed. A folder reached
  through a link (`/tmp`, a linked project) is reported resolved
  (`/private/tmp`) while the pane keeps the link: the panel resolves it
  once (`pwd -P`) and places the watch's paths against both, or every batch
  would refresh and search would miss new files.
- **A `roundup-files` refresh costs more git than `files`:** five reads at
  once (status, ignored, forced, `check-ignore`, numstat) where `files` runs
  status alone: 12 ms in a small repo, 351 ms (about 580 ms CPU, 6 % of a
  core every 10s) with 68,000 files (2026-11-07). If that shows, a minimum
  of about 1 s between the watch's refreshes is the lever.
- **A virtual list's rows can't hold handlers:** `on_click` in the row
  renderer throws, and the list draws nothing. Clicks come from
  `on_item_click(key)` and `on_item_secondary_click(key, event)` on the
  list, the path as key; the keyboard menu can't sit in a row either.
- **Icon colors are fixed:** Symbols' SVGs carry their own colors
  (`image()`), the one exception to theme colors; one set serves both.
- **Symbols leans on language ids:** `.css`, `.html`, `.php`, `.vue` and
  more get their icons only through VS Code's languages, which Herdr lacks.
  `scripts/build-icons.mjs` turns them into extensions from a table of VS
  Code's associations (without it those files get the plain document
  icon), and drops the six rules of 0.0.26 that name icons the release
  lacks (`less`, `folder-redux`), as VS Code ignores them.
- **Limits:** a folder shows its first 500 entries of the first 10,000 it
  reads and sorts, so a few that sort early (folders, dotfiles) may be
  missing. Changed stops at 2,000 paths because its tree is built on every
  render (about 70 ms for 5,000 in Herdr's runtime) and every arrow key
  would wait for it. Past the search limits a folder is searched only in
  part; the footer says which limit cut it.
- **No search from the disk on Windows yet** (issue #10): `Get-ChildItem
  -Recurse` walks into `node_modules` and the other pruned folders before
  dropping them, so it needs a walk of its own.
- **An overlap stops recording for a while:** an open that overlapped
  another and never saw its pane keeps `until: null`, so every later open
  within 10 s overlaps it and records none either: while files are opened
  less than 10 s apart, a second Cmd-double-click opens another tab. Ending
  it once any new pane comes is wrong: two overlapping opens can both see
  the first one's pane, and a later open then takes the late second pane as
  its own. Counting the panes of the whole overlapping group works only
  with an observer that outlives each open's five looks; until `run()`
  names the pane it made (issue #17), this stays.
- **Open in tab keeps the window up to a second:** the window opens the tab
  and waits for its pane before it closes (its timers end with it). Closed
  by hand meanwhile, the tab isn't recorded: the next click on the file
  opens a second tab instead of focusing the first, and its open stays in
  `roundup-preview.opening` without an end, so opens in the next 10s record
  none either. Handing the open to the panel let the window close at once,
  but lost it when that panel copy had ended.
- **A slow window answer drops the key:** a window that doesn't answer a
  probe within 1500ms (a blocked app) loses the key though it is open; the
  panel stops following it and its `close()` has nothing to clear. The next
  Space or double-click replaces it (same window `key`).

## Done when

- `herdr-app check` passes for every `roundup-` mod, `herdr-app status`
  shows no errors, and `layout.switch {"name": "Herdr-Roundup"}` shows the
  window.
- The top left shows the logo, "Herdr Roundup" and the version under it; at
  268px nothing truncates the name, and dragging the name moves the window
  without opening the menu.
- Hovering logo or name shows the card (Installed, Based on `Herdr 0.1.13`,
  Latest, Checked); clicking opens the menu with those facts on top, and no
  card shows over it.
- With a newer release on GitHub, the logo has the point, the second line
  says `<version> available`, and exactly one toast came; a reload or
  restart brings no second. A copy at the latest version shows neither.
- Check for updates answers "up to date", "<version> is out" or "Couldn't
  check for updates" (before the first release: "No release on GitHub
  yet"); the automatic check stays quiet on that.
- The toast and "Update to <version> with an agent…" open a tab "Update
  Herdr Roundup" in the app's folder with an installed agent and the brief,
  versions and app's folder filled in; with a space on another machine
  shown, the tab opens in a space on this computer.
- A check finding a newer release while the menu is open changes the
  version in its labels: the label names what the action installs. Menu and
  toast send that version with the command (`update@<version>`,
  `notes@<version>`), so a check ending between click and command doesn't
  change it.
- Skip <version> keeps point, line and toast away until a newer version.
- `lastCheck` changes at most once a day across reloads and restarts, and
  not at all with Only when I ask.
- With Show details on hover off, hovering shows no card; the menu still
  shows the facts.
- A space in a repo of another name, on branch `feat/x`, shows `repo ·
  feat/x` under its name in a 44px row. A space named after its repo, clean
  on `main`, is a single 32px row.
- Editing a file in that space's terminal shows `±1` within 10s (at once
  after an agent's turn or a longer command); editing it in an outside
  editor shows `±1` on switching back to Herdr.
- Two worktree spaces of one repo, with no space in its main checkout, sit
  on one card under the repo's name, each with a branch icon for an avatar.
  A space in the main checkout then heads the card instead of the header.
- An agent started in a space shows a badge with `1`: gray while idle, in
  `working` while it works, in `blocked` while it waits for you. A click on
  it goes to that agent's pane.
- With a second agent in a split of another tab, hovering the badge shows
  the quicklook: both agents under their tabs, each tab's map split as the
  panes are (also right after dragging a divider and opening it again);
  hovering a row lights its pane; a click goes there, switching space and
  tab. A right-click on the row shows the menu with no card over it, and
  the card comes back once the menu is closed and the badge entered again.
- The sidebar toggle narrows to the rail (numbers and `●`/`·`) and widens
  back to the width it had.
- Every pane header shows its terminal's address (`t5j`); double-clicking
  it copies `t5j`. `hc label t5j roundup-pane.name=Build` shows "Build" in
  that header within a second; so does renaming in the dialog, and saving
  an empty name shows the program's name again.
- With "While an agent works", `cmd-w` on a tab whose agent works asks
  "Close tab …?" and Cancel keeps it; a tab with only a shell closes at
  once. With "Always" the shell's tab asks too; with "Never" neither does.
- With "While an agent works" for panes, in a tab split into an agent and a
  shell, `cmd-shift-w` asks "Close pane …?" on the working agent's pane and
  closes the shell's at once. With "Never" for panes and "Always" for tabs,
  a tab's only pane still asks. On a space's last pane the question adds
  that the space closes too. A terminal's right-click shows Close pane and
  "Ask before closing a pane"; choosing there leaves the tabs' choice as it
  was.
- In the question, Enter right away cancels; Tab, then Enter closes.
- In a light and a dark theme, every avatar letter and badge count can be
  read.
- The Files button shows `roundup-files`; Changes still shows Herdr's diff
  and commit panel.
- In a repo with a modified, a new, a staged, a deleted and an ignored
  file, the branch row shows the branch and `↑n ↓n` as `git status -sb`
  does; the files show `M`, `?`, `A` and their `+N −N`, the ignored one is
  dim, their folders show the counts. Changed lists exactly what `git
  status -s` lists, the deleted file struck through. Editing or deleting a
  file shows within a second, without a restart.
- Files and folders, open ones too, show Symbols icons in light and dark
  themes (`package.json`, `Dockerfile`, `style.css`, `index.html`, `src/`,
  `.github/`).
- Typing the name of a file in a never-opened folder finds it;
  `node_modules` stays out. Enter opens a file in a preview tab. In a repo,
  an ignored `.env` is found only with the switch on the disk; outside a
  repo, search works with the switch hidden.
- ↑ ↓ → ← Enter and Esc work as described; right-clicking a file shows the
  menu, Preview in panel shows it in the panel and Esc goes back, and Copy
  relative path puts the path on the clipboard.
- A click on a file selects it; a double-click shows it in the floating
  preview, which then follows the selection. A Cmd-double-click (Enter
  too) on a `.md`, `.pdf`, `.png`, `.csv` and `.json` file opens a tab
  named after it with the Markdown rendered (its local SVG drawn inline),
  the PDF's pages, the picture with its size, a table with a fixed header,
  and a JSON tree. Another Cmd-double-click on the same file brings that
  tab back instead of a new one. With the terminal `cd`'d into a subfolder,
  the tree still shows that subfolder while the preview tab is in front.
- In the floating preview of a PDF, typing a page into Go to and Enter
  jumps there; in a code file or Raw, a selection copies with Cmd-C. Open
  in tab opens the tab even though the window closes at once, and the next
  Cmd-double-click on that file brings the tab back.
- `node --test 'tests/*.test.mjs'` passes (Node 22.15 or later).
- A folder without git shows "Not a git repository" and its files; one with
  more than 500 entries says so in the footer.
