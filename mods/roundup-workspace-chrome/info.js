// What this copy of Herdr Roundup is and what the update check found: the head of the menu, and the card on hover.
// Fixed line heights, so the menu's popup can be sized to it (infoHeight).
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { get, newer } from "./update.js";

const pad = (n) => String(n).padStart(2, "0");
// "today 09:12", "yesterday 18:40", else "Nov 3 09:12".
function when(ms) {
  const d = new Date(ms), day = (x) => new Date(x).toDateString(), time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (day(ms) === day(Date.now())) return `today ${time}`;
  if (day(ms) === day(Date.now() - 24 * 60 * 60 * 1000)) return `yesterday ${time}`;
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]} ${d.getDate()} ${time}`;
}

// A line under the facts only when it says something they don't: a check under way, or why the last one failed.
const status = (checking) => checking ? "checking" : get("error") ? "error" : null;

// `herdr`: the Herdr version the layout was cloned from, or null.
export function info(t, { installed, herdr, checking }) {
  const latest = get("latest"), checked = get("checked"), why = get("error");
  const skipped = latest && newer(latest.version, installed) && latest.version === get("dismissed");
  const kv = (k, v, color = t.foreground) => h_flex().justify_between().gap(12).line_height("15px")
    .child(div().text_color(t.dim).child(k)).child(div().text_color(color).child(v));
  const s = status(checking);
  return v_flex().gap(3).text_size(12)
    .child(div().mb(3).font_semibold().text_size(13).line_height("16px").text_color(t.foreground).child("Herdr Roundup"))
    .child(kv("Installed", installed ?? "–"))
    .when(Boolean(herdr), el => el.child(kv("Based on", `Herdr ${herdr}`)))
    .child(kv("Latest", latest ? `${latest.version}${skipped ? " · skipped" : ""}` : "–",
      latest && newer(latest.version, installed) && !skipped ? t.accent : t.foreground))
    .child(kv("Checked", checked ? when(checked) : "–"))
    .when(Boolean(s), el => el.child(h_flex().pt(4).gap(6).items_start().line_height("15px").text_size(11.5).text_color(s === "error" ? t.working : t.muted)
      .child(svg(`mods/roundup-workspace-chrome/${s === "error" ? "circle-alert" : "spinner"}.svg`).size(12).mt("1.5px").flex_none()
        .text_color(s === "error" ? t.working : t.muted).when(s === "checking", el => el.spin(900)))
      .child(div().flex_1().min_w(0).child(s === "error" ? `Couldn't check: ${why}` : "Checking for updates…"))));
}

// Its height in px: the name (16 + 3), each fact 15, 3 between lines, and the status line (4 + 15) if there is one.
// A reason wraps in the card (212 px) and may in the menu (234 px): the menu leaves room for a second line.
export function infoHeight({ herdr, checking }) {
  const facts = herdr ? 4 : 3, s = status(checking);
  return 19 + facts * 15 + facts * 3 + (s ? 3 + 19 + (s === "error" ? 15 : 0) : 0);
}
