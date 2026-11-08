// The preview part: one file, shown by the viewer for its kind (viewers/), opened
// by roundup-files in a tab or a split. props: { file: absolute path, on: machine or null }.
// A local file reloads when it changes on disk, keeping the viewer's Raw or zoom.
// The header: Back (after following a link), the name and folder (a click copies
// the name or the full path) and its size, the viewer's own controls, and the ⋯ menu.
// As the floating window (props.float, opened by roundup-files): Open in tab and Close
// beside them, Esc closes, and only the header's free part drags the window.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, notify, watchFolder, shared, setShared, exec, window, run, panes, focused, closeOverlay } from "herdr";
import { viewerFor, basename } from "./kinds.js";
import { dirname, native, localPath, changedFile, normalize } from "./paths.js";
import { VIEWERS } from "./viewers/index.js";
import { openMenu } from "./menu.js";
import { iconButton } from "./viewers/controls.js";
import { MOVED, FLOAT, openTab, timerOf, newToken, fresh, answered, startFile, floatMoved, releasesFloat } from "./open-file.js";
import { formatSize } from "./size.js";
import { programs } from "./programs.js";
import { systemOf } from "./platform.js";

// How often a file whose folder can't be watched is looked at (watch).
const POLL = 3000;

export class Preview {
  init(_props, cx) {
    const { file, on = null, float = null, overlay = null, token = null } = props() ?? {};
    this.on = on;
    // A tab opened by openTab: its token, under which it tells MOVED what it shows.
    this.token = token;
    // The floating window's copy: its token, and a handle so Esc reaches it once clicked.
    this.float = float && overlay ? float : null;
    if (this.float) this.handle = cx.focus_handle();
    this.system = systemOf(window()?.platform, on);
    this.history = [];
    this.size = { width: 900, height: 700 };
    // A copy that starts again (a restart, the mod reloaded) shows the file it showed, not the one
    // it opened with: a tab's MOVED, the window's FLOAT. So OPEN and FLOAT stay right about it.
    const start = startFile({ file, token, float: this.float }, shared(FLOAT), shared(MOVED));
    this.show(start && localPath(start, this.system), cx);
    // A window that starts again (the mod reloaded) writes FLOAT back if it is gone, and marks it
    // with this copy, so the copy before, closing late, leaves it alone. Not over a newer window.
    // Starting proves it is there: the record drops a probe a panel copy may have left (fresh).
    // FLOAT outlives the window, so a panel copy starting while it is set asks (`probe`); this
    // copy answers from a timer, which ends with the window. It writes only when asked.
    if (this.float) {
      this.copy = newToken();
      const f = shared(FLOAT);
      if (!f || f.token === this.float) setShared(FLOAT, { ...fresh(f), id: overlay, file: this.file, on, token: this.float, copy: this.copy });
      cx.timer.every(500, () => {
        const next = answered(shared(FLOAT), this.float, this.copy);
        if (next) setShared(FLOAT, next);
      });
    }
  }

  env() {
    return { file: this.file, on: this.on, anchor: this.anchor, size: this.size, navigate: (file, cx, anchor) => this.navigate(file, cx, anchor),
      // A field or editor that takes the keyboard on a press says so (viewers/text.js keepsKeys):
      // the window's press handler, which runs after it, then leaves the keyboard there.
      ownsKeys: () => { this.childKeys = true; } };
  }

  // reload: the same file changed on disk; the old view stays until the new one is ready.
  show(file, cx, reload = false) {
    const previous = reload ? this.state : null;
    if (!reload) { this.release(); this.bytes = null; }
    this.file = file; this.error = null;
    if (!file) { this.error = "No file to show"; return; }
    if (!reload) this.watch(cx);
    const viewer = this.viewer = VIEWERS[viewerFor(file)];
    const env = this.env(), loading = this.loading = {};
    cx.spawn(async (cx) => {
      const r = await exec(...programs(this.system).bytes(file), { on: this.on }).catch(() => null);
      if (this.loading === loading) { this.bytes = r?.code === 0 ? Number(r.stdout.trim()) : null; cx.notify(); }
    });
    cx.spawn(async (cx) => {
      try {
        const state = await viewer.load(file, env, previous);
        if (this.loading !== loading) { viewer.release?.(state); return; }
        this.release();
        this.state = state;
        viewer.start?.(state, env, cx);
      } catch (e) { if (this.loading === loading) { this.release(); this.error = String(e?.message ?? e); } }
      finally { cx.notify(); }
    });
  }

