// One virtual clock for a test: cx timers run on it, and Date.now follows it once `useFakeNow()`
// is called. Nothing advances on its own: a test moves it with `advance(ms)`.
const realNow = Date.now;

export const clock = {
  now: 0,
  timers: [], // { at, every, handler, cancelled, cx }
  fake: false,

  // Date.now() answers `start + virtual time` until reset.
  useFakeNow(start = Date.UTC(2026, 10, 8, 12)) {
    this.base = start - this.now;
    this.fake = true;
    Date.now = () => this.base + this.now;
  },

  schedule(ms, handler, cx, every = null) {
    const t = { at: this.now + Math.max(0, ms), every, handler, cx, cancelled: false, done: false };
    this.timers.push(t);
    return t;
  },

  // Moves time forward, firing every timer that comes due on the way, in order. A handler's own
  // promises settle before the next timer fires.
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      const due = this.timers.filter((t) => !t.cancelled && !t.done && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.now = due.at;
      if (due.every === null) due.done = true;
      try { await due.handler(due.cx); } catch (e) { due.cx?.errors?.push(e); }
      if (due.every !== null && !due.cancelled) due.at = this.now + due.every;
      await flush();
    }
    this.now = end;
    await flush();
  },

  pending() {
    return this.timers.filter((t) => !t.cancelled && !t.done);
  },

  reset() {
    this.now = 0;
    this.timers = [];
    this.fake = false;
    Date.now = realNow;
  },
};

// Lets pending promise callbacks and I/O callbacks run (a few turns of the event loop).
export async function flush(turns = 5) {
  for (let i = 0; i < turns; i++) await new Promise((r) => setImmediate(r));
}
