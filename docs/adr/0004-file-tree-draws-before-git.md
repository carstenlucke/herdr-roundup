# 0004: The file tree draws before git answers

- **Status:** Accepted
- **Date:** 2026-11-06
- **Concerns:** `mods/roundup-files/main.js` (`refresh`, `summary`, `note`)

## Context

[ADR 0001](0001-first-draw-waits-for-git.md) lets `roundup-spaces` wait up to
1.5s for git before its first draw, because there git decides the rows' height
and order: without it the list grows and regroups row by row.

`roundup-files` also shows git: a branch row, a status letter and +/− lines on
each path, counts on folders, and the Changed view. Should its first draw wait
for git too?

## Options

### A. Wait for git, as in 0001

- Pro: the first frame is complete.
- Con: the files would wait for git although they don't need it; in a big
  repo, `git status --ignored` and `git diff --numstat` take noticeably longer
  than listing one folder.
- Con: a folder without git, or a slow remote machine, would hold up the list
  for the whole wait.

### B. Draw the files at once; git fills in without moving anything (chosen)

- Pro: the files show as soon as the folder is listed.
- Pro: nothing jumps. Git changes only colors and the small marks at the right
  end of a row; rows keep their height and order. The branch row is 46px high
  in every state ("Reading git…", "Not a git repository", a branch), so the
  search field and the tree below it never move.
- Con: for a moment the rows are plain and the branch row says "Reading git…".

## Decision

Option B. The reason for 0001, rows that change height and order, doesn't
apply here: git adds marks to rows that are already in place.

## Consequences

- The Changed view does depend on git; until it answers, it says
  "Reading git…" instead of showing an empty list.
- Every refresh lists the open folders first, then reads git. A folder that
  changes on disk shows its new files at once and their marks right after.
