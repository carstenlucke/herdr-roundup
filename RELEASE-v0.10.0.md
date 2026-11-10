# Herdr Roundup 0.10.0

The update check can now offer pre-releases, and the menu under the logo stays open while you change its settings.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.10.0/preview.png)

## Updates

- **Include pre-releases:** a new choice in the logo menu, off by default. When on, alpha, beta and rc releases (`0.11.0-beta.1`) are offered like any other update.
- **Right order:** `0.11.0-alpha.1` < `0.11.0-beta.1` < `0.11.0-rc.1` < `0.11.0`. From a beta, the next release is an update even with pre-releases switched off.
- **Takes effect at once:** switching the choice checks again right away. A check still running from before the switch is ignored.
- **More reliable:** the check reads GitHub's list of releases instead of only "latest". A beta tag not marked as a pre-release on GitHub no longer breaks the stable check.

## The logo menu

- **Stays open** for Check for updates, Daily, Only when I ask, Include pre-releases and Show details on hover. Update, Release notes and Skip close it.
- **Shows what happens:** "checking…" or "failed" in the Checked line. An update that goes away while the menu is open stays dimmed and inactive.
- **300 px wide**, so long versions fit.

## Corrections

- A long line under the name ("0.11.0-beta.1 available") is cut off and no longer runs under the search button.

## Before you update

- `scripts/sync.sh` replaces the layout, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`. Your edits to those are lost; global keys, other layouts and Herdr's own mods stay untouched.
- Only `roundup-workspace-chrome` changes. No new mods, no key changes.
- New shared state: `roundup-workspace-chrome.update.prerelease` and `roundup-workspace-chrome.update.checking`.
- The check now asks `GET https://api.github.com/repos/carstenlucke/herdr-roundup/releases?per_page=30` instead of `…/releases/latest`, with the same headers and no token. Further pages (at most 5) only if a page is full; today that is one request per check.
- Pre-releases stay off until you tick the choice.
