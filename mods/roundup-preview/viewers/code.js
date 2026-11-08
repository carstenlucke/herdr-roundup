// Any text file: read-only source with syntax colors and line numbers.
import { languageOf } from "../kinds.js";
import { readLongText, codeState, codeView } from "./text.js";

export default {
  id: "code",
  async load(file, env) {
    return { editor: codeState((await readLongText(file, env.on)).text, languageOf(file)) };
  },
  render: (state, env) => codeView(state.editor, env),
  release: (state) => state.editor?.release(),
};
