#!/bin/sh
# Draws the project site's pictures into site/img/ with scripts/preview.py: each scene cropped to
# what it shows, and whole windows for the slides at the top of the page. Needs python3,
# rsvg-convert and cwebp, and Herdr App installed (preview.py takes the program icons from it).
# Run from anywhere; commit site/img/, then run the Pages workflow (.github/workflows/pages.yml).
# Everything is drawn into a temporary folder first: site/img/ changes only once all pictures
# are there, and pictures of scenes that no longer exist go away.
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/img" site/img

# draw <scene> <name> <rsvg size option> [full]: -z 2 doubles a crop, -w 1920 fits a whole window to 1920px.
draw() {
  python3 scripts/preview.py . "$tmp/$2.svg" "$1" ${4:-}
  rsvg-convert $3 "$tmp/$2.svg" -o "$tmp/$2.png"
  cwebp -quiet -q 88 -m 6 "$tmp/$2.png" -o "$tmp/img/$2.webp"
}

draw window window "-w 1920"
# The picture a shared link shows: the whole window as PNG, which link previews widely support.
rsvg-convert -w 1200 "$tmp/window.svg" -o "$tmp/img/og.png"
# Its own line: a failing preview.py inside `for … in $(…)` would not stop the script.
scenes=$(python3 scripts/preview.py --scenes)
for scene in $scenes; do
  draw "$scene" "$scene" "-z 2"
done
# The hero's slides: whole windows, 1920px wide.
for scene in quicklook files-changed preview-tab update; do
  draw "$scene" "hero-$scene" "-w 1920" full
done
cp mods/roundup-workspace-chrome/logo.png "$tmp/img/logo.png"

rm -f site/img/*.webp site/img/*.png
cp "$tmp"/img/* site/img/
ls -l site/img
