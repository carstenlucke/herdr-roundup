// How a file opens in roundup-preview: a new tab, or a split beside the focused
// pane, or the pane already showing it, or the floating window. No Herdr imports: openTab
// gets Herdr's functions passed in, so tests/open-file.test.mjs runs it in node.
import { pathKey } from "./paths.js";

// Shared keys. Each preview tab opened here carries a token in its props (props.token).
// OPEN: previewId(file, on) -> { pane, token }, the pane the opener made for the file.
// MOVED: token -> the file that preview shows now, once it followed a link or went Back.
// ".v2": the keys before were "<on>:<file>" -> pane and "<on>:<file>" -> file.
export const OPEN = "roundup-preview.open.v2", MOVED = "roundup-preview.moved.v2";
/** One key per file and machine, whichever way the path is written (C:\x and c:/X are one). */
export const previewId = (file, on) => JSON.stringify([on ?? null, pathKey(file)]);
/** A token unique enough to tell one open, window or panel copy from another. */
export const newToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** The pane already showing `file`, or null. `open`, `moved`: the shared maps; `alive`: pane ids that exist. */
export function shownIn(open, moved, file, on, alive) {
  const entry = open?.[previewId(file, on)];
  if (!entry || !alive.has(entry.pane)) return null;
  const now = moved?.[entry.token];
  return now == null || pathKey(now) === pathKey(file) ? entry.pane : null;
}

/** OPEN and MOVED once `pane` (props.token `token`) was made for `file`. Entries for panes no
 *  longer in `alive` are dropped, and MOVED keeps only the tokens OPEN names: neither map only
 *  grows. The new token's MOVED stays: its tab may have followed a link before it was recorded. */
export function remember(open, moved, file, on, pane, token, alive) {
  const id = previewId(file, on);
  const live = Object.entries(open ?? {}).filter(([k, e]) => k !== id && alive.has(e?.pane));
  const nextOpen = Object.fromEntries([...live, [id, { pane, token }]]);
  const tokens = new Set(Object.values(nextOpen).map((e) => e.token));
  return { open: nextOpen, moved: Object.fromEntries(Object.entries(moved ?? {}).filter(([t]) => tokens.has(t))) };
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
 *  tab (in `space`, else the current one), recorded in OPEN once madePane can tell it. `api`:
 *  Herdr's { panes, run, shared, setShared }; `wait`: timerOf(cx); `done()` once it is settled. */
export function openTab(api, file, on, wait, done = () => {}, space = null) {
  const { panes, run, shared, setShared } = api, ids = () => new Set(panes().map((p) => p.pane));
  const shown = shownIn(shared(OPEN), shared(MOVED), file, on, ids());
  if (shown) { run("pane.focus", { pane: shown }); done(); return; }
  const token = newToken(), since = Date.now(), before = ids();
  setShared(OPENING, marked(shared(OPENING), token, { since, until: null }, since));
  run(...openCommand({ file, on, token, space }));
  const attempt = (tries, wait) => {
    const got = madePane(shared(OPENING), token, before, panes());
    if (got.wait && tries > 0) { wait(STEP, (wait) => attempt(tries - 1, wait)); return; }
    if (got.pane) {
      const next = remember(shared(OPEN), shared(MOVED), file, on, got.pane, token, ids());
      setShared(OPEN, next.open); setShared(MOVED, next.moved);
      setShared(OPENING, marked(shared(OPENING), token, { since, until: Date.now() }, Date.now()));
    }
    done();
  };
  attempt(TRIES, wait);
}

// The floating window's Open in tab: the window ends when it closes, timers included, so it
// hands the open to the panel copy that opened it (FLOAT.owner) and closes. TAB_REQUESTS:
// request token -> { at, owner, file, on, space }; the owner takes its own out before it opens
// them, so a second window's request can't replace one not yet taken. Old ones go after AGE ms.
export const TAB_REQUESTS = "roundup-preview.tab-requests";
const AGE = 30000;

/** TAB_REQUESTS with `request` added under `token`, old ones dropped. */
export function requested(requests, token, request, now) {
  const keep = Object.entries(requests ?? {}).filter(([, r]) => r.at > now - AGE);
  return Object.fromEntries([...keep, [token, request]]);
}

/** What `owner` takes from TAB_REQUESTS: { mine: its requests, rest: the map without them and old ones }. */
export function taken(requests, owner, now) {
  const all = Object.entries(requests ?? {}).filter(([, r]) => r.at > now - AGE);
  return { mine: all.filter(([, r]) => r.owner === owner).map(([, r]) => r), rest: Object.fromEntries(all.filter(([, r]) => r.owner !== owner)) };
}

// The floating preview: one window (kind "window", one key), which opening again replaces
// in its place. FLOAT: { id, file, on, token, owner, copy } of the open one, null when none is;
// the token tells the window's own copy that it is still the one FLOAT names, owner is the
// panel copy that opened it (or took it over), copy the window's running copy.
export const FLOAT = "roundup-preview.float";
export function floatSpec({ file, on = null, token }) {
  return { kind: "window", key: "roundup-preview", mod: "roundup-preview", width: 0.6, height: 0.75, props: { file, on, float: token } };
}

/** From `herdr-app status`: true only when it lists overlays as names, none of them roundup-preview. */
export function windowGone(status) {
  const names = status?.overlays;
  return Array.isArray(names) && names.every((n) => typeof n === "string") && !names.includes("roundup-preview");
}

/** Whether FLOAT `f` is still the record `was`: a window copy that started since writes its own id and copy. */
export const sameFloat = (f, was) => Boolean(f && was) && f.token === was.token && f.id === was.id && (f.copy ?? null) === (was.copy ?? null);

/** The app command, as [name, args], that shows `file` (on machine `on`) in roundup-preview. */
export function openCommand({ file, on = null, mode = "tab", token = null, space = null }) {
  const props = { file, on, token };
  if (mode === "split-right" || mode === "split-down") {
    return ["pane.split", { direction: mode === "split-down" ? "down" : "right", mod: "roundup-preview", props }];
  }
  return ["tab.new", { name: file.split(/[\\/]/).pop(), mod: "roundup-preview", props, ...(space ? { space } : {}) }];
}
