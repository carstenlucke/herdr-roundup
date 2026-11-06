# 0006: Symbols replaces Catppuccin Icons

- **Status:** Accepted
- **Date:** 2026-11-06
- **Replaces:** the choice of set in [0003](0003-catppuccin-icons-pinned-and-generated.md)
  (its pinned, checked generator stays)
- **Concerns:** `scripts/build-icons.mjs`, `mods/roundup-files/icon.js`,
  `mods/roundup-files/icons.js`, `mods/roundup-files/icons/`

## Context

Seen in the panel, Carsten found Catppuccin's line icons old-fashioned. Nine
VS Code icon themes were compared on 30 typical files and folders, dark and
light, at 16px. They differ in size, look, licence and upkeep.

## Options

### A. Material Icon Theme

- Pro: the biggest rule set (1,256 icons, rules for 3,547 file names and
  extensions and 4,674 folder names); MIT throughout; maintained daily.
- Con: colorful and dense; louder than the rest of the layout.

### B. vscode-icons

- Pro: the most icons (1,504).
- Con: MIT covers only the code. The icons are CC BY-SA 4.0 (attribution,
  share-alike for changed icons), and brand logos fall under their owners'
  licences, unnamed per icon.

### C. Charmed

- Pro: modern and soft; MIT throughout; its own light variant.
- Con: one author, version 0.10.0, no commit since 2025-05-25. It is "heavily
  inspired" by a theme that is itself a modified copy of Google IDX's, which
  can't be checked icon by icon.

### D. Symbols (chosen by Carsten)

- Pro: reduced and modern, calm at 16px next to the layout's own glyphs.
- Pro: MIT throughout (code and icons, (c) Miguel Solorio); no third-party
  sources named; maintained (commits this week, releases about every six
  months, 554 stars).
- Con: smaller: 346 icons in the theme, 440 extension and name rules, 158
  folder rules. Rarer files show the plain document icon (`LICENSE`,
  `Cargo.toml` show a gear or a page).
- Con: many icons hang on VS Code language ids (`.css`, `.html`, `.php`,
  `.vue`), which Herdr lacks.

## Decision

Symbols 0.0.26, from the `.vsix` of its GitHub release (identical to the one
on Open VSX), checked by SHA-256, as 0003's generator did for Catppuccin.

## Consequences

- One set for light and dark themes: the icons carry mid-tone colors that read
  on both, so `icon.js` no longer looks at `settings().dark`.
- The generator maps the theme's language ids to extensions and names with a
  table of VS Code's associations; the theme's own rules win. It drops rules
  that name icons the release doesn't contain (six in 0.0.26: `less`,
  `folder-redux`), as VS Code ignores them.
- Symbols has no open-folder icons; an open folder keeps its icon, as in
  VS Code.
- Symbols lists some whole names as extensions (`tsconfig.json`), which
  VS Code would match only in `x.tsconfig.json`. `icon.js` also tries the
  whole name as an extension, so those files get the icon Symbols meant.
- 245 SVGs, about 600 KB on disk, replace Catppuccin's 1,242.
- `THIRD_PARTY_NOTICES.md` names Symbols and its copyright instead of
  Catppuccin.
