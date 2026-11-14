# Herdr Roundup 0.11.0

Every Claude Code and Codex pane now shows in its header how full its agent's context window is, without typing `/context` or `/status`.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.11.0/preview.png)

## The context meter

- **In the pane header,** between the folder and the agent's status: a small bar, the percent of the window in use and the tokens (`41% 412k / 1M`). From 65 % the bar takes the working color, from 80 % the blocked color, with a warning sign before the number.
- **Current:** while the agent works within about 15 seconds, idle within a minute.
- **Hover it** for the tokens free, the model and when it was read. An idle Claude Code session above 200k also says when it will likely be compacted (about 55 minutes after its last answer, as observed; an estimate).
- **Narrow panes** drop the tokens first, then the bar; the percent stays longest.
- **No meter** where the value can't be known for sure: a shell, an agent just started, an agent on another machine, two Codex threads in one process. That is normal, not an error.

## Exact numbers: one step per agent, only with your yes

Without anything installed, Claude Code shows its tokens (and its window only after `/context` in that session), Codex its numbers when Herdr started it. For exact numbers everywhere, each agent gets an integration:

- `scripts/agent-integrations.sh install claude`: Claude Code's status line passes on its own numbers. Your own status line, if you have one, keeps running after it.
- `scripts/agent-integrations.sh install codex`: Codex puts its thread id into its terminal title (`tui.terminal_title` gets `"thread-id"` at its end; your other title items stay). Herdr's lists show that id in the title too; without the integration Codex still gets its numbers when Herdr started it.
- `scripts/agent-integrations.sh status` says on, off or broken; `uninstall claude|codex` puts back exactly what `install` changed.

## Before you update

- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Your edits to those are lost; global keys, other layouts and Herdr's own mods stay untouched.
- `roundup-pane` changes (the meter) and `roundup-spaces` a little (the quicklook leaves a Codex thread id out of a title). No new mods, no key changes, no new shared state.
- The meter only reads: it runs `hc get`, `ps`, `stat`, `tail`, `awk`, `lsof` and `pgrep` on this machine, reads `~/.claude/sessions/`, `~/.claude/projects/`, `~/.codex/sessions/` and `~/.cache/herdr-roundup/context/`, and once an hour removes files there of terminals that have ended. It changes no agent config.
- **To the updating agent:** `scripts/agent-integrations.sh install` edits the person's own agent configs (`~/.claude/settings.json`, `~/.codex/config.toml`). Don't run it on your own: tell the person what each `install` changes (above) and run it only for the agents they say yes to. It keeps a backup under `~/.config/herdr-roundup/integrations/backup/`. It needs `jq`.
- An integration reaches sessions started after `install`; ones already running may need a restart (Codex reads its title setting at start).
