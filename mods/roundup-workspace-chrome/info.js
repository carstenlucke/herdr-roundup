// What this copy of Herdr Roundup is and what the update check found: the head of the menu, and the card on hover.
// Fixed line heights, so the menu's popup can be sized to it (infoHeight).
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { get, newer, available } from "./update.js";
import { when, status, headHeight } from "./brand.js";

// `herdr`: the Herdr version the layout was cloned from, or null. `error`: the last check's failure, the shared one
// unless given (the menu passes the one its height was summed from).
// `live` (the menu): the popup stays open while a check runs, but can't grow. A check under way shows in the Checked
// line, and so does a failure the popup has no room for ("failed"; a manual check's toast gives the reason). The
// status line shows only an error, and only when there was one at the opening (`error`), which left room for it.
export function info(t, { installed, herdr, checking, error = get("error"), live = false }) {
  const latest = get("latest"), checked = get("checked"), release = available(installed);
  const skipped = latest && newer(latest.version, installed) && !release;
  const kv = (k, v, color = t.foreground) => h_flex().justify_between().gap(12).line_height("15px")
    .child(div().text_color(t.dim).child(k)).child(div().text_color(color).child(v));
  const room = live && Boolean(error);
  if (live) { checking = get("checking") === true; error = get("error"); }
  const s = live ? (room && !checking && error ? "error" : null) : status(checking, error);
  const failed = live && !checking && error && !room;
  const at = live && checking ? "checking…" : failed ? "failed" : checked ? when(checked, Date.now()) : "–";
  return v_flex().gap(3).text_size(12)
    .child(div().mb(3).font_semibold().text_size(13).line_height("16px").text_color(t.foreground).child("Herdr Roundup"))
    .child(kv("Installed", installed ?? "–"))
    .when(Boolean(herdr), el => el.child(kv("Based on", `Herdr ${herdr}`)))
    .child(kv("Latest", latest ? `${latest.version}${skipped ? " · skipped" : ""}` : "–",
      release ? t.accent : t.foreground))
    .child(kv("Checked", at, failed ? t.working : live && checking ? t.muted : t.foreground))
    .when(Boolean(s), el => el.child(h_flex().pt(4).gap(6).items_start().line_height("15px").text_size(11.5).text_color(s === "error" ? t.working : t.muted)
      .child(svg(`mods/roundup-workspace-chrome/${s === "error" ? "circle-alert" : "spinner"}.svg`).size(12).mt("1.5px").flex_none()
        .text_color(s === "error" ? t.working : t.muted).when(s === "checking", el => el.spin(900)))
      .child(div().flex_1().min_w(0).max_h("30px").overflow_hidden().child(s === "error" ? `Couldn't check: ${error}` : "Checking for updates…"))));
}

// Its height in px (brand.js's headHeight), with the shared error unless given.
export const infoHeight = ({ herdr, checking, error = get("error") }) => headHeight({ herdr, checking, error });