  // A local file reloads on a change in its folder. The watch reports a folder reached through
  // a link (/tmp is /private/tmp on macOS) resolved, so the file's resolved name counts too. A
  // watch that rejects (on Linux, a tree above 4096 folders) gives way to a look every POLL ms.
  watch(cx) {
    this.poll?.cancel(); this.poll = null;
    if (this.on) return;
    const file = this.file, token = this.watching = {};
    cx.spawn(async (cx) => {
      const real = await this.realFile(file);
      try {
        while (this.watching === token) {
          const changed = await watchFolder(dirname(file));
          if (this.watching === token && changedFile(changed, file, real)) this.show(file, cx, true);
        }
      } catch {
        if (this.watching === token) await this.pollFile(file, token, cx);
      }
    });
  }

  // `file` with its folder's links resolved, or null where that is the same or can't be told.
  async realFile(file) {
    const command = programs(this.system).realDir?.(dirname(file));
    const r = command && await exec(...command).catch(() => null);
    const dir = r?.code === 0 ? r.stdout.replace(/\n$/, "") : "";
    return dir && dir !== dirname(file) ? normalize(`${dir}/${basename(file)}`) : null;
  }

  // The watch's stand-in: the file's revision (modification time and size), looked at every POLL ms.
  async pollFile(file, token, cx) {
    const stamp = () => exec(...programs(this.system).stamp(file)).then((r) => r.code === 0 ? r.stdout.trim() : null, () => null);
    let last = await stamp(), busy = false;
    if (this.watching !== token) return;
    this.poll = cx.timer.every(POLL, (cx) => {
      if (busy || this.watching !== token) return;
      busy = true;
      cx.spawn(async (cx) => {
        const now = await stamp();
        busy = false;
        if (this.watching !== token) return;
        if (now !== last) this.show(file, cx, true);
        last = now;
      });
    });
  }

  navigate(file, cx, anchor) {
    this.history.push(this.file);
    this.anchor = anchor;
    this.show(file, cx);
    this.moved();
    cx.notify();
  }

  back(cx) {
    const file = this.history.pop();
    if (file) { this.anchor = null; this.show(file, cx); this.moved(); cx.notify(); }
  }

  // Tells roundup-files what this preview shows now, so it isn't reused for the file it opened with:
  // a tab under its own token (one without, opened elsewhere, is in no OPEN entry). The floating
  // window updates FLOAT's file instead, while FLOAT still names it, so the panel's floats() sees it.
  moved() {
    if (this.float) {
      const next = floatMoved(shared(FLOAT), this.float, this.file);
      if (next) setShared(FLOAT, next);
    } else if (this.token) setShared(MOVED, { ...(shared(MOVED) ?? {}), [this.token]: this.file });
  }

  release() {
    if (this.state) this.viewer?.release?.(this.state);
    this.state = null;
  }

  close() {
    this.watching = null; this.poll?.cancel(); this.release();
    // The window is gone: roundup-files learns there is none, unless another one (opened again
    // in its place) or a later copy of this one (the mod reloaded) already took FLOAT.
    if (releasesFloat(shared(FLOAT), this.float, this.copy)) setShared(FLOAT, null);
  }

  // From the floating window to a tab: the pane already showing the file comes to the front,
  // else a new tab in the space in front, recorded (shared OPEN) as roundup-files records its
  // own. The window's timers end when it closes, so it stays until the record is settled (at
  // most five looks, 200ms apart); the tab itself opens at once.
  toTab(cx) {
    const file = this.file, on = this.on, overlay = props()?.overlay;
    if (!file || this.tabRequested) return;
    this.tabRequested = true;
    openTab({ panes, run, shared, setShared }, file, on, timerOf(cx), () => closeOverlay(overlay), focused()?.space ?? null);
  }

