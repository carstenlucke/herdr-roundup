# 0001: The first draw of the spaces panel waits for git

- **Status:** Accepted
- **Date:** 2026-11-06
- **Concerns:** `mods/roundup-spaces/main.js` (`init`, `ordered`)

## Context

`roundup-spaces` draws a space's row from git: a row with a git line is 44px
high, one without is 32px, and a repo's worktree spaces sit together on one
card. All of that needs a `git status` and a `git rev-parse` per place, run one
after another, on remote machines through `exec`.

Spaces made while the panel runs already wait up to 1.5s for their git, so a
worktree appears on its repo's card instead of jumping there. The spaces that
already exist when the panel starts (Herdr starts, or `scripts/sync.sh`
reloads the mod) were shown at once, before any git had answered. Then, as the
answers came in one by one, rows grew from 32 to 44px and moved onto their
cards, and `ordered()` could move a worktree twice while only half the repos
were known. The list jumped for a moment on every start.

## Options

### A. Show everything at once, as before

- Pro: the names are there from the first frame.
- Pro: no code.
- Con: the list grows and regroups row by row on every start.
- Con: with half the git known, `ordered()` may run `space.move` for a
  grouping that the next answer undoes.

### B. Remember the last git answers in `localStorage`

Draw the first frame from the answers of the last run, then let the fresh ones
correct it.

- Pro: the list is complete and grouped from the first frame, remote machines
  included.
- Pro: no "Loading…" at all.
- Con: the first frame can be wrong: a branch switched, a worktree removed or
  files committed while Herdr was closed. It then changes anyway, only less
  often.
- Con: more code: when to write the cache, how to drop places that are gone,
  what to do when the stored shape changes between versions.

### C. Let the spaces there at start wait too (chosen)

Treat them like new spaces: none is shown until every one of them has its git
answer (or has no place to ask about), or 1.5s have passed. Then they appear
together. `ordered()` moves no space before that.

- Pro: one consistent rule for new spaces and those at start.
- Pro: small: a set of the spaces there at start, a start time, and one check
  before reordering.
- Pro: what shows is never stale: it comes from this run's git.
- Con: up to 1.5s of "Loading…" on every start and every reload of the mod.
  Local git usually answers in a few milliseconds per place, so in practice
  it is short.
- Con: a slow remote machine still decides the wait, up to the 1.5s cap; its
  spaces may then show without git and regroup when it answers.

## Decision

Option C. A short wait on start is cheaper than a cache that can show an old
state, and it reuses the rule that new spaces already follow. If the wait
turns out to be noticeable (many places, slow machines), B is the next step;
it can be added on top of C without changing it.

## Consequences

- `this.shown` starts empty; `this.first` and `this.start` mark the spaces
  there at start. `ordered()` shows them all at once when they are ready, and
  reorders nothing before.
- A space without a place (no terminal folder, no `folder`) counts as answered,
  so it never holds up the list.
- `RECIPE.md` ("At start") describes the wait.
