// The element tree the gpui stubs build: each builder call is recorded, nothing is laid out or drawn.
//   el.type       "div", "h_flex", "v_flex", "svg", "image", "Input", "HoverCard", ...
//   el.arg        what the builder got (svg's path, image's path, Input's state, ...)
//   el.elementId  from .id(...) (`id` and `children` stay the builder methods)
//   el.kids       elements and strings, in order (.child, .children; null/undefined/false left out)
//   el.styles     every other call: [name, ...args] (bg, text_color, truncate, ...)
//   el.handlers   on_click → "click", on_mouse_down("left", fn) → "mouse_down:left", on_key_down → "key_down"
//   el.hovered    the styles .hover(s => …) sets, as an element of type "style"
// A method the stub doesn't know is recorded as a style and chains on, so a new builder call in a
// mod needs no change here.
export class El {
  constructor(type, arg) {
    this.type = type;
    this.arg = arg;
    this.elementId = null;
    this.kids = [];
    this.styles = [];
    this.handlers = {};
    this.hovered = null;
    this.focusHandle = null;
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === "symbol" || prop in target) return Reflect.get(target, prop, receiver);
        if (prop === "then" || prop === "toJSON") return undefined; // neither a thenable nor JSON-special
        if (prop.startsWith("on_")) {
          return (...args) => {
            const name = prop.slice(3);
            const fn = args.find((a) => typeof a === "function");
            target.handlers[typeof args[0] === "string" && args.length > 1 ? `${name}:${args[0]}` : name] = fn;
            return receiver;
          };
        }
        return (...args) => { target.styles.push([prop, ...args]); return receiver; };
      },
    });
  }

  id(v) { this.elementId = v; return this; }
  child(c) { if (c !== null && c !== undefined && c !== false) this.kids.push(c); return this; }
  children(list) { for (const c of list ?? []) this.child(c); return this; }
  when(cond, then, otherwise) {
    if (cond) return then(this) ?? this;
    return otherwise ? otherwise(this) ?? this : this;
  }
  when_some(v, then) { return v !== null && v !== undefined ? then(this, v) ?? this : this; }
  hover(fn) { this.hovered = fn(new El("style")) ?? null; return this; }
  track_focus(handle) { this.focusHandle = handle; return this; }

  // The args of the last call of a style ("bg" → ["raised"]), or undefined.
  style(name) {
    for (let i = this.styles.length - 1; i >= 0; i--) if (this.styles[i][0] === name) return this.styles[i].slice(1);
    return undefined;
  }
  has(name) { return this.styles.some((s) => s[0] === name); }
  // All text below, joined by a space.
  text() { return texts(this).join(" "); }
}

export const element = (type, arg) => new El(type, arg);

// Elements given as arguments (a HoverCard's trigger, a Popup's content, an Input's state is not one).
const argEls = (node) => [...(node.arg instanceof El ? [node.arg] : []), ...node.styles.flatMap((s) => s.slice(1).filter((a) => a instanceof El))];

// Every element in the tree, depth first: children, then elements given as arguments.
export function* walk(node) {
  if (!(node instanceof El)) return;
  yield node;
  for (const c of node.kids) yield* walk(c);
  for (const a of argEls(node)) yield* walk(a);
}

export function texts(node) {
  const out = [];
  const go = (n) => {
    if (typeof n === "string" || typeof n === "number") { out.push(String(n)); return; }
    if (!(n instanceof El)) return;
    if (n.type === "TextView" && typeof n.arg?.text === "string") out.push(n.arg.text);
    for (const c of n.kids) go(c);
    for (const a of argEls(n)) go(a);
  };
  go(node);
  return out;
}

export const findAll = (root, pred) => [...walk(root)].filter(pred);
export const find = (root, pred) => findAll(root, pred)[0];
export const ids = (root) => findAll(root, (e) => e.elementId !== null).map((e) => e.elementId);

export function byId(root, id) {
  const el = find(root, (e) => e.elementId === id);
  if (!el) throw new Error(`no element with id ${JSON.stringify(id)}; ids: ${ids(root).join(", ")}`);
  return el;
}
export const hasId = (root, id) => Boolean(find(root, (e) => e.elementId === id));

// The innermost element with a text child that matches (a string: equal; a RegExp: test).
export function byText(root, text) {
  const match = (s) => (text instanceof RegExp ? text.test(s) : s === text);
  const el = findAll(root, (e) => e.kids.some((c) => typeof c === "string" && match(c))).pop();
  if (!el) throw new Error(`no element with text ${text}; texts: ${texts(root).join(" | ")}`);
  return el;
}

// Calls a handler as Herdr would: handler(event, cx). `key` as in el.handlers ("click", "mouse_down:left").
export function fire(el, key, event = {}, cx) {
  const fn = el.handlers[key];
  if (!fn) throw new Error(`element ${el.elementId ?? el.type} has no ${key} handler; it has: ${Object.keys(el.handlers).join(", ") || "none"}`);
  return fn(event, cx);
}
export const click = (el, cx, event = {}) => fire(el, "click", { click_count: 1, button: "left", modifiers: {}, ...event }, cx);
