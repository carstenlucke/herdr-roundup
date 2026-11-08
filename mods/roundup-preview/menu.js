// The menu part: the preview header's ⋯ menu, a popup copy of this mod, with actions on
// the shown file. Each runs the command for its system (platform.js); one the system
// can't do is left out, and opening and revealing need the file on this computer.
import { div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, theme, openOverlay, closeOverlay, notify, exec, home, window } from "herdr";
import { openInEditor } from "./editor.js";
import { dirname, native, relativePath } from "./paths.js";
import { systemOf, commands, revealLabel } from "./platform.js";

const ROW = 30;

export function openMenu(file, on) {
  openOverlay({ mod: "roundup-preview", kind: "popup", width: 240, props: { part: "menu", file, on } });
}

export class FileMenu {
  init(_props, cx) {
    const { file, on } = props();
    this.system = systemOf(window()?.platform, on);
    this.tools = new Set();
    this.relative = relativePath(file, null, home());
    cx.spawn(async (cx) => {
      const r = await exec("git", ["-C", dirname(file), "rev-parse", "--show-toplevel"], { on }).catch(() => null);
      if (r?.code === 0) { this.relative = relativePath(file, r.stdout.trim(), home()); cx.notify(); }
    });
    // Linux opens and reveals through xdg-open, when it is there.
    if (this.system === "linux") cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", "command -v xdg-open"]).catch(() => null);
      if (r?.code === 0) { this.tools = new Set(["xdg-open"]); cx.notify(); }
    });
  }

  render() {
    const t = theme(), { file, on, overlay } = props(), can = commands(this.system, this.tools), reveal = revealLabel(this.system);
    const failed = (what) => (e) => notify({ title: `Couldn't ${what}`, body: String(e?.message ?? e), level: "error" });
    const desktop = ([program, args], what) => exec(program, args).then((r) => { if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim()); }).catch(failed(what));
    const copy = (cx, text, what) => { cx.write_to_clipboard(text); notify({ title: `${what} copied to the clipboard`, body: text, level: "success", timeout: 2500 }); };
    const item = (id, label, run) => div().id(`file-menu-${id}`).h(ROW).px(10).flex().items_center().rounded(6).text_size(13)
      .cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => { closeOverlay(overlay); run(cx); })
      .child(label);
    const opens = [
      can.editor && item("editor", "Open in editor", () => openInEditor(file, on).catch(failed("open the editor"))),
      can.open && item("default", "Open with default app", () => desktop(can.open(file), "open the file")),
      can.reveal && item("reveal", reveal, () => desktop(can.reveal(file), reveal.toLowerCase())),
    ].filter(Boolean);
    return v_flex().id("file-menu").w_full().p(6).gap(2).bg(t.popover).text_color(t.foreground)
      .children(opens)
      .when(opens.length > 0, (el) => el.child(div().h(1).mx(6).my(2).bg(t.border)))
      .child(item("path", "Copy path", (cx) => copy(cx, native(file, this.system), "Path")))
      .child(item("relative", "Copy relative path", (cx) => copy(cx, this.relative, "Relative path")));
  }
}
