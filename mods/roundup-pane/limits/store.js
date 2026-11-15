// The limits each account stands at, kept for all pane headers: module code is shared by a mod's
// copies, so one pane's read serves every pane of that account. Pure.
//
// An account is the agent's config folder ("claude:/Users/a/.claude", "codex:/Users/a/.codex"):
// limits belong to the subscription, and two accounts on one machine never mix.
//
// Readings are merged window by window (by its length), not by their time:
// - a window with a later reset is the next window: it replaces the kept one, whatever it says;
// - the same window (resets within SAME_MS) only ever fills: the higher percent stays. A session
//   that hasn't answered for hours hands its old numbers on again with a new time (Claude Code
//   runs the status line on a mode change too), and they must not lower what a later answer said;
// - a window with an earlier reset is an old one: ignored.
// So a reading is as fresh as the last answer of any pane of the account. Nothing is kept across
// a restart: the agents' files are, and every header offers what its file says.
//
// When an agent starts in a pane, its reader also asks what the account's other files say (the
// strategy's accountLimits: a session that hasn't answered yet has no numbers of its own). `due`
// keeps that to once a minute per account, however many panes start at once.

export const SAME_MS = 2 * 60_000;
export const ASK_EVERY_MS = 60_000;

export function makeStore() {
  const accounts = new Map(); // account → { plan, source, rev, windows: Map(minutes → window) }
  const asked = new Map(); // account → when its kept files were last asked
  return {
    // True, and noted, when the account's kept files weren't asked within `every` ms.
    due(account, now, every = ASK_EVERY_MS) {
      if (!account) return false;
      const last = asked.get(account);
      if (last !== undefined && now - last < every) return false;
      asked.set(account, now);
      return true;
    },
    // True when the account's reading changed.
    offer(account, reading) {
      if (!account || !reading || !Array.isArray(reading.windows)) return false;
      let a = accounts.get(account);
      if (!a) accounts.set(account, (a = { plan: null, source: null, rev: 0, windows: new Map() }));
      let changed = false;
      for (const w of reading.windows) {
        const kept = a.windows.get(w.minutes);
        const next = { minutes: w.minutes, used: w.used, resetsAt: w.resetsAt, at: reading.at };
        if (!kept || w.resetsAt > kept.resetsAt + SAME_MS) { a.windows.set(w.minutes, next); changed = true; continue; }
        if (w.resetsAt < kept.resetsAt - SAME_MS) continue;
        if (w.used > kept.used || (w.used === kept.used && reading.at > kept.at)) { a.windows.set(w.minutes, { ...next, resetsAt: kept.resetsAt }); changed = true; }
      }
      if (changed) {
        a.plan = reading.plan ?? a.plan;
        a.source = reading.source ?? a.source;
        a.rev++;
      }
      return changed;
    },
    // { at, plan, source, rev, windows: [{ minutes, used, resetsAt, at }] } (shortest first), or null.
    // `at` is the newest window's; `rev` counts the account's changes.
    get(account) {
      const a = account ? accounts.get(account) : null;
      if (!a || !a.windows.size) return null;
      const windows = [...a.windows.values()].sort((x, y) => x.minutes - y.minutes);
      return { at: Math.max(...windows.map((w) => w.at)), plan: a.plan, source: a.source, rev: a.rev, windows };
    },
    clear() { accounts.clear(); asked.clear(); },
  };
}

export const sharedStore = makeStore();
