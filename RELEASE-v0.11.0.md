# Herdr Roundup 0.11.0

Each agent pane now shows in its header how full the agent's context window is and, for Claude Code and Codex on a subscription, where the 5-hour and the weekly limit stand.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.11.0/preview.png)

## Context meter

- **In the pane header:** a bar, the percent in use and the tokens (`41% 412k / 1M`), for Claude Code, Codex, Pi Agent and OpenCode. From 65 % the working color, from 80 % the blocked color, each with a warning sign.
- **Hover it** for the tokens free, the model, when and from where it was read, and the last compaction.
- **Exact numbers, if you want them:** `scripts/agent-integrations.sh install claude|codex|pi|opencode` adds one small integration per agent; `status` shows it, `uninstall` undoes it. Without it the meter shows what it can know for sure, or nothing.

## Plan limits

- **Beside the context:** `5h 21%  wk 40%`, the share of the 5-hour and the weekly limit in use, for Claude Code and Codex on a subscription. They are the account's: every pane of an agent shows the same, as of the last answer in any of them.
- **A warning sign** from 70 %, in the blocked color from 90 %, a no-entry sign at 100 %.
- **In the hover card:** when each window resets, a bar with a tick for how much of the window's time has passed, and, when you are ahead of that, when the limit would run out.
- **Claude Code** needs its integration for them (`install claude`, the same one as for the context window). **Codex** needs nothing.
- **Not shown:** with an API key (there are no windows), and for Pi Agent and OpenCode (they don't pass the limits on).

## Also

- The agents list no longer shows the thread id that Codex's integration puts into its title.
- Based on Herdr 0.1.14.

## Before you update

- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Your edits to those are lost; global keys, other layouts and Herdr's own mods stay untouched.
- **A new mod:** `roundup-agents`, a clone of Herdr's `agents`; the layout's agents block now uses it. `roundup-pane` and `roundup-spaces` change most. No key changes.
- New shared state: `roundup-pane.overlay`.
- From 0.11.0-beta.2 only `roundup-pane` changes: the plan limits. Nothing to set up again.
- **To the updating agent:** `scripts/agent-integrations.sh install` changes the person's agent setup: `~/.claude/settings.json` (claude), `~/.codex/config.toml` (codex), a link in `~/.pi/agent/extensions/` (pi) or in `~/.config/opencode/plugins/` (opencode). Don't run it on your own: ask the person, per agent. It keeps a backup and needs `jq`. Sessions already running may need a restart.
