// node --test 'tests/*.test.mjs'
// roundup-pane as the terminal menu (L2): Herdr's pane menu item for item, and as in Herdr's menu
// 0.1.14 without the pane rows for a terminal outside a tab. Also roundup-confirm's look.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, find, findAll, texts, pane, terminal } from "./support/harness.mjs";

const Pane = (await import("../mods/roundup-pane/main.js")).default;
const Confirm = (await import("../mods/roundup-confirm/main.js")).default;

beforeEach(reset);

const CHOICES = ["Never", "While an agent works", "Always"];
// The menu's rows (mi-0, mi-1, …) by label, the choices of when closing asks included.
function menu(target) {
  const root = mount(Pane, { props: { tab: "pane", target, overlay: "o1" } }).render();
  const rows = findAll(root, (e) => /^mi-\d+$/.test(e.elementId ?? "")).map((r) => texts(r).find((s) => s.length > 1));
  return { root, rows };
}

test("PAN-12, PAN-17: a terminal in a tab gets Split, Zoom and Close pane; one outside a tab only the terminal rows", () => {
  herdr.set({
    panes: [pane("p1", "tb1", { terminal: "t1" })],
    terminals: [terminal("t1"), terminal("t9", { parent: "t1" })],
  });
  const inTab = menu({ pane: "p1", terminal: "t1" });
  assert.deepEqual(inTab.rows, ["Split right", "Split down", "Zoom", "Send right-clicks to pane", "Close pane", ...CHOICES]);
  assert.ok(texts(inTab.root).includes("Ask before closing a pane"));
  // A layout terminal block, or a window: its pane is the block's id, not in panes(). With no
  // Close pane there, the choice of when closing asks goes too.
  const outside = menu({ pane: "block-7", terminal: "t9" });
  assert.deepEqual(outside.rows, ["Send right-clicks to pane", "Send back to t1"]);
  assert.ok(!texts(outside.root).includes("Ask before closing a pane"), "no heading outside a tab");
});

test("PAN-17: a menu with no rows at all closes on Esc and ignores the other keys", () => {
  // Neither a pane in a tab nor a live terminal: nothing to offer.
  const { view, cx, render } = mount(Pane, { props: { tab: "pane", target: { pane: "block-7", terminal: "t404" }, overlay: "o1" } });
  const root = render();
  assert.equal(findAll(root, (e) => /^mi-\d+$/.test(e.elementId ?? "")).length, 0);
  const menuEl = find(root, (e) => e.elementId === "menu");
  for (const key of ["down", "up", "enter"]) menuEl.handlers.key_down({ key }, cx);
  assert.equal(view.at, 0);
  assert.deepEqual(herdr.calls("closeOverlay"), []);
  menuEl.handlers.key_down({ key: "escape" }, cx);
  assert.deepEqual(herdr.calls("closeOverlay"), [["o1"]]);
  assert.deepEqual(cx.errors, []);
});

test("CNF-06, CNF-08: the dialog is rounded 8px on popover, with the defaults for title and detail", () => {
  const root = mount(Confirm, { props: { overlay: "o1" } }).render();
  assert.deepEqual([root.style("rounded"), root.style("bg")], [[8], ["popover"]]);
  assert.deepEqual(texts(root.kids[0]).filter((s) => s !== "Esc"), ["Are you sure?"], "the title");
  const detail = root.kids[1];
  assert.ok(detail.has("overflow_y_scrollbar"), "the detail is the scrolling text under the title");
  assert.deepEqual(detail.style("text_color"), ["muted"]);
  assert.deepEqual(detail.kids, [""], "the detail is empty");
});
