// The `gpui-kit` module as mods see it in tests: builders that record an element tree (gpui-tree.mjs).
import { element } from "./gpui-tree.mjs";

// A mod's main.js default-exports a subclass; harness `mount()` runs init and render.
export class View {
  constructor(props) { this.props = props; }
}

export const div = () => element("div");
export const svg = (path) => element("svg", path);
export const image = (path) => element("image", path);
export const img = image;
