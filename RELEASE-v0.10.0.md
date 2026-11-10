# Herdr Roundup 0.10.0

The update check can now offer pre-releases too, if you want them. The menu under the logo also stays open while you change its settings, so you can see each choice take effect.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.10.0/preview.png)

## Updates

- **Include pre-releases:** a new choice in the menu under the logo, off by default. With it off, only stable releases are offered, as before. With it on, alpha, beta and rc releases (`0.11.0-beta.1`) count as updates too. They show the same way as any update: the point on the logo, the new version under the name, one notification and the menu's update rows.
- **Versions in the right order:** `0.11.0-alpha.1` comes before `0.11.0-beta.1`, then `0.11.0-rc.1`, then `0.11.0`. From a beta, the release that follows it is an update, even after you switch pre-releases off again.
- **Switching takes effect at once:** ticking or unticking the choice checks again right away and tells you what it found. A check that was still running when you switched is ignored: it can no longer offer a beta you just switched off.
- **Said where it matters:** the agent's brief says when it is installing a pre-release, and "up to date" adds ", pre-releases included" while the choice is on.
- **More reliable for everyone:** both channels now read GitHub's list of releases, not just its "latest" entry. A release tagged as a beta but not marked as a pre-release on GitHub no longer makes every stable check fail. A newer stable release is still found when a later hotfix and many pre-releases come before it in the list.

## The menu under the logo

- **It stays open for its choices:** Check for updates, Daily, Only when I ask, Include pre-releases and Show details on hover leave the menu open. Update, Release notes and Skip still close it.
- **It shows what happens while open:** a running check shows as "checking…" in the Checked line, and a failed one as "failed" (the notification gives the reason). If an offered update goes away while the menu is open, for example because you switched pre-releases off, its rows stay but are dimmed and do nothing. A release found while the menu is open shows under Latest and in a notification; its rows appear the next time you open the menu.
- **Wider:** the menu is now 300 px wide, so "Update to 0.11.0-alpha.12 with an agent…" fits.

## Corrections

- **The line under the name:** a long second line, such as "0.11.0-beta.1 available", is now cut off under the name. It no longer runs under the search button.

## Before you update

For the person, or the agent, installing this release:

- `scripts/sync.sh` replaces the layout file, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`, as in 0.9.1. Edits you made to those files are lost. Your global keys, other layouts and Herdr's own mods stay untouched.
- No new mods and no key changes. Only `roundup-workspace-chrome` changes.
- **New shared state:** `roundup-workspace-chrome.update.prerelease` (true once you tick Include pre-releases) and `roundup-workspace-chrome.update.checking` (true while a check runs). Nothing else is written.
- **What changes in what the layout asks GitHub:** the check now sends `GET https://api.github.com/repos/carstenlucke/herdr-roundup/releases?per_page=30` instead of `…/releases/latest`, with the same two headers as before: no token, nothing about you. Only when a page holds 30 releases does it read the next one (`&page=2`, …), at most 5 pages. With the project's few releases today, a check is still one request, once a day or when you click Check for updates.
- Pre-releases stay off after the update until you tick the choice.
