// What the meter's hover card says, as rows of text. Pure, so tests/context-card.test.mjs runs it.
// Estimates and rounded values carry "~"; what the source can't tell is said, not guessed.

import { tokens, share, percentText, clock } from "./text.js";

const FROM = {
  "status-line": "Claude Code's status line",
  transcript: "the transcript's last answer",
  compaction: "the compaction",
  rollout: "the Codex rollout",
};

// rows: [{ text, kind }], kind one of "title", "main", "plain", "note", "warn".
export function cardRows(reading, { agent, hint = null } = {}) {
  if (!reading) return [];
  const rows = [];
  const add = (text, kind = "plain") => rows.push({ text, kind });
  const approx = reading.windowRounded ? "~" : "";
  const hasWindow = Number.isFinite(reading.window) && reading.window > 0;
  add("Context window", "title");
  if (hasWindow && Number.isFinite(reading.used)) {
    add(`${tokens(reading.used)} of ${approx}${tokens(reading.window)} in use · ${percentText(share(reading))}`, "main");
    const free = reading.window - reading.used;
    add(free >= 0 ? `${approx}${tokens(free)} free` : `${tokens(-free)} over the window`);
  } else if (Number.isFinite(reading.used)) {
    add(`${tokens(reading.used)} in use · window unknown`, "main");
  } else if (Number.isFinite(reading.percent)) {
    add(`~${percentText(reading.percent)} in use`, "main");
  }
  if (reading.model) add(`Model ${reading.model}`);
  add(`Read ${clock(reading.at)}, from ${FROM[reading.source] ?? reading.source}`);
  if (hint !== null) add(`Idle compaction expected around ${clock(hint)} (about 55 min after the last answer; observed on this machine)`, "warn");
  const c = reading.compaction;
  if (c && Number.isFinite(c.post)) add(`Compacted ${clock(c.at)}${Number.isFinite(c.pre) ? `: ${tokens(c.pre)} → ${tokens(c.post)}` : `: now ${tokens(c.post)}`}`);
  if (reading.windowRounded) add("Window from this session's /context, which rounds it", "note");
  if (!hasWindow && agent === "claude") add("Switch on the status line integration for its window: scripts/agent-integrations.sh install claude (or type /context)", "note");
  if (agent === "codex") add("The raw share of the window: Codex's /status takes a 12k baseline off", "note");
  if (reading.setting) add(`${reading.setting} moves the auto-compact threshold`, "note");
  return rows;
}
