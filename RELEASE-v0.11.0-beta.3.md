# Herdr Roundup 0.11.0-beta.3

Third beta of 0.11.0: Claude Code and Codex panes on a subscription now show, beside the context meter, where the 5-hour and the weekly limit stand. A pre-release, offered only with "Include pre-releases" ticked in the logo menu.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.11.0-beta.3/preview.png)

## New

- **Plan limits beside the context:** `5h 21%  wk 40%`, the share of the 5-hour and the weekly limit in use, for Claude Code and Codex on a subscription. They are the account's: every pane of an agent shows the same, as of the last answer in any of them.
- **A warning sign** from 70 %, in the blocked color from 90 %, a no-entry sign at 100 %.
- **In the hover card:** when each window resets, a bar with a tick for how much of the window's time has passed, and, when you are ahead of that, when the limit would run out.
- **Claude Code** needs its integration for them (`scripts/agent-integrations.sh install claude`, the same one as for the context window). **Codex** needs nothing.
- **Dimmed** when the numbers are older than 15 minutes. Claude Code's are also dimmed, with "age unknown" in the card, until its next answer after a start or after this update: only then is it known how old they are.
- **Not shown:** with an API key (there are no windows), for Claude Code on Bedrock, Vertex, Foundry or another endpoint, for a Codex model with a limit of its own, and for Pi Agent and OpenCode (they don't pass the limits on). A Claude Code pane with an API key, or with Bedrock, Vertex or Foundry switched on in its settings' `env`, may show the account's limits at first, until the integration has seen one of its own answers come without them.
- **README:** a section "Agent integrations": what each one changes, and what shows without it.

## Before you update

- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Global keys, other layouts and Herdr's own mods stay untouched.
- Only `roundup-pane` changes. No new mods, no key changes, no new shared state.
- An integration already switched on stays on: nothing to set up again. Claude Code's status line script is one of the mod's files, so the sync updates it.
- **To the updating agent:** `scripts/agent-integrations.sh install` changes the person's agent setup: `~/.claude/settings.json` (claude), `~/.codex/config.toml` (codex), a link in `~/.pi/agent/extensions/` (pi) or in `~/.config/opencode/plugins/` (opencode). Don't run it on your own: ask the person, per agent. It keeps a backup and needs `jq`. Sessions already running may need a restart.
