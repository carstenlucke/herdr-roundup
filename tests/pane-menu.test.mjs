// node --test 'tests/*.test.mjs'
// roundup-pane as the terminal menu (L2): Herdr's pane menu item for item, and as in Herdr's menu
// 0.1.14 without the pane rows for a terminal outside a tab. Also roundup-confirm's look.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, findAll, texts, pane, terminal } from "./support/harness.mjs";

const Pane = (await import("../mods/roundup-pane/main.js")).default;
const Confirm = (await import("../mods/roundup-confirm/main.js")).default;

beforeEach(reset);

// The menu's command rows (mi-0, mi-1, …), by label, before the three choices of when closing asks.
const CHOICES = 3;
function labels(target) {
  const root = mount(Pane, { props: { tab: "pane", target, overlay: "o1" } }).render();
  const rows = findAll(root, (e) => /^mi-\d+$/.test(e.elementId ?? ""));
  return rows.slice(0, rows.length - CHOICES).map((r) => texts(r).find((s) => s.length > 1));
}

test("PAN-12, PAN-17: a terminal in a tab gets Split, Zoom and Close pane; one outside a tab only the terminal rows", () => {
  herdr.set({
    panes: [pane("p1", "tb1", { terminal: "t1" })],
    terminals: [terminal("t1"), terminal("t9", { parent: "t1" })],
  });
  assert.deepEqual(labels({ pane: "p1", terminal: "t1" }), ["Split right", "Split down", "Zoom", "Send right-clicks to pane", "Close pane"]);
  // A layout terminal block, or a window: its pane is the block's id, not in panes().
  assert.deepEqual(labels({ pane: "block-7", terminal: "t9" }), ["Send right-clicks to pane", "Send back to t1"]);
});

test("CNF-06, CNF-08: the dialog is rounded 8px on popover, with the defaults for title and detail", () => {
  const root = mount(Confirm, { props: { overlay: "o1" } }).render();
  assert.deepEqual([root.style("rounded"), root.style("bg")], [[8], ["popover"]]);
  assert.ok(texts(root).includes("Are you sure?"));
});
