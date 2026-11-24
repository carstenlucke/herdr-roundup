# 0001: A pane's name is Herdr's own (`pane.rename`)

- **Status:** Accepted (rewritten 2026-11-24; first decided 2026-11-06 as "a terminal pane's name is a core label")
- **Date:** 2026-11-24
- **Concerns:** `mods/roundup-pane/main.js` (`adopt`), `mods/roundup-pane/header-text.js` (`oldName`), `close.js` (`givenName`)

## Context

Herdr's pane header shows the program ("Claude Code", "zsh") or the
terminal's title, so two Claude panes look the same. `roundup-pane` lets
the person name a pane.

When this was first decided, Herdr App had no `pane.rename` (only
`space.rename` and `tab.rename`), and herdr-core named a terminal only when
it started. So Roundup kept the name itself: a terminal pane's as the core
label `roundup-pane.name`, a mod pane's in shared state `roundup-pane.names`,
with a rename dialog of its own.

Herdr 0.1.17 added `pane.rename {pane?, name}`: the name is kept on the
pane's node in its tab's layout document, read as `panes()[i].name` and
`agents()[i].pane_name`; without a name it asks in Herdr's prompt. The
reason for the label is gone, so the question was asked again.

## Options

### A. Shared state of Herdr App, keyed by pane id

`setShared("roundup-pane.names", { [pane]: name })`.

- Pro: works the same for terminal panes and mod panes.
- Con: only this Herdr App sees it.
- Con: names of closed panes stay in the map until something cleans them up.

### B. A label on the terminal in herdr-core (the decision up to 0.11.0-beta.3)

`hc label t7 roundup-pane.name=<name>`; read back from `terminals()[i].labels`.

- Pro: lives and ends with the terminal: no cleanup, nothing stale.
- Pro: every `hc` user sees it (`hc get t7`), and a script names a pane
  with one `hc label`.
- Con: only `roundup-pane` reads it. Herdr's own lists, the shipped `pane`
  header in another layout and other people's mods show no name.
- Con: a mod pane has no terminal, so it needs option A beside it.
- Con: a rename dialog of Roundup's own (Herdr's `prompt` only runs app
  commands), and an `hc` call per rename.

### C. Start terminals with `--name`

- Con: only at start, restricted characters, and must be unique among live
  terminals. Doesn't name an existing pane.

### D. Herdr's `pane.rename` (chosen)

- Pro: one name for every layout and mod: the shipped header shows it,
  `agents()` carries it as `pane_name`, the command palette and a key can
  rename.
- Pro: terminal panes and mod panes alike, saved with the tab, so it
  outlives a restart; nothing stale, nothing to clean up.
- Pro: no dialog, no `hc` call and no shared map of Roundup's own.
- Con: the name belongs to the pane, not the terminal: a terminal sent back
  to its parent (`terminal.park`) and kept again starts unnamed.
- Con: `hc get t7` no longer shows it; from outside it is
  `herdr-app do pane.rename --pane <id> --name Build`, which needs the app.
- Con: needs Herdr 0.1.17.

## Decision

D, for terminal panes and mod panes. B and A stay only as the place old
names are read from once.

## Consequences

- `roundup-pane` renames through `run("pane.rename", {pane})`: the name,
  the pencil and Rename in the terminal's menu. Its own dialog, `saveName`
  and the 48 character cut are gone; Herdr trims and sets no limit, the
  header and the close dialog cut what doesn't fit.
- A name from before moves over without the person doing anything: a
  header that finds the old label or shared entry gives it to its pane and,
  once the pane shows a name, removes the old one (in the same look of its
  2 s timer when the rename shows at once, else at the next; a rename that
  didn't arrive keeps the old name). Before a terminal's label is asked to
  go, the terminal goes into shared `roundup-pane.moved`, which keeps it
  until the label is visibly gone: its pane never gets the old name again,
  so a removal that failed can't bring back a name the person cleared. A
  pane not shown since the update moves when it is first shown.
- `hc label t7 roundup-pane.name=Build` still names a pane that has no
  name, as a side effect of the move. It is no interface any more: a pane
  that has a name ignores it.
- Roundup's agents list and space rows can show `pane_name` without a
  store of their own. Whether they should is a separate question.
- Roundup needs Herdr 0.1.17 or later.
