// A pane's header, cloned from Herdr's `pane` mod:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "roundup-pane" } } } }
// Shows the program's icon, the pane's name, its id, the folder and the agent's status;
// buttons rename, split, zoom and close this pane. Props from the app: { pane, terminal }.
//
// - The id is the terminal's address (`t7`, what `hc` and Cmd-click take); a mod pane has no
//   terminal and shows its pane id, shortened. Double-click it: copied to the clipboard.
// - A name: double-click the name, or the pencil on hover. herdr-core can't rename a terminal
//   once it runs, so a terminal's name is its label `roundup-pane.name` (kept by the core with
//   the terminal, seen by every Herdr client, gone when the terminal ends; set with
//   `hc label t7 roundup-pane.name=…`). A mod pane's name is shared state `roundup-pane.names`
//   (pane id -> name). An empty name goes back to the program's name.
// - The same mod draws the rename dialog: opened as an overlay with props { rename: {...} }.
// - Closing asks first as "Ask before closing a pane" in the terminal's menu says; a tab's only pane
//   as the tab menu's choice for tabs says (close.js, shared with roundup-tabs). Ways to close: the ×,
//   cmd-shift-w (`roundup-tabs.close-pane`: the tab bar has one copy, every header would get it) and
//   Close pane in the terminal's right-click menu, which is this mod too (the layout's `terminal_menu`).

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex, InputState, Input } from "gpui-base";
import { panes, terminals, props, run, theme, settings, home, hc, shared, setShared, openOverlay, closeOverlay, notify, focused } from "herdr";
import { closePane, givenName, fallbackName, NAME_LABEL, NAMES } from "./close.js";
import { menuView, shortcut } from "./menu.js";
import { folder, paneId, cutName } from "./header-text.js";
// Roundup's own: the agent's context meter (context/, context-io.js, context-view.js; RECIPE "Context").
import { ContextReader, sweep } from "./context/reader.js";
import { headerTier } from "./context/text.js";
import { makeIo } from "./context-io.js";
import { meter } from "./context-view.js";

// Integration files of ended terminals go once an hour, by whichever header gets there first.
let lastSweep = 0;
const SEE_MS = 2000;
// A hover card draws above popups: the meter's stays empty while one of these holds an overlay id.
// This mod's own menu and rename dialog write theirs to OVERLAY and clear only their own (as
// roundup-menu does); roundup-menu's menus and the close confirmation (close.js) write theirs.
const OVERLAY = "roundup-pane.overlay";
const covered = () => Boolean(shared("roundup-menu.open") || shared("roundup-confirm.open") || shared(OVERLAY));

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// Herdr's pane menu (`menu`, tab "pane") item for item, with Close pane going through closePane.
// A terminal shown outside a tab (a layout terminal block, a window) has no pane to split, zoom or
// close: its pane is the block's id. Those rows (`inTab`) go, as in Herdr's menu 0.1.14, and with
// Close pane the choice of when closing asks.
const inTab = (target) => panes().some((p) => p.pane === target.pane);
function menuRows(target) {
  const all = terminals(), term = all.find((t) => t.address === target.terminal);
  const parent = term?.parent && all.find((t) => t.address === term.parent);
  const pane = target.pane, tabbed = inTab(target);
  return [
    { label: "Split right", icon: "panel-right", inTab: true, act: () => run("pane.split", { direction: "right", pane }), keys: shortcut(["pane.split:right"]) },
    { label: "Split down", icon: "panel-right", inTab: true, act: () => run("pane.split", { direction: "down", pane }), keys: shortcut(["pane.split:down"]) },
    { label: "Zoom", icon: "square", inTab: true, act: () => run("pane.zoom", { pane }), keys: shortcut(["pane.zoom"]) },
    ...(term ? [term.labels?.["herdr.right-click"] === "program"
      ? { label: "Use Herdr right-click menu", icon: "terminal", act: () => run("terminal.right_click", { terminal: term.address, to: "menu" }) }
      : { label: "Send right-clicks to pane", icon: "terminal", act: () => run("terminal.right_click", { terminal: term.address, to: "program" }) }] : []),
    ...(parent ? [{ label: `Send back to ${parent.name || parent.address}`, icon: "terminal", act: () => run("terminal.park", { terminal: term.address }) }] : []),
    { label: "Close pane", icon: "x", sep: true, inTab: true, act: () => closePane(pane), keys: shortcut(["roundup-tabs.close-pane", "pane.close"]) },
  ].filter((row) => tabbed || !row.inTab);
}

