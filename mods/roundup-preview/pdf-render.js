// PDF pages as PNGs: drawn by macOS's PDFKit through osascript or Windows.Data.Pdf
// through PowerShell (nothing to install), on Linux by poppler's pdftoppm. Pages land in data/roundup-preview/
// in the Herdr home, because image() only reads files from there. A page is named
// by its file, its modification time and its number, so an edited PDF renders anew.
import { exec, appHome, window } from "herdr";
import { key } from "./cache-key.js";
import { programs, pdfPages } from "./programs.js";

const WIDTH = 1600; // pixels across: sharp in a wide tab on a Retina screen, ~0.5 MB a page

/** Renders pages from..to (1-based, clamped). Resolves { count, pages: [{ n, path, width, height }] }. */
export async function renderPages(file, from, to) {
  const dir = `${appHome().split("\\").join("/")}/data/roundup-preview`, k = key(file), platform = window()?.platform;
  return pdfPages(platform, await exec(...programs(platform).pdf(file, dir, k, from, to, WIDTH)), k);
}
