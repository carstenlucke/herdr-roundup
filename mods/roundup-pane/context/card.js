// What the meter's hover card says, laid out as the mockup's card (variant E): a big line with the
// tokens in use, the window and the percent; rows of label, value and a dim extra; notes below.
// Pure, so tests/context-card.test.mjs runs it. Estimates and rounded values carry "~"; what the
// source can't tell is said, not guessed. The head (icon, name, id) comes from the header.

import { tokens, share, percentText, severity, clock } from "./text.js";

const FROM = {
  "status-line": "status line",
  transcript: "transcript",
  compaction: "compaction",
  rollout: "Codex rollout",
};

// → { big: { used, of, percent, sev }, rows: [{ label, value, extra, kind }], notes: [text] }, or null.
// `kind` is "plain" or "warn"; `big.of` is "of 200k", "in use · window unknown" or "".
export function cardModel(reading, { agent, hint = null } = {}) {
  if (!reading) return null;
  const approx = reading.windowRounded ? "~" : "";
  const hasWindow = Number.isFinite(reading.window) && reading.window > 0;
  const hasUsed = Number.isFinite(reading.used);
  const p = share(reading);
  const rows = [], notes = [];
  const row = (label, value, extra = "", kind = "plain") => rows.push({ label, value, extra, kind });
  let big;
  if (hasWindow && hasUsed) {
    big = { used: tokens(reading.used), of: `of ${approx}${tokens(reading.window)}`, percent: `${approx}${percentText(p)}`, sev: severity(p) };
    const free = reading.window - reading.used;
    if (free >= 0) row("Free", `${approx}${tokens(free)}`, percentText((free / reading.window) * 100));
    else row("Over", tokens(-free), "beyond the window", "warn");
  } else if (hasUsed) {
    big = { used: tokens(reading.used), of: "in use · window unknown", percent: "", sev: "ok" };
  } else {
    big = { used: `~${percentText(reading.percent)}`, of: "in use", percent: "", sev: severity(reading.percent) };
  }
  if (reading.model) row("Model", reading.model);
  row("Read", clock(reading.at), FROM[reading.source] ?? reading.source);
  const c = reading.compaction;
  if (c && Number.isFinite(c.post)) row("Compacted", clock(c.at), Number.isFinite(c.pre) ? `${tokens(c.pre)} → ${tokens(c.post)}` : `now ${tokens(c.post)}`);
  if (hint !== null) {
    row("Idle compact", `~${clock(hint)}`, "estimate", "warn");
    notes.push("Expected about 55 min after the last answer, as observed on this machine");
  }
  if (reading.windowRounded) notes.push("Window from this session's /context, which rounds it");
  if (!hasWindow && agent === "claude") notes.push("Switch on the status line integration for its window: scripts/agent-integrations.sh install claude (or type /context)");
  if (agent === "codex") notes.push("The raw share of the window: Codex's /status takes a 12k baseline off");
  if (reading.setting) notes.push(`${reading.setting} moves the auto-compact threshold`);
  return { big, rows, notes };
}
