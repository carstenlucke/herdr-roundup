// The limits each account stands at, kept for all pane headers: module code is shared by a mod's
// copies, so one pane's read serves every pane of that account. Pure.
//
// An account is the agent's config folder ("claude:/Users/a/.claude", "codex:/Users/a/.codex"):
// limits belong to the subscription, and two accounts on one machine never mix. (Another login in
// the same folder is the same account here: its windows replace the old one's as they are read,
// and a window it doesn't have keeps the old login's number until that resets.)
//
// Readings are merged window by window (by its length), by the time they are from (`at`,
// limits/parse.js):
// - the newer reading stays, whatever it says: a lower percent or an earlier reset too (the plan
//   changed, the provider reset the limits). An older one never comes back, so a session that
//   hasn't answered for hours can hand its numbers on as often as it likes;
// - at the same time the higher percent stays. Claude's time is in whole seconds: a correction
//   within the second of the reading it corrects loses, until the next answer;
// - a reading without a time (`at` null) is a stopgap: it never replaces one with a time, and one
//   with a time always replaces it. Among themselves such readings go by the window: a later
//   reset is the next window, the same one (resets within SAME_MS) only fills.
// A kept window whose reset has passed stays until a newer reading comes: an older reading with a
// later reset is not the next window, it may be the very one the newer reading corrected.
// The times are the agents' own and not exact (parse.js): a line of Codex that is newer than its
// numbers can lower what another pane read more recently, until the next answer of any pane.
// Nothing is kept across a restart: the agents' files are, and every header offers what its file says.
//
// When an agent starts in a pane, its reader also asks what the account's other files say (the
// strategy's accountLimits: a session that hasn't answered yet has no numbers of its own). `due`
// keeps that to once a minute per account, however many panes start at once.

export const SAME_MS = 2 * 60_000;
export const ASK_EVERY_MS = 60_000;

// Whether `next` takes the place of `kept` (both { used, resetsAt, at }).
function replaces(next, kept) {
  if (!kept) return true;
  if (next.at !== null) return kept.at === null || next.at > kept.at || (next.at === kept.at && next.used > kept.used);
  if (kept.at !== null) return false;
  if (next.resetsAt > kept.resetsAt + SAME_MS) return true;
  return next.resetsAt >= kept.resetsAt - SAME_MS && next.used > kept.used;
}

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
      const at = Number.isFinite(reading.at) ? reading.at : null;
      let changed = false;
      for (const w of reading.windows) {
        const next = { minutes: w.minutes, used: w.used, resetsAt: w.resetsAt, at };
        if (!replaces(next, a.windows.get(w.minutes))) continue;
        a.windows.set(w.minutes, next);
        changed = true;
      }
      if (changed) {
        a.plan = reading.plan ?? a.plan;
        a.source = reading.source ?? a.source;
        a.rev++;
      }
      return changed;
    },
    // { plan, source, rev, windows: [{ minutes, used, resetsAt, at }] } (shortest first), or null.
    // A window's `at` is null where its time is unknown. How old the reading is depends on the time
    // (a window that has reset doesn't count): limits/text.js, asOf(). `rev` counts the account's
    // changes.
    get(account) {
      const a = account ? accounts.get(account) : null;
      if (!a || !a.windows.size) return null;
      const windows = [...a.windows.values()].sort((x, y) => x.minutes - y.minutes);
      return { plan: a.plan, source: a.source, rev: a.rev, windows };
    },
    clear() { accounts.clear(); asked.clear(); },
  };
}

export const sharedStore = makeStore();