  // The name or the folder, which a click copies: the name, or the file's full path.
  copier(id, label, what, t) {
    const text = what === "name" ? basename(this.file ?? "") : native(this.file ?? "", this.system);
    return div().id(id).min_w(0).truncate().cursor_pointer().hover((s) => s.text_color(t.accent))
      .tooltip(what === "name" ? "Copy the file name" : "Copy the full path")
      .on_click((_e, cx) => {
        cx.write_to_clipboard(text);
        notify({ title: what === "name" ? "File name copied to the clipboard" : "Path copied to the clipboard", body: text, level: "success", timeout: 2500 });
      }).child(label);
  }

  // A window control: like iconButton, with the click's cx (Open in tab waits on a timer).
  windowButton(id, icon, tip, action, t) {
    return div().id(`roundup-preview-${id}`).size(28).flex().items_center().justify_center().rounded(7).cursor_pointer()
      .bg(t.chrome).text_color(t.muted).hover((s) => s.text_color(t.foreground))
      .tooltip(tip).on_click((_e, cx) => action(cx)).child(svg(`mods/roundup-preview/${icon}.svg`).size(14));
  }

  render() {
    const t = theme(), env = this.env(), viewer = this.viewer, state = this.state, float = Boolean(this.float);
    // In the window a press drags it unless stopped: the controls and the body stop it, and give
    // the window the keyboard (for Esc) unless a field or editor in them just took it.
    const still = (el) => float ? el.on_mouse_down("left", (_e, cx) => {
      if (!this.childKeys) this.handle.focus();
      this.childKeys = false; cx.stop_propagation();
    }) : el;
    // In the window the name and folder are plain text, part of what drags it.
    const label = (id, text, what) => float ? div().id(id).min_w(0).truncate().child(text) : this.copier(id, text, what, t);
    const control = (id, label, tip, action) => div().id(id).h(26).px(9).flex().items_center().rounded(6).cursor_pointer().text_size(12)
      .text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip(tip).on_click(action).child(label);
    return v_flex().id("roundup-preview").size_full()
      .when(float, (el) => el.track_focus(this.handle).on_key_down((e, cx) => {
        if (e.keystroke === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); }
      })).min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(10).gap(8).items_center().border_b(1).border_color(t.border)
        // A press on its free part drags the window and gives it the keyboard, for Esc.
        .when(float, (el) => el.on_mouse_down("left", () => { this.childKeys = false; this.handle.focus(); }))
        .when(this.history.length > 0, (el) => el.child(still(control("roundup-preview-back", "←", `Back to ${basename(this.history.at(-1))}`, (_e, cx) => this.back(cx)))))
        .child(h_flex().flex_1().min_w(0).gap(8).items_center().pl(this.history.length ? 0 : 4)
          .child(label("roundup-preview-name", basename(this.file ?? ""), "name").flex_none().max_w(320).font_semibold())
          .child(label("roundup-preview-path", this.file ? native(dirname(this.file), this.system) : "", "path").flex_shrink(1).text_size(12).text_color(t.dim))
          .when(this.bytes != null, (el) => el.child(div().flex_none().text_size(12).text_color(t.dim).child(formatSize(this.bytes))))
          .child(div().flex_1()))
        .child(still(h_flex().id("roundup-preview-controls").flex_none().gap(8).items_center())
          .when(Boolean(state && viewer?.toolbar), (el) => el.child(viewer.toolbar(state, env)))
          .when(Boolean(this.file), (el) => el.child(iconButton("more", "more", "Open in editor, reveal, copy the path…", false, () => openMenu(this.file, this.on))))
          .when(float && Boolean(this.file), (el) => el.child(this.windowButton("to-tab", "to-tab", "Open in a tab", (cx) => this.toTab(cx), t)))
          .when(float, (el) => el.child(this.windowButton("close", "close", "Close (Esc)", () => closeOverlay(props()?.overlay), t)))))
      .child(still(v_flex().id("roundup-preview-body")).flex_1().min_h(0).on_size_change((size, cx) => { this.size = size; cx.notify(); })
        .child(state ? viewer.render(state, env) : div().p(14).text_color(this.error ? t.ansi1 : t.dim).child(this.error ?? "Loading…")));
  }
}
