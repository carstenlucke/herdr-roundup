// When a pane header reads its agent's context, and what it keeps. One reader per header copy,
// for its own terminal only. Herdr-free: `io` comes in (context-io.js), and the timers and tasks
// are the `cx` each call gets, so tests/context-reader.test.mjs runs it in node.
//
// - Working and shown: every 15 s; on each status change at once and again 2 s later (writes that
//   come after the status).
// - Idle, or the pane not shown: every 60 s; plus one look shortly after an expected idle
//   compaction. Shown again: at once. A status change while not shown waits for that.
// - A source is read only when one of its files changed (size or modification time) or its last
//   read gave no reading; finding it (hc get, the session file) is cheap and runs on each look.
//   A file the strategy read while finding it comes with the stat of that read (`observed`); one
//   whose stat and content it couldn't both get (UNSURE) is read again on the next look.
//   Nothing found, or a failed read: tried again with a backoff, not on every render. Read without
//   a number (NO_READING): no backoff, the schedule above; read again when a file changed, or on
//   every look where the strategy can't tell that from a failed read (keepsNoReading false).
// - Module code is shared by the copies: one queue lets two reads run at once, not all panes'.

import { STRATEGIES, strategyFor } from "./registry.js";
import { NO_ANSWER, UNSURE } from "./locate.js";
import { NO_READING } from "./tail.js";

export const WORKING_MS = 15_000;
export const IDLE_MS = 60_000;
export const AFTER_STATUS_MS = 2_000;
export const RETRY_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
export const COMPACT_CHECK_MS = 30_000; // after the expected idle compaction
export const HINT_FOR_MS = 5 * 60_000; // the hint goes 5 min after its time when nothing compacted

// `enter(fn)` → { promise, release }. A job frees its place when fn settles, or at `release()`,
// whichever comes first, and only once: a header that closes releases its job, as a look hanging
// on hc or exec in a closed copy may never settle (its deadline was that copy's timer). Released,
// a waiting job never runs and its promise gives false; a running one gives false at once, and
// its late answer counts for nothing (the reader's gen drops it anyway).
export function makeQueue(limit) {
  let running = 0;
  const waiting = [];
  const next = () => {
    while (running < limit && waiting.length) {
      const job = waiting.shift();
      job.state = "running";
      running++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(job.free);
    }
  };
  const enter = (fn) => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    const job = { fn, resolve, reject, state: "waiting" };
    job.free = () => {
      if (job.state !== "running") return;
      job.state = "done";
      running--;
      next();
    };
    const release = () => {
      if (job.state === "waiting") {
        waiting.splice(waiting.indexOf(job), 1);
        job.state = "done";
        resolve(false);
      } else if (job.state === "running") {
        job.free();
        resolve(false);
      }
    };
    waiting.push(job);
    next();
    return { promise, release };
  };
  return {
    enter,
    run: (fn) => enter(fn).promise,
    get running() { return running; },
    get waiting() { return waiting.length; },
  };
}
export const sharedQueue = makeQueue(2);

// A reading is used only with sane numbers: a time, the used tokens or a percent, a window > 0.
export function valid(r) {
  if (!r || typeof r !== "object" || !Number.isFinite(r.at)) return null;
  const used = Number.isFinite(r.used) && r.used >= 0, pct = Number.isFinite(r.percent) && r.percent >= 0;
  if (!used && !pct) return null;
  if (r.window != null && !(Number.isFinite(r.window) && r.window > 0)) return null;
  return r;
}

const sameStats = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
  && a.every((s, i) => (s === null ? b[i] === null : b[i] !== null && s.size === b[i].size && s.mtime === b[i].mtime));
const sourceKey = (s) => JSON.stringify([s.id, s.pid, s.session ?? s.thread ?? null, s.files]);
// Spreads the first reads of many headers over a moment.
const jitter = (terminal) => [...String(terminal)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7) % 8 * 150;

// Whether the idle compaction hint shows now: above the threshold, the agent not working, and
// not longer than a few minutes past its time (then it checks itself: nothing came, it goes).
export function idleHint(reading, status, now) {
  const at = reading?.idleCompactAt;
  if (!Number.isFinite(at) || status === "working") return null;
  return now <= at + HINT_FOR_MS ? at : null;
}

export class ContextReader {
  constructor(io, { strategies = STRATEGIES, queue = sharedQueue } = {}) {
    this.io = io;
    this.strategies = strategies;
    this.queue = queue;
    this.reading = null;
    this.terminal = null;
    this.strategy = null;
    this.status = null;
    this.shown = true;
    this.gen = 0;
    this.timer = null;
    this.busy = false;
    this.again = false;
    this.followUp = false;
    this.misses = 0;
    this.key = null;
    this.stats = null;
    this.memo = {};
    this.hint = null;
    this.closed = false;
    this.job = null; // the look in the queue: released at close()
  }

