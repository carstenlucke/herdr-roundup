// Names for files in data/roundup-preview/: rendered pages and cached pictures. Pure, so
// tests/cache-key.test.mjs runs it in node: the time and the random part come in.

// A short, stable name for a path (FNV-1a).
export function key(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

// A web image's download: names of its own each time (now: Date.now(), random: Math.random()),
// as two previews fetching the same URL would overwrite each other's file.
export const downloadKey = (url, now, random) => `${key(url)}-${now.toString(36)}${random.toString(36).slice(2, 8)}`;
