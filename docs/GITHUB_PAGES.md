# GitHub Pages

The project page: https://carstenlucke.github.io/herdr-roundup/

## What it is

- `site/` is the whole page: `index.html`, `style.css` and its pictures in `site/img/`. Static, no build step.
- The pictures come from `scripts/preview.py`: each is a scene of the same drawn window, cropped to one feature. `scripts/site.sh` renders them all into `site/img/` (needs `python3`, `rsvg-convert`, `cwebp`, and Herdr App installed for its program icons). So they are made locally and committed, never in CI.
- Without a scene, `preview.py` draws `layouts/Herdr-Roundup.svg` as before; keep it that way.

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

## A new feature

Give it a scene in `scripts/preview.py` (an overlay or state, and its crop in `CROP`), add the scene to `scripts/site.sh`, and a section to `site/index.html`.
