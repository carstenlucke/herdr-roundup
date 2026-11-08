#!/bin/sh
# Draws the project site's pictures into site/img/ with scripts/preview.py: each scene cropped to
# what it shows, and whole windows for the slides at the top of the page. Needs python3,
# rsvg-convert and cwebp, and Herdr App installed (preview.py takes the program icons from it).
# Run from anywhere; commit site/img/, then run the Pages workflow (.github/workflows/pages.yml).
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p site/img

# draw <scene> <name> <rsvg size option> [full]: -z 2 doubles a crop, -w 1920 fits a whole window to 1920px.
draw() {
  python3 scripts/preview.py . "$tmp/$2.svg" "$1" ${4:-}
  rsvg-convert $3 "$tmp/$2.svg" -o "$tmp/$2.png"
  cwebp -quiet -q 88 -m 6 "$tmp/$2.png" -o "site/img/$2.webp"
}

draw window window "-w 1920"
for scene in spaces files files-changed search symlink pane-header rename close-menu close-confirm update preview-tab float; do
  draw "$scene" "$scene" "-z 2"
done
# The hero's slides: whole windows, 1920px wide.
for scene in files-changed preview-tab update; do
  draw "$scene" "hero-$scene" "-w 1920" full
done
rm -f site/img/tile-*.webp
cp mods/roundup-workspace-chrome/logo.png site/img/logo.png
ls -l site/img
