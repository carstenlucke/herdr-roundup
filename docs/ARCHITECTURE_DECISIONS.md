# Architecture decisions

Decisions about how the layout and its mods work, each with the options weighed
and why one won. The details are in `docs/adr/`, one file per decision,
numbered in the order they were made. A decision that is replaced keeps its
file; its status names the one that replaced it.

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| [0001](adr/0001-first-draw-waits-for-git.md) | `roundup-spaces` shows the spaces there at start together, after up to 1.5s for their git, instead of row by row or from a cache | Accepted | 2026-11-06 |
| [0002](adr/0002-pane-names-in-core-labels.md) | `roundup-pane` keeps a terminal pane's name as the core label `roundup-pane.name`, not in Herdr App's shared state | Accepted | 2026-11-06 |
| [0003](adr/0003-catppuccin-icons-pinned-and-generated.md) | `roundup-files` draws Catppuccin Icons (Latte light, Mocha dark), vendored from a pinned release by `scripts/build-icons.mjs` | Superseded by 0006 (the set; the generator stays) | 2026-11-06 |
| [0004](adr/0004-file-tree-draws-before-git.md) | `roundup-files` shows the files at once and lets git fill in its marks, unlike 0001: git moves no rows there | Accepted | 2026-11-06 |
| [0005](adr/0005-file-menu-acts-through-the-panel.md) | The file menu (a popup copy of `roundup-files`) asks the panel to act through shared `roundup-files.request` | Accepted | 2026-11-06 |
| [0006](adr/0006-symbols-icons-replace-catppuccin.md) | `roundup-files` draws Symbols instead of Catppuccin Icons: modern, MIT throughout, maintained; one set for light and dark | Accepted | 2026-11-06 |

## Writing one

Copy the shape of an existing ADR: context, options with their pros and cons,
the decision, and what follows from it. Add a row above, and link the ADR
from the code or the recipe where the decision shows.
