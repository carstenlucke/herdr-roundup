// Pictures for image(), which reads only from the Herdr home: a local file is
// copied into data/roundup-preview/, named by its path and modification time; a
// web image, once the person asked, is downloaded there (https only, 5 MB,
// 10 s, image types only). Each is measured: sips on macOS, `file` on Linux, WPF on
// Windows, the SVG's own width/height or viewBox.
import { exec, appHome, window } from "herdr";
import { extension } from "./kinds.js";
import { svgSize } from "./svg-size.js";
import { imageExtension } from "./mime.js";
import { programs, pictureSize } from "./programs.js";
import { readText } from "./viewers/text.js";
import { key, downloadKey } from "./cache-key.js";

const DIR = () => `${appHome().split("\\").join("/")}/data/roundup-preview`;
const here = () => programs(window()?.platform);

// Size in pixels of a cached picture, by its name in data/roundup-preview/.
async function measure(name) {
  const file = `${DIR()}/${name}`;
  if (name.endsWith(".svg")) return svgSize(await readText(file));
  return pictureSize((await exec(...here().size(file))).stdout);
}

async function picture(name) {
  const size = await measure(name);
  if (!(size.width > 0 && size.height > 0)) throw new Error("This image format can't be shown");
  return { path: `data/roundup-preview/${name}`, ...size };
}

/** Resolves { path (for image()), width, height } for a local picture. */
export async function stageImage(file) {
  const r = await exec(...here().stage(file, DIR(), key(file), extension(file)));
  if (r.code !== 0) throw new Error(r.stderr.trim() || "Cannot read this image");
  return picture(r.stdout.trim());
}

/** The same for a web image: downloaded, then kept only when it is an image. Each download
 *  has names of its own: two previews fetching the same URL would overwrite each other's file. */
export async function fetchImage(url) {
  const k = downloadKey(url, Date.now(), Math.random());
  const r = await exec(...here().fetch(url, DIR(), k));
  if (r.code !== 0) throw new Error(r.stderr.trim() || "Download failed");
  const ext = imageExtension(r.stdout.trim()), tmp = `${DIR()}/${k}.download`;
  if (!ext) { await exec(...here().remove(tmp)); throw new Error(`Not an image (${r.stdout.trim()})`); }
  const kept = `${DIR()}/${k}.${ext}`;
  await exec(...here().move(tmp, kept));
  return picture(`${k}.${ext}`).catch(async (e) => { await exec(...here().remove(kept)); throw e; });
}

/** Drops cached pages and pictures older than two weeks. Await it before staging or rendering:
 *  with that, and the scripts in programs.js touching a cache hit, a prune rarely takes what was
 *  just picked. Not never: one running at the same time may have chosen the file before the touch. */
export function pruneCache() {
  return exec(...here().prune(DIR())).catch(() => null);
}
