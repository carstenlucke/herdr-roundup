# Architecture decisions

The few decisions that need their reasons kept, each with the options weighed
and why one won. The details are in `docs/adr/`, one file per decision.

| # | Decision | Status | Date |
| --- | --- | --- | --- |
| [0001](adr/0001-pane-names-in-core-labels.md) | `roundup-pane` keeps a terminal pane's name as the core label `roundup-pane.name`, not in Herdr App's shared state | Accepted | 2026-11-06 |
| [0002](adr/0002-file-icon-set.md) | `roundup-files` draws Symbols, chosen from nine icon sets on taste and licence | Accepted | 2026-11-06 |

## When to write one

- **ADRs are rare.** Write one only for a decision that is architecturally
  fundamental **and** hard to reverse (0001: the label is what agents and
  scripts write from outside), or for a **selection among evaluated
  alternatives** (library, tool, icon set, approach) whose comparison would
  otherwise be lost, even if the choice itself is easy to swap (0002: it
  records why the other sets were ruled out).
- A feature's behaviour, a reworked feature or a corrected rule is not an
  ADR: it belongs in `RECIPE.md` (the current state), a comment at the code,
  and the PR. A limit of Herdr found on the way goes in `CLAUDE.md`
  ("Limits found so far").
- When in doubt: no ADR. A request for an ADR that doesn't meet this bar gets
  pushed back on, not a new ADR.
- When a decision is revisited, its ADR is rewritten to the new state, the new
  comparison included; git keeps the old one. There is one ADR per question,
  not a chain of superseded ones.

## Writing one

Copy the shape of an existing ADR: context, options with their pros and cons
(a table where there are many), the decision, and what follows from it. Add a
row above, and link the ADR from the code or the recipe where the decision
shows.
