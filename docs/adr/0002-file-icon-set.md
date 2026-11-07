# 0002: The file icons are Symbols

- **Status:** Accepted
- **Date:** 2026-11-06
- **Concerns:** `scripts/build-icons.mjs`, `mods/roundup-files/icon.js`,
  `mods/roundup-files/icons.js`, `mods/roundup-files/icons/`

## Context

`roundup-files` gives files and folders the icons people know from their
editor. Herdr draws a mod's own SVGs with `image()` in their own colors, so a
set has to ship as files in the mod's folder, together with the rules that
pick an icon for a name. The layout's repo carries those files, so the set's
licence has to let it pass them on.

The set is easy to swap: `scripts/build-icons.mjs` reads any compiled VS Code
icon theme. This ADR keeps the comparison, so the next change doesn't have to
redo it.

## How the sets were compared

Nine VS Code icon themes, each at its current version on Open VSX, drawn for
30 typical files and folders, resolved as VS Code does (file name before
extension before language, else the default icon). Dark and light
backgrounds like the layout's, at 16px (Herdr's size), 20px and 32px. Sets
with a light variant or light exceptions showed those on light.

The comparison page itself is not in the repo: it embeds every set's icons,
GPL and CC BY-SA ones included.

## Options

| Set | Icons | File rules | Folder rules | Licence | Look | Out because |
| --- | ---: | ---: | ---: | --- | --- | --- |
| vscode-icons 13.0 | 1,504 | 2,522 | 524 | MIT for the code only; icons CC BY-SA 4.0, brand logos under their owners' licences, unnamed per icon | very colorful, many logos | licence, look |
| Material Icon Theme 5.40 | 1,256 | 3,547 | 4,674 | MIT throughout | colorful and dense, louder than the layout | look |
| file-icons 1.1 | 893 | 5,885 | 45 | MIT | glyphs from icon fonts (as Atom and GitHub) | look |
| Catppuccin Icons 1.26 | 656 | 1,813 | 421 | MIT | pastel line icons; Latte for light, Mocha for dark | look: used first, found old-fashioned in the panel |
| Bearded Icons 1.22 | 390 | 1,607 | 0 | GPL-3.0 | flat, strong | licence |
| **Symbols 0.0.26** | 346 | 440 | 158 | MIT throughout, code and icons, (c) Miguel Solorio | reduced, modern | chosen |
| Great Icons 2.1 | 297 | 892 | 66 | MIT | colorful, classic | look |
| Charmed 0.10 | 249 | 1,003 | 450 | MIT, but "heavily inspired" by a modified copy of Google IDX's theme, which can't be checked icon by icon | soft, modern, own light variant | licence; one author, no commit since 2025-05-25 |
| JetBrains 2.40 (2023+ UI) | 120 | 237 | 14 | MIT by its package, the pictures JetBrains' (Apache-2.0) | small | too few icons |

## Decision

Symbols, on two grounds only:

- **Taste:** reduced and modern, calm at 16px next to the layout's own glyphs.
- **Licence:** MIT for code and icons, no third-party sources named.

Of the shortlist (Material, vscode-icons, Charmed, Symbols), only Symbols is
both calm and cleanly licensed: Material is loud, vscode-icons' icons are
share-alike, and Charmed's sources can't be checked.

Its upkeep (commits this week, a release about every six months) was a plus,
not a reason.

## Consequences

- Fewer rules than most: rarer files show the plain document icon
  (`LICENSE`, `Cargo.toml` show a gear or a page).
- Many icons hang on VS Code language ids (`.css`, `.html`, `.php`, `.vue`),
  which Herdr lacks. The generator turns them into extensions from a table of
  VS Code's associations; the theme's own rules win.
- One set for light and dark themes: the icons carry mid-tone colors that read
  on both. They are the one exception to the rule that colors are theme names.
- `THIRD_PARTY_NOTICES.md` names Symbols and its copyright.
