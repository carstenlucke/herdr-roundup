// Asks before something destructive, e.g. "Close tab?". Opened as a
// dialog with props { title, detail, command: { name, args } }.
// Cloned from Herdr's `confirm`: Cancel is chosen when it opens, so Enter
// cancels; Tab and Shift-Tab move between Cancel and Confirm, Enter or Space
// presses the chosen one, Esc cancels.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme } from "herdr";

export default class Confirm extends View {
  init(_props, cx) {
    this.no = cx.focus_handle();
    this.yes = cx.focus_handle();
    this.at = "no";
    this.no.focus();
  }

  // The window doesn't move the keyboard between a dialog's tab stops on Tab: the dialog hears the key
  // and moves it itself. With two buttons, Tab and Shift-Tab both go to the other one.
  move(cx) {
    this.at = this.at === "no" ? "yes" : "no";
    this[this.at].focus();
    cx.notify();
  }

  press() {
    const p = props();
    closeOverlay(p.overlay);
    if (this.at === "yes") run(p.command.name, p.command.args ?? {});
  }

  render(cx) {
    const t = theme();
    const p = props() ?? {};
    const button = (id, label, bg, fg, border) =>
      h_flex().id(id).track_focus(this[id]).tab_index(0).h(32).px(14).items_center().rounded(8).border_1().border_color(border).bg(bg).text_color(fg).cursor_pointer()
        .hover((s) => s.opacity(0.88))
        .on_click(() => { this.at = id; this.press(); })
        .child(label)
        .when(this.at === id, (el) => el.relative().child(div().absolute().inset(-3).rounded(10).border(2).border_color(t.accent)));
    return v_flex()
      .id("confirm")
      .on_key_down((e, cx) => {
        if (e.keystroke === "tab" || e.keystroke === "shift-tab") this.move(cx);
        else if (e.keystroke === "enter" || e.keystroke === "space") this.press();
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.stop_propagation();
      })
      .size_full()
      .min_h(0)
      .p(18)
      .gap(12)
      .bg(t.popover)
      .text_size(13)
      .child(h_flex().items_center().child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(p.title ?? "Are you sure?")).child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().flex_1().min_h(0).overflow_y_scrollbar().text_color(t.muted).child(p.detail ?? ""))
      .child(
        h_flex()
          .justify_end()
          .gap(8)
          .text_size(12)
          .child(button("no", "Cancel", t.raised, t.foreground, t.input))
          .child(button("yes", "Confirm", t.solid, t.solid_foreground, t.solid)),
      );
  }
}
