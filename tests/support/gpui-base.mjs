// The `gpui-base` module as mods see it in tests: layout builders and controls that record an
// element tree (gpui-tree.mjs). Controls with state (InputState) keep it, so a test can type and submit.
import { element } from "./gpui-tree.mjs";

export const h_flex = () => element("h_flex");
export const v_flex = () => element("v_flex");

// `X.new(...)` and friends: an element of type X whose arg is the first argument (an id, a state),
// with the rest in `el.args`.
const native = (type) => {
  const make = (...args) => Object.assign(element(type, args[0]), { args });
  return { new: make };
};
export const Input = native("Input");
export const Button = native("Button");
export const Checkbox = native("Checkbox");
export const Switch = native("Switch");
export const Editor = native("Editor");
export const HoverCard = native("HoverCard");
export const Popup = native("Popup");
export const Scrollbar = { vertical: (...args) => Object.assign(element("Scrollbar", args[0]), { args }), horizontal: (...args) => Object.assign(element("Scrollbar", args[0]), { args }) };
export const TextView = { markdown: (id, text) => element("TextView", { kind: "markdown", text }).id(id) };

// v_virtual_list(id, count, size, key, render): `el.rows(start, end)` renders those rows as the list would.
export function v_virtual_list(id, count, size, key, render) {
  const el = element("v_virtual_list", { count, size }).id(id);
  return Object.assign(el, { rows: (start = 0, end = count) => render({ start, end }) });
}

// A recorder for native handles: every method call goes into `calls` and returns undefined.
const handle = (kind, init) => {
  const calls = [];
  return new Proxy({ kind, init, calls }, {
    get(target, prop) {
      if (typeof prop === "symbol" || prop in target) return target[prop];
      if (prop === "then" || prop === "toJSON") return undefined;
      return (...args) => { calls.push([prop, ...args]); return undefined; };
    },
  });
};
export const VirtualListScrollHandle = { new: () => handle("VirtualListScrollHandle") };
export const EditorState = { new: (opts) => Object.assign(handle("EditorState", opts), { opts }) };

// An input's text and listeners. `type(text)` sets the value as typing would, `emit(event)` fires a
// listener ("submit", "change", "focus", "blur") with (event, cx).
export class InputState {
  static new(opts = {}) { return new InputState(opts); }
  constructor(opts = {}) {
    this.opts = opts;
    this.text = opts.value ?? "";
    this.listeners = {};
    this.focused = false;
    this.selected = null;
  }
  value() { return this.text; }
  set_value(v) { this.text = String(v); }
  set_placeholder(p) { this.opts.placeholder = p; }
  set_selected_range(r) { this.selected = r; }
  on(event, fn) { (this.listeners[event] ??= []).push(fn); }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  is_focused() { return this.focused; }
  type(text) { this.text = text; return this.emit("change"); }
  emit(event, e = {}, cx) { for (const fn of this.listeners[event] ?? []) fn(e, cx); }
}
