// node --test 'tests/*.test.mjs'
// roundup-preview's code view (L2): it follows the terminal's font and size, set on the Editor at
// each draw (Herdr's files 0.1.17), so a change in Settings shows in a preview that is open.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, find } from "./support/harness.mjs";

const { codeState, codeView } = await import("../mods/roundup-preview/viewers/text.js");

beforeEach(reset);

test("VW-29: the code view draws in the terminal's font and size, and follows a change while open", () => {
  herdr.set({ settings: { zoom: 1, dark: true, font_family: "Menlo", font_size: 14 } });
  const state = codeState("const a = 1;\n", "js");
  assert.equal("font_size" in state.opts || "font_family" in state.opts, false, "not fixed in the editor's state");
  const editor = (tree) => find(tree, (e) => e.type === "Editor");
  let ed = editor(codeView(state, {}));
  assert.deepEqual([ed.style("font_family"), ed.style("text_size")], [["Menlo"], [14]]);
  herdr.set({ settings: { zoom: 1, dark: true, font_family: "JetBrains Mono", font_size: 16 } });
  ed = editor(codeView(state, {}));
  assert.deepEqual([ed.style("font_family"), ed.style("text_size")], [["JetBrains Mono"], [16]], "the same state, drawn again");
});
