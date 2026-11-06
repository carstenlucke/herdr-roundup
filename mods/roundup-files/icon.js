// Picks a Symbols icon for a path, the way VS Code applies an icon theme: names are compared
// in lower case; a rule naming a path ("a/b") beats one naming the last part, a file's name
// beats its extension, and the longest extension wins ("spec.ts" over "ts"). An open folder
// without an open icon of its own shows its closed one. One deviation: the whole name counts
// as an extension too, since Symbols lists some names there ("tsconfig.json"), which VS Code
// would only match in "x.tsconfig.json". The icons carry their own colors and read on light
// and dark themes alike. The icons and icons.js come from scripts/build-icons.mjs;
// see docs/adr/0006.
//
// The matching follows cybertron288/herdr-mods `file-icons` (MIT, (c) 2026 cybertron288).
// See THIRD_PARTY_NOTICES.md.
import ICONS from "./icons.js";

const path = (id) => `mods/roundup-files/icons/${id}.svg`;

// rel: the path below the shown folder, "/"-separated; dir: a folder; open: an open folder.
export function iconFor(rel, dir, open) {
  const parts = String(rel).toLowerCase().split("/").filter(Boolean), name = parts[parts.length - 1] ?? "";
  const find = (table) => {
    let id;
    for (let i = 0; !id && i < parts.length - 1; i++) id = table[parts.slice(i).join("/")];
    return id ?? table[name];
  };
  if (dir) return path((open ? find(ICONS.folderNamesExpanded) : undefined) ?? find(ICONS.folderNames) ?? (open ? ICONS.folderExpanded : ICONS.folder));
  // Extensions, longest first: the whole name, then what follows each dot.
  const extensions = [name];
  for (let dot = name.indexOf("."); dot !== -1; dot = name.indexOf(".", dot + 1)) extensions.push(name.slice(dot + 1));
  let id = find(ICONS.fileNames);
  for (const e of extensions) id ??= ICONS.fileExtensions[e];
  return path(id ?? ICONS.file);
}

// The shown folder itself, in the header.
export const rootIcon = (open) => path(open ? ICONS.rootFolderExpanded : ICONS.rootFolder);
