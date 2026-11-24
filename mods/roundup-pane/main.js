// A pane's header, cloned from Herdr's `pane` mod:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "roundup-pane" } } } }
// Shows the program's icon, the pane's name, its id, the folder and the agent's status;
// buttons rename, split, zoom and close this pane. Props from the app: { pane, terminal }.
//
// - The id is the terminal's address (`t7`, what `hc` and Cmd-click take); a mod pane has no
//   terminal and shows its pane id, shortened. Double-click it: copied to the clipboard.
// - A name: double-click the name, the pencil on hover, or Rename in the terminal's menu. All
//   three run Herdr's `pane.rename` (0.1.17), which asks in Herdr's own prompt and keeps the name
//   with the pane's tab (`panes()[i].name`; a mod pane has one too). An empty name goes back to the
//   program's name. From outside: `herdr-app do pane.rename --pane <id> --name Build`.
// - Roundup up to 0.11 kept the name itself (a terminal's label `roundup-pane.name`, shared
//   `roundup-pane.names` for mod panes): a header that finds one gives it to its pane, then
//   removes it (`adopt`; docs/adr/0001-pane-names-in-core-labels.md).
// - Closing asks first as "Ask before closing a pane" in the terminal's menu says; a tab's only pane
//   as the tab menu's choice for tabs says (close.js, shared with roundup-tabs). Ways to close: the ×,
//   cmd-shift-w (`roundup-tabs.close-pane`: the tab bar has one copy, every header would get it) and
//   Close pane in the terminal's right-click menu, which is this mod too (the layout's `terminal_menu`).

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, terminals, props, run, theme, settings, home, hc, shared, setShared, focused } from "herdr";
import { closePane, givenName, fallbackName } from "./close.js";
import { menuView, shortcut } from "./menu.js";
import { folder, paneId, oldName, OLD_LABEL, OLD_NAMES } from "./header-text.js";
// Roundup's own: the agent's context meter (context/, context-io.js, context-view.js; RECIPE "Context").
import { ContextReader, sweep } from "./context/reader.js";
import { makeIo } from "./context-io.js";
import { meter, headerTiers, sameTiers } from "./context-view.js";
// The plan limits of the agent's account, beside the context in the same pill (limits/; RECIPE "Limits").
import { sharedStore } from "./limits/store.js";
import { shownState } from "./limits/text.js";

// Integration files of ended terminals go once an hour, by whichever header gets there first.
let lastSweep = 0;
const SEE_MS = 2000;
// A hover card draws above popups: the meter's stays empty while one of these holds an overlay id.
// This mod's own menu writes its to OVERLAY and clears only its own (as roundup-menu does);
// roundup-menu's menus and the close confirmation (close.js) write theirs.
const OVERLAY = "roundup-pane.overlay";
const covered = () => Boolean(shared("roundup-menu.open") || shared("roundup-confirm.open") || shared(OVERLAY));

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// Herdr's pane menu (`menu`, tab "pane") item for item, with Close pane going through closePane.
// A terminal shown outside a tab (a layout terminal block, a window) has no pane to rename, split,
// zoom or close: its pane is the block's id. Those rows (`inTab`) go, as in Herdr's menu, and with
// Close pane the choice of when closing asks.
const inTab = (target) => panes().some((p) => p.pane === target.pane);
function menuRows(target) {
  const all = terminals(), term = all.find((t) => t.address === target.terminal);
  const parent = term?.parent && all.find((t) => t.address === term.parent);
  const pane = target.pane, tabbed = inTab(target);
  return [
    { label: "Rename", icon: "square-pen", inTab: true, act: () => run("pane.rename", { pane }), keys: shortcut(["pane.rename"]) },
    { label: "Split right", icon: "panel-right", inTab: true, act: () => run("pane.split", { direction: "right", pane }), keys: shortcut(["pane.split:right"]) },
    { label: "Split down", icon: "panel-bottom", inTab: true, act: () => run("pane.split", { direction: "down", pane }), keys: shortcut(["pane.split:down"]) },
    { label: "Zoom", icon: "square", inTab: true, act: () => run("pane.zoom", { pane }), keys: shortcut(["pane.zoom"]) },
    ...(term ? [term.labels?.["herdr.right-click"] === "program"
      ? { label: "Use Herdr right-click menu", icon: "terminal", act: () => run("terminal.right_click", { terminal: term.address, to: "menu" }) }
      : { label: "Send right-clicks to pane", icon: "terminal", act: () => run("terminal.right_click", { terminal: term.address, to: "program" }) }] : []),
    ...(parent ? [{ label: `Send back to ${parent.name || parent.address}`, icon: "terminal", act: () => run("terminal.park", { terminal: term.address }) }] : []),
    { label: "Close pane", icon: "x", sep: true, inTab: true, act: () => closePane(pane), keys: shortcut(["roundup-tabs.close-pane", "pane.close"]) },
  ].filter((row) => tabbed || !row.inTab);
}

