// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
// roundup-files' clicks and keys: the context menu, the keyboard menu, the cursor's moves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { menuItems, menuHeight, keyMenuAt, menuKey, moveIndex, clickAction, ROW } from "../mods/roundup-files/input.js";

const ids = (groups) => groups.map((g) => g.map(([id]) => id));
const file = { dir: false, gone: false, local: true }, remote = { dir: false, gone: false, local: false };
const folder = { dir: true, gone: false, local: true }, gone = { dir: false, gone: true, local: true };

test("menuItems per local file, remote file, folder and deleted file", () => {
  assert.deepEqual(ids(menuItems(file, true)), [["float", "tab", "preview", "open", "reveal"], ["copy-rel", "copy-abs"], ["send"]]);
  assert.deepEqual(ids(menuItems(remote, true)), [["float", "tab", "preview"], ["copy-rel", "copy-abs"], ["send"]]);
  assert.deepEqual(ids(menuItems(folder, true)), [["reveal"], ["copy-rel", "copy-abs"], ["send"]]);
  assert.deepEqual(ids(menuItems(gone, true)), [["copy-rel", "copy-abs"], ["send"]]);
  assert.deepEqual(ids(menuItems({ ...folder, local: false }, true)), [["copy-rel", "copy-abs"], ["send"]]);
});

test("Reveal is \"Reveal in Finder\" on macOS, else \"Show in folder\"", () => {
  const reveal = (mac) => menuItems(file, mac)[0].find(([id]) => id === "reveal")[1];
  assert.equal(reveal(true), "Reveal in Finder");
  assert.equal(reveal(false), "Show in folder");
});

test("menuHeight is 28 per entry, 9 per divider and 10 of padding", () => {
  assert.equal(menuHeight(menuItems(file, true)), 28 * 8 + 9 * 2 + 10);
  assert.equal(menuHeight(menuItems(gone, true)), 28 * 3 + 9 + 10);
});

test("The keyboard menu hangs below its row, and above it where it doesn't fit", () => {
  const k = (row, m = file) => ({ m, row, depth: 1 });
  const tall = menuHeight(menuItems(file)) + 4;
  // Not measured yet.
  assert.equal(keyMenuAt(k(0), 5, null, 1), null);
  // A long list, the row centred: below it.
  const h = 1000;
  const below = keyMenuAt(k(50), 200, h + 4, 1);
  assert.equal(below.up, undefined);
  assert.equal(below.left, 4 + 8 + 14 + 18);
  assert.equal(below.top, Math.round(h / 2 - ROW / 2) + ROW);
  // The last row of a long list sits at the bottom: above it.
  const last = keyMenuAt(k(199), 200, h + 4, 1);
  assert.equal(last.up, true);
  assert.equal(last.top, h - ROW);
  // A short list can't scroll: the row stays where it is.
  assert.deepEqual(keyMenuAt(k(0), 3, h + 4, 1), { top: ROW, left: 44 });
  assert.ok(ROW + ROW + tall <= h);
  // Herdr's zoom makes the measured height larger than the mod's.
  assert.deepEqual(keyMenuAt(k(0), 3, 2 * (h + 4), 2), { top: ROW, left: 44 });
  assert.equal(keyMenuAt(k(0), 3, 2 * (ROW + tall), 2).up, true);
});

test("Keyboard menu keys: ↑↓/Tab wrap; Home/End/PgUp/PgDn go to the ends; Enter/Space run; Esc/←/Menu/Shift-F10 close", () => {
  assert.deepEqual(menuKey(0, 5, "down"), { at: 1 });
  assert.deepEqual(menuKey(4, 5, "down"), { at: 0 });
  assert.deepEqual(menuKey(4, 5, "tab"), { at: 0 });
  assert.deepEqual(menuKey(0, 5, "up"), { at: 4 });
  assert.deepEqual(menuKey(3, 5, "home"), { at: 0 });
  assert.deepEqual(menuKey(3, 5, "pageup"), { at: 0 });
  assert.deepEqual(menuKey(1, 5, "end"), { at: 4 });
  assert.deepEqual(menuKey(1, 5, "pagedown"), { at: 4 });
  assert.deepEqual(menuKey(2, 5, "enter"), { run: 2 });
  assert.deepEqual(menuKey(2, 5, "space"), { run: 2 });
  for (const key of ["escape", "left", "menu"]) assert.deepEqual(menuKey(2, 5, key), { close: true }, key);
  assert.deepEqual(menuKey(2, 5, "f10", true), { close: true });
  assert.deepEqual(menuKey(2, 5, "f10", false), {});
  assert.deepEqual(menuKey(2, 5, "x"), {});
});

test("move: ↑↓ ±1, PgUp/PgDn ±10, Home/End to the ends, clamped", () => {
  assert.equal(moveIndex(20, 5, 1), 6);
  assert.equal(moveIndex(20, 5, -1), 4);
  assert.equal(moveIndex(20, 5, 10), 15);
  assert.equal(moveIndex(20, 15, 10), 19);
  assert.equal(moveIndex(20, 5, -10), 0);
  assert.equal(moveIndex(20, 5, -20), 0); // Home
  assert.equal(moveIndex(20, 5, 20), 19); // End
});

test("move with nothing selected: down and Home start at the top, up and End at the bottom", () => {
  assert.equal(moveIndex(20, -1, 1), 0);
  assert.equal(moveIndex(20, -1, -20), 0);
  assert.equal(moveIndex(20, -1, -1), 19);
  assert.equal(moveIndex(20, -1, 20), 19);
  assert.equal(moveIndex(20, -1, 10), 9);
  assert.equal(moveIndex(1, -1, -1), 0);
});

test("A single click on a file only moves the cursor and lets an open window follow", () => {
  const never = () => { throw new Error("floats isn't asked on a single click"); };
  assert.deepEqual(clickAction({ rel: "a.md", dir: false }, 1, false, never), ["follow"]);
  assert.deepEqual(clickAction({ rel: "a.md", dir: false }, 1, true, never), ["stopFollow"]);
});

test("A double-click floats the file, unless the window shows it; with Cmd it opens a tab and closes such a window", () => {
  const r = { rel: "a.md", dir: false };
  assert.deepEqual(clickAction(r, 2, false, () => false), ["openFloat"]);
  assert.deepEqual(clickAction(r, 2, false, () => true), []);
  assert.deepEqual(clickAction(r, 2, true, () => false), ["openPreview"]);
  assert.deepEqual(clickAction(r, 2, true, () => true), ["closeFloat", "openPreview"]);
  assert.deepEqual(clickAction(r, 3, false, () => false), []);
});

test("A folder or a deleted file acts on the first press only", () => {
  assert.deepEqual(clickAction({ rel: "src", dir: true }, 1, false), ["activate"]);
  assert.deepEqual(clickAction({ rel: "src", dir: true }, 2, false), []);
  assert.deepEqual(clickAction({ rel: "x", dir: false, gone: true }, 1, true), ["activate"]);
  assert.deepEqual(clickAction({ rel: "x", dir: false, gone: true }, 2, true), []);
});
