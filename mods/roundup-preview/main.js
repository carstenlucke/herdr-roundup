// roundup-preview: one file shown by the viewer for its kind, opened in a tab or a split
// by roundup-files. Each copy draws the part its props.part names:
//   preview  the file (preview.js); the default
//   menu     the preview's ⋯ popup (menu.js)
//
// From gsydler/herdr-cria `file-preview` (the `cria-file-preview` mod) at 82ce1eb,
// Apache-2.0. Changed here: renamed roundup-preview throughout (asset paths, the menu's
// overlay, the cache folder data/roundup-preview/, the shared keys); added the floating window
// (preview.js with props.float: Open in tab, Close, Esc; open-file.js's FLOAT and floatSpec;
// close.svg, to-tab.svg). See THIRD_PARTY_NOTICES.md.
import { View } from "gpui-kit";
import { props } from "herdr";
import { Preview } from "./preview.js";
import { FileMenu } from "./menu.js";

const PARTS = { preview: Preview, menu: FileMenu };

export default class FilePreview extends View {
  init(initial, cx) {
    this.part = new (PARTS[props()?.part] ?? Preview)();
    this.part.init(initial, cx);
  }

  render(cx) { return this.part.render(cx); }

  close(cx) { return this.part.close?.(cx); }
}
