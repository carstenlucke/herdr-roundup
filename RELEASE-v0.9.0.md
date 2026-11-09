# Herdr Roundup 0.9.0

The agent count beside a space now shows which agents run there and where. Rest the pointer on it and a card lists them by tab, with a small map of each tab's panes; a click takes you to one.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.9.0/preview.png)

## Spaces

- **Agent quicklook:** with two or more agents in a space, hovering its agent badge for a moment opens a card. A click on the badge switches to the space, as before. The agents are grouped by tab, each with its status dot, program icon, terminal title and status word ("needs you", "done", "working", "idle").
- **Pane map:** beside each tab a small map of its panes, split as they are on screen. An agent's pane has its status color; other terminals are gray, a mod pane (a preview, say) is an outline. Rest the pointer on a row and its pane lights up.
- **Jump:** a click on a row or on an agent's pane goes to that pane, switching space and tab.
- **One agent:** the badge keeps its tooltip, and a click on it now goes to that agent.
- **Without a map:** when the map can't be read (Windows, a machine away, a form this version doesn't know, a split made a moment ago), the card shows the same rows without maps, a little narrower. No error.
- The card stays away while the space's menu is open, and during a space drag. A press on the badge no longer starts dragging the space.

## Before you update

For the person, or the agent, installing this release:

- `scripts/sync.sh` replaces the layout file, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`, as before. Edits you made to those files are lost. Your global keys, other layouts and Herdr's own mods stay untouched.
- **A new mod:** `roundup-menu`, a clone of Herdr's `menu` (0.1.14). The space menu now comes from it; its one change is that it writes its overlay id to the shared key `roundup-menu.open` while open, so the card can stay out of its way. Every other menu is still Herdr's.
- No key changes.
- **What changes in what the sidebar runs:** when the pointer rests on the agent badge of a space with two or more agents for 300 ms, `roundup-spaces` runs `sh -c 'printf … | hc connect'` once to read that machine's layout document (`doc.get` of `herdr-app`, read only, 3 s timeout), and once more while the card is open when the space's agents move to splits the last read didn't have. Passing over a badge runs nothing. Nothing is written. Not on Windows. It needs `hc` on your PATH (Herdr installs it in `~/.local/bin`); if a read fails, the card shows its rows without new maps and the log says why, once.
- The pane map relies on herdr-core's layout document, whose form Herdr doesn't promise. If a later herdr-core changes it, the card shows its rows without maps.
