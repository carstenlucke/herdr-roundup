// pi: its own number from its extension (`agent-integrations.sh install pi`), else the rounded one
// on its footer on screen.
//
// - The extension (integrations/pi-context.js) runs in pi's own process and writes
//   ~/.cache/herdr-roundup/context/pi/<t>.json with ctx.getContextUsage() (tokens, contextWindow,
//   percent unrounded), the session and the model. It counts only if its pid is the terminal's
//   foreground process. pi's `tokens` is its last answer's usage plus an estimate of what came
//   after it: pi's own number, the one its footer shows, so exact here. Right after a compaction it
//   is unknown until the next answer: no meter then.
// - Without it, pi's footer: its stats line ends in `8.6%/66k (auto)` (percent with one decimal of
//   the window, which is rounded: formatTokens), `?/66k` while unknown, before the model on the
//   right. Only that line counts, directly below the footer's folder line, among the last lines of
//   the screen: never numbers from the conversation. No tokens are worked back from it, and no
//   model (the right side is cut to the width without a mark). While a dialog covers the footer
//   the last reading of the same process stands, with its time.
//
// pi's session files are not used: nothing ties them safely to the terminal (pi appends with
// appendFileSync, so lsof doesn't see them open).

import { NO_ANSWER, foreground, processEnv, observeTerminalFile, normalizedReading } from "../locate.js";
import { NO_READING } from "../tail.js";

// pi's formatTokens back to a number: "940", "9.4k", "66k", "1.2M", "10M".
export function footerTokens(s) {
  const m = /^([0-9]+(?:\.[0-9])?)([kM]?)$/.exec(s ?? "");
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * ({ k: 1e3, M: 1e6 }[m[2]] ?? 1));
}

// The stats line: optional usage items (↑in ↓out Rread Wwrite CHhit% $cost), then the context
// item, then " • xp" maybe, then the model after two spaces or more, or nothing (no room).
const ITEM = String.raw`(?:[↑↓RW][0-9]+(?:\.[0-9])?[kM]?|CH[0-9]+\.[0-9]%|\$[0-9]+\.[0-9]{3}(?: \(sub\))?)`;
const STATS = new RegExp(String.raw`^\s*(?:${ITEM} )*(\?|[0-9]+\.[0-9]%)\/([0-9]+(?:\.[0-9])?[kM]?)(?: \(auto\))?(?: • xp)?(?: {2,}\S.*)?\s*$`);
// The folder line above it: the cwd, ~ for the home, maybe cut with "...".
const FOLDER = /^\s*(?:~|\/)\S*/;
const LAST = 4; // the footer's lines are the screen's last: folder, stats, maybe extension statuses

// → { percent, window } (percent null for `?`), or null: no footer of pi's form at the end.
export function parseFooter(screen) {
  if (typeof screen !== "string") return null;
  const lines = screen.split("\n").map((l) => l.replace(/\s+$/, "")).filter(Boolean).slice(-LAST);
  for (let i = lines.length - 1; i >= 1; i--) {
    const m = STATS.exec(lines[i]);
    if (!m || !FOLDER.test(lines[i - 1])) continue;
    const window = footerTokens(m[2]);
    if (!window) return null;
    const percent = m[1] === "?" ? null : parseFloat(m[1]);
    return { percent: Number.isFinite(percent) ? percent : null, window };
  }
  return null;
}

export default {
  id: "pi",
  matches: ["pi"],
  // The extension's file decides alone (read whole, its stat taken first): without a number it
  // stays so until the file changes.
  keepsNoReading: true,

  async locate(agent, io, memo = {}) {
    const fg = await foreground(io, agent.terminal);
    if (!fg || fg === NO_ANSWER) return fg;
    const env = await processEnv(io, fg.pid, memo);
    if (env?.HC_TERMINAL_ID && env.HC_TERMINAL_ID !== agent.terminal) return null;
    const base = { id: "pi", terminal: agent.terminal, pid: fg.pid };
    const ext = await observeTerminalFile(io, "pi", agent.terminal, fg.pid);
    if (ext.file) {
      memo.screenPid = null;
      memo.footer = null;
      return { ...base, session: ext.file.session ?? null, file: ext.file, how: "extension", files: [ext.path], observed: { [ext.path]: ext.stat } };
    }
    const screen = await io.screen(agent.terminal);
    if (screen === null) return NO_ANSWER; // hc gave no screen: nothing known, the reading stands
    const footer = parseFooter(screen);
    if (!footer) {
      // Covered (a dialog, a selector) or not drawn yet: a reading of this process stands; none
      // of another process (pi restarted in the terminal) or of none at all.
      return memo.screenPid === fg.pid ? NO_ANSWER : null;
    }
    memo.screenPid = fg.pid;
    // The time the footer first showed this value (of this process): an unchanged footer gives the
    // same reading, so the header isn't drawn again on every look.
    const seen = memo.footer;
    const same = seen && seen.pid === fg.pid && seen.percent === footer.percent && seen.window === footer.window;
    if (!same) memo.footer = { pid: fg.pid, percent: footer.percent, window: footer.window, at: io.now() };
    return { ...base, footer, at: memo.footer.at, how: "screen", files: [], fresh: true };
  },

  // Before its first answer pi counts 0 (`0.0%`): its system prompt isn't in that number, so it
  // is no reading (an agent just started shows nothing, R5).
  async read(source) {
    if (source.how === "extension") {
      const r = normalizedReading(source.file, "extension");
      return r && (r.used ?? r.percent) > 0 ? r : NO_READING;
    }
    const f = source.footer;
    if (!f || !(f.percent > 0)) return NO_READING; // `?`: unknown until pi's next answer; 0: none yet
    return { used: null, window: f.window, percent: f.percent, model: null, at: source.at, source: "screen", exact: false, windowRounded: true };
  },
};
