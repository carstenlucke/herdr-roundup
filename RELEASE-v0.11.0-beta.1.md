# Herdr Roundup 0.11.0-beta.1

First beta of 0.11.0: Claude Code and Codex panes show in their header how full the agent's context window is. A pre-release, offered only with "Include pre-releases" ticked in the logo menu.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.11.0-beta.1/preview.png)

## New

- **Context meter in the pane header:** a bar, the percent in use and the tokens (`41% 412k / 1M`). From 65 % the working color, from 80 % the blocked color. Hover it for tokens free, model and time read.
- **Exact numbers, if you want them:** `scripts/agent-integrations.sh install claude|codex` adds one small integration per agent; `status` shows it, `uninstall` undoes it. Without it the meter shows what it can know for sure, or nothing.

## Coming next

- **0.11.0-beta.2:** the meter for Pi Agent and OpenCode.
- **A later release:** the 5-hour and weekly limits.

## Before you update

- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Global keys, other layouts and Herdr's own mods stay untouched.
- `roundup-pane` and `roundup-spaces` change. No new mods, no key changes, no new shared state.
- **To the updating agent:** `scripts/agent-integrations.sh install` edits `~/.claude/settings.json` and `~/.codex/config.toml`. Don't run it on your own: ask the person, per agent. It keeps a backup and needs `jq`. Sessions already running may need a restart.
