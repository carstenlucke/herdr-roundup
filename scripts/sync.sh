#!/bin/sh
# Installs this repo into the local Herdr App: the layout, its roundup-* mods, its themes and its keys.
# Real copies, not symlinks: Herdr App doesn't load a mod's own SVGs through a symlink.
set -eu
src=$(cd "$(dirname "$0")/.." && pwd)
app=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
gen="--exclude gpui-kit.d.ts --exclude jsconfig.json --exclude .gitkeep"
name=Herdr-Roundup # the layout's file name, as Settings shows it

# Mods can't import from each other: files they share are copies, and the copies must match.
for f in close.js menu.js; do
  cmp -s "$src/mods/roundup-tabs/$f" "$src/mods/roundup-pane/$f" ||
    { echo "mods/roundup-tabs/$f and mods/roundup-pane/$f differ: copy one over the other" >&2; exit 1; }
done
# How roundup-files opens roundup-preview (the mod name, its props and its shared keys), and
# how both tell two spellings of one path apart.
for f in open-file.js paths.js; do
  cmp -s "$src/mods/roundup-preview/$f" "$src/mods/roundup-files/$f" ||
    { echo "mods/roundup-preview/$f and mods/roundup-files/$f differ: copy one over the other" >&2; exit 1; }
done

mkdir -p "$app/layouts" "$app/mods" "$app/themes"

# The layout file. Clicks (sizes, hidden columns, stack choices, theme picks) live in layouts/.state/ and survive this.
cp "$src/layouts/$name".* "$app/layouts/"

# One mod at a time: other folders in the app (Herdr's, other layouts') are left alone.
for d in "$src"/mods/roundup-*/; do
  [ -d "$d" ] || continue
  rsync -a --delete $gen "$d" "$app/mods/$(basename "$d")/"
done

# The repo's themes. One named $name.json is the layout's own.
for f in "$src"/themes/*.json; do
  [ -f "$f" ] || continue
  cp "$f" "$app/themes/"
done

# keys.json: only the layout's own section is replaced; global and every other section stay as they are.
keys="$app/keys.json"
[ -f "$keys" ] || echo '{}' > "$keys"
# A section missing from the repo's keys.json installs as {}, not null.
jq --slurpfile ours "$src/keys.json" --arg s "layout:$name" \
  '. + {($s): ($ours[0][$s] // {})}' "$keys" > "$keys.tmp"
mv "$keys.tmp" "$keys"

# Herdr reloads on save; check each mod and report errors from files and mods.
for d in "$app"/mods/roundup-*/; do
  [ -d "$d" ] || continue
  herdr-app check "$d"
done
herdr-app status | jq '.errors'
