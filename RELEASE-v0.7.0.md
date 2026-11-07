# Herdr Roundup 0.7.0

The first release on GitHub. Herdr Roundup is a layout for Herdr App, built on Herdr's default layout (`main`, Herdr 0.1.13): a quieter window that says more about where each space stands. These notes cover everything since the project began.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.7.0/preview.png)

## Highlights

- **Spaces at a glance:** each space shows its repo, branch, ahead/behind and uncommitted changes, plus a badge with its agents. Worktrees of one repo share a card.
- **A file panel with git built in:** all files or only the changed ones, each with its git status and lines changed, and search across folders you haven't opened yet.
- **Closing asks only when it matters:** you choose whether closing a tab or pane asks first, for example only while an agent is working.
- **Pane names of your own:** each pane header shows the terminal's id, and you can rename the pane there.
- **Updates in place:** the layout checks once a day for a newer release, and your agent installs it after asking you.

## Sidebar

- Three sheep and the name Herdr Roundup at the top left, with the installed version under the name.
- **Spaces:** each space has a softly tinted initial. A second line shows repo · branch, `↑ahead ↓behind` and `±n` uncommitted changes.
- The agent badge stays gray while every agent is idle. Otherwise it takes the color of the most urgent agent: blocked, done or working.
- A repo and its worktree spaces sit together on one card, and you drag the card as one.
- Change counts refresh when the window comes to the front and after an agent's turn. Spaces that are there at start appear together, not one by one.

## Tabs and panes

- **Pane headers** show the terminal's id (`t7`) beside the pane's name. A double-click copies the id.
- **Rename a pane** with a double-click on its name or the pencil that appears on hover. The name stays with the terminal.
- **Ask before closing:** in the tab's right-click menu, choose *Never*, *While an agent works* (the default) or *Always*. Panes have their own choice, in the terminal's right-click menu.
- The question starts with **Cancel** selected, so Enter on its own closes nothing. Tab moves to Confirm, and Esc cancels.
- `cmd-w` closes the tab and `cmd-shift-w` closes the focused pane, both through your choice.

## Files panel

Open it with the **Files** button at the right of the tab bar. It shows the focused pane's folder.

- **All | Changed:** All shows the folder tree. Changed lists exactly what `git status` lists, deleted files included.
- **Git state on every row:** names are colored by status, and files end with `+N −N` and their status letter. Folders show counts of new, modified and deleted files below them, and paths git ignores are dimmed.
- **Branch row:** the branch, ahead/behind, the lines changed, and a bar of modified, new and deleted paths.
- **Search** covers folders you haven't opened yet. It reads git's files by default, so ignored folders like `node_modules` stay out; a switch in the search field searches the disk instead.
- **Preview** a file in the panel. The right-click menu (or the Menu key) can also open, reveal, copy paths, or send `@path` to the tab's agent.
- **Keyboard:** arrows, Enter, Space, `/` for search and Esc.
- File and folder icons come from Symbols and look right in light and dark themes.
- Large repos stay fast: Changed shows the first 2,000 paths, folders their first 500 entries, and the panel says when it cuts a list short.

## Updates

- Once a day, the layout asks GitHub for its latest release. It sends a plain request with a generic name, so GitHub sees nothing but your IP address.
- When a newer version is out, the logo gets a point, `<version> available` shows under the name, and one notification appears.
- Click the logo or name for the menu: check now, update, read the release notes, skip a version, or switch to *Only when I ask*. A hover card shows the details, and you can turn it off there.
- **Update** opens a tab with your agent. It reads the release, tells you what would change, and asks before it installs anything.

## Before you update

For the person, or the agent, installing this release:

- `scripts/sync.sh` replaces the layout file, every `roundup-*` mod in `mods/`, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Edits you made to those are lost; your global keys, other layouts and Herdr's own mods stay untouched. Sizes, hidden columns and theme picks in `layouts/.state/` stay too.
- The layout's keys are `cmd-w` (close tab, asking as chosen) and `cmd-shift-w` (close pane).
- **What the mods reach:**
  - `roundup-workspace-chrome` reads `api.github.com` once a day.
  - `roundup-spaces` and `roundup-files` run `git`, and `roundup-files` also runs `find` and opens files with the system's opener.
  - `roundup-pane` runs `hc label` to store pane names.
- Coming from 0.6.0 or earlier: there was no update check yet, so install this release by hand. Clone the repo at `v0.7.0` and run `scripts/sync.sh`. Later releases can then go through the menu.
- On Windows, search in the Files panel reads only git's files for now; there is no disk search there yet.
