# 0003: Catppuccin Icons, pinned and generated, Latte and Mocha only

- **Status:** Accepted
- **Date:** 2026-11-06
- **Concerns:** `scripts/build-icons.mjs`, `mods/roundup-files/icon.js`,
  `mods/roundup-files/icons.js`, `mods/roundup-files/icons/`

## Context

`roundup-files` replaces Herdr's `files` in the side panel and gives files and
folders the icons people know from their editor. Herdr draws a mod's own SVGs
with `image()` in their own colors, so an icon set has to ship as files in the
mod's folder, with the rules that pick an icon for a name. The layout works in
light and dark themes, so the icons must read on both.

Which set, and how it gets into the repo, were open.

## Options for the set

### A. Material Icon Theme (as `cybertron288/herdr-mods` `file-icons`)

- Pro: the most common set in VS Code; the reference mod already uses it.
- Con: its colors are its own, not tuned to light or dark; 1,180 SVGs.

### B. Catppuccin Icons (chosen by Carsten)

- Pro: one design in four flavors with matching palettes; Latte is made for
  light backgrounds, Mocha for dark ones.
- Pro: its release carries the compiled VS Code icon theme per flavor, so the
  rules come ready to use.
- Con: fewer special icons than Material.

## Options for the storage

### A. Copy the SVGs and rules by hand

- Con: nobody can tell later which version they are, or redo the copy.

### B. Fetch at run time

- Con: the panel would reach the network; offline, no icons.

### C. A generator at a pinned release (chosen)

`scripts/build-icons.mjs` downloads the `.vsix` of release 1.26.0, checks its
SHA-256, reads `dist/latte/theme.json` and `dist/mocha/theme.json`, and writes:
the SVGs any rule names (621 per flavor, about 400 KB), Catppuccin's `LICENSE`
beside them, and `icons.js` (data only: `fileNames`, `fileExtensions`,
`folderNames`, `folderNamesExpanded`, the default file, folder and root icons).

- Pro: reproducible: running it again gives the same files; a new release is
  a change of `VERSION` and `SHA256`.
- Pro: the repo holds what Herdr loads, so `scripts/sync.sh` just copies it.
- Con: about 1,250 small files in the repo.

## Only Latte and Mocha

The two other flavors, Frappé and Macchiato, are dark too. Herdr only says
light or dark (`settings().dark`), so a third and fourth set would never show.

## Decision

Catppuccin Icons 1.26.0, generated, Latte for light themes and Mocha for dark
ones.

## Consequences

- `icon.js` matches as VS Code does: lower-case names; a rule naming a path
  beats one naming the last part, a file's name beats its extension, the
  longest extension wins. Both flavors share one rule table; the generator
  stops if they ever differ.
- The theme also maps VS Code language ids, which Herdr doesn't have. The
  generator fills the gaps from VS Code's built-in associations for the ids
  the theme uses (`diff` → `.diff`, `.patch`, `.rej`, ...); the theme's own
  extensions and names always win.
- The icons are pictures in fixed colors: the one deliberate exception to the
  rule that colors are theme names. Chevrons, text and git marks stay in
  theme colors.
- `THIRD_PARTY_NOTICES.md` lists the set and its licence.
