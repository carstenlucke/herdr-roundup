// How a file opens in roundup-preview: a new tab, or a split beside the focused
// pane, or the pane already showing it, or the floating window. No imports: openTab gets
// Herdr's functions passed in, so node --test covers all of it.

// Shared keys. OPEN: "<on>:<file>" -> the pane the opener made for it. MOVED:
// "<on>:<file>" -> what that preview shows now, once it followed a link.
export const OPEN = "roundup-preview.open", MOVED = "roundup-preview.moved";
export const previewId = (file, on) => `${on ?? ""}:${file}`;

/** The pane already showing `file`, or null. `open`, `moved`: the shared maps; `alive`: pane ids that exist. */
export function shownIn(open, moved, file, on, alive) {
  const id = previewId(file, on), pane = open?.[id];
  return pane && alive.has(pane) && (moved?.[id] ?? file) === file ? pane : null;
}

/** OPEN and MOVED once `pane` was made for `file`: it shows the file itself (no MOVED entry),
 *  and entries for panes no longer in `alive` are dropped, so neither map only grows. */
export function remember(open, moved, file, on, pane, alive) {
  const id = previewId(file, on);
  const keep = (map) => Object.fromEntries(Object.entries(map ?? {}).filter(([k]) => k !== id && alive.has(open?.[k])));
  return { open: { ...keep(open), [id]: pane }, moved: keep(moved) };
}

// Opens in flight. run() doesn't name the pane it made, so an open takes the one new
// roundup-preview pane; when another open overlapped it in time, that pane may be the other's,
// and it records none: the next click opens another tab rather than focusing a wrong one.
// OPENING: token -> { since, until }; until stays null while it waits, and for an open that
// never saw its pane, which may still come. Entries go SPAN ms after they ended.
export const OPENING = "roundup-preview.opening";
const SPAN = 10000;

/** OPENING with `token` set to `entry` (none: removed), entries older than SPAN dropped. */
export function marked(opening, token, entry, now) {
  const keep = Object.entries(opening ?? {}).filter(([k, e]) => k !== token && (e.until ?? e.since) > now - SPAN);
  return Object.fromEntries(entry ? [...keep, [token, entry]] : keep);
}

/** What open `token` made: { pane } when it can tell, { wait: true } while no new preview pane is
 *  there, {} when it can't tell (two new ones, or another open overlapped it). `before`: pane ids
 *  before it ran; `now`: panes(). */
export function madePane(opening, token, before, now) {
  const mine = opening?.[token];
  if (!mine) return {};
  const end = (e) => e.until ?? Infinity;
  if (Object.entries(opening).some(([k, e]) => k !== token && e.since < end(mine) && end(e) > mine.since)) return {};
  const made = now.filter((p) => !before.has(p.pane) && p.mod === "roundup-preview");
  return made.length === 1 ? { pane: made[0].pane } : made.length ? {} : { wait: true };
}

/** A wait for openTab from a callback's cx: each step gets the next callback's cx, never a kept one. */
export const timerOf = (cx) => (ms, fn) => cx.timer.after(ms, (cx) => fn(timerOf(cx)));

const TRIES = 5, STEP = 200;

/** Shows `file` in roundup-preview: the pane already showing it comes to the front, else a new
 *  tab, recorded in OPEN once madePane can tell it. `api`: Herdr's { panes, run, shared,
 *  setShared }; `wait`: timerOf(cx); `done()` once it is settled (the floating window closes
 *  then: its timers end with it). */
export function openTab(api, file, on, wait, done = () => {}) {
  const { panes, run, shared, setShared } = api, ids = () => new Set(panes().map((p) => p.pane));
  const shown = shownIn(shared(OPEN), shared(MOVED), file, on, ids());
  if (shown) { run("pane.focus", { pane: shown }); done(); return; }
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`, since = Date.now(), before = ids();
  setShared(OPENING, marked(shared(OPENING), token, { since, until: null }, since));
  run(...openCommand({ file, on }));
  const attempt = (tries, wait) => {
    const got = madePane(shared(OPENING), token, before, panes());
    if (got.wait && tries > 0) { wait(STEP, (wait) => attempt(tries - 1, wait)); return; }
    if (got.pane) {
      const next = remember(shared(OPEN), shared(MOVED), file, on, got.pane, ids());
      setShared(OPEN, next.open); setShared(MOVED, next.moved);
      setShared(OPENING, marked(shared(OPENING), token, { since, until: Date.now() }, Date.now()));
    }
    done();
  };
  attempt(TRIES, wait);
}

// The floating preview: one window (kind "window", one key), which opening again replaces
// in its place. FLOAT: { id, file, on, token } of the open one, null when none is; the
// token tells the window's own copy that it is still the one FLOAT names.
export const FLOAT = "roundup-preview.float";
export function floatSpec({ file, on = null, token }) {
  return { kind: "window", key: "roundup-preview", mod: "roundup-preview", width: 0.6, height: 0.75, props: { file, on, float: token } };
}

/** The app command, as [name, args], that shows `file` (on machine `on`) in roundup-preview. */
export function openCommand({ file, on = null, mode = "tab" }) {
  const props = { file, on };
  if (mode === "split-right" || mode === "split-down") {
    return ["pane.split", { direction: mode === "split-down" ? "down" : "right", mod: "roundup-preview", props }];
  }
  return ["tab.new", { name: file.split(/[\\/]/).pop(), mod: "roundup-preview", props }];
}
