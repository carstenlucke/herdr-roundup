# Herdr Roundup

A Herdr App layout, cloned from Herdr's `main` (0.1.13). See README.md for the layout of the repo.

## Before changing anything

- Read `~/.config/herdr-app/AGENTS.md` (layouts, mods, keys, settings, limits) and `~/.config/herdr-app/herdr.d.ts` (the mod API). Don't answer Herdr questions from memory.
- The repo is the source; `~/.config/herdr-app` is the install. Edit here, then run `scripts/sync.sh`. Never edit Herdr's shipped layouts or mods, nor `~/.config/herdr-app/frame/`: Herdr rewrites them on every start.

## Rules

- The layout is `layouts/Herdr-Roundup.json`: Settings show the file name, and a name with a space can't be switched to. Mods keep the `roundup-` prefix.
- Every mod of this layout is `mods/roundup-<name>/`. Changing a shipped mod means cloning it (`mod.clone`) into this repo first, keeping its `cloned_from` in `mod.json`.
- Layout block ids must stay unique: a duplicate crashes Herdr App.
- Colors in the layout and in mods are theme names (`chrome`, `canvas`, `border`, `accent`, ...), not hex, so the layout works light and dark. The one exception: the vendored file icons in `mods/roundup-files/icons/` keep their own colors (`docs/adr/0002-file-icon-set.md`).
- Keys go in the `layout:Herdr-Roundup` section of `keys.json`, never in `global`.
- Shared state keys: a mod's own state goes under its name (`roundup-<name>.<key>`); keys that mods share with Herdr's shipped mods (`sidebar.width`, `space.colors`, `workspace.panels`, ...) keep Herdr's names.
- ADRs are rare: read the bar in `docs/ARCHITECTURE_DECISIONS.md` before writing one. When in doubt, none; behaviour goes in `RECIPE.md`.
- After a change: `node --test 'tests/*.test.mjs'` must pass (Node 22.15 or later), then `herdr-app check ~/.config/herdr-app/mods/<mod>` for each changed mod, then `herdr-app status` must show no errors.
- A fixed bug or a new behaviour gets its row in `tests/CATALOG.md` and a test whose name goes into **Covered**. `scripts/smoke.sh` runs only when an L3 row is touched: it brings a second window to the front for about two minutes.

## Before a release

- Raise `"version"` on the root of `layouts/Herdr-Roundup.json`. It is the layout's only version: `roundup-workspace-chrome` reads it from the file (`layout()` leaves out fields Herdr doesn't know) and shows it under the name at the top left and in its details.
- Every release gets a tag `v<version>` matching that root `"version"`, plus a GitHub release with notes written for the person who updates (`gh release create v<version> --notes-file …`). Only a release, not a tag, reaches the update check (`releases/latest`), and the updating agent reads its notes before changing anything.

- The site (`site/`, GitHub Pages) is published only by hand: after changing it or a feature it shows, run `scripts/site.sh`, commit `site/img/`, and once on `main` run `gh workflow run pages.yml`. A new feature gets a scene in `scripts/preview.py` and a section in `site/index.html`. Details: `docs/GITHUB_PAGES.md`.
- Decide whether the layout needs a new preview picture: does it look different from what Settings shows (a plain frame, or the last `layouts/Herdr-Roundup.svg`)? If so, draw `layouts/Herdr-Roundup.svg` and set `"preview": "layouts/Herdr-Roundup.svg"` on the layout root. `scripts/sync.sh` already copies it.

## Limits found so far

- `<mod>.<command>` reaches only shown copies of a mod; a mod runs only where a layout places it.
- Mods can't add entries to Settings (cmd-,) or to the command palette (cmd-shift-p).
- Mods can't import from another mod's folder: shared code is copied into each mod.
- `watchFolder()` can't be cancelled: a watch on a folder no longer shown waits until its next change there. At most one per folder, and Herdr shares it between mods.
- A popup overlay is a copy of its mod that ends when it closes, timers and tasks included: work that must outlive it runs in the copy that stays.
- In a `window_drag` block a drag still ends in `on_click`; tell them apart by the pointer's moves (RECIPE "Click or drag"), or stop `mouse_down` and lose the drag there.
- A `HoverCard` draws above popups: empty its content while a popup it would cover is open.
- Herdr gives mods no signal for an open overlay, and its shipped `menu` sets no shared state: a mod that must know opens a clone that says so (`roundup-menu`, `roundup-menu.open`).
- Mods don't get the split arrangement (`panes()` has no geometry). It is only in each machine's core document `herdr-app` (`doc.get` over `hc connect`), opaque JSON whose form can change with herdr-core: read it defensively, with a fallback (`mods/roundup-spaces/pane-map.js`).
