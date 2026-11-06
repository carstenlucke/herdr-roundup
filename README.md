# Herdr Roundup

A layout for [Herdr App](https://herdr.dev), started from Herdr's default layout (`main`, Herdr 0.1.13).

The layout is called `Herdr-Roundup`: Herdr's Settings show a layout by its file name, and a name with a space can't be switched to. Its mods keep the short `roundup-` prefix.

## Contents

| Path | What |
| --- | --- |
| `layouts/Herdr-Roundup.json` | The window: its tree of rows, columns, stacks and blocks, and its look |
| `mods/roundup-*/` | The layout's own mods. Until a mod is cloned here, the layout uses Herdr's shipped ones (`spaces`, `agents`, `tabs`, `pane`, `files`, `changes`, `workspace-status`) |
| `themes/` | Themes. One named `Herdr-Roundup.json` is the layout's own: Settings offers it only there |
| `keys.json` | The `layout:Herdr-Roundup` section: keys that apply only while this layout shows |
| `scripts/sync.sh` | Installs all of the above into `~/.config/herdr-app` |

## Install

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

Apache-2.0, see [LICENSE](LICENSE).
