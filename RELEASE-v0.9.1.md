# Herdr Roundup 0.9.1

Corrections only: nothing in how the layout or its mods work changes.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.9.1/preview.png)

## Corrections

- **Preview pictures:** the picture in Settings, the README's preview and the project site now show 0.9.0's agent card: one agent done, one still working, and a tab split into three panes, as the card's map shows them.

## Before you update

For the person, or the agent, installing this release:

- `scripts/sync.sh` replaces the layout file, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`, as in 0.9.0. Edits you made to those files are lost. Your global keys, other layouts and Herdr's own mods stay untouched.
- Only the layout's version and its preview picture (`layouts/Herdr-Roundup.svg`) change. No mod, key or behaviour changes.
