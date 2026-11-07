# 0001: A terminal pane's name is a core label

- **Status:** Accepted
- **Date:** 2026-11-06
- **Concerns:** `mods/roundup-pane/main.js` (`givenName`, `saveName`)

## Context

Panes had no name of their own. Herdr's pane header shows the program
("Claude Code", "zsh") or the terminal's title, so two Claude panes look the
same. `roundup-pane` lets the person name a pane. Herdr App has no
`pane.rename` (only `space.rename` and `tab.rename`), and herdr-core gives a
terminal a name only when it starts (`hc run --name`, 1-32 of `a-z 0-9 - _`);
nothing renames a running one. So the name has to be kept somewhere else.

## Options

### A. Shared state of Herdr App, keyed by pane id

`setShared("roundup-pane.names", { [pane]: name })`.

- Pro: works the same for terminal panes and mod panes.
- Con: only this Herdr App sees it; another Herdr client on the same core
  (another screen, the other machine) shows no name.
- Con: names of closed panes stay in the map until something cleans them up.

### B. A label on the terminal in herdr-core (chosen for terminal panes)

`hc label t7 roundup-pane.name=<name>`; read back from `terminals()[i].labels`.
Herdr itself keeps per-terminal facts this way (`herdr.pinned`).

- Pro: lives and ends with the terminal: no cleanup, nothing stale.
- Pro: every Herdr client and every `hc` user sees it (`hc get t7`).
- Pro: any text, spaces and umlauts included.
- Con: an `hc` call per rename (fast, local or on the terminal's machine).
- Con: a mod pane has no terminal to carry it.

### C. Start terminals with `--name`

- Con: only at start, restricted characters, and must be unique among live
  terminals. Doesn't name an existing pane.

## Decision

B for terminal panes, A for mod panes (they have nothing else). The key
follows the repo's rule for a mod's own state: `roundup-pane.name` as the
label, `roundup-pane.names` as the shared key.

## Consequences

- An agent or script can name a pane from outside:
  `hc label t7 roundup-pane.name=Build`; the header follows within a second.
- Only `roundup-pane` shows the name. The shipped `agents` and `tabs` lists
  don't read the label; cloning them would be needed for that.