async function saveName(target, raw) {
  const name = cutName(raw);
  if (target.terminal) {
    const r = await hc(["label", target.terminal, `${NAME_LABEL}=${name}`]).catch((e) => ({ code: 1, stderr: String(e), stdout: "" }));
    if (r.code !== 0) notify({ title: "Couldn't rename the pane", body: (r.stderr || r.stdout).trim(), level: "error" });
    return;
  }
  const names = { ...(shared(NAMES) ?? {}) };
  if (name) names[target.pane] = name; else delete names[target.pane];
  setShared(NAMES, names);
}

export default class Pane extends View {
  init(_props, cx) {
    this.hovered = false;
    this.copied = false;
    // The menu and the dialog are overlays: their id goes to OVERLAY until they close.
    const overlay = (props()?.rename || props()?.target) && props()?.overlay;
    this.overlay = overlay || null;
    if (this.overlay) setShared(OVERLAY, this.overlay);
    if (props()?.rename) return this.initDialog(cx);
    // The terminal's right-click menu: props { tab: "pane", target: { pane, terminal }, overlay }.
    if (props()?.target) {
      this.at = 0;
      this.handle = cx.focus_handle();
      this.handle.focus();
      return;
    }
    // init's cx outlives this call (an AsyncContext): its timer gives hc get a deadline.
    this.context = new ContextReader(makeIo({ after: (ms, f) => cx.timer.after(ms, f) }));
    this.width = null;
    // A header in a hidden tab doesn't render, so render's see() misses the tab going and coming
    // back, and status changes there: this look tells the reader (no I/O, only panes() and focused()).
    cx.timer.every(SEE_MS, (cx) => { const p = this.me(); if (p) this.context.see(p, focused()?.tab === p.tab, cx); });
    cx.timer.every(10 * 60_000, (cx) => {
      if (Date.now() - lastSweep < 3_600_000) return;
      lastSweep = Date.now();
      cx.spawn(async () => { await sweep(makeIo(), terminals().map((t) => t.address)).catch(() => 0); });
    });
  }

  // Only its own entry: a newer menu or dialog may have taken the key meanwhile. (One left by a
  // crash goes with the next overlay, which writes its id and clears it on closing.)
  async close() {
    if (this.overlay && shared(OVERLAY) === this.overlay) setShared(OVERLAY, null);
    this.context?.close();
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  // --- the header ---

  button(t, id, icon, tip, action) {
    return div()
      .id(id)
      .p(3)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip)
      .on_click((_e, cx) => {
        cx.stop_propagation();
        action();
      })
      .child(svg(`mods/roundup-pane/${icon}.svg`).size(14));
  }

  openRename(p, given, fallback) {
    openOverlay({
      mod: "roundup-pane",
      kind: "dialog",
      width: 380,
      height: 196,
      props: { rename: { pane: p.pane, terminal: p.terminal, value: given, fallback } },
    });
  }

  copyId(cx, id) {
    cx.write_to_clipboard(id.copied);
    this.copied = true;
    cx.notify();
    this.copiedTimer?.cancel();
    this.copiedTimer = cx.timer.after(1200, (cx) => { this.copied = false; this.copiedTimer = null; cx.notify(); });
  }

