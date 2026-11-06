# Architecture decisions

Decisions about how the layout and its mods work, each with the options weighed
and why one won. The details are in `docs/adr/`, one file per decision,
numbered in the order they were made. A decision that is replaced keeps its
file; its status names the one that replaced it.

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| [0001](adr/0001-first-draw-waits-for-git.md) | `roundup-spaces` shows the spaces there at start together, after up to 1.5s for their git, instead of row by row or from a cache | Accepted | 2026-11-06 |
| [0002](adr/0002-pane-names-in-core-labels.md) | `roundup-pane` keeps a terminal pane's name as the core label `roundup-pane.name`, not in Herdr App's shared state | Accepted | 2026-11-06 |

## Writing one

Copy the shape of an existing ADR: context, options with their pros and cons,
the decision, and what follows from it. Add a row above, and link the ADR
from the code or the recipe where the decision shows.
