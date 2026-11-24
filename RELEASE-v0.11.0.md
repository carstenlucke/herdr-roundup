# Herdr Roundup 0.11.0

Each agent's pane now shows how full its context window is and, on a subscription, where your plan's limits stand. The integrations behind the exact numbers are switched on and off in the menu under the logo. Everything from the four betas of 0.11.0 is in it; the last section is new since 0.11.0-beta.4.

**Needs Herdr 0.1.17 or later.**

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.11.0/preview.png)

## New

- **Context meter in the pane header** for Claude Code, Codex, Pi and OpenCode: a bar, the percent in use and the tokens (`41% 412k / 1M`). From 65 % the working color, from 80 % the blocked color. Hover it for the tokens free, the model and when it was read; an idle Claude Code session above 200k says when it will likely be compacted.
- **Plan limits beside it:** `5h 21%  wk 40%`, the 5-hour and the weekly limit of Claude Code and Codex on a subscription. A warning sign from 70 %, red from 90 %, a no-entry sign at 100 %. The card says when each resets and whether you are ahead of it. Nothing with an API key, on Bedrock, Vertex or Foundry, or for Pi and OpenCode.
- **Agent integrations in the logo menu:** click the logo or the name at the top left. Under "Agent integrations" each installed agent has a check. Switching one on asks first and names the file that changes; switching off doesn't ask. A notification says what happened, and that a session already running may need a restart.
  - Claude Code: Roundup's status line in `~/.claude/settings.json` (yours keeps running after it). Codex: `"thread-id"` in `tui.terminal_title` of `~/.codex/config.toml`. Pi and OpenCode: a link to Roundup's extension or plugin. A backup is kept; switching off restores exactly what switching on changed.
  - After the first start with this release, one notification names the installed agents whose integration is off, once per agent.
  - A pane's hover card says when its own agent lacks its integration, or when the session started before it was switched on.
- **Pane names are Herdr's own** (`pane.rename`): double-click a pane's name, click the pencil, or choose "Rename" in the terminal's menu. Names you gave before move over by themselves.
- **Brought up to Herdr 0.1.18:** tabs follow their agent's title, the bar scrolls to the active tab; the active space stays in view; code in previews is drawn in your terminal's font; the lists cope better with many watched folders.

## New since 0.11.0-beta.4

- The integrations are switched in the logo menu, with the notification and the card's hints above. Before, only `scripts/agent-integrations.sh` from a clone of the repo did it.
- The script now comes with the layout: `~/.config/herdr-app/mods/roundup-pane/integrations/agent-integrations.sh`. `scripts/agent-integrations.sh` in the repo runs that one and has a new `where`: the file `install` changes, per agent.

## Before you update

- Update Herdr first if it is older than 0.1.17.
- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Global keys, other layouts and Herdr's own mods stay untouched.
- **From 0.10.x:** one new mod, `roundup-agents` (Herdr's agent list, which doesn't take a Codex thread id for a name), placed by the layout. Every other `roundup-*` mod changes. No key changes. New shared state: `roundup-pane.overlay`, `roundup-pane.moved`, `roundup-workspace-chrome.integrations`, `.integrations.busy`, `.integrations.told`. Names kept in the label `roundup-pane.name` or the shared `roundup-pane.names` move to Herdr's pane names.
- **From 0.11.0-beta.4:** `roundup-workspace-chrome`, `roundup-pane` and `roundup-confirm` change (the dialog's button can carry its own label). No new mods, no key changes. New shared state: `roundup-workspace-chrome.integrations`, `.integrations.busy`, `.integrations.told`.
- What the mods run: `roundup-workspace-chrome` runs `sh` with the integrations script to read their state (at start, hourly and when the menu opens) and, only on the person's click and yes, to switch one. Claude Code's and Codex's need `jq`. Not on Windows: the menu says so.
- **To the updating agent:** don't switch integrations on or off, with the script or otherwise: the person does that in the logo menu, and the dialog there names what changes. Ones already on stay on; the sync updates the files they point to.
