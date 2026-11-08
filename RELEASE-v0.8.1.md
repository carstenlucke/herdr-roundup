# Herdr Roundup 0.8.1

The Files panel now shows which entries are symlinks and where they point. Before this, a link looked like any other file or folder.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.8.1/preview.png)

## Files panel

- **Symlinks are marked:** a link's name is in italics, with a small arrow in the accent color after it.
- **The target on hover:** rest the pointer on the arrow and it says where the link points, for example "Link to CLAUDE.md". The target is shown as the link writes it, relative or absolute.
- **Broken links stand out:** a link whose target is missing has a dimmed name, a faded icon and a red arrow, and its hover says "Broken link to …".
- The marker shows wherever the panel reads the folder from disk: in **All**, and in folders that **Changed** opens from disk. Search results and git's own lists don't show it.
- Nothing else changes: a link to a folder still opens as a folder, and a link to a file still opens in the preview.

## Before you update

For the person, or the agent, installing this release:

- `scripts/sync.sh` replaces the layout file, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`, as in 0.8.0. Edits you made to those files are lost. Your global keys, other layouts and Herdr's own mods stay untouched.
- No new mods and no key changes in this release.
- **What changes in what the panel runs:** when it lists a folder, `roundup-files` now also runs `readlink` for each link it finds, to learn the target. On Windows, PowerShell reads the target itself. Nothing else is read or written.
- `readlink` comes with macOS and Linux. Where it is missing, links are still marked, only without a target in the hover.
