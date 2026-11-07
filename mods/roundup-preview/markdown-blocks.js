// Markdown cut into blocks: around its images, since Herdr's Markdown view
// draws none, and before each heading, so the preview can show the document
// from a heading (no scroll area can be scrolled from code):
// [{ text, heading? } | { image: { alt, src, link? } }], heading being
// { level, title, slug } with GitHub's anchor names. Fenced code is left whole,
// and reference definitions ([id]: url) are repeated in every text block so a
// reference link still resolves when its definition sits in another block.
// Pure, so node --test covers it.
import { GONE } from "./text-file.js";

const IMAGE = /\[!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\]\(\s*<?([^)\s>]+)>?\s*\)|!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
const DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*\S.*$/gm;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;

/** Why an image block isn't drawn. `web`: the document's "ask", "loading" or "loaded". */
export function imageNote({ url, failed }, web) {
  if (url) return web === "loading" ? "loading…" : web === "loaded" ? "couldn't load" : "on the web";
  return !failed || failed === GONE ? "not found" : failed;
}

// GitHub's anchor for a heading: lower case, punctuation dropped, spaces to dashes.
export const slugify = (title) => title.toLowerCase().replace(/[`*_~]|<[^>]*>/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-");

export function splitBlocks(text) {
  const blocks = [], seen = {};
  let buffer = "", heading = null, fence = null;
  const flush = () => { if (buffer.trim() || heading) blocks.push(heading ? { text: buffer, heading } : { text: buffer }); buffer = ""; heading = null; };
  for (const line of text.split(/(?<=\n)/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (fence) { buffer += line; if (marker?.[0] === fence[0] && marker.length >= fence.length) fence = null; continue; }
    if (marker) { fence = marker; buffer += line; continue; }
    const h = line.replace(/\r?\n$/, "").match(HEADING);
    if (h) {
      flush();
      const base = slugify(h[2]), n = seen[base] = (seen[base] ?? -1) + 1;
      heading = { level: h[1].length, title: h[2], slug: n ? `${base}-${n}` : base };
    }
    let last = 0;
    for (const m of line.matchAll(IMAGE)) {
      if ((line.slice(0, m.index).match(/`/g)?.length ?? 0) % 2) continue; // inside inline code
      buffer += line.slice(last, m.index);
      flush();
      blocks.push({ image: m[2] ? { alt: m[1], src: m[2], link: m[3] } : { alt: m[4], src: m[5] } });
      last = m.index + m[0].length;
    }
    buffer += line.slice(last);
  }
  flush();
  if (!blocks.length) blocks.push({ text: "" });
  const definitions = text.match(DEFINITION);
  if (definitions && blocks.length > 1) for (const b of blocks) if (b.text !== undefined) b.text += "\n\n" + definitions.join("\n");
  return blocks;
}
