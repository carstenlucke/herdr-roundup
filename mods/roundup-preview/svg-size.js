// The SVG's size: width/height attributes, else its viewBox, else the CSS default;
// an attribute follows whitespace, so stroke-width is no width;
// zeros when the text has no svg tag. Pure (no Herdr imports), so tests/svg-size.test.mjs runs it in node.
export function svgSize(text) {
  const tag = text.match(/<(?:[\w.-]+:)?svg\b[^>]*>/i)?.[0];
  if (!tag) return { width: 0, height: 0 };
  const attr = (name) => Number(tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, "i"))?.[1]);
  const box = tag.match(/\sviewBox\s*=\s*["']\s*[-\d.]+[ ,]+[-\d.]+[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  const width = attr("width") || Number(box?.[1]) || 300, height = attr("height") || Number(box?.[2]) || 150;
  return { width, height };
}
