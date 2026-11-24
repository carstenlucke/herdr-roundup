# GitHub Pages

The project page: https://carstenlucke.github.io/herdr-roundup/

## What it is

- `site/` is the whole page: `index.html`, `style.css` and its pictures in `site/img/`. Static, no build step.
- The pictures come from `scripts/preview.py`: each is a scene of the same drawn window, cropped to one feature. `scripts/site.sh` renders them all into `site/img/` (needs `python3`, `rsvg-convert`, `cwebp`, and Herdr App installed for its program icons). So they are made locally and committed, never in CI. It draws everything into a temporary folder first and replaces `site/img/` only when all pictures are done; `og.png` is the picture a shared link shows (PNG, which link previews widely support).
- Without a scene (or with the scene `window`), `preview.py` draws the bare window: `layouts/Herdr-Roundup.svg`, the picture Settings shows, and what `site.sh` uses for `window.webp` and `og.png`. `poster` instead puts that window beside the name, the claim and the main features, only for `preview.png` (README, RECIPE, herdr.dev); it is no scene, so `--scenes` and `site.sh` leave it out. Keep it that way (tests/CATALOG.md LAY-21).

## Publishing

Only by hand. Nothing happens on push, merge or release.

1. If a picture should change: `scripts/site.sh`, then commit `site/`.
2. Merge to `main`.
3. `gh workflow run pages.yml` (or Actions → "Publish site" → Run workflow); `gh run watch` follows it.

`.github/workflows/pages.yml` (`workflow_dispatch` only) uploads `site/` from the branch it runs on and deploys it. The `github-pages` environment takes only `main` by default.

## Set up once

Pages' source is GitHub Actions (`build_type: workflow`), so GitHub's own branch build doesn't run:

```sh
gh api -X POST repos/carstenlucke/herdr-roundup/pages -f build_type=workflow
```

Done on 2026-11-08.

## What the site shows

This is the site's content, decided at each release (`CLAUDE.md`, "Before a release"), not with each feature:

- The scenes: `SCENES` in `scripts/preview.py` names every picture `scripts/site.sh` draws into `site/img/`; `python3 scripts/preview.py --scenes` lists them. Each is a crop of the same drawn window (see "What it is").
- The features: the sections of `site/index.html`, in the order they appear there. A feature the site shows gets a section; a scene on its own is not published.
- What is left out: behaviour Herdr's own mods bring is not shown on the site. From Herdr 0.1.18, the machine-login note, the logout warning and the tab bar scrolling to the active tab were reported missing from the site; that was closed as won't fix. Such behaviour goes on the site only if a release decides to show it.

## A new feature

When a release decides to show a feature, give it a scene in `scripts/preview.py`: its name in `SCENES`, an overlay or state, and its crop in `CROPS` (worked out from what the scene draws, not fixed numbers). `scripts/site.sh` draws every scene `preview.py --scenes` lists; only a hero slide is added there by hand. Then a section in `site/index.html`.
