// Where a link in a Markdown file goes. Pure, so node --test covers it.
//   { url }   a web or mail link, for the system to open
//   { file, anchor? }  a local file, absolute, to open in this preview, at a heading
//   { anchor } a heading in this page
//   { error } anything else
import { dirname, isWindows, normalize } from "./paths.js";

const DRIVE = /^[a-z]:[\\/]/i;

// `path` made absolute against the document it's in, the document deciding the system.
function absolute(from, path) {
  const base = normalize(from), inside = `${dirname(base).replace(/\/$/, "")}/${path}`;
  if (!isWindows(base)) return path.startsWith("/") ? path.replace(/^\/+/, "/") : inside;
  if (path.startsWith("//") || DRIVE.test(path)) return path;
  return path.startsWith("/") ? (base.match(/^[a-z]:|^\/\/[^/]+\/[^/]+/i)?.[0] ?? "") + path : inside;
}

export function resolveLink(from, href) {
  const link = String(href ?? "").trim();
  if (!link) return { error: "Empty link" };
  if (link.startsWith("#")) return { anchor: link.slice(1) };
  if (/^(https?|mailto):/i.test(link)) return { url: link };
  const windows = isWindows(from), fileUrl = /^file:\/\//i.test(link);
  let path = link;
  if (fileUrl) path = path.replace(/^file:\/\/(localhost(?=\/|$))?/i, "");
  else if (!(windows && DRIVE.test(path)) && /^[a-z][a-z\d+.-]*:/i.test(path)) return { error: `Can't open ${link.split(":")[0]}: links here` };
  const anchor = path.match(/#(.*)$/)?.[1];
  path = path.replace(/[?#].*$/, "");
  if (!path) return { anchor: anchor ?? "" };
  try { path = decodeURIComponent(path); } catch { return { error: "This link has an invalid path" }; }
  if (fileUrl && windows) path = path.replace(/^\/(?=[a-z]:[\\/])/i, "");
  if (fileUrl && !path.startsWith("/") && !DRIVE.test(path)) path = `//${path}`; // file://host/…
  if (windows) path = path.replaceAll("\\", "/");
  const file = normalize(absolute(from, path));
  // Images load on open, and Windows answers a share with the person's credentials.
  const host = (full) => full.match(/^\/\/([^/]*)/)?.[1].toLowerCase();
  if (file.startsWith("//") && host(file) !== host(normalize(from))) return { error: "Can't open links to another computer" };
  return anchor ? { file, anchor } : { file };
}
