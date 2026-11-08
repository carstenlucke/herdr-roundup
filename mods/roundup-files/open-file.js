// How a file opens in roundup-preview: a new tab, or a split beside the focused
// pane, or the pane already showing it, or the floating window. No Herdr imports: openTab
// gets Herdr's functions passed in, so tests/open-file.test.mjs runs it in node.
import { pathKey, samePath } from "./paths.js";

// Shared keys. Each preview tab opened here carries a token in its props (props.token).
// OPEN: token -> { pane, file, on }, the pane the opener made and the file it opened with.
// MOVED: token -> the file that preview shows now, once it followed a link or went Back.
// ".v3": before, OPEN was previewId(file, on) -> { pane, token }, which found a tab only by the
// file it opened with; ".v2" before that: "<on>:<file>" -> pane and "<on>:<file>" -> file.
export const OPEN = "roundup-preview.open.v3", MOVED = "roundup-preview.moved.v2";
export const OPEN_V2 = "roundup-preview.open.v2";
/** One key per file and machine, whichever way the path is written (C:\x and c:/X are one). */
export const previewId = (file, on) => JSON.stringify([on ?? null, pathKey(file)]);
/** A token unique enough to tell one open, window or panel copy from another. */
export const newToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** The pane showing `file` now, or null: a recorded tab whose current file (MOVED, else the one
 *  it opened with) is `file` on machine `on`. `open`, `moved`: the shared maps; `alive`: pane ids that exist. */
export function shownIn(open, moved, file, on, alive) {
  const want = previewId(file, on);
  for (const [token, e] of Object.entries(open ?? {})) {
    if (e?.file && alive.has(e.pane) && previewId(moved?.[token] ?? e.file, e.on) === want) return e.pane;
  }
  return null;
}

/** OPEN with the tabs `v2` (OPEN_V2's map) recorded added, `open`'s own entries first, so tabs
 *  opened before ".v3" are still found, and remember keeps their MOVED (openTab then clears
 *  OPEN_V2). A v2 id names the machine and the path's key, which serves as the file: previewId
 *  gives the same id for it. */
export function upgraded(open, v2) {
  if (!v2) return open ?? {};
  const out = {};
  for (const [id, e] of Object.entries(v2)) {
    try {
      const [on, file] = JSON.parse(id);
      if (e?.token && e.pane && typeof file === "string") out[e.token] = { pane: e.pane, file, on: on ?? null };
    } catch {}
  }
  return { ...out, ...(open ?? {}) };
}

/** OPEN and MOVED once `pane` (props.token `token`) was made for `file`. Entries for panes no
 *  longer in `alive` are dropped, with their MOVED. A token OPEN never named keeps its MOVED:
 *  its tab may be alive, unrecorded after an overlap, and restores from it (only a tab can tell
 *  its token is gone, and it can't). So MOVED entries of tabs never recorded stay after their
 *  tab closed, for good: rare, as it takes a tab left unrecorded (an overlap, or a pane that came
 *  after the opener's last look) that then followed a link. The new token's MOVED
 *  stays too: its tab may have followed a link before it was recorded. */
export function remember(open, moved, file, on, pane, token, alive) {
  const entries = Object.entries(open ?? {});
  const live = entries.filter(([t, e]) => t !== token && e?.pane !== pane && alive.has(e?.pane));
  const nextOpen = Object.fromEntries([...live, [token, { pane, file, on: on ?? null }]]);
  const gone = new Set(entries.map(([t]) => t).filter((t) => !Object.hasOwn(nextOpen, t)));
  return { open: nextOpen, moved: Object.fromEntries(Object.entries(moved ?? {}).filter(([t]) => !gone.has(t))) };
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
  const open = () => upgraded(shared(OPEN), shared(OPEN_V2));
  const shown = shownIn(open(), shared(MOVED), file, on, ids());
  if (shown) { run("pane.focus", { pane: shown }); done(); return; }
  const token = newToken(), since = Date.now(), before = ids();
  setShared(OPENING, marked(shared(OPENING), token, { since, until: null }, since));
  run(...openCommand({ file, on, token, space }));
  const attempt = (tries, wait) => {
    const got = madePane(shared(OPENING), token, before, panes());
    if (got.wait && tries > 0) { wait(STEP, (wait) => attempt(tries - 1, wait)); return; }
    if (got.pane) {
      const next = remember(open(), shared(MOVED), file, on, got.pane, token, ids());
      setShared(OPEN, next.open); setShared(MOVED, next.moved);
      if (shared(OPEN_V2) != null) setShared(OPEN_V2, null);
      setShared(OPENING, marked(shared(OPENING), token, { since, until: Date.now() }, Date.now()));
    }
    done();
  };
  attempt(TRIES, wait);
}

