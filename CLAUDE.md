# Herdr Roundup

A Herdr App layout, cloned from Herdr's `main` (0.1.13). See README.md for the layout of the repo.

## Before changing anything

- Read `~/.config/herdr-app/AGENTS.md` (layouts, mods, keys, settings, limits) and `~/.config/herdr-app/herdr.d.ts` (the mod API). Don't answer Herdr questions from memory.
- The repo is the source; `~/.config/herdr-app` is the install. Edit here, then run `scripts/sync.sh`. Never edit Herdr's shipped layouts or mods, nor `~/.config/herdr-app/frame/`: Herdr rewrites them on every start.

## Rules

- The layout is `layouts/Herdr-Roundup.json`: Settings show the file name, and a name with a space can't be switched to. Mods keep the `roundup-` prefix.
- Every mod of this layout is `mods/roundup-<name>/`. Changing a shipped mod means cloning it (`mod.clone`) into this repo first, keeping its `cloned_from` in `mod.json`.
- Layout block ids must stay unique: a duplicate crashes Herdr App.
- Colors in the layout and in mods are theme names (`chrome`, `canvas`, `border`, `accent`, ...), not hex, so the layout works light and dark.
- Keys go in the `layout:Herdr-Roundup` section of `keys.json`, never in `global`.
- Shared state keys carry the mod's name as prefix (`roundup-tabs.<key>`).
- After a change: `herdr-app check ~/.config/herdr-app/mods/<mod>` for each changed mod, then `herdr-app status` must show no errors.

## Before a release

- Decide whether the layout needs a new preview picture: does it look different from what Settings shows (a plain frame, or the last `layouts/Herdr-Roundup.svg`)? If so, draw `layouts/Herdr-Roundup.svg` and set `"preview": "layouts/Herdr-Roundup.svg"` on the layout root. `scripts/sync.sh` already copies it.

## Limits found so far (in herdr-t3)

- `<mod>.<command>` reaches only shown copies of a mod; a mod runs only where a layout places it.
- Mods can't add entries to Settings (cmd-,) or to the command palette (cmd-shift-p).
- Mods can't import from another mod's folder: shared code is copied into each mod.
