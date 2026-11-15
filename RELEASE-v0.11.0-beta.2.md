# Herdr Roundup 0.11.0-beta.2

Second beta of 0.11.0: the context meter in the pane header now also shows for Pi Agent and OpenCode. A pre-release, offered only with "Include pre-releases" ticked in the logo menu.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.11.0-beta.2/preview.png)

## New

- **Pi Agent:** with its integration, pi's own numbers (`24% 48.1k / 200k`). Without it, the percent from pi's footer, rounded and marked `~`, without tokens.
- **OpenCode (2.x):** with its integration, the numbers of the session it shows, counted as OpenCode's own footer counts them. Without it, no meter: nothing ties an OpenCode session to its terminal.
- **Two more integrations:** `scripts/agent-integrations.sh install pi|opencode`. Each adds one link in the agent's extensions or plugins folder to a file of the layout, so updates of the layout reach it. `status` shows it, `uninstall` removes the link.

## Coming next

- **A later release:** the 5-hour and weekly limits.

## Before you update

- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Global keys, other layouts and Herdr's own mods stay untouched.
- Only `roundup-pane` changes. No new mods, no key changes, no new shared state.
- **To the updating agent:** `scripts/agent-integrations.sh install pi` adds `~/.pi/agent/extensions/roundup-context.js`, `install opencode` adds `~/.config/opencode/plugins/roundup-context`. Both run code inside that agent: don't run them on your own, ask the person, per agent. Pi and OpenCode load them when they next start.