// The floating preview: one window (kind "window", one key), which opening again replaces
// in its place. FLOAT: { id, file, on, token, copy, probe?, alive? } of the open one, null when
// none is; the token tells the window's own copy that it is still the one FLOAT names, copy the
// window's running copy. FLOAT is saved and outlives the window (a restart, a layout switch, a
// crash): a panel copy that starts while it is set asks with a fresh `probe`, the window's copy
// answers with `alive` = that probe, and an unanswered probe clears FLOAT (roundup-files main.js).
export const FLOAT = "roundup-preview.float";
export function floatSpec({ file, on = null, token }) {
  return { kind: "window", key: "roundup-preview", mod: "roundup-preview", width: 0.6, height: 0.75, props: { file, on, float: token } };
}

/** Whether FLOAT `f` names a window to follow: written fresh (no probe), or its probe answered. */
export const isOpen = (f) => Boolean(f) && (f.probe == null || f.alive === f.probe);

/** Whether FLOAT `f` names an open window showing `file` on machine `on`, however the path is
 *  written: the window writes a followed link's path in its own form (/ on Windows). */
export const floatShows = (f, file, on) => isOpen(f) && Boolean(f.file) && samePath(f.file, file) && (f.on ?? null) === (on ?? null);

/** FLOAT once window `token` shows `file` (it followed a link or went Back); null when FLOAT
 *  names another window, which it then leaves alone. */
export const floatMoved = (f, token, file) => (f?.token === token ? { ...f, file } : null);

/** Whether window `token`'s copy `copy`, closing, clears FLOAT `f`: not when another window
 *  (opened again in its place) or a later copy of this one (the mod reloaded) took it. */
export const releasesFloat = (f, token, copy) => Boolean(token) && f?.token === token && (f.copy ?? copy) === copy;

/** The file a preview copy starts with. One that starts again (a restart, the mod reloaded)
 *  shows the file it showed, not the one it opened with (`file`): a tab its token's MOVED
 *  (`moved`), the window FLOAT's file (`f`) while FLOAT holds its token (`float`). */
export function startFile({ file, token = null, float = null }, f, moved) {
  const was = float ? (f?.token === float ? f.file : null) : token ? moved?.[token] : null;
  return was ?? file;
}

/** FLOAT `f` without a probe or its answer: a window opened or a copy started just now. */
export function fresh(f) {
  const { probe: _probe, alive: _alive, ...rest } = f ?? {};
  return rest;
}

/** FLOAT once openOverlay returned `record` ({ file, on, token, id }): what the window's copy
 *  wrote under the same token meanwhile (its `copy`) stays; another token's record is replaced. */
export const placed = (f, record) => ({ ...(f?.token === record.token ? f : {}), ...record });

/** The window copy `token`/`copy`'s answer to FLOAT `f`: the record to write, or null when it
 *  names another window or copy, or has no probe left to answer. */
export function answered(f, token, copy) {
  return f?.token === token && f.copy === copy && f.probe != null && f.alive !== f.probe ? { ...f, alive: f.probe } : null;
}

/** Whether FLOAT `f` still holds `probe` unanswered: then no window took it, and FLOAT goes.
 *  A newer probe (another panel copy asked since), or a window written since, isn't this one's. */
export const unanswered = (f, probe) => Boolean(f) && f.probe === probe && f.alive !== probe;

/** The app command, as [name, args], that shows `file` (on machine `on`) in roundup-preview. */
export function openCommand({ file, on = null, mode = "tab", token = null, space = null }) {
  const props = { file, on, token };
  if (mode === "split-right" || mode === "split-down") {
    return ["pane.split", { direction: mode === "split-down" ? "down" : "right", mod: "roundup-preview", props }];
  }
  return ["tab.new", { name: file.split(/[\\/]/).pop(), mod: "roundup-preview", props, ...(space ? { space } : {}) }];
}
