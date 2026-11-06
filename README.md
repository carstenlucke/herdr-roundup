<p align="center"><img src="assets/logo.png" width="160" alt="Herdr Roundup logo: three sheep"></p>

# Herdr Roundup

A layout for [Herdr App](https://herdr.dev), started from Herdr's default layout (`main`, Herdr 0.1.13).

The layout is called `Herdr-Roundup`: Herdr's Settings show a layout by its file name, and a name with a space can't be switched to. Its mods keep the short `roundup-` prefix.

## Contents

| Path | What |
| --- | --- |
| `layouts/Herdr-Roundup.json` | The window: its tree of rows, columns, stacks and blocks, and its look |
| `mods/roundup-*/` | The layout's own mods. Until a mod is cloned here, the layout uses Herdr's shipped ones (`agents`, `changes`, `workspace-status`). The side panel's file list is `roundup-files`, in place of Herdr's `files` |
| `themes/` | Themes. One named `Herdr-Roundup.json` is the layout's own: Settings offers it only there |
| `keys.json` | The `layout:Herdr-Roundup` section: keys that apply only while this layout shows |
| `assets/` | Files for this README, such as the logo |
| `docs/ARCHITECTURE_DECISIONS.md` | Why the layout and its mods work the way they do: an index of the decisions, details in `docs/adr/` |
| `scripts/sync.sh` | Installs all of the above into `~/.config/herdr-app` |
| `scripts/build-icons.mjs` | Regenerates `roundup-files`' icons from a pinned release of Symbols (needs `curl`, `unzip`, Node) |
| `THIRD_PARTY_NOTICES.md` | Other people's work in this repo (icons, adapted code) and their licences |

## Install

Tell your agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/carstenlucke/herdr-roundup/tree/main
```

Or, from a clone of this repo:

```sh
scripts/sync.sh
herdr-app do layout.switch '{"name":"Herdr-Roundup"}'
```

`sync.sh` copies the layout, the `roundup-*` mods and the themes, and replaces only the `layout:Herdr-Roundup` section of your `keys.json`. Sizes, hidden columns and theme picks you change by clicking stay in `layouts/.state/`.

## Working on it

- Herdr reloads a mod or layout on every save. After editing, run `scripts/sync.sh`.
- To change one of Herdr's mods, clone it into this repo and point the layout at the clone:
  `herdr-app do mod.clone '{"name":"tabs","as":"roundup-tabs"}'`, move `~/.config/herdr-app/mods/roundup-tabs` into `mods/`, then set `"mod": "roundup-tabs"` in `layouts/Herdr-Roundup.json`.
- Mod folders carry the `roundup-` prefix: a folder's name is the mod's identity (layout blocks, `roundup-x.command` keys, `openOverlay`), and an install renames a mod whose name is taken.
- Reference: `~/.config/herdr-app/AGENTS.md` (layouts, mods, keys, settings) and `~/.config/herdr-app/herdr.d.ts` (the mod API). `herdr-app commands` lists every app command.

## License

Apache-2.0, see [LICENSE](LICENSE). Icons and code adapted from others are listed, with their licences, in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
