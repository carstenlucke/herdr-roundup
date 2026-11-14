# 0003: The context meter takes the agents' own numbers through opt-in integrations

- **Status:** Accepted
- **Date:** 2026-11-14
- **Concerns:** `mods/roundup-pane/context/`, `mods/roundup-pane/integrations/`,
  `scripts/agent-integrations.sh` (issue #30)

## Context

The pane header shows how full each agent's context window is (`RECIPE.md`,
Context meter). Herdr gives a mod no context value: `panes()` and `agents()`
carry the program and its status, not a pid, a session or tokens. The
agents keep their numbers in their own files, in formats that change with
releases, and Claude Code doesn't write its window size anywhere a mod can
read. The person's principle (2026-11-10): **the values are as precise as
possible, and the approach follows from that**; better no value than a
wrong one. Checked on this machine with Claude Code 2.1.322–2.1.325 and
Codex 0.167.0; eleven mods of the Herdr gallery that show context were read
for their ways.

## Options

| Way | Precise? | Tied to the terminal? | Install | Verdict |
| --- | --- | --- | --- | --- |
| **Claude: its status line** (`statusLine` gets `context_window` with `context_window_size` and `current_usage`; a script writes it per `HC_TERMINAL_ID`) | yes, Claude's own numbers | yes: `HC_TERMINAL_ID` and the pid in the file | one entry in `~/.claude/settings.json`, the person's status line kept running | **chosen** |
| Claude: transcript only, window from a `/context` snapshot | tokens yes; window only where `/context` was typed, rounded | yes: `foreground.pid` → `sessions/<pid>.json` | none | the fallback without the integration |
| Claude: a table of models and windows | no: a guess that breaks with each model and setup (some report Haiku with 1M) | — | none | ruled out (R5) |
| Claude: a rule by model version (`herdr-over9k`) | no | — | none | ruled out |
| **Codex: thread id in the terminal title** (`tui.terminal_title` with `thread-id`) | yes, the raw rollout numbers | yes: the title is the terminal's; the UUIDv7 prefix names one file | one line in `~/.codex/config.toml` | **chosen** |
| Codex: the open rollout file (`lsof`) | yes | only in direct mode (`--no-daemon`); a shared daemon holds every client's files outside the process tree | none | the fallback without the integration |
| Codex: `context-used` in the title | rounded, with a 12k baseline taken off | yes | one line | ruled out: the thread id leads to the raw numbers |
| Codex: newest rollout by folder and time | no: a resume, `/new` or a second client makes it the wrong one | no | none | ruled out (R2) |
| Reading the agent's screen (`hc read`) | rounded, breaks with each change of the agent's text | yes | none | only for pi without its extension (PR 2) |
| A context field in Herdr's agent report (OSC 7501) | yes | yes | a change in Herdr and each agent | not ours to build |

Where the integration files live: in the Herdr App home a mod could clean
them up itself, but a terminal's environment doesn't name the app home its
Herdr App uses (`HC_SCOPE`, `HC_TERMINAL_ID`, `HC_TERMINAL_SOCKET`, no
`HERDR_APP_HOME`); so `~/.cache/herdr-roundup/context/<agent>/<t>.json`, and
the mod removes old ones through `exec`.

## Decision

Integrations first, by the person's principle: Claude Code's status line
and Codex's thread id in its title, each switched on, off and checked by
`scripts/agent-integrations.sh`, explicitly and only with the person's yes,
keeping what was there. The session files stay the passive part: Claude's
transcript for compactions and the time of the last answer, Codex's rollout
for its numbers, and both as the fallback where they can be proven to be
this terminal's agent. No guessing anywhere: a source that can't be tied to
the terminal gives no meter. One strategy per agent program (Strategy
pattern), so pi and opencode (PR 2: a pi extension writing
`ctx.getContextUsage()`, an opencode TUI plugin) come as one file each.

## Consequences

- With the integrations on, the meter is exact; without, Claude shows its
  tokens alone unless `/context` was typed in the session, and Codex only in
  direct mode.
- Both integrations edit the person's agent config: an agent update can
  break them (then no value, never a wrong one), and `status` reports it.
- Claude has one `statusLine` slot: the same script will carry the plan
  limits of #31 (`rate_limits` is in the same stdin).
- Codex shows the cut thread id in its title, where everything that shows
  the title shows it too; it comes last, after the person's items. This
  layout's lists drop it: `roundup-spaces` from the quicklook, and
  `roundup-agents`, a clone of Herdr's `agents` for this alone, from its
  rows. Views outside the layout (Herdr's own, other layouts) still show
  it. Direct mode (`codex --no-daemon`, how Herdr starts Codex) needs no
  title.
- The internal file formats can change with any release: every read is
  defensive, and a failure means no meter, not an error in `herdr-app status`.
