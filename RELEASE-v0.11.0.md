# Herdr Roundup 0.11.0

Each agent's pane now shows how full its context window is and, on a subscription, where your plan's limits stand. The integrations behind the exact numbers are switched on and off in the menu under the logo. This letter describes what changed since 0.10.0.

**Needs Herdr 0.1.17 or later.**

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.11.0/preview.png)

## New

- **Context meter in the pane header** for Claude Code, Codex, Pi and OpenCode: a bar, the percent in use and the tokens (`41% 412k / 1M`). From 65 % the working color, from 80 % the blocked color. Hover it for the tokens free, the model and when it was read; an idle Claude Code session above 200k says when it will likely be compacted.
- **Plan limits beside it:** `5h 21%  wk 40%`, the 5-hour and the weekly limit of Claude Code and Codex on a subscription. A warning sign from 70 %, red from 90 %, a no-entry sign at 100 %. The card says when each resets and whether you are ahead of it. Nothing with an API key, on Bedrock, Vertex or Foundry, or for Pi and OpenCode.
- **Agent integrations in the logo menu:** click the logo or the name at the top left. Under "Agent integrations" each installed agent has a check. Switching one on asks first and names the file that changes; switching off doesn't ask. A notification says what happened, and that a session already running may need a restart.
  - Claude Code: Roundup's status line in `~/.claude/settings.json` (yours keeps running after it). Codex: `"thread-id"` in `tui.terminal_title` of `~/.codex/config.toml`. Pi and OpenCode: a link to Roundup's extension or plugin. A backup is kept; switching off restores exactly what switching on changed.
  - After the first start with this release, one notification names the installed agents whose integration is off, once per agent.
  - A pane's hover card says when its own agent lacks its integration, or when the session started before it was switched on.
  - Without the menu, the script that comes with the layout does the same: `~/.config/herdr-app/mods/roundup-pane/integrations/agent-integrations.sh install|uninstall|status|where <agent>` (`scripts/agent-integrations.sh` in a clone runs that one). It needs `jq` for Claude Code and Codex.
- **README:** a section "Agent integrations": what each one changes, and what shows without it.

## Changed

- **Pane names are Herdr's own** (`pane.rename`): double-click a pane's name, click the pencil, or choose the new "Rename" at the top of the terminal's menu. Herdr asks in its own prompt and keeps the name with the pane, also after a restart; a preview pane can be named the same way. Names you gave before move over by themselves, a few seconds after their pane is shown.
- **Tabs:** a tab you didn't name follows its agent's title, as the agents list does. The bar scrolls to the active tab, and a touchpad swipe moves one tab at a time.
- **Spaces:** the active space stays in view. A name that starts with an emoji shows the emoji as its avatar. A repository kept as `project/.bare` is named after the project. A machine that needs a login shows the command to run, with Copy; one whose programs stop when you disconnect shows a warning.
- **Agents:** the list no longer takes a Codex thread id for a name (Codex's title carries it with its integration). A title keeps its own emoji or bracket in front. A sub-agent you kept as a pane shows its own "done". The narrow rail marks the agent you are on.
- **Files and previews:** code is drawn in your terminal's font and size. The files panel reads nothing while Herdr is behind another app and catches up when it is back; after a slow read on a big repository it waits longer before the next.
- **Many folders at once:** Herdr watches at most 64 folders for changes and lets go of idle ones when more are asked for. The spaces list no longer runs git over and over when that happens, and a preview whose watch was let go still notices when its file is saved.
- **Split down** has its own icon in the menus.

## Before you update

- Update Herdr first if it is older than 0.1.17: the pane's name, its menu and three mods use what only newer versions have.
- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Global keys, other layouts and Herdr's own mods stay untouched.
- One new mod, `roundup-agents` (Herdr's agent list, which doesn't take a Codex thread id for a name), placed by the layout. Every other `roundup-*` mod changes. No key changes. New shared state: `roundup-pane.overlay`, `roundup-pane.moved`, `roundup-workspace-chrome.integrations`, `.integrations.busy`, `.integrations.told`.
- Pane names: the label `roundup-pane.name` on a terminal and the shared state `roundup-pane.names` are no longer where a name lives. A pane header gives an old name to its pane and then removes it; until a terminal's old label is gone, the terminal is listed in `roundup-pane.moved`, so a name you clear in the meantime doesn't come back. From a script, name a pane with `herdr-app do pane.rename --pane <id> --name Build`. A name now belongs to the pane, not the terminal: a terminal sent back to its parent and kept again starts unnamed.
- On macOS, File > Close Tab and Close Pane in the menu bar are Herdr's own (since Herdr 0.1.16) and close without asking, whatever "Ask before closing" says. The ×, the menus and the layout's keys ask.
- What the mods run: `roundup-workspace-chrome` runs `sh` with the integrations script to read their state (at start, hourly and when the menu opens) and, only on the person's click and yes, to switch one. Not on Windows: the menu says so.
- **To the updating agent:** don't switch integrations on or off, with the script or otherwise: the person does that in the logo menu, and the dialog there names what changes. Ones already on stay on; the sync updates the files they point to.
