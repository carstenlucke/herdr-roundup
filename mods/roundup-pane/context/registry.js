// The strategies, one per agent program (Strategy pattern): a new agent is one file in
// strategies/ and one line here. The reader takes the first whose `matches` has the pane's
// `program.key` or `app`; none means no meter. Why integrations first and session files as the
// passive part: docs/adr/0003-context-from-agent-integrations.md.

import claude from "./strategies/claude.js";
import codex from "./strategies/codex.js";
import pi from "./strategies/pi.js";
import opencode from "./strategies/opencode.js";

export const STRATEGIES = [claude, codex, pi, opencode];

// A terminal of another machine (`vps/t7`) gets none: its agent's files are there, not here.
export function strategyFor(pane, list = STRATEGIES) {
  if (!pane?.terminal || pane.terminal.includes("/")) return null;
  const keys = [pane.program?.key, pane.app].filter((k) => typeof k === "string" && k);
  return list.find((s) => s.matches.some((m) => keys.includes(m))) ?? null;
}
