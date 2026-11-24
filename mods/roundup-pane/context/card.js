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
  extension: "pi extension",
  plugin: "oc plugin", // short: the card's extra column holds about 12 characters
  screen: "pi's footer",
};

// Where the integrations are switched on (roundup-workspace-chrome's menu, issue #48).
const MENU = "the Herdr Roundup menu (top left)";
const NAMES = { claude: "Claude Code", pi: "Pi" };

// What the card says about its own agent's integration when the reading lacks what it would give
// (`gives`: "its window and plan limits", …). `integration` is the menu's word for it (shared
// roundup-workspace-chrome.integrations): "on" with such a reading means a session older than it,
// "older" an install in an earlier form;
// null (not read yet) counts as off; "windows": the script doesn't run there.
function integrationNote(agent, integration, gives, without = "") {
  const name = NAMES[agent] ?? agent, or = without ? `, or ${without}` : "";
  if (integration === "on") return `Its integration is on: a session started before it shows ${gives} after a restart${or}`;
  // A restart doesn't help there: the install itself is to be renewed.
  if (integration === "older") return `${name}'s integration is in an older form: switch it off and on again in ${MENU}`;
  if (integration === "broken") return `${name}'s integration is broken: see ${MENU}`;
  if (integration === "unknown") return `Whether ${name}'s integration is on can't be told: see ${MENU}`;
  if (integration === "windows") return without ? `${name}'s integration isn't on Windows yet: ${without}` : null;
  return `For ${gives}, switch on ${name}'s integration in ${MENU}${or}`;
}

// The card's word for an agent's integration from the logo menu's entry for it (shared
// roundup-workspace-chrome.integrations: { state, form, … }, or none before the first read).
export const integrationWord = (entry, platform) => platform === "windows" ? "windows"
  : entry?.state === "on" && entry.form === "older" ? "older" : entry?.state ?? null;

// → { big: { used, of, percent, sev }, rows: [{ label, value, extra, kind }], notes: [text] }, or null.
// `kind` is "plain" or "warn"; `big.of` is "of 200k", "in use · window unknown" or "".
// `integration`: the state of this agent's integration (integrationNote); `limits`: whether the card
// shows plan limits.
export function cardModel(reading, { agent, hint = null, integration = null, limits = false } = {}) {
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
  } else if (hasWindow) {
    // A share of a window without the tokens (pi's footer): no tokens worked back from it.
    big = { used: `${approx}${percentText(reading.percent)}`, of: `of ${approx}${tokens(reading.window)}`, percent: "", sev: severity(reading.percent) };
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
  if (Number.isFinite(reading.footerWindow) && hasWindow) notes.push(`The window opencode compacts against; its own footer counts of ${tokens(reading.footerWindow)}, which includes room for the answer`);
  if (reading.source === "screen") {
    notes.push("Rounded, as pi's footer shows it");
    const note = integrationNote("pi", integration, "pi's own number");
    if (note) notes.push(note);
  } else if (reading.windowRounded) notes.push("Window from this session's /context, which rounds it");
  // Claude Code tells its window and its plan limits only to its status line: without a reading from
  // it, the integration is what would give them.
  if (agent === "claude" && reading.source !== "status-line") {
    const note = !hasWindow ? integrationNote("claude", integration, "its window and plan limits", "type /context")
      : !limits ? integrationNote("claude", integration, "exact numbers and the plan limits") : null;
    if (note) notes.push(note);
  }
  if (agent === "codex") notes.push("The raw share of the window: Codex's /status takes a 12k baseline off");
  if (reading.setting) notes.push(`${reading.setting} moves the auto-compact threshold`);
  return { big, rows, notes };
}
