// The viewers, by id. Each one is a module with:
//   id
//   load(file, env, previous)  -> Promise<state>   read the file; throw to show an error.
//                              previous: the state before the file changed on disk, to keep Raw, zoom…
//   start?(state, env, cx)     after load: background work (cx.spawn), e.g. more PDF pages
//   toolbar?(state, env)       -> element           controls in the header, right side
//   render(state, env)         -> element           the body; fills the rest of the pane
//   release?(state)            the preview closed or moved to another file
// env: { file, on, anchor (a #heading a link asked for), size: { width, height } of the body,
//        navigate(file, cx, anchor?) }.
// A new viewer: add it here and map its extensions in ../kinds.js.
import code from "./code.js";
import image from "./image.js";
import json from "./json.js";
import markdown from "./markdown.js";
import pdf from "./pdf.js";
import table from "./table.js";

export const VIEWERS = { code, image, json, markdown, pdf, table };
