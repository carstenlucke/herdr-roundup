// Which viewer shows a file, chosen by extension. Pure, so node --test covers it.
// A new viewer: add viewers/<id>.js, register it in viewers/index.js, and map
// its extensions here. Anything unmapped opens in the code viewer.

export const VIEWER_OF = {
  md: "markdown", markdown: "markdown", mdx: "markdown",
  pdf: "pdf",
  csv: "table", tsv: "table",
  json: "json",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", svg: "image", bmp: "image", tiff: "image", heic: "image",
};

// Editor language names, where the extension isn't one already.
const LANGUAGE = { md: "markdown", mdx: "markdown", ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js",
  toml: "yaml", yml: "yaml", jsonc: "json", svelte: "html", vue: "html", htm: "html", sh: "bash", zsh: "bash", py: "python", rb: "ruby", rs: "rust" };

export const basename = (path) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
export function extension(path) {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}
export const viewerFor = (path) => VIEWER_OF[extension(path)] ?? "code";
export const languageOf = (path) => LANGUAGE[extension(path)] ?? (extension(path) || "text");
