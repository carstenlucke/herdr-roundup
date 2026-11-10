// The brand's rules: whether a press on the logo and name was a click, what its sub line and
// the menu's head say, and how tall the menu's popup is. Pure, so tests/brand.test.mjs runs
// it in node: the pointer's events, the time and the update check's state come in.

// A press on the logo and name drags the window as anywhere in the row (it isn't stopped), and its release
// still clicks. A click doesn't move the pointer; a drag does, the window trailing it by a few px.
export const pressOf = (e) => ({ x: e.position.x, y: e.position.y, far: 0, moves: 0 });
export function pressMoved(press, e) {
  if (!press) return;
  press.moves++;
  press.far = Math.max(press.far, Math.abs(e.position.x - press.x) + Math.abs(e.position.y - press.y));
}
// Whether the release `e` of `press` opens the menu: under 3 px and 10 moves, one click (a
// double-click maximizes the window, as in the rest of the row).
export const isClick = (press, e) => !(!press || press.far >= 3 || press.moves >= 10 || e.click_count > 1);

// "0.1.13" from the layout's file: layout() leaves out fields Herdr doesn't know, such as the root's "version" and
// "cloned_from". A copy of this layout isn't Herdr's.
export const herdrVersion = (file) => file?.cloned_from?.name === "main" ? file.cloned_from.version : null;

// The line under the name: none without a version read, an offered release, a check under way, else the version.
export const subLine = (installed, release, checking) => !installed ? null : release ? `${release.version} available` : checking ? `${installed} · checking…` : installed;

const pad = (n) => String(n).padStart(2, "0");
// "today 09:12", "yesterday 18:40", else "Nov 3 09:12", in local time; `now`: Date.now().
export function when(ms, now) {
  const d = new Date(ms), day = (x) => new Date(x).toDateString(), time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (day(ms) === day(now)) return `today ${time}`;
  if (day(ms) === day(now - 24 * 60 * 60 * 1000)) return `yesterday ${time}`;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getDate()} ${time}`;
}

// A line under the facts only when it says something they don't: a check under way, or why the last one failed.
export const status = (checking, error) => checking ? "checking" : error ? "error" : null;

// The head's height in px: the name (16 + 3), each fact 15, 3 between lines, and the status line (4 + 15) if there is one.
// A reason wraps, at most to a second line (cut there): the menu leaves room for it.
export function headHeight({ herdr, checking, error }) {
  const facts = herdr ? 4 : 3, s = status(checking, error);
  return 19 + facts * 15 + facts * 3 + (s ? 3 + 19 + (s === "error" ? 15 : 0) : 0);
}

// The room in px for the name's column in the brand row of a sidebar `sidebar` px wide, `left` px padded on the
// left (76 beside macOS's traffic lights, else 14): the row's right padding 10, search and sidebar buttons 26 each
// with a gap of 4 before each, the logo 20 and its gap 8. Null without a width. The sub line gets it as its max
// width: gpui-base's HoverCard wraps logo and name in an element no style reaches, which never shrinks below its
// content, so a longer line would run under the search button instead of being cut (seen at 268 px).
export const nameRoom = (sidebar, left) => Number.isFinite(sidebar) ? Math.max(0, sidebar - left - 10 - 2 * (26 + 4) - 20 - 8) : null;

// The popup's width, for "Update to 0.10.0-alpha.12 with an agent…". Always this wide: which release the rows name
// can change while the menu is open (pre-releases switched on there), and its width can't.
export const MENU_WIDTH = 300;

// The popup's height for its rows ({ head, sep }) under a head `head` px tall: 5 px padding each side, the head
// (6 + its lines + 6) and a divider (9), 31 px a row, 19 px a heading, 9 px a divider.
export const popupHeight = (rows, head) => rows.reduce((h, r) => h + 31 + (r.head ? 19 : 0) + (r.sep ? 9 : 0), 10 + 12 + head + 9);
