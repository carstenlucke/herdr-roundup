// Picks a Catppuccin icon for a path, the way VS Code applies an icon theme: names are
// compared in lower case; a rule naming a path ("a/b") beats one naming the last part, a
// file's name beats its extension, and the longest extension wins ("spec.ts" over "ts").
// Light themes draw the Latte set, dark themes the Mocha set (settings().dark).
// The icons and icons.js come from scripts/build-icons.mjs; see docs/adr/0003.
import ICONS from "./icons.js";

const DIR = "mods/roundup-files/icons";
const path = (id, dark) => `${DIR}/${dark ? "mocha" : "latte"}/${id}.svg`;

// rel: the path below the shown folder, "/"-separated; dir: a folder; open: an open folder.
export function iconFor(rel, dir, open, dark) {
  const parts = String(rel).toLowerCase().split("/").filter(Boolean), name = parts[parts.length - 1] ?? "";
  const table = dir ? (open ? ICONS.folderNamesExpanded : ICONS.folderNames) : ICONS.fileNames;
  let id;
  for (let i = 0; !id && i < parts.length - 1; i++) id = table[parts.slice(i).join("/")];
  id ??= table[name];
  if (dir) return path(id ?? (open ? ICONS.folderExpanded : ICONS.folder), dark);
  for (let dot = name.indexOf("."); !id && dot !== -1; dot = name.indexOf(".", dot + 1)) id = ICONS.fileExtensions[name.slice(dot + 1)];
  return path(id ?? ICONS.file, dark);
}

// The shown folder itself, in the header.
export const rootIcon = (open, dark) => path(open ? ICONS.rootFolderExpanded : ICONS.rootFolder, dark);