  render(cx) {
    if (props()?.rename) return this.renderDialog();
    if (props()?.target) return menuView(this, menuRows(props().target), inTab(props().target) ? "pane" : null);
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const given = givenName(p);
    const fallback = fallbackName(p);
    const name = given || fallback;
    const id = paneId(p);
    const pic = icon(p.program, 14, t.dim);
    const font = settings().font_family ?? "JetBrains Mono";
    const st = p.status;
    const pane = p.pane;
    this.context?.see(p, focused()?.tab === p.tab, cx);
    // The tier from the current zoom, so a zoom change re-tiers without a new measurement.
    this.shownTier = headerTier(this.width, settings()?.zoom);
    const ctx = this.context && meter(t, { pane, reading: this.context.reading, tier: this.shownTier, agent: this.context.strategy?.id, hint: this.context.hint, covered: covered(),
      // An icon of its own: an element belongs to the one parent it's given (gpui-kit.d.ts).
      head: { pic: icon(p.program, 14, t.dim), name, id: id.shown, font } });
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      // The width is kept on every change (a later zoom tiers it), but only a new tier re-renders.
      .on_size_change((size, cx) => { this.width = size.width; if (headerTier(this.width, settings()?.zoom) !== this.shownTier) cx.notify(); })
      .px(10)
      .gap(8)
      .items_center()
      .bg(t.background)
      .border_b(1)
      .border_color(t.border)
      .text_size(12)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div()
        .id(`ph-name-${pane}`)
        .flex_none()
        .truncate()
        .max_w(260)
        .font_medium()
        .text_color(t.foreground)
        .tooltip(given ? `${given} · ${fallback} · double-click to rename` : "Double-click to name this pane")
        .on_click((e, cx) => { if (e.click_count === 2) { cx.stop_propagation(); this.openRename(p, given, fallback); } })
        .child(name))
      .child(div()
        .id(`ph-id-${pane}`)
        .flex_none()
        .h(18)
        .px(5)
        .flex()
        .items_center()
        .rounded(4)
        .bg(this.copied ? t.accent + "26" : t.hover)
        .font_family(font)
        .text_size(10.5)
        .text_color(this.copied ? t.accent : t.dim)
        .hover((s) => s.text_color(t.foreground))
        .tooltip(`${id.copied} · double-click to copy`)
        .on_click((e, cx) => { if (e.click_count === 2) { cx.stop_propagation(); this.copyId(cx, id); } })
        .child(this.copied ? "copied" : id.shown))
      .child(div().flex_1().truncate().text_color(t.dim).child(folder(p.cwd, home())))
      // Roundup: the hover buttons come before the meter and the status (Herdr: after the status),
      // so those two stay where they are when the pointer enters the header.
      .when(this.hovered, el => el
        .child(this.button(t, `ph-n-${pane}`, "rename", "Rename", () => this.openRename(p, given, fallback)))
        .child(this.button(t, `ph-r-${pane}`, "split-right", "Split right", () => run("pane.split", { direction: "right", pane })))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "Split down", () => run("pane.split", { direction: "down", pane })))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", p.zoomed ? "Unzoom" : "Zoom", () => run("pane.zoom", { pane })))
        .child(this.button(t, `ph-x-${pane}`, "close", "Close", () => closePane(pane))))
      .when(Boolean(ctx), (el) => el.child(ctx))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)));
  }

  // --- the rename dialog (this mod as an overlay), shaped like Herdr's `prompt` ---

  initDialog(cx) {
    const value = props().rename.value ?? "";
    this.input = InputState.new({ value, placeholder: props().rename.fallback ?? "" });
    if (value) this.input.set_selected_range({ start: 0, end: value.length });
    this.input.on("submit", () => this.submit());
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  submit() {
    const p = props();
    const value = this.input.value();
    closeOverlay(p.overlay);
    saveName(p.rename, value);
  }

  renderDialog() {
    const t = theme();
    const p = props();
    const label = (text) => div().pt(16).pb(7).text_size(11.5).text_color(t.dim).child(text);
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("rename").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Rename pane"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(label("Name (empty: the program's name)"))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(h_flex().pt(20).gap(8).justify_end()
        .child(button("rn-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("rn-save", "Save", true, () => this.submit())));
  }
}
