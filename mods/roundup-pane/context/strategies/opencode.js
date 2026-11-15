// opencode: its own numbers from its TUI plugin (`agent-integrations.sh install opencode`); without
// it no meter. opencode keeps all sessions of all terminals in one database behind a shared
// server, and nothing there ties a session to a terminal.
//
// The plugin (integrations/opencode/tui.js) runs in the TUI, the terminal's own process (the
// server is a shared service with another terminal's pid and environment), and writes
// ~/.cache/herdr-roundup/context/opencode/<t>.json for the session it shows: the tokens of its last
// answer after the last compaction (input + output + reasoning + cache read + cache write), as
// opencode's own footer sums them, of the window opencode compacts against (min of the model's
// `limit.input` and `limit.context`; its footer divides by `limit.context`). On its home screen,
// or before an answer, the file says no number. It counts only if its pid is the terminal's
// foreground process.

import { NO_ANSWER, foreground, processEnv, observeTerminalFile, normalizedReading } from "../locate.js";
import { NO_READING } from "../tail.js";

export default {
  id: "opencode",
  matches: ["opencode"],
  keepsNoReading: true,

  async locate(agent, io, memo = {}) {
    const fg = await foreground(io, agent.terminal);
    if (!fg || fg === NO_ANSWER) return fg;
    const env = await processEnv(io, fg.pid, memo);
    if (env?.HC_TERMINAL_ID && env.HC_TERMINAL_ID !== agent.terminal) return null;
    const plugin = await observeTerminalFile(io, "opencode", agent.terminal, fg.pid);
    if (!plugin.file) return null;
    return {
      id: "opencode",
      terminal: agent.terminal,
      pid: fg.pid,
      session: plugin.file.session ?? null,
      file: plugin.file,
      files: [plugin.path],
      observed: { [plugin.path]: plugin.stat },
    };
  },

  async read(source) {
    return normalizedReading(source.file, "plugin") ?? NO_READING;
  },
};
