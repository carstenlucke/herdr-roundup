import { View, div, image, svg } from "gpui-kit";
import { h_flex, v_flex, HoverCard } from "gpui-base";
import { theme, run, props, window, shared, setShared, updates, layout, appHome, readTextFile, watchFolder, openOverlay, nextCommand } from "herdr";
import { get, put, available, due, check, install, openNotes } from "./update.js";
import { menuView, menuHeight, DETAILS, MENU_OPEN } from "./menu.js";
import { info } from "./info.js";
import { pressOf, pressMoved, isClick, herdrVersion, subLine, MENU_WIDTH, nameRoom } from "./brand.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's width in px, undefined when the layout has none.
const sidebarPx = () => find(layout(), "sidebar")?.size?.px;

// Whether a sidebar `px` wide (sidebarPx()) is the rail: it goes by its width, not a flag, as dragging its edge
// narrows it too. Without a width, wide.
const narrow = (px) => (px ?? Infinity) < 160;

// The brand row's left padding when wide: room for the traffic lights on macOS, unless in full screen.
const left = () => window()?.platform === "macos" && !window()?.fullscreen ? 76 : 14;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = sidebarPx(), rail = narrow(width);
  if (!rail) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !rail);
  run("layout.resize", { id: "sidebar", px: rail ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

export default class WorkspaceChrome extends View {
  init(_props, cx) {
    this.file = null;
    // The menu's popup: a copy of this mod that ends when it closes.
    if (props()?.menu) {
      setShared(MENU_OPEN, true);
      this.at = 0;
      this.handle = cx.focus_handle();
      this.handle.focus();
      return;
    }
    if (props()?.footer) return;
    // Only the brand copy checks for updates, takes the commands and reads the installed version.
    this.checking = false;
    // A menu still open when Herdr quit doesn't keep the card away for good, nor a check cut off by it the open menu.
    setShared(MENU_OPEN, false);
    put("checking", false);
    cx.spawn(async (cx) => {
      for (;;) {
        // `update@0.8.0`, `notes@0.8.0`: the version the menu or toast named.
        const [command, version] = (await nextCommand()).split("@");
        const installed = this.file?.version;
        if (command === "check" && installed) this.check(cx, installed, true);
        // Not awaited: a slow knownAgents() doesn't hold back the next command, and a failure doesn't end the loop.
        else if (command === "update" && installed) install(installed, version).catch(() => null);
        else if (command === "notes") openNotes(version);
        // Daily chosen again: check now if a day has passed, not at the next hourly tick.
        else if (command === "auto") this.autoCheck(cx);
      }
    });
    // The automatic check: at start once the version is read, then hourly to see whether a day has passed.
    cx.timer.every(60 * 60 * 1000, (cx) => this.autoCheck(cx));
    cx.spawn(async (cx) => {
      // Read again whenever the layout's file changes (a release via scripts/sync.sh), not only once.
      const dir = `${appHome()}/layouts`;
      for (;;) {
        const name = shared("layout");
        const text = await readTextFile(`${dir}/${name}.json`).catch(() => null);
        try { this.file = JSON.parse(text ?? "null"); } catch { this.file = null; }
        this.autoCheck(cx);
        cx.notify();
        // layouts/.state/ changes on every click; only the layout's own file matters here.
        for (;;) {
          const paths = await watchFolder(dir).catch(() => null);
          if (!paths) return;
          if (paths.some(p => p === dir || p.endsWith(`/${shared("layout")}.json`))) break;
        }
      }
    });
  }
  async close() {
    if (props()?.menu) setShared(MENU_OPEN, false);
  }
  autoCheck(cx) {
    const installed = this.file?.version;
    if (installed && due()) this.check(cx, installed, false);
  }
  check(cx, installed, manual) {
    // A manual check asked for during another one runs after it, so it still answers with a toast.
    if (this.checking) { if (manual) this.manualPending = true; return; }
    this.checking = true;
    // Shared for the menu's popup, which stays open while a check it started runs.
    put("checking", true);
    cx.notify();
    cx.spawn(async (cx) => {
      await check(installed, manual).catch(() => null);
      this.checking = false;
      put("checking", false);
      if (this.manualPending) {
        this.manualPending = false;
        const now = this.file?.version;
        if (now) return this.check(cx, now, true);
      }
      cx.notify();
    });
  }
  // A press on the logo and name drags the window as anywhere in the row; brand.js tells a click from a drag.
  pressed(e) { this.press = pressOf(e); }
  moved(e) { pressMoved(this.press, e); }
  openMenu(e) {
    const press = this.press;
    this.press = null;
    // A double-click maximizes the window, as in the rest of the row.
    if (!isClick(press, e)) return;
    // Without a version read there is no menu; the card on hover stays, showing "Installed –".
    const installed = this.file?.version;
    if (!installed) return;
    // The card stays away until the pointer leaves: its layer is above the popup, and the pointer is still on it.
    this.hot = false;
    this.quiet = true;
    // What the popup's height is summed from, fixed while it is open: a check that ends meanwhile doesn't add
    // rows or a status line the popup has no room for.
    const menu = { installed, herdr: herdrVersion(this.file), release: available(installed), error: get("error") ?? null };
    openOverlay({ mod: "roundup-workspace-chrome", kind: "popup", width: MENU_WIDTH, height: menuHeight(menu), props: { menu } });
  }
  // The menu's head as a card, with a hint that a click gives more.
  card(t, installed) {
    return v_flex().mt(4).w(236).p(12).rounded(10).border(1).border_color(t.border).bg(t.popover).shadow_lg()
      .child(info(t, { installed, herdr: herdrVersion(this.file), checking: this.checking }))
      .child(div().mt(9).pt(7).border_t(1).border_color(t.border).text_size(11.5).text_color(available(installed) ? t.accent : t.dim).child("Click the Roundup title for update options"));
  }
  brand(t, sidebar, pad) {
    const installed = this.file?.version, release = available(installed);
    const sub = subLine(installed, release, this.checking);
    const room = nameRoom(sidebar, pad);
    // Lit and a pointer on hover, as the buttons beside it, so it reads as something to click. The padding hangs into
    // the row's margin and gap, so at 268 px the name keeps its width (2 px to spare beside the search button).
    const trigger = h_flex().id("brand-name").gap(8).items_center().h(36).pl(6).ml(-6).pr(4).mr(-4).rounded(8).cursor_pointer()
      .hover(s => s.bg(t.hover))
      .on_hover((on, cx) => { this.hot = on; if (!on) this.quiet = false; cx.notify(); })
      .on_mouse_down("left", (e) => this.pressed(e)).on_mouse_move((e) => this.moved(e)).on_click((e, cx) => { this.openMenu(e); cx.notify(); })
      .child(div().relative().flex_none().child(image("mods/roundup-workspace-chrome/logo.png").size(20).rounded(5))
        .when(Boolean(release), el => el.child(div().absolute().top(-3).right(-3).size(10).rounded_full().border(2).border_color(t.chrome).bg(t.accent))))
      // The name keeps its width; a longer sub line ("0.10.0-beta.1 available", 117 px to the name's 96) is cut where
      // the row has no room for it (brand.js's nameRoom), and doesn't run under the search button.
      .child(v_flex().min_w(0).child(div().whitespace_nowrap().font_semibold().text_size(13).line_height("16px").text_color(t.foreground).child("Herdr Roundup"))
        .when(Boolean(sub), el => el.child(div().when(room !== null, el => el.max_w(room)).min_w(0).truncate().text_size(11).line_height("14px").text_color(release ? t.accent : t.dim).child(sub))));
    // Content only while hovered, not right after a click and never over the open menu: the card's layer is above the
    // popup, and the pointer can come back to the name while the menu is open.
    const shown = this.hot && !this.quiet && shared(DETAILS) !== false && !shared(MENU_OPEN);
    return HoverCard.new("brand-card").anchor("top_left").open_delay(500).close_delay(150).trigger(trigger)
      .content(shown ? this.card(t, installed) : div());
  }
  button(id, label, action) {
    const t = theme();
    return div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(action).child(label);
  }
  render() {
    if (props()?.menu) return menuView(this);
    const t = theme();
    // One look at the layout and the window per draw: the rail, the padding and the name's room all come from it.
    const sidebar = sidebarPx(), collapsed = narrow(sidebar), pad = left();
    if (props()?.footer) {
      const row = (id, icon, label, dim, action) => h_flex().id(id).h(28).px(8).gap(9).items_center().rounded(8)
        .text_color(dim ? t.dim : t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)).cursor_pointer()
        .on_click(action).child(svg(`mods/roundup-workspace-chrome/${icon}.svg`).size(14))
        .when(!collapsed, el => el.child(label));
      return v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(8).pt(4).pb(8).text_size(13)
        .child(row("settings", "settings", "Settings", false, () => run("app.settings"))
          .when(Boolean(updates().app.ready), el => el.child(div().size(6).rounded_full().bg(t.accent))))
        .child(row("machine", "plus", "Add machine", true, () => run("mod.open", { name: "machine-add" })));
    }
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : pad).pr(10).gap(4).items_center().text_size(13.5)
      .when(!collapsed, el => el.child(h_flex().flex_1().min_w(0).items_center().child(this.brand(t, sidebar, pad))))
      .when(!collapsed, el => el.child(this.button("search", svg("mods/roundup-workspace-chrome/search.svg").size(15), () => run("mod.open", { name: "picker" }))))
      // On the macOS rail the traffic lights fill the row; the agents list's » unfolds it.
      .when(!(collapsed && window()?.platform === "macos"), el => el.child(this.button("sidebar-toggle", svg("mods/roundup-workspace-chrome/sidebar.svg").size(15), toggleSidebar)));
  }
}