export default class Pane extends View {
  init(_props, cx) {
    this.hovered = false;
    this.copied = false;
    // The menu is an overlay: its id goes to OVERLAY until it closes.
    this.overlay = (props()?.target && props()?.overlay) || null;
    if (this.overlay) setShared(OVERLAY, this.overlay);
    // The terminal's right-click menu: props { tab: "pane", target: { pane, terminal }, overlay }.
    if (props()?.target) {
      this.at = 0;
      this.handle = cx.focus_handle();
      this.handle.focus();
      return;
    }
    // init's cx outlives this call (an AsyncContext): its timer gives hc get a deadline.
    this.context = new ContextReader(makeIo({ after: (ms, f) => cx.timer.after(ms, f), limits: sharedStore }));
    this.width = null;
    this.limitsShown = "";
    // A header in a hidden tab doesn't render, so render's see() misses the tab going and coming
    // back, and status changes there: this look tells the reader (no I/O, only panes() and focused()).
    // The same look draws the header again when its account's limits changed (another pane read
    // them into the store), went stale or passed a reset; each minute while hovered, for the card's times.
    cx.timer.every(SEE_MS, (cx) => {
      const p = this.me();
      if (p) this.adopt(p);
      if (p) this.context.see(p, focused()?.tab === p.tab, cx);
      // Kept here, not only in render(): a header in a hidden tab doesn't render, and would ask
      // for a draw on every look from the first change on.
      const shown = shownState(this.limits(), Date.now(), this.hovered);
      if (shown !== this.limitsShown) { this.limitsShown = shown; cx.notify(); }
    });
    cx.timer.every(10 * 60_000, (cx) => {
      if (Date.now() - lastSweep < 3_600_000) return;
      lastSweep = Date.now();
      cx.spawn(async () => { await sweep(makeIo(), terminals().map((t) => t.address)).catch(() => 0); });
    });
  }

  // Only its own entry: a newer menu may have taken the key meanwhile. (One left by a
  // crash goes with the next overlay, which writes its id and clears it on closing.)
  async close() {
    if (this.overlay && shared(OVERLAY) === this.overlay) setShared(OVERLAY, null);
    this.context?.close();
  }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  // The plan limits of the account this pane's agent runs on, or null (no agent, no reading).
  limits() {
    return this.context?.account ? sharedStore.get(this.context.account) : null;
  }

  // The header's tiers, the context part's and the limit part's (context-view.js, headerTiers):
  // limits beside a context number take the wider thresholds where they draw something there;
  // limits alone (a session before its first answer) keep the context's own.
  tierNow(limits = this.limits(), now = Date.now()) {
    return headerTiers(this.width, settings()?.zoom, { limits, reading: this.context?.reading, now });
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

  // A name Roundup kept itself before Herdr named panes (header-text.js, oldName) moves over:
  // given to the pane, and removed once the pane shows a name. Each step once per copy, from the
  // timer (a hidden tab's header too), so a machine that is away isn't asked every two seconds.
  adopt(p) {
    const labels = p.terminal ? terminals().find((t) => t.address === p.terminal)?.labels : null;
    const old = oldName(p, labels, shared(OLD_NAMES));
    if (!old || this.moved === old.step) return;
    this.moved = old.step;
    if (old.step === "give") {
      try { run("pane.rename", { pane: p.pane, name: old.name }); } catch { /* the next start tries again */ }
    } else if (p.terminal) {
      hc(["label", p.terminal, `${OLD_LABEL}=`]).catch(() => null);
    } else {
      const { [p.pane]: _moved, ...rest } = shared(OLD_NAMES) ?? {};
      setShared(OLD_NAMES, Object.keys(rest).length ? rest : null);
    }
  }

  copyId(cx, id) {
    cx.write_to_clipboard(id.copied);
    this.copied = true;
    cx.notify();
    this.copiedTimer?.cancel();
    this.copiedTimer = cx.timer.after(1200, (cx) => { this.copied = false; this.copiedTimer = null; cx.notify(); });
  }

  render(cx) {
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
    const now = Date.now();
    const limits = this.limits();
    this.limitsShown = shownState(limits, now, this.hovered);
    this.shownTier = this.tierNow(limits, now);
    const ctx = this.context && meter(t, { pane, reading: this.context.reading, tier: this.shownTier, agent: this.context.strategy?.id, hint: this.context.hint, covered: covered(),
      limits, now, program: p.program?.name ?? null,
      // An icon of its own: an element belongs to the one parent it's given (gpui-kit.d.ts).
      head: { pic: icon(p.program, 14, t.dim), name, id: id.shown, font } });
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      // The width is kept on every change (a later zoom tiers it), but only a new tier re-renders.
      // The limits are this render's: a drag fires many events, and the store's reading changes
      // only with a redraw (the 2 s timer draws when it does).
      .on_size_change((size, cx) => { this.width = size.width; if (!sameTiers(this.tierNow(limits), this.shownTier)) cx.notify(); })
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
        .on_click((e, cx) => { if (e.click_count === 2) { cx.stop_propagation(); run("pane.rename", { pane }); } })
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
        .child(this.button(t, `ph-n-${pane}`, "rename", "Rename", () => run("pane.rename", { pane })))
        .child(this.button(t, `ph-r-${pane}`, "split-right", "Split right", () => run("pane.split", { direction: "right", pane })))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "Split down", () => run("pane.split", { direction: "down", pane })))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", p.zoomed ? "Unzoom" : "Zoom", () => run("pane.zoom", { pane })))
        .child(this.button(t, `ph-x-${pane}`, "close", "Close", () => closePane(pane))))
      .when(Boolean(ctx), (el) => el.child(ctx))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(t.done)));
  }
}