  // From the header's render: its pane as panes() has it, and whether its tab is on screen.
  see(pane, shown, cx) {
    if (this.closed) return;
    const strategy = pane?.terminal ? strategyFor(pane, this.strategies) : null;
    const terminal = pane?.terminal ?? null;
    if (terminal !== this.terminal || strategy !== this.strategy) {
      // Another terminal, or its program changed (a shell became Claude): start over.
      this.gen++;
      this.terminal = terminal;
      this.strategy = strategy;
      this.reading = null;
      this.key = this.stats = null;
      this.memo = {};
      this.misses = 0;
      this.followUp = false;
      this.again = false;
      this.status = pane?.status ?? null;
      this.shown = shown;
      this.cancel();
      if (strategy) this.arm(cx, jitter(terminal));
      return;
    }
    if (!strategy) return;
    // A status change reads at once only where it shows; hidden, the idle schedule goes on and the
    // tab shown again reads at once. (A hidden tab's header doesn't render: main.js calls see() from
    // a timer as well, so the reader learns both.)
    const status = pane.status ?? null;
    const back = shown && !this.shown;
    this.shown = shown;
    if (status !== this.status) {
      this.status = status;
      this.misses = 0;
      if (shown) { this.followUp = true; this.arm(cx, 0); }
    }
    if (back) this.arm(cx, 0);
  }

  cancel() {
    this.timer?.cancel();
    this.timer = null;
  }

  // The header goes: no look starts after this, a pending one's answer is dropped (gen), its place
  // in the shared queue is freed, and nothing arms again. (Herdr cancels the copy's tasks soon
  // after close() as well.)
  close() {
    this.closed = true;
    this.gen++;
    this.strategy = null;
    this.again = false;
    this.cancel();
    this.job?.release();
    this.job = null;
  }

  arm(cx, ms) {
    this.cancel();
    this.timer = cx.timer.after(Math.max(0, ms), (cx) => { this.timer = null; this.wake(cx); });
  }

  wake(cx) {
    if (this.closed || !this.strategy) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    const gen = this.gen;
    cx.spawn(async (cx) => {
      // Closed between wake() and this task's start (GPUI starts it on the next tick): no place
      // in the queue, which close() could no longer release.
      if (this.closed) { this.busy = false; return; }
      let changed = false;
      const job = this.queue.enter(() => this.look(gen));
      this.job = job;
      try {
        changed = await job.promise;
      } catch {
        if (gen === this.gen) this.key = this.stats = null; // the next look tries again
        changed = this.set(null, gen);
      } finally {
        this.busy = false;
        if (this.job === job) this.job = null;
      }
      if (gen !== this.gen) {
        // Another terminal or program meanwhile: its first wake found this read busy and only noted
        // `again`. Hand it over, or nothing reads for the new one (a timer of its own not yet run
        // leaves `again` false and goes on as it is).
        if (this.again) { this.again = false; if (this.strategy && !this.closed) this.arm(cx, 0); }
        return;
      }
      const hint = idleHint(this.reading, this.status, this.io.now());
      if (hint !== this.hint) { this.hint = hint; changed = true; }
      if (changed) cx.notify();
      if (this.again) { this.again = false; this.arm(cx, 0); } else this.arm(cx, this.delay());
    });
  }

  // How long until the next look: a backoff only after misses (nothing found, a failed read).
  delay() {
    if (this.followUp) { this.followUp = false; return AFTER_STATUS_MS; }
    if (!this.reading && this.misses > 0) return RETRY_MS[Math.min(this.misses - 1, RETRY_MS.length - 1)];
    let ms = this.status === "working" && this.shown ? WORKING_MS : IDLE_MS;
    const at = this.reading?.idleCompactAt;
    if (Number.isFinite(at)) {
      const now = this.io.now();
      for (const t of [at + COMPACT_CHECK_MS, at + HINT_FOR_MS + 1000]) if (t > now) ms = Math.min(ms, t - now);
    }
    return ms;
  }

  // `settled`: read, and no number (NO_READING): no reading, but no miss either.
  set(reading, gen, settled = false) {
    if (gen !== this.gen) return false;
    const r = valid(reading);
    this.misses = r || settled ? 0 : this.misses + 1;
    const changed = JSON.stringify(r) !== JSON.stringify(this.reading);
    this.reading = r;
    return changed;
  }

