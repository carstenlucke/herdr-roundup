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
//   Nothing found: tried again with a backoff, not on every render.
// - Module code is shared by the copies: one queue lets two reads run at once, not all panes'.

import { STRATEGIES, strategyFor } from "./registry.js";

export const WORKING_MS = 15_000;
export const IDLE_MS = 60_000;
export const AFTER_STATUS_MS = 2_000;
export const RETRY_MS = [15_000, 30_000, 60_000, 120_000, 300_000];
export const COMPACT_CHECK_MS = 30_000; // after the expected idle compaction
export const HINT_FOR_MS = 5 * 60_000; // the hint goes 5 min after its time when nothing compacted

export function makeQueue(limit) {
  let running = 0;
  const waiting = [];
  const next = () => {
    if (running >= limit || !waiting.length) return;
    running++;
    const { fn, resolve, reject } = waiting.shift();
    Promise.resolve().then(fn).then(resolve, reject).finally(() => { running--; next(); });
  };
  return {
    run(fn) { return new Promise((resolve, reject) => { waiting.push({ fn, resolve, reject }); next(); }); },
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
  }

  // From the header's render: its pane as panes() has it, and whether its tab is on screen.
  see(pane, shown, cx) {
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

  arm(cx, ms) {
    this.cancel();
    this.timer = cx.timer.after(Math.max(0, ms), (cx) => { this.timer = null; this.wake(cx); });
  }

  wake(cx) {
    if (!this.strategy) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    const gen = this.gen;
    cx.spawn(async (cx) => {
      let changed = false;
      try {
        changed = await this.queue.run(() => this.look(gen));
      } catch {
        if (gen === this.gen) this.key = this.stats = null; // the next look tries again
        changed = this.set(null, gen);
      } finally {
        this.busy = false;
      }
      if (gen !== this.gen) {
        // Another terminal or program meanwhile: its first wake found this read busy and only noted
        // `again`. Hand it over, or nothing reads for the new one (a timer of its own not yet run
        // leaves `again` false and goes on as it is).
        if (this.again) { this.again = false; if (this.strategy) this.arm(cx, 0); }
        return;
      }
      const hint = idleHint(this.reading, this.status, this.io.now());
      if (hint !== this.hint) { this.hint = hint; changed = true; }
      if (changed) cx.notify();
      if (this.again) { this.again = false; this.arm(cx, 0); } else this.arm(cx, this.delay());
    });
  }

  // How long until the next look.
  delay() {
    if (this.followUp) { this.followUp = false; return AFTER_STATUS_MS; }
    if (!this.reading) return RETRY_MS[Math.min(this.misses - 1, RETRY_MS.length - 1)] ?? RETRY_MS[0];
    let ms = this.status === "working" && this.shown ? WORKING_MS : IDLE_MS;
    const at = this.reading.idleCompactAt;
    if (Number.isFinite(at)) {
      const now = this.io.now();
      for (const t of [at + COMPACT_CHECK_MS, at + HINT_FOR_MS + 1000]) if (t > now) ms = Math.min(ms, t - now);
    }
    return ms;
  }

  set(reading, gen) {
    if (gen !== this.gen) return false;
    const r = valid(reading);
    this.misses = r ? 0 : this.misses + 1;
    const changed = JSON.stringify(r) !== JSON.stringify(this.reading);
    this.reading = r;
    return changed;
  }

  // One look: find the source, and read it if a file of it changed. True when the reading changed.
  async look(gen) {
    const { io, strategy, terminal } = this;
    const src = await strategy.locate({ terminal }, io, this.memo);
    if (gen !== this.gen) return false;
    if (!src) { this.key = this.stats = null; return this.set(null, gen); }
    const key = sourceKey(src);
    const stats = await Promise.all(src.files.map((f) => io.stat(f)));
    if (gen !== this.gen) return false;
    if (key === this.key && sameStats(stats, this.stats)) { // nothing new: the reading stands
      if (!this.reading) this.misses++;
      return false;
    }
    let r = await strategy.read(src, io, this.memo);
    if (gen !== this.gen) return false;
    // A late answer can't overwrite a newer session: the terminal still runs the same process.
    const fg = await io.terminal(terminal);
    if (gen !== this.gen) return false;
    // No answer from hc (slow, failed) proves nothing: the reading stands, the next look checks again.
    if (!fg) { this.key = this.stats = null; return false; }
    if (fg.pid !== src.pid) { this.key = this.stats = null; return this.set(null, gen); }
    // Only a reading counts as read: no reading (a failed tail, a file being written) is tried
    // again on the next look, not taken as "unchanged" until a file of it changes.
    if (valid(r)) { this.key = key; this.stats = stats; } else this.key = this.stats = null;
    return this.set(r, gen);
  }
}

// Integration files of ended terminals: removed when no live terminal here has that id and the
// process that wrote it is gone, and the file is older than an hour. Another Herdr core (an
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
      const m = /^([A-Za-z0-9_-]+)\.json$/.exec(name);
      if (!m || live.has(m[1])) continue;
      const path = `${dir}/${name}`;
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
