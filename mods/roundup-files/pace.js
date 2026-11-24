// When the panel reads its folder and git again without being asked, after Herdr's files 0.1.18
// (which shares one scan with `changes`; this panel reads git its own way and paces itself):
// every POLL ms while the window is in front, slower after a slow read, and not at all behind
// another app, where a change only counts as seen and is read once the window is back.
// Pure, so tests/pace.test.mjs runs it in node: the time comes in.

export const POLL = 10000;
const SLOW = 500, MOST = 60000;

// How long to hold back after a read that took `ms`: a quick one nothing, a slow one five times
// its length, at most a minute.
export const hold = (ms) => (ms < SLOW ? 0 : Math.min(MOST, 5 * ms));

// front: the window was in front at the last look (null: not looked yet). pollAt: the next read
// without a change. watchAt: until then a reported change waits. dirty: a change is waiting.
export const newPace = (now, front = null) => ({ front, pollAt: now + POLL, watchAt: 0, dirty: false });

// A look of the panel's timer: whether to read now. `watched`: the folder has a watch (a folder
// on another machine has none, so coming back reads it in any case).
export function due(p, front, now, watched) {
  const back = front && p.front === false;
  p.front = front;
  if (!front) return false;
  if (back && (p.dirty || !watched)) return true;
  return now >= p.pollAt || (p.dirty && now >= p.watchAt);
}

// The watch reported a change the tree shows: whether to read now. Else it waits for due().
export function changed(p, front, now) {
  if (front && now >= p.watchAt) return true;
  p.dirty = true;
  return false;
}

// A read begins, and ends after `took` ms.
export function started(p, now) { p.dirty = false; p.pollAt = now + POLL; }
export function ended(p, took, now) {
  const wait = hold(took);
  p.watchAt = now + wait;
  p.pollAt = now + Math.max(POLL, wait);
}