  // One look: find the source, and read it if a file of it changed. True when the reading changed.
  async look(gen) {
    if (gen !== this.gen) return false; // queued, and closed or switched meanwhile: no I/O
    const { io, strategy, terminal } = this;
    const src = await strategy.locate({ terminal }, io, this.memo);
    if (gen !== this.gen) return false;
    // No answer from hc proves nothing (as after a read, below): the reading stands, the next look
    // checks again.
    if (src === NO_ANSWER) { this.key = this.stats = null; return false; }
    if (!src) { this.key = this.stats = null; return this.set(null, gen); }
    const key = sourceKey(src);
    // A file the strategy already observed in locate() keeps that stat (`observed`, path → stat,
    // null or UNSURE), the one of the content it read: a newer stat here could mark newer content
    // as read. UNSURE (locate.js: the stat or the content is missing) says nothing about a change:
    // this look reads, and its stats aren't kept, so the next one reads again.
    const seen = src.observed ?? {};
    const stats = await Promise.all(src.files.map((f) => (Object.hasOwn(seen, f) ? seen[f] : io.stat(f))));
    if (gen !== this.gen) return false;
    const sure = !stats.includes(UNSURE);
    // Nothing new: the reading stands (key is kept only beside a reading, or after NO_READING of
    // a strategy that keeps it: then the meter stays empty).
    if (sure && key === this.key && sameStats(stats, this.stats)) return false;
    let r = await strategy.read(src, io, this.memo);
    if (gen !== this.gen) return false;
    // A late answer of another process is dropped: the terminal must still run the one located,
    // and where the strategy can tell from hc get (Codex's title), still on the same thread. A new
    // session in the same process that it can't tell (Claude's /clear) isn't caught here: the next
    // successful locate, which sees the new session (part of the source's key), replaces or clears
    // the old reading. Until then (hc not answering that locate, say) the old one stands.
    const fg = await io.terminal(terminal);
    if (gen !== this.gen) return false;
    // No answer from hc (slow, failed) proves nothing: the reading stands, the next look checks again.
    if (!fg) { this.key = this.stats = null; return false; }
    if (fg.pid !== src.pid || strategy.stillSame?.(src, fg) === false) { this.key = this.stats = null; return this.set(null, gen); }
    // Read without a number: the meter goes, with no backoff; its stats are kept only where the
    // strategy says the file alone decides (then read again only when a file changes).
    if (r === NO_READING) {
      if (strategy.keepsNoReading === true && sure) { this.key = key; this.stats = stats; } else this.key = this.stats = null;
      return this.set(null, gen, true);
    }
    // Only a reading counts as read: no reading (a failed tail, a file being written) is tried
    // again on the next look, not taken as "unchanged" until a file of it changes.
    if (valid(r) && sure) { this.key = key; this.stats = stats; } else this.key = this.stats = null;
    return this.set(r, gen);
  }
}

// Integration files of ended terminals: removed when no live terminal here has that id and the
// process that wrote it is gone, and the file is older than an hour; temp files older than an hour. Another Herdr core (an
// isolated instance) has its own terminal ids, but its processes are alive: its files stay.
export const SWEEP_AGE_MS = 60 * 60_000;
export const AGENTS = ["claude", "codex", "pi", "opencode"];
export async function sweep(io, liveTerminals) {
  const live = new Set(liveTerminals);
  let removed = 0;
  for (const agent of AGENTS) {
    const dir = `${io.home}/.cache/herdr-roundup/context/${agent}`;
    const names = await io.list(dir);
    if (!Array.isArray(names)) continue;
    for (const name of names) {
      const path = `${dir}/${name}`;
      // A temp file of the status line script (`.<terminal>.<pid>`), left by a run killed between
      // printf and mv: no run needs one for an hour, whether its terminal lives or not.
      if (/^\.[A-Za-z0-9_-]+\.\d+$/.test(name)) {
        const st = await io.stat(path);
        if (st && io.now() - st.mtime >= SWEEP_AGE_MS && (await io.remove(path))) removed++;
        continue;
      }
      const m = /^([A-Za-z0-9_-]+)\.json$/.exec(name);
      if (!m || live.has(m[1])) continue;
      const st = await io.stat(path);
      if (!st || io.now() - st.mtime < SWEEP_AGE_MS) continue;
      let pid = null;
      try { pid = JSON.parse((await io.readText(path)) ?? "null")?.pid ?? null; } catch {}
      if (Number.isInteger(pid) && pid > 0 && (await io.alive(pid))) continue;
      if (await io.remove(path)) removed++;
    }
  }
  return removed;
}
