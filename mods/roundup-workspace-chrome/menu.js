// The menu a click on the logo and name opens: this mod again, as a popup with props { menu: { installed, herdr, release, error } }.
// What this copy is heads it (info.js), then the update actions and the choices. Drawn as roundup-tabs' menu.js
// draws its menus (mods can't import each other's code, so it is written again here).
// A popup ends when it closes, so whatever has to outlive it goes to the brand copy as a command.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, run, shared, setShared, closeOverlay } from "herdr";
import { get, put, available } from "./update.js";
import { info, infoHeight } from "./info.js";

// Whether the logo and name show the facts on hover (true unless switched off here).
export const DETAILS = "roundup-workspace-chrome.details";
// Set while the menu is open: the card on hover stays away then.
export const MENU_OPEN = "roundup-workspace-chrome.menu";

const icon = (name) => `mods/roundup-workspace-chrome/${name}.svg`;

// `m.release`: the release offered when the menu opened (fixed, as the popup's height), else the shared one.
function rows(m) {
  const release = "release" in m ? m.release : available(m.installed), auto = get("auto") !== false, details = shared(DETAILS) !== false;
  return [
    { label: "Check for updates", icon: "refresh", act: () => run("roundup-workspace-chrome.check") },
    ...(release ? [
      { label: `Update to ${release.version} with an agent…`, icon: "bot", accent: true, act: () => run("roundup-workspace-chrome.update") },
      { label: `Release notes ${release.version}`, icon: "notes", act: () => run("roundup-workspace-chrome.notes") },
      { label: `Skip ${release.version}`, icon: "skip", act: () => put("dismissed", release.version) },
    ] : []),
    { label: "Daily", check: auto, act: () => { put("auto", true); run("roundup-workspace-chrome.auto"); }, head: "Check for updates", sep: true },
    { label: "Only when I ask", check: !auto, act: () => put("auto", false) },
    { label: "Show details on hover", check: details, act: () => setShared(DETAILS, !details), sep: true },
  ];
}

// The popup's height: 5 px padding each side, the head (6 + its lines + 6) and a divider (9), 31 px a row, 19 px
// a heading, 9 px a divider.
export const menuHeight = (m) => rows(m).reduce((h, r) => h + 31 + (r.head ? 19 : 0) + (r.sep ? 9 : 0), 10 + 12 + infoHeight(m) + 9);

// ↑/↓ move, Enter runs, Esc closes. `view.at` is the highlighted row, `view.handle` the menu's focus.
export function menuView(view) {
  const t = theme(), m = props().menu, list = rows(m);
  const choose = (i) => { closeOverlay(props().overlay); list[i].act(); };
  const line = () => div().mx(7).my(4).h(1).bg(t.border);
  return v_flex().id("menu").track_focus(view.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
    .on_key_down((e, cx) => {
      if (e.key === "down") view.at = (view.at + 1) % list.length;
      else if (e.key === "up") view.at = (view.at + list.length - 1) % list.length;
      else if (e.key === "enter") return choose(view.at);
      else if (e.key === "escape") return closeOverlay(props().overlay);
      else return;
      cx.notify();
    })
    .child(div().px(8).py(6).child(info(t, m)))
    .child(line())
    .children(list.map((it, i) => v_flex()
      .when(Boolean(it.sep), el => el.child(line()))
      .when(Boolean(it.head), el => el.child(div().px(8).pt(3).pb(2).text_size(11).text_color(t.dim).child(it.head)))
      .child(h_flex().id(`mi-${i}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(it.accent ? t.accent : t.foreground)
        .when(i === view.at, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
        .on_click(() => choose(i))
        .child(it.icon
          ? svg(icon(it.icon)).size(14).flex_none().text_color(it.accent ? t.accent : t.muted)
          : div().size(14).flex_none().when(it.check, el => el.child(svg(icon("check")).size(14).text_color(t.accent))))
        .child(div().flex_1().truncate().child(it.label)))));
}
