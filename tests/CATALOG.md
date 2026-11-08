# Test catalog

What the regression suite has to hold, one row per test case. Built 2026-11-08 from every PR (#1–#18), their 106 inline review comments, the fix commits of PR #6, issue #8, `RECIPE.md` now and before PR #15 (`482a2ca^`), `CLAUDE.md`, and the code. The old RECIPE held no rule the current one lacks: PR #15 only reworded it.

A row says what must hold, where it comes from, how it is tested and what has to happen first. When a test lands, its name goes into **Covered**.

## Levels

| Level | Runs | Needs Herdr | Where |
| --- | --- | --- | --- |
| **L1** unit / static | pure functions from files without `herdr`/`gpui` imports; static checks of repo files (layout JSON, keys, ids, colors, copies) | no | `node --test tests/`, CI (macOS) |
| **L2** node integration | a mod's real code in Node, with `herdr`, `gpui-kit`, `gpui-base` replaced by stubs through a loader hook: `exec()` runs through `child_process` (real git repos and folders in a temp dir), `readTextFile` reads real files, `shared`/`setShared`/`panes`/`spaces`/`agents`/`run`/`notify`/`openOverlay`/`watchFolder`/`fetch` are fixtures and recorders, `cx` has fake timers; the gpui stub returns an element tree whose `on_click`/`on_key_down`/`on_mouse_down` handlers a test calls | no | `node --test tests/`, CI (macOS) |
| **L3** smoke | an isolated Herdr instance (own `HERDR_APP_HOME`, own `HC_SESSION`) beside the person's window, driven by `herdr-app do` and `<mod>.<command>`, read through `herdr-app status`/`ls`, `shared.json` and `shot` | yes | `scripts/smoke.sh`, local, started on purpose; the window comes to the front while it runs |

Nothing may need a person: there is no pointer or key injection, so L2 calls handlers directly and L3 uses commands (plus debug commands where a mod has none).

**Prio:** H = a bug was found and fixed here, or it breaks the layout or a core function. M = documented behaviour. L = cosmetic.

**Needs** names the prerequisite: `extract …` (move logic out of a `main.js` into a herdr-free file), `herdr stub` / `gpui stub` (the L2 harness), `fixture: …`, `debug command`, `isolated Herdr`.

## Order of work

1. **Static checks and existing pure files (L1, no refactor):** LAY-01…12, PAN-01/02/13, FIL-108…111, the L1 rows of `links.js`, `kinds.js`, `mime.js`, `json-tree.js`, `size.js`, `programs.js`, `platform.js`, `text-file.js`, `markdown-blocks.js`.
2. **L2 harness:** the loader hook and the `herdr`/`gpui` stubs, kept close to `herdr.d.ts`. First users: `git.js` against real repos (FIL-01…25), `roundup-spaces` git (SPC-02…05), `update.js` (CHR-01…16), `close.js` (PAN-03…06, TAB-01…07).
3. **Extractions from `main.js`, H rows first:** each with its test in the same PR, and a live check in Herdr afterwards. Candidates are listed at the end.
4. **`scripts/sync.sh` (L2 with a temp home):** LAY-13…17.
5. **`scripts/smoke.sh` (L3):** start the isolated instance, seed its home (Welcome seen, update check off), install with `HERDR_APP_HOME=… scripts/sync.sh`, run the L3 rows, quit and clean up. See memory "Isolated Herdr instance" for the recipe and its pitfalls.
6. **CI:** a GitHub Actions workflow on macOS running `node --test tests/` (L1 + L2).

---

## Layout, keys, themes, sync (LAY)

| ID | Behaviour (what must hold) | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| LAY-01 | Every `id` in the `layouts/Herdr-Roundup.json` tree is unique. | CLAUDE.md; RECIPE now (Watch out) | L1 | — | — | H |
| LAY-02 | Every color value in the layout (`background`, `divider.color`, `border.color`, `focus.color`, …) is a theme name, not `#hex`, and the mods' JS has no hex color literal (the vendored icons excepted). | CLAUDE.md | L1 | — | — | M |
| LAY-03 | Root `"version"` exists, matches `^\d+\.\d+\.\d+$` (what update.js compares) and has a `RELEASE-v<version>.md` beside it. | CLAUDE.md (release); commit a73afea | L1 | — | — | M |
| LAY-04 | Root `"preview"` names an existing file matching `layouts/Herdr-Roundup.*`, which sync.sh's `cp layouts/$name.*` copies. | CLAUDE.md (release) | L1 | — | — | M |
| LAY-05 | The layout file is `layouts/Herdr-Roundup.json` (no space); sync.sh `name=` and keys.json's `layout:Herdr-Roundup` match it. | PR #1 body; commit 0c25217 | L1 | — | — | H |
| LAY-06 | Every `content.mod` and `terminal_menu` names a `mods/roundup-*` folder or a shipped mod (`agents`, `changes`, `workspace-status`); `roundup-workspace-chrome` sits in `brand` and in `sidebar-footer` with `props.footer: true`; `terminal_menu` is `roundup-pane`. | RECIPE now (Built from) | L1 | — | — | H |
| LAY-07 | The block ids the code looks up exist with the right shape: `sidebar` (column with `size.px`), `panel`, `panel-body` (stack holding `files` and `changes`). | RECIPE now | L1 | — | — | H |
| LAY-08 | Every `mods/*` folder starts with `roundup-` and has a `mod.json` with `place: "none"`; clones of shipped mods keep `cloned_from {name, version}`. | CLAUDE.md | L1 | — | — | M |
| LAY-09 | keys.json holds only `layout:Herdr-Roundup` (no `global`): `cmd-w`→`roundup-tabs.close`, `cmd-shift-w`→`roundup-tabs.close-pane` (never `roundup-pane.close`, which every header copy would get, closing pane after pane). | CLAUDE.md; commit f0ad009 | L1 | — | — | H |
| LAY-10 | Each `<mod>.<command>` bound in keys.json is handled by that mod's `nextCommand` loop, and that mod is placed in the layout. | CLAUDE.md (limits) | L1 | — | static scan of main.js | M |
| LAY-11 | Shared-state key literals in the mods start with an existing `roundup-<mod>.` or are Herdr's (`sidebar.width`, `sidebar.collapsed`, `space.colors`, `workspace.panels`, `layout`). | CLAUDE.md | L1 | — | static scan | M |
| LAY-12 | Every svg/png a mod references exists, dynamic names included (pane: rename/split-right/split-down/zoom/unzoom/close; tabs: win-min/max/restore/close; chrome menu/info icons); no unreferenced svg/png in chrome, pane, tabs, spaces. | PR #13 rc 4503276075; commit a73afea | L1 | — | list of dynamic names | L |
| LAY-13 | With `HERDR_APP_HOME` set to a temp folder, sync.sh installs there and writes nothing under `$HOME/.config/herdr-app`. | sync.sh | L2 | — | temp HOME, `herdr-app` stub on PATH | H |
| LAY-14 | sync.sh copies the layout (.json, .svg) and each `roundup-*` mod with `rsync --delete`: a stale file in an installed roundup mod goes; other mods stay; `gpui-kit.d.ts`, `jsconfig.json`, `.gitkeep` aren't copied; `layouts/.state/` survives; an empty `themes/` is fine. | commit c8d800a; sync.sh | L2 | — | temp app home, `herdr-app` stub | M |
| LAY-15 | sync.sh replaces only `layout:Herdr-Roundup` in keys.json and keeps `global` and other sections; a missing keys.json is created; a section missing from the repo installs as `{}`, never `null`. | commits 0c25217, c8d800a | L2 | — | fixture keys.json | H |
| LAY-16 | sync.sh exits non-zero with "… differ: copy one over the other", before copying anything, when roundup-tabs/roundup-pane `close.js`/`menu.js` or roundup-files/roundup-preview `open-file.js`/`paths.js` differ. | commit f0ad009; PR #5 body | L2 | — | copy of the repo in a temp dir | H |
| LAY-17 | sync.sh runs `herdr-app check` on every installed `roundup-*` mod and stops when one fails. | sync.sh; commit c8d800a | L2 | — | failing `herdr-app` stub | M |
| LAY-18 | After sync.sh into the isolated home, `herdr-app check` passes for each roundup mod and `herdr-app status` shows no errors. | CLAUDE.md; PR #2–#5, #13 test plans | L3 | — | isolated Herdr | H |
| LAY-19 | `layout.switch --name Herdr-Roundup` switches: status shows `"layout": "Herdr-Roundup"`. | PR #1 body | L3 | — | isolated Herdr | H |
| LAY-20 | The shipped-mod assets the roundup mods draw exist in a started home: `mods/workspace-chrome/{spinner,check,branch,folder,plus,monitor,server,chevron-down,chevron-right,square-pen,x,panel-right,square,terminal}.svg`, `mods/pane/close.svg`, `mods/files/file.svg`, `mods/changes/changes.svg`. | RECIPE now (Built from) | L3 | — | isolated Herdr | M |

## roundup-workspace-chrome (CHR)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| CHR-01 | `newer(a,b)` compares major.minor.patch as numbers (`0.10.0` > `0.9.0`), accepts a leading `v`, ignores a suffix (`0.9.0` > `0.8.0-rc.1`, `0.8.0-rc.1` not > `0.8.0`), and is false for equal or unparsable input. | PR #13 rc 4503275917 | L1 | version: "newer compares major.minor.patch as numbers, takes a leading v and ignores a suffix" | extract `newer` into `version.js` | H |
| CHR-02 | `latest()` sends one GET to `RELEASES` with exactly `Accept: application/vnd.github+json` and `User-Agent: herdr-roundup`: no Authorization, no token. | PR #13 body; RECIPE now | L2 | update: "latest sends one plain GET to the releases API with only Accept and User-Agent" | herdr stub, fake fetch | H |
| CHR-03 | `latest()` answers: fetch throws → "No connection to api.github.com"; 404 → "No release on GitHub yet"; 403/429 → rate limit; 500 → "GitHub answered 500"; bad JSON → "couldn't be read"; tag `latest`/missing → "…isn't a version"; `v01.02.03` → `1.2.3`; `v0.9.0-rc.1` rejected; no `html_url` → the releases page. | RECIPE now | L2 | update: "latest says why it found no version, and reads one from the tag"; version: "tagVersion reads…" | fake fetch | M |
| CHR-04 | `check()` writes `lastCheck` before the fetch resolves, failures included; sets `error` on failure and null on success; writes `checked` and `latest` only on success. | PR #13 body | L2 | update: "check writes lastCheck before the answer, error on failure, checked and latest only on success" | shared recorder, fake fetch | H |
| CHR-05 | The automatic check gives no toast on failure and exactly one info toast per new version ("Herdr Roundup X is out", action `roundup-workspace-chrome.update@X`, `notified=X`); none again for the same version, none for a dismissed one. | RECIPE Done when | L2 | update: "the automatic check gives no toast on failure and one per new version, none for a dismissed one" | notify recorder | H |
| CHR-06 | A manual check always gives one toast: failure → warning "Couldn't check for updates" plus the reason; newer → the new-version toast even when dismissed, clearing `dismissed`; else "up to date". | RECIPE now | L2 | update: "a manual check always gives one toast, and shows a dismissed version again" | notify recorder | H |
| CHR-07 | `due()` is true only when `auto !== false` and `now − lastCheck ≥ 24h` (no `lastCheck` counts as due). | RECIPE now, Done when | L2 | update: "due: only when on and a day has passed since the last request" | fake `Date.now` | H |
| CHR-08 | `available(installed)` returns `latest` only when it is newer and not `dismissed`, else null. | RECIPE now | L2 | update: "available: the latest release when newer and not dismissed" | herdr stub | M |
| CHR-09 | `install(installed, V)`: V equal to latest → latest; another valid V → `{V, …/releases/tag/vV}`; invalid V → "Nothing to update"; no V → latest; a release not newer than installed → info "Nothing to update" and no `run()`. | PR #13 body; RECIPE Done when | L2 | update: "install takes the release the command names, else the latest, and refuses one not newer"; version: "pick: …" | run/notify recorders | H |
| CHR-10 | `install()` takes the first `knownAgents()` entry with `installed`; with none, or when `knownAgents` rejects, a warning "No agent to update with" and no `run()`. | RECIPE now | L2 | update: "install uses the first installed agent; with none, or when knownAgents fails, a warning and no tab" | knownAgents fixture | M |
| CHR-11 | `install()` uses only spaces with `machine === null`: active local space → `tab.new {name:"Update Herdr Roundup", folder: appHome(), argv, task, space}` without `space.select`; inactive → `space.select` first; only remote spaces → `space.new {machine:"", …}`. | RECIPE now, Done when | L2 | update: "install opens the tab in a space on this computer: the shown one, else selects one, else makes one" | spaces fixture, run recorder | H |
| CHR-12 | A throwing `run()` in `install()` gives the warning "Couldn't open the update tab", and `install()` resolves without rejecting. | PR #13 rc 4503275679 | L2 | update: "install resolves with a warning when run() throws" | throwing run stub | H |
| CHR-13 | The brief names v<installed> and v<version>, `<home>/AGENTS.md`, a clone at tag v<version> into `mktemp -d`, the release URL, `layout:Herdr-Roundup` of `<home>/keys.json` and `<home>/mods`, and "Only after I agree"; `scripts/sync.sh` and `herdr-app status` are prefixed `HERDR_APP_HOME=<JSON-quoted home>` (a home with spaces works). | RECIPE now/old | L1 | version: "brief names both versions, the app home's files, the clone at the tag and asks before it changes anything" | extract `brief` into `version.js` | M |
| CHR-14 | `openNotes(V)` runs `open [url]` on macOS, `cmd /c start "" url` on Windows, else `xdg-open`; url from `pick(V)`, else the releases page; an exec rejection gives a warning toast with the url. | RECIPE now | L2 | update: "openNotes opens the release page with the platform's opener, and says so when it can't" | exec recorder | M |
| CHR-15 | Brand command loop: `update@V` passes V; a rejecting `install` neither ends the loop nor holds back the next command; `check`/`update` do nothing until a version is read; `notes` works without one. | PR #13 rc 4503275679 | L2 | update: "the brand's commands: update@V names V, a slow or failing install holds nothing back, notes without a version", "the brand's check and update wait for the version; notes don't" | herdr + gpui stubs, nextCommand queue | H |
| CHR-16 | A manual check asked for during a running check is queued and runs right after, so it still toasts. | PR #13 rc 4503275732 | L2 | update: "a manual check asked for during a running one runs right after it, and toasts too" | deferred fake fetch | H |
| CHR-17 | The `auto` command (Daily chosen) runs `autoCheck` at once: it fetches when due and not otherwise. | PR #13 rc 4503275873 | L2 | — | herdr + gpui stubs | M |
| CHR-18 | Click vs drag: the menu opens only when the pointer moved < 3 px (summed x+y) in < 10 moves with `click_count` 1; a drag or a double-click opens nothing. | PR #13 body; RECIPE Watch out; CLAUDE.md limits | L1 | — | extract `isClick(press, e)` | H |
| CHR-19 | A click with no version read opens no overlay, and the hover card isn't suppressed (`quiet` stays false). | PR #13 rc 4503275977 | L2 | — | gpui stub, openOverlay recorder | H |
| CHR-20 | `openMenu` freezes `{installed, herdr, release, error}` into props with `height = menuHeight(menu)`; a check finishing later changes neither row count nor height, labels follow the newer version, and Enter never reaches an undefined row. | PR #13 rc 4503275775; RECIPE Done when | L2 | — | herdr + gpui stubs | H |
| CHR-21 | `menuHeight` and `infoHeight` match what `menuView` draws (rows 31, headings 19, dividers 9, facts 18, status 22, +15 for an error's second line, reason clamped to 30 px). | PR #13 rc 4503275829 | L1 | — | extract height arithmetic | M |
| CHR-22 | Menu actions close the overlay first, then: Check → `run(…check)`; Update → `update@V`; Release notes → `notes@V`; Skip → `dismissed=V`; Daily → `auto=true` + `run(…auto)`; Only when I ask → `auto=false`; Show details toggles `…details`. | RECIPE now; CLAUDE.md (popup ends) | L2 | — | gpui stub | H |
| CHR-23 | In the chrome menu ↓/↑ wrap, Enter runs the highlighted row, Esc closes, other keys do nothing. | RECIPE now | L2 | — | gpui stub | M |
| CHR-24 | `info()` shows Latest "–" before an answer and "V · skipped" when newer but dismissed; accent only when `available()` is non-null; Based on only with herdr; status "Checking for updates…" or "Couldn't check: <reason>". | PR #13 rc 4503276026; RECIPE now | L2 | — | gpui stub | M |
| CHR-25 | The hover card is empty while shared `roundup-workspace-chrome.menu` is true, right after a click until hover leaves, or when `…details` is false; the popup's init sets `menu` true, its close false; the brand copy's init resets it. | RECIPE Watch out; CLAUDE.md limits | L2 | — | gpui stub | M |
| CHR-26 | The version comes from `appHome()/layouts/<layout>.json`, re-read when `watchFolder` reports that file or folder (not `layouts/.state/*`); unreadable or invalid JSON → no version. | commit a73afea; RECIPE now | L2 | — | readTextFile/watchFolder stubs | M |
| CHR-27 | "Based on Herdr <v>" shows only when `cloned_from.name` is `"main"`; a missing version shows "Installed –" with no stray space. | commit a73afea | L1 | — | extract `herdrVersion` | L |
| CHR-28 | Brand sub line: no version → none; offered release → "V available" in accent plus the point on the logo; checking → "I · checking…"; else the installed version. | RECIPE now | L2 | — | gpui stub | M |
| CHR-29 | Sidebar toggle: wide (≥ 160 px) stores `sidebar.width`, sets `sidebar.collapsed` and resizes to 76 (macOS) or 44; narrow resizes to `sidebar.width ?? 268`, `collapsed` false. | RECIPE now/old | L2 | — | layout/window fixtures | M |
| CHR-30 | `when()` gives "today HH:MM", "yesterday HH:MM", else "Mon D HH:MM", zero-padded. | RECIPE now | L1 | — | extract `when` | L |
| CHR-31 | Only update.js calls `fetch`, and only `RELEASES`; no other network URL in these mods. | RECIPE Watch out (network) | L1 | — | static scan | M |
| CHR-32 | Settings in the footer has an accent dot iff `updates().app.ready`; Add machine runs `mod.open {name:"machine-add"}`. | RECIPE now | L2 | — | gpui stub | L |
| CHR-33 | `roundup-workspace-chrome.check` writes `…update.checked`, `…update.latest.version` and `…update.error` null into shared.json. | PR #13 body | L3 | — | isolated Herdr, network | M |
| CHR-34 | `lastCheck` stays the same across two restarts within a day; with `…update.auto` false seeded, no `lastCheck` is written. | RECIPE Done when | L3 | — | seeded shared.json | M |

## roundup-spaces (SPC)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| SPC-01 | `alpha()`: `#abc`→`#aabbcc`+a, `#a1b2c3`+a, `#a1b2c3dd` gets its alpha replaced, case-insensitive; `ansi6`, `rgb(…)`, undefined → null. | PR #3 body (review fix); RECIPE Watch out | L1 | — | extract `alpha` (l.47–52) | H |
| SPC-02 | Porcelain v2: dirty counts only lines starting `1 `, `2 `, `u `, `? ` (not `! `, not `#`); branch from `# branch.head`; `# branch.ab +2 -1` → ahead 2, behind 1; no ab line → 0/0. | RECIPE Watch out | L1 | spaces-git: "parseStatus counts changed, renamed, conflicted and untracked lines, not ignored ones or headers" | extract parse from `check()` (l.258–268) | H |
| SPC-03 | rev-parse: main checkout → repo `<top>/.git`, not linked, name = top's basename; worktree → common dir, linked, same repo; git < 2.31 output (3 lines) → `<top>/.git`, never linked; common dir `x.git` → name `x`. | PR #3 body; RECIPE now | L1 | spaces-git: "parseRevParse: a main checkout, a worktree, an old git and a bare common dir" | extract (l.250–255) | H |
| SPC-04 | `check()` on real repos: 1 modified + 1 untracked → dirty 2; a `git worktree add` copy → linked, same repo key; a non-repo → null, not unsure; another non-zero exit → unsure; exec throwing → unsure, old value kept. | RECIPE now | L2 | spaces-git: "check on real repos: dirty count, a worktree on its repo's card, a non-repo", "check: another failure of git is asked again; an exec that throws keeps the old value" | herdr stub; temp repos | H |
| SPC-05 | Git runs as `git --no-optional-locks -c core.fsmonitor=false status --porcelain=v2 --branch`; after `check()` on a dirty repo, `.git`'s files and the index mtime are unchanged. | RECIPE Watch out (endless watch loop) | L2 | spaces-git: "check runs a status that writes nothing under .git" | temp repo | H |
| SPC-06 | Only local repos' common git folder is watched, never the working tree; once per repo; dropped when no shown place uses it. | RECIPE Watch out | L2 | — | watchFolder recorder | M |
| SPC-07 | Git line: repo omitted in a tree row or when equal to the space name (case-insensitive); branch omitted when equal to the name or `main`/`master`; null branch → "detached"; nothing to say → null; tooltip "1 uncommitted change"/"3 uncommitted changes"; ↑/↓ only > 0. | RECIPE Done when | L1 | — | extract text of `gitLine` (l.469–475) | M |
| SPC-08 | Badge: color of the most urgent (blocked > done > working > idle; unknown = idle); all idle → `dim`; tooltip "3 agents: 1 blocked, 2 idle" by urgency, singular "1 agent: …". | RECIPE now | L1 | — | extract from `crewBadge` (l.491–498) | M |
| SPC-09 | Cards: main checkout plus its worktrees → one card headed by the main row; ≥ 2 worktrees without main → a card under the repo name; a lone worktree without main → an ordinary row. | PR #3 body; RECIPE Done when | L2 | — | spaces/panes fixtures | H |
| SPC-10 | `arrange()`: the `space.move` calls (1-based), replayed on the order, give the target order; nothing moves before the first git answers; no repeat for an unchanged key. | RECIPE now | L2 | — | run recorder | M |
| SPC-11 | `drop(from, onto)`: a card's first row carries the whole card; another worktree moves alone; below `onto` when dragged down, above when dragged up; `onto` outside → nothing. | RECIPE How it behaves | L2 | — | spaces fixture | M |
| SPC-12 | Spaces there at start stay hidden until all have a git answer or 1.5 s pass, then show together; a new space waits up to 1.5 s for its own git. | PR #3 body; RECIPE now | L2 | — | fake clock | M |
| SPC-13 | `due()` refreshes on a new place, a cd, busy→idle or a changed `turn` (its place and every place of the same repo), a machine back to `ready`, the window back in front; while in front the active place every 10 s, others 60 s; folded machines skipped. | RECIPE How it behaves | L2 | — | fixtures, fake clock | M |
| SPC-14 | `refreshGit` runs one look at a time; a place asked for during a run is looked at once more afterwards, never twice at once. | RECIPE old | L2 | — | deferred exec | L |
| SPC-15 | A new space gets the least-used of `ansi6, ansi3, ansi4, ansi5, ansi2, ansi1` (ties in that order); `~` gets none; deleted spaces leave `space.colors`; nothing is written when nothing changed. | RECIPE now | L2 | — | setShared recorder | M |
| SPC-16 | Avatar tint alpha is `2e` in dark themes, `24` in light; a theme-name color resolves through `theme()`, a hex stays. | RECIPE now | L2 | — | settings/theme fixtures | L |
| SPC-17 | Reconnect: `machine rm` then `machine add` with `--via`/target, `--name`, `--session`, `--temp`; a failure after rm keeps `removed` so a retry only adds; error text from `error.message`; success unfolds the machine. | RECIPE now | L2 | — | hc recorder | M |
| SPC-18 | `rebuilt()` is true only for `state: "unreachable"` with `why` = `a different core answers there ("…")`. | RECIPE now | L1 | — | extract (l.152–154) | L |
| SPC-19 | Rail: a compact row shows i+1 and `●` for blocked/done, else `·`; `narrow()` below 160 px. | RECIPE now | L2 | — | herdr + gpui stubs | L |
| SPC-20 | `place()` is the first terminal pane's `cwd` in the space's tabs, else `s.folder`; `where()` keys on machine plus place. | RECIPE now | L1 | — | extract `place`/`where` (l.25–33) | M |

## roundup-pane (PAN)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| PAN-01 | roundup-pane's `close.js` and `menu.js` are byte-identical to roundup-tabs'. | commit f0ad009; RECIPE Watch out | L1 | — | — | H |
| PAN-02 | roundup-pane has no `nextCommand` loop; `cmd-shift-w` goes only through `roundup-tabs.close-pane`. | commit f0ad009 ("pane after pane") | L1 | — | static scan | H |
| PAN-03 | `closePane`: a pane with siblings → kind `pane`, `pane.close {pane}`; a lone pane → kind `tab`, `tab.close {id, confirmed:true}`; "Its terminal ends." only for a terminal; "…space closes too" for the last pane of the last tab, "…tab closes too" for a lone pane. | PR #5 body | L2 | close (both copies): "closePane closes a pane with siblings, a lone pane's tab, and says what goes with it" | herdr stub | H |
| PAN-04 | A pane's busy agents: its own plus terminals descending from it through `parent` (sub-agents of sub-agents); a parent cycle ends; a lone pane counts every busy agent in the tab. | commit f0ad009 | L2 | close (both copies): "a pane's busy agents are its own and its sub-agents' down the parent chain; a lone pane counts the tab's" | terminals/agents fixtures | H |
| PAN-05 | `paneName`: the given name (terminal label `roundup-pane.name`; mod pane: shared `roundup-pane.names[pane]`), else agent/shell program name, else title, else program name, else "shell". | PR #4 body | L2 | close (both copies): "paneName: the given name, else the agent's or shell's name, the title, the program, \"shell\"" | herdr stub | M |
| PAN-06 | `saveName` trims and cuts to 48 code points without splitting an emoji; terminal → `hc label … roundup-pane.name=<name>` (empty removes), failure → toast "Couldn't rename the pane"; mod pane → its `roundup-pane.names` entry set or deleted, others kept. | commit 9cb2280 | L2 | close: "roundup-pane's rename dialog saves a trimmed name of at most 48 code points as the terminal's label", "…says so when hc can't label the terminal", "…keeps a mod pane's name in shared state, others kept" | hc/notify recorders; export `saveName` | H |
| PAN-07 | `paneId`: a terminal shows and copies its address; a mod pane `p`+≥7 hex shows `p`+6 hex+"…" (a `<machine>/` prefix kept) and copies the full id. | PR #4 body | L1 | — | extract `paneId` (l.39–43) | M |
| PAN-08 | `folder()`: home → `~`, below home → `~/…`; `/Users/ab` with home `/Users/a` unchanged; null → "". | RECIPE now | L1 | — | extract with home as parameter (l.32–36) | L |
| PAN-09 | Double-click on the name opens the rename dialog (380×196, `props.rename {pane, terminal, value, fallback}`) and stops propagation; on the id chip it copies; a single click only focuses the pane. | commit 9cb2280 | L2 | — | gpui stub | H |
| PAN-10 | The chip shows "copied" for 1.2 s; a second copy cancels the first timer. | commit 9cb2280 | L2 | — | fake cx.timer | M |
| PAN-11 | Rename submit reads the input before `closeOverlay`, then saves; Esc and Cancel close without saving. | commit 9cb2280 | L2 | — | gpui stub | M |
| PAN-12 | Terminal menu: Split right/down, Zoom, the right-click toggle (label by `herdr.right-click`), "Send back to <parent>" only with a parent, Close pane → `closePane` (never a bare `pane.close`), then three choices writing only `roundup-pane.confirm-close`. | PR #5 body; RECIPE Done when | L2 | — | herdr + gpui stubs | H |
| PAN-13 | Popup heights fit their rows: pane overlay 332 ≥ 9 rows (326); tab popup 237 ≥ 6 rows (233). | commit f0ad009 ("ninth row") | L1 | — | export row heights from menu.js | M |
| PAN-14 | `shortcut()` returns the first bound action's keys from `layout:<layout>`, then `global`, else ""; Close pane shows `cmd-shift-w`. | RECIPE now | L2 | — | keys() fixture | L |
| PAN-15 | Hover buttons: rename, split right/down, zoom/unzoom by `p.zoomed`, close → `closePane`; status spinner for working, "Needs you" for blocked, a dot for done. | RECIPE now | L2 | — | gpui stub | L |
| PAN-16 | `roundup-tabs.close-pane` on a focused shell beside another shell (default mode) closes only that pane (`herdr-app ls`). | PR #5 test plan | L3 | — | isolated Herdr | M |

## roundup-tabs (TAB)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| TAB-01 | `confirmMode` returns a stored `never`/`agents`/`always`; unset or invalid → `agents`; tabs and panes use separate keys. | PR #5 body | L2 | close (both copies): "confirmMode reads never/agents/always per kind, else agents" | herdr stub | H |
| TAB-02 | `never` runs the command with `confirmed: true`; `agents` without a working/blocked agent runs it without `confirmed`, with one opens the dialog (done and idle don't count); `always` opens the dialog. | PR #5 body | L2 | close (both copies): "never closes at once, agents asks only while one works or waits, always asks" | run/openOverlay recorders | H |
| TAB-03 | The dialog is roundup-confirm, 400×170; detail for one agent "<Name> is still running in it. Closing ends it.", for several "N agents are still running in it (A, B). Closing ends them." (names deduped); without agents `ends` plus `more`; nothing → "Nothing runs in it." | commit f0ad009 | L2 | close (both copies): "the dialog is roundup-confirm, 400×170, and says which agents end" | herdr stub | M |
| TAB-04 | One dialog at a time: a close while `roundup-confirm.open` holds an id closes that overlay first and stores the new id. | commit f0ad009 | L2 | close (both copies): "one dialog at a time: the open one closes first" | closeOverlay recorder | H |
| TAB-05 | Title: named tab → `Close tab "<fit>"?`; `tb\d+` tab → `Close tab <program\|Terminal>?`; `fit` cuts at 26 columns with "…", CJK counting 2; the space's last tab adds "…space closes too". | commit f0ad009 | L2 | close (both copies): "the title names the tab, cut to 26 columns, and the last tab takes its space" | herdr stub | M |
| TAB-06 | `tabProgram` takes an agent pane's program first, else the first pane's. | commit f0ad009 | L2 | close (both copies): "tabProgram takes an agent pane's program first, else the first pane's" | panes fixture | L |
| TAB-07 | `close` → focused tab, else the active space's active tab; `close:<id>` → that tab; `close-pane` → the focused pane only, nothing without focus; an unknown id → nothing. | PR #5 body; commit f0ad009 | L2 | close: "roundup-tabs' close commands: the focused tab, else the shown one; close:<id>; close-pane only with a focused pane" | nextCommand queue | H |
| TAB-08 | Tab menu: Rename, New tab (`tab.new {space}`), Close → `closeTab` (never a bare `tab.close`), then three choices writing only `roundup-tabs.confirm-close` with a check on the chosen one. | PR #5 body | L2 | — | herdr + gpui stubs | H |
| TAB-09 | Shared `menu.js`: ↓/↑ wrap, Enter closes the overlay then runs the row, Esc closes. | RECIPE now | L2 | — | gpui stub | M |
| TAB-10 | The × shows only on the active tab, calls `closeTab`, stops propagation; right-click opens a 220×237 popup with `{menu: {id, space}}`. | RECIPE now | L2 | — | gpui stub | M |
| TAB-11 | Window buttons only with `window().buttons`: Windows SVGs (min, max/restore, close), elsewhere −/□/×; they run `window.minimize`/`maximize`/`close`. | RECIPE now | L2 | — | window fixture | L |
| TAB-12 | `syncPanel` remembers the side panel per space: switching restores it (`layout.select` + `layout.show`, or `layout.hide`); an unknown first space isn't forced; old state ignored for 1 s while a restore lands; only enabled panels. | clone behaviour (tabs 0.1.13) | L2 | — | localStorage stub | L |
| TAB-13 | Tab drag i→j → `tab.move {id, index: j+1}`; same tab → `tab.select`; double-click → `tab.rename`; wheel → `tab.prev`/`tab.next`. | clone behaviour | L2 | — | gpui stub | L |
| TAB-14 | Default mode: `roundup-tabs.close:<id>` on a shell-only tab closes it at once; with `roundup-tabs.confirm-close` seeded to `always`, the tab stays and `roundup-confirm.open` holds an overlay id. | PR #5 test plan | L3 | — | isolated Herdr, seeded shared.json | H |

## roundup-confirm (CNF)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| CNF-01 | Cancel is chosen when the dialog opens: Enter or Space right away closes and runs nothing. | PR #5 body | L2 | — | herdr + gpui stubs | H |
| CNF-02 | Tab/Shift-Tab toggle the chosen button and focus it; then Enter or Space closes and runs `command.name` with `command.args ?? {}`. | PR #5 body | L2 | — | gpui stub (focus handles) | H |
| CNF-03 | Esc closes without running; handled keys stop propagation, others don't. | PR #5 body | L2 | — | gpui stub | M |
| CNF-04 | A click on Confirm runs the command; on Cancel it doesn't. | RECIPE now | L2 | — | gpui stub | M |
| CNF-05 | `close()` clears `roundup-confirm.open` only while it holds this dialog's id. | commit f0ad009 | L2 | — | shared recorder | H |
| CNF-06 | Without props the title is "Are you sure?" and the detail "". | code | L2 | — | gpui stub | L |
| CNF-07 | After a dialog from TAB-14, `overlay.close {id}` clears `roundup-confirm.open`, and the tab still exists. | commit f0ad009 | L3 | — | isolated Herdr | M |

## roundup-files (FIL)

Source keys: `PR #6 c <sha>` is a fix commit inside PR #6 whose message names the failure; `issue #8` lists the cases checked by hand after PR #6.

### Git state (git.js)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FIL-01 | `parseStatus` header: `# branch.head main` → head `main`; `(detached)` → head `HEAD`, detached; `# branch.ab +2 -1` → ahead 2, behind 1; `branch.upstream` without `branch.ab` → gone. | PR #6 body; RECIPE now | L1 | git-parse: "parseStatus reads the branch header: head, detached, ahead/behind, an upstream that is gone" | extract parsers into `git-parse.js` | H |
| FIL-02 | `readGit` in a repo with modified, staged, deleted, untracked and ignored files and an upstream 2 ahead gives the same 8 entries and ↑2 as `git status -sb`, also from a subfolder and with a space in a path. | PR #6 body (test plan) | L2 | git: "readGit lists the same entries as git status, with the branch 2 ahead, from the root and from a subfolder" | herdr stub; repo + bare upstream | H |
| FIL-03 | Letters: `??` → `?`/NEW; `A.` → `A`/NEW; `.M` → `M`/MODIFIED; `D` → `D`/DELETED; `u`, `UU`, `AA`, `DD` → `U`/MODIFIED; a folder takes its strongest child status (U > D > M/R/T > A/C > ?). | PR #6 body; RECIPE now | L1 | git-parse: "parseStatus gives each kind of change its letter and change", "parseStatus gives a folder its strongest child's letter…" | extract parsers | H |
| FIL-04 | `counts` holds [new, modified, deleted] for every folder above a path and for `""`; `records` counts status lines without the header. | PR #6 body | L1 | git-parse: "parseStatus counts [new, modified, deleted] in every folder above a path and in the whole; records skip the header" | extract parsers | M |
| FIL-05 | numstat: each file's `+N −N` is summed into its folders and `""`; binary `-` counts 0; paths outside the prefix are dropped; a user `diff.relative=true` still gives lines in a subfolder. | PR #6 c 404dd34; RECIPE now | L2 | git: "readGit sums numstat lines into folders, binary files count 0, a user's diff.relative=true changes nothing"; git-parse: "parseNumstat sums lines…" | herdr stub; repo with `diff.relative true` | H |
| FIL-06 | Before the first commit `diff HEAD` fails but status loads: no lines, `failed` false. | RECIPE now | L2 | git: "readGit before the first commit: status loads, no lines, not failed" | empty repo with new files | M |
| FIL-07 | `readGit` from `outer/deep/newdir` (never added) gives `rootUntracked`, `records: 1`, `counts.get("") = [1,0,0]`; from the repo root `rootUntracked` is false. | issue #8; PR #6 c bbee787 | L2 | git: "readGit in a folder never added (outer/deep/newdir) is rootUntracked with one record; the repo root isn't" | herdr stub; fixture | H |
| FIL-08 | An untracked repo inside the repo is one entry in `untracked` and one folder row in Changed that opens from disk, with no `nested/` file row. | issue #8; PR #6 c bbee787 | L2 | partly: git: "readGit lists an untracked repo inside the repo as one untracked folder, nothing below it" (the Changed row and opening it: main.js) | nested `git init` | H |
| FIL-09 | A submodule goes into `links`, shows as a folder row in Changed and opens from disk. | PR #6 c 7526a7e, d7efd20 | L2 | partly: git: "readGit puts a submodule into links" (the Changed row and opening it: main.js) | repo with submodule | H |
| FIL-10 | After `git rm --cached f`: letter `D`, not in `gone` (not struck through), counts as two changes, kept on purpose since git lists it twice. | PR #6 body; PR #6 c d7efd20; RECIPE now | L2 | git: "readGit after git rm --cached: letter D, not gone, two changes" | fixture | H |
| FIL-11 | A file deleted from the working tree is in `gone` and its Changed row is struck through. | RECIPE now | L2 | partly: git: "readGit puts a file deleted from the working tree into gone" (the struck-through row: main.js) | fixture | H |
| FIL-12 | An absent path below an untracked or ignored folder goes to `unsure`; after `kinds()`, missing → gone, a folder → `links`, an unchecked path (past 2,000, or a failed lookup) counts as present. | PR #6 c 7a6fe58, 47ad269 | L2 | partly: git: "readGit asks the disk about absent paths below an untracked folder…" (not the 2,000 cap) | `kinds` failure switch | H |
| FIL-13 | `parseIgnored` keeps `node_modules` as one entry, skips paths below an ignored folder, stops at 5,000; a new folder holding only ignored files (`logs/*`) comes as one dimmed path. | PR #6 c 70f8279; RECIPE now | L1 + L2 | git-parse: "parseIgnored keeps an ignored folder as one entry…"; git: "readGit keeps an ignored folder as one dimmed path, also a new folder of only ignored files" | extract parsers; `.gitignore` fixture | H |
| FIL-14 | A file added with `git add -f` inside an ignored folder, and its folders, are in `forced`: not dimmed, edits refresh at once. | PR #6 c c99c4c0; RECIPE now | L2 | partly: git: "readGit puts a file added with -f in an ignored folder, and its folders, into forced" (not dimmed, refresh: main.js) | extract `isIgnored`/`unseen` | H |
| FIL-15 | Shown folder inside an ignored folder: `rootIgnored`; `listFiles` gives null; Changed says "Git ignores this whole folder"; the source switch is hidden. | PR #6 c 6724dd7, 404dd34, 3cba73c | L2 | partly: git: "readGit and listFiles in a folder inside an ignored one: rootIgnored, and listFiles gives null" (note() and the switch: main.js) | extract `note()` | H |
| FIL-16 | An ignored path below an untracked folder is dimmed with no `?`. | PR #6 c 720403b | L1 | — | extract `rowStatus(git, rel)` | H |
| FIL-17 | A tracked link to a folder and an untracked path without `/` go to `maybeDirs`; when `kinds` says `d` they join `links` and open from disk as folders. | PR #6 c 720403b | L2 | partly: git: "readGit takes a tracked link to a folder and an untracked one as maybeDirs, and links when they are folders" (opening: main.js) | symlinks to folders | H |
| FIL-18 | With a stored `base`, a status path outside its prefix (a repo `git init`ed in between) makes `readGit` run again without `base`. | PR #6 c a36c37f; RECIPE now | L2 | git: "readGit with a stored base reads again without it when a repo was made in between" | fixture | H |
| FIL-19 | A failing status (corrupt `.git/index`) gives `failed`, not clean: "Git can't read this folder", and `ctx.base` is not kept. | PR #6 c a36c37f; RECIPE now | L2 | partly: git: "readGit with a corrupt index: failed, not clean" (the text and ctx.base: main.js) | corrupt index | H |
| FIL-20 | Outside a repo: `repo: false, known: true`, "Not a git repository"; when git doesn't start: `missing`, "Git not found". | PR #6 c 7a0d325; RECIPE now | L2 | partly: git: "readGit outside a repo: repo false, known; without git: missing" (the texts: main.js) | exec reject for `git` | M |
| FIL-21 | On Windows, when `git` doesn't start, `runGit` tries the two standard Git paths and keeps the first that works per machine; no fallback with `on`. | PR #6 c 7a0d325; RECIPE now | L2 | git: "runGit on Windows tries Git for Windows' two places and keeps the first that starts; not with on" (stubbed) | platform stub, exec recorder | M |
| FIL-22 | `rev-parse` output keeps leading and trailing spaces of folder names. | PR #6 c a36c37f | L2 | git: "readGit keeps leading and trailing spaces of folder names" | folder `" sp "` | M |
| FIL-23 | Every git call carries `--no-optional-locks -c core.fsmonitor=false -c diff.autoRefreshIndex=false -c diff.relative=false`, and `.git/index` mtime is unchanged after `readGit`. | RECIPE now; PR #6 body | L2 | git: "readGit passes the read-only flags to every git call and writes nothing under .git" | exec recorder | H |
| FIL-24 | `rev-parse` runs once per shown folder: a second refresh reuses `base`; a watch batch with `.git` drops it; a refresh overlapping such a drop doesn't store it. | PR #6 c f312f93; RECIPE now | L2 | — | main.js harness, exec recorder | M |
| FIL-25 | `parseStatus` keeps paths with spaces and with newlines (NUL records). | PR #6 body | L1 | git-parse: "parseStatus keeps paths with spaces and with line feeds" | extract parsers | M |

### Changed view and row marks

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FIL-26 | Changed lists exactly `git.files` as a tree with every folder open, folders first, natural order. | RECIPE now; PR #6 body | L1 | — | extract `changedRows` + `mixed` into `rows.js` | H |
| FIL-27 | With 2,501 changes Changed shows the first 2,000 paths plus their folders, sets `changedCut`, footer "Changed shows the first 2,000 paths"; counts stay 2,501; a search down to 1,100 drops the footer. | PR #6 c 06ddffc; RECIPE now | L1 | — | extract `changedRows` + footer | H |
| FIL-28 | An untracked folder or submodule row opens from disk and lists its disk entries plus git's paths below it that aren't on disk (as gone). | PR #6 c d7efd20; RECIPE now | L1 | — | extract `changedRows` | H |
| FIL-29 | A search in Changed filters git's paths by case-insensitive substring, opens every folder, and says "No matching changes" when nothing matches. | RECIPE now/old | L1 | — | extract `changedRows` + `note()` | M |
| FIL-30 | A tracked folder in Changed folds without reading the disk; toggling while a query is typed does nothing; opening one in Changed doesn't open its parents in All. | PR #6 c 7526a7e; RECIPE now | L2 | — | main.js harness | M |
| FIL-31 | Changed notes: "Reading git…"; "Not a git repository"/"Git not found"; "Git can't read this folder"; "This whole folder is new to git"; "Git ignores this whole folder"; "No changes". | PR #6 c bbee787; issue #8 | L1 | — | extract `note()` | H |
| FIL-32 | When the shown folder is new to git, every row in All gets `?`. | issue #8; PR #6 c bbee787 | L1 | — | extract `rowStatus` | H |
| FIL-33 | Status colors are theme names: D/U `ansi1`; ?/A/C `ansi2`; R `ansi4`; M/T `ansi3`; change colors [`ansi2`, `ansi3`, `ansi1`]. | PR #6 body; CLAUDE.md | L1 | — | extract `statusColor`/`changeColors` | M |
| FIL-34 | A file row shows `+N`/`−N` and a letter; a folder row a dot+count per nonzero kind, and `+N −N` only at width ≥ 360 (measured ÷ zoom). | RECIPE now; PR #6 c 0229d56 | L2 | — | gpui stub | M |
| FIL-35 | Branch row: "Reading git…"; "HEAD (detached)"; ↑/↓ only when nonzero; "upstream gone"; "clean" with no bar but its 4 px kept. | PR #6 c 69f04d5; RECIPE now | L2 | — | gpui stub | M |
| FIL-36 | The header's Changed tab shows `git.records`, nothing when 0. | RECIPE now | L2 | — | gpui stub | L |
| FIL-37 | Row ids are `rf-row-<rel>`: root folders named `source`, `rows`, `clear`, `menu` give no duplicate ids. | issue #8; PR #6 c bbee787 | L2 | — | gpui stub collecting ids | M |
| FIL-38 | Ignored rows have a `dim` name and a 0.5-opacity icon; gone rows are struck through. | RECIPE now | L2 | — | gpui stub | L |

### Listing and symlinks (disk.js, listing.js)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FIL-39 | `listScript` reports kinds d/f/D/F/B and targets for links to a file, to a folder, and a broken one. | PR #18 body | L1 | `kinds, names and targets` | — | H |
| FIL-40 | `listScript` leaves out `.git` (folder or worktree file) and includes `.x` and `..x`. | RECIPE now | L1 | partly: `kinds, names and targets` | fixture with `.git`, `..x` | M |
| FIL-41 | One `readlink` for all links through `xargs`, with a per-link fallback giving the same result (BusyBox). | PR #18 rc 4506237347 | L1 | `a readlink taking one path still gives every target`; `under any budget…` | — | H |
| FIL-42 | A line feed inside a target is kept. | PR #18 rc 4506237385 | L1 | `a line feed inside a target stays` | — | M |
| FIL-43 | 7 MiB byte budget: entries only whole, `+` when cut, a target that doesn't fit becomes `""`, names counted in bytes. | PR #18 rc 4506344137 | L1 | `a target is shown whole…`; `the budget ends the entries…`; `names count in bytes`; `the cut keeps links and targets together` | — | H |
| FIL-44 | A link past a folder one may not search is blocked, not broken; only the first 200 walked; HOPS 8; a shared blocked link read once; env marks move nothing. | PR #18 rc 4506237385 (1d92c6d) | L1 | `a link past a folder one may not search…` and 6 more | — | H |
| FIL-45 | `listDir` reads up to 10,000 entries, sorts folders first, cuts to 500 with `more`: in 1,200 files late folders and dotfiles stay; footer "Folders show their first 500 entries". | PR #6 c 09206e2, a36c37f; RECIPE now | L2 | partly: disk: "listDir reads every entry of a large folder, folders first, and cuts to 500 with more" (the footer: main.js) | herdr stub; 1,200 files | H |
| FIL-46 | `compare`: `file2` before `file10`, case-insensitive; digit runs past 2^53 ordered by digits, then length; folders first. | PR #6 c ffba978 | L1 | — | move `compare`/`sortEntries` herdr-free | M |
| FIL-47 | A missing folder: `listDir` throws; a failing root shows only the error and clears rows; a failing subfolder closes; `open()` failure notifies "Cannot open this folder". | PR #6 c 65d7bcb, 0229d56, 7526a7e | L2 | partly: `a missing folder fails` | main.js harness | H |
| FIL-48 | Windows `listDir`: only `SymbolicLink`/`Junction` reparse points are links (pnpm hard links stay files); unreadable target → `link ""`; budget → `cut`; `UnauthorizedAccessException` → blocked. | PR #18 rc 4506237251, 4506237304, 4506237455, 4506344137 | L2 | — | needs real PowerShell: out of scope while CI is macOS-only | H |
| FIL-49 | A remote `on` without sh: `listDir` and `kinds` fall back to PowerShell; `buildIndex` throws "Search can't read the disk without sh". | PR #6 c 028b202; RECIPE now | L2 | disk: "a machine without sh: listDir and kinds ask PowerShell, buildIndex says search can't read the disk" (stubbed) | exec throws for sh | M |
| FIL-50 | `kinds()` splits paths into pieces of ≤ 100,000 chars (Windows 24,000) run in turn; missing paths left out; a broken link counts as `f`. | PR #6 c f312f93, 404dd34 | L2 | disk: "kinds goes in pieces of at most 100,000 characters, one after another; missing paths are left out, a broken link is f" | exec recorder | M |
| FIL-51 | `linkTip`: "Link to X"; "Broken link to X"; "Link" for an empty target; "Link to X (no access to check it)". | PR #18 body; RECIPE now | L1 | — | extract `linkTip` | M |
| FIL-52 | A link row has an italic name and an `accent` arrow (`ansi1` when broken) with the tooltip; a broken link also a `dim` name and faded icon. | PR #18 body; RECIPE now | L2 | — | gpui stub | M |
| FIL-53 | The arrow sits right after the name (name `flex_shrink_1().min_w(0)` inside an `h_flex().flex_1().min_w(0)`). | PR #18 rc 4506237207 | L2 | — | gpui stub recording styles | M |
| FIL-54 | Search hits and git-only rows carry no `link`; rows in All and in folders Changed opens from disk do. | PR #18 rc 4506237552 | L1 | — | extract `diskRows`/`hitRows`/`changedRows` | M |
| FIL-55 | A link to a folder opens as a folder in the tree. | PR #18 body | L2 | — | main.js harness | M |
| FIL-56 | Italic and arrow look right in the running app. | PR #18 body (not tested then) | L3 | — | isolated Herdr; folder with links; shot | L |

### Search and index

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FIL-57 | Matching is case-insensitive, name matches before path-only matches, no duplicates, at most 200 with "First 200 matches". | PR #6 body; PR #6 c 55d6e62 | L1 | — | extract matching into `search.js` | H |
| FIL-58 | `hitRows`: hits as a tree, folders open and first; a path with matches below it is a folder even past the 20,000-folder index; a gone hit is struck through. | PR #6 c 09206e2; RECIPE now | L1 | — | extract `hitRows` | H |
| FIL-59 | After a search the cursor stays on a hit or a folder above one, else goes to the first hit; a quiet rerun scrolls only when the cursor changed. | PR #6 c 65d7bcb, 7526a7e | L1 | — | extract cursor rule | M |
| FIL-60 | `listFiles` lists tracked and untracked files without ignored ones; at 40,000 `full: false, cut: ["files"]`; a conflicted file once; a tracked link to a folder is a folder, an untracked one a file. | PR #6 body; PR #6 c 0229d56 | L2 | git: "listFiles lists tracked and untracked files without ignored ones, a tracked link to a folder as a folder", "listFiles lists a conflicted file once" | fixtures | H |
| FIL-61 | `listFiles` gives null outside a repo, without git, or in an ignored root, so search reads the disk. | PR #6 c 3cba73c, 6724dd7 | L2 | git: "listFiles gives null outside a repo and without git", "readGit and listFiles in a folder inside an ignored one…" | fixture | H |
| FIL-62 | `buildIndex` skips folders `node_modules`, `dist`, `build`, `vendor`… but indexes files with those names; never `.git`; a link to a folder counts as a folder without being followed. | PR #6 c 65d7bcb, 0229d56 | L2 | disk: "buildIndex skips folders like node_modules, dist, build, vendor but not files of those names, never .git, and takes a link to a folder as one" | fixture | H |
| FIL-63 | At home `~/Library`, `AppData`, `.Trash` are skipped at the top only; at `/` at any depth; depth 5 at home or `/`, else 12; a remote home from `printf "$HOME"`, once. | PR #6 c 62c14bc, a36c37f | L2 | disk: "buildIndex at home skips Library, AppData and .Trash at the top only and reads 5 levels; elsewhere 12", "buildIndex at / prunes…", "buildIndex on another machine learns its home once" | `home()` → temp dir | H |
| FIL-64 | More than 20,000 folders → `cut: ["dirs"]`; more than 40,000 files → `["files"]`; the footer names the limit. | PR #6 c ffba978, 62c14bc | L2 | partly: disk: "buildIndex cuts past 20,000 folders and past 40,000 files, and says which" (the footer: main.js) | large temp fixture; extract `limits()` | H |
| FIL-65 | The disk index is NUL-separated: a name with a newline is one entry. | PR #6 c 59bb1e9 | L2 | disk: "buildIndex keeps a name with a line feed as one entry" | fixture | H |
| FIL-66 | `buildIndex` on a missing folder throws "Cannot open this folder"; on Windows "Search can't read the disk on Windows yet". | issue #8; RECIPE now | L2 | disk: "buildIndex on a missing folder can't open it; on Windows it can't read the disk yet" | herdr stub | H |
| FIL-67 | `prunedName`, `prunedAbove`, `indexDepth`, `unindexed` agree with the rules above. | PR #6 c 0229d56, 65d7bcb | L1 | — | move herdr-free with `home` passed in | M |
| FIL-68 | Source: git in a repo reads `listFiles`; outside a repo or in an ignored root the disk; where the disk can't be read, git; with neither, "Not a git repository · Search can't read the disk on Windows yet". | PR #6 c 6724dd7, 3cba73c | L2 | — | extract `ensureIndex` decision + `gitReason` | H |
| FIL-69 | A failed index build shows only over the search; isn't retried per key while git is the same; is retried after git answers again; clears on clear-search and folder change. | PR #6 c 62c14bc, bbee787; issue #8 | L2 | — | main.js harness | H |
| FIL-70 | A search error or "Searching…" from folder A never shows after switching to folder B. | PR #6 c 028b202, ffba978 | L2 | — | main.js harness, delayed exec | H |
| FIL-71 | Switching git/disk mid-search keeps the old index until the new one is ready (`nested` stays a folder). | issue #8; PR #6 c bbee787 | L2 | — | main.js harness | H |
| FIL-72 | The source switch shows only in All, in a repo, not rootIgnored, not noDisk; click flips it; `source:git`/`source:disk` set and save it; an unknown value is ignored. | PR #6 body; RECIPE now | L2 | — | localStorage stub | M |
| FIL-73 | The input's `change` with text equal to the query doesn't search. | PR #6 c b0e88ae | L2 | — | InputState stub | M |
| FIL-74 | `index.lower` stays parallel to `index.all` through recheck adds and drops. | PR #6 c 55d6e62 | L1 | — | extract `applyRecheck` | M |
| FIL-75 | Watch-batch classification (stale/dirty/skip) for `""`, known folders, > 100 new paths, new disk folders, cut-short index, known files, pruned/too deep/ignored, `.gitignore`/`.git/info/exclude`/`.git/config` (stale), `.git/index` (dirty), other `.git/*` (nothing). | PR #6 c 91f10ff, 65d7bcb, 028b202, 0229d56, 720403b | L1 | — | extract `changed()` classification, `gitMeta`, `placeable` | H |
| FIL-76 | A new path is checked on its own and added (git: `ls-files`; disk: `kinds`); a temp file gone again comes out with what was added below it; no full rebuild. | PR #6 c 91f10ff | L2 | — | watchFolder stub, real repo | H |
| FIL-77 | `outdated`: stale and ≥ 3 s, or ≥ 5 min, or dirty and ≥ 30 s. | PR #6 c fca7352, 88405b2 | L1 | — | extract `outdated` with `now` | H |
| FIL-78 | A burst of changes gives one rebuild per 3 s; a deleted known file leaves the hits after 30 s without typing, not before. | PR #6 c fca7352, 88405b2; issue #8 | L2 | — | fake clock and timers | H |
| FIL-79 | A change during an index build makes the finished index dirty, judged by the source it was read from. | PR #6 c 7526a7e, ffba978 | L2 | — | slow exec | H |
| FIL-80 | When git's answer changes (`git init`, repo removed, root now ignored) or first comes, a git-sourced index is read again; a disk-fallback index isn't re-read on every refresh. | PR #6 c 47ad269 | L2 | — | main.js harness | H |
| FIL-81 | A recheck that would pass 40,000 files (disk: 20,000 folders) takes nothing, rebuilds, and the footer says the index was cut. | PR #6 c 720403b | L2 | — | main.js harness | M |
| FIL-82 | Rechecks run one at a time per index; a later batch's answer is never applied before an earlier one's. | RECIPE now | L2 | — | delayed exec | M |

### Watch, refresh and folder

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FIL-83 | `unseen`: a batch touching only ignored paths outside open folders doesn't refresh; outside a repo closed folders don't, except `.git/` (`git init`); forced files do; an empty batch or unplaceable path does. | PR #6 c 404dd34, c99c4c0; RECIPE now | L1 | — | extract `unseen` | H |
| FIL-84 | `realPath` resolves a link (`/tmp` → `/private/tmp`), gives null for the same path or a missing folder; watch paths under the resolved root are placed. | PR #6 c 62c14bc | L2 | — | herdr stub | H |
| FIL-85 | A refresh while one runs only marks another due: never two at once. | RECIPE now | L2 | — | main.js harness | M |
| FIL-86 | Editing and deleting a file in the shown folder shows in the panel without a restart. | PR #6 body; RECIPE now | L3 | — | isolated Herdr; panel shown; shot or debug dump | M |
| FIL-87 | Switching folders saves open folders, cursor and preview; returning restores them; at most 50 kept. | PR #6 c fca7352; RECIPE now | L2 | — | focused/panes/spaces fixtures | M |
| FIL-88 | `location()`: the focused terminal's cwd; for a mod pane the first terminal of its tab; in a tab without terminals the last folder shown in the space; else the space's first terminal with a cwd, else `space.folder`; `on` from `space.machine`. | PR #16 body; RECIPE now | L1 | — | extract `location()` | H |
| FIL-89 | Enter on a folder hit clears the search, opens it and its ancestors, puts the cursor on it and scrolls there. | PR #6 c 65d7bcb; RECIPE now | L2 | — | main.js harness | M |
| FIL-90 | All notes: "No folder", "Loading files…", "Empty folder", "Searching…", "No matches · ignored files left out" vs "No matches". | RECIPE now | L1 | — | extract `note()` | M |

### Keys and menu

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FIL-91 | `move`: ↑↓ ±1, PgUp/PgDn ±10, Home/End to the ends, clamped; with nothing selected down/Home start at the top, up/End at the bottom. | PR #6 body ("Home … jumped to the end; fixed") | L1 | — | extract index math | H |
| FIL-92 | → opens a closed folder or steps in; ← closes an open folder (not in hits, not in Changed with a query), else goes to the parent. | RECIPE now | L2 | — | main.js harness `key()` | M |
| FIL-93 | Enter/Space toggle a folder; Enter on a gone row notifies "… is no longer on disk"; `/` focuses the field; Esc clears the search; in the field Esc clears or gives focus back and ↑↓ move; in the panel preview Esc/←/Backspace close it; Cmd/Ctrl/Alt keys are ignored. | RECIPE now | L2 | — | main.js harness | M |
| FIL-94 | Enter in the field acts on the cursor row (else the first) and, for a file, gives the keyboard to the list. | PR #6 c 028b202; PR #16 rc 4504326825 | L2 | — | InputState `submit` | M |
| FIL-95 | `menuItems` per local file/remote/folder/gone, "Reveal in Finder" on macOS else "Show in folder"; `menuHeight` = 28·n + 9·(groups−1) + 10. | PR #6 body; RECIPE now; PR #6 c 65d7bcb | L1 | — | extract `menuItems` (platform param), `menuHeight` | H |
| FIL-96 | The popup writes `roundup-files.request {n, action, from, root, on, rel}`; only the copy with `uid` = `from` and the same root/on runs it, once per `n`. | PR #6 c 88405b2; issue #8; RECIPE now | L2 | — | two instances, shared fixture | H |
| FIL-97 | `join` uses `\` under `C:\` or `\\server` roots and `/` otherwise; Copy absolute path notifies "Copied". | PR #6 c ffba978 | L1 | — | extract `join` | M |
| FIL-98 | `sendToAgent` types into the focused pane's agent, else the tab's focused or first; path relative to its cwd, quoted with whitespace (`@"my notes.txt" `); none → "No agent in this tab"; the clipboard comes back after 600 ms only if unchanged. | PR #6 c 09206e2; RECIPE now | L2 | — | agents/panes/run fixtures, fake clipboard | H |
| FIL-99 | `openExternal`/`revealExternal`: macOS `open --` / `open -R --`; Windows `Invoke-Item`, `explorer.exe "/select,"`; Linux `xdg-open`; non-zero exit → "Could not open the file". | PR #6 c a36c37f, 7526a7e, 91f10ff | L2 | — | exec recorder | M |
| FIL-100 | Keyboard menu: below the row, above where it doesn't fit; ↑↓/Tab wrap; Home/End/PgUp/PgDn; Enter/Space run; Esc/←/Menu/Shift-F10 close; closes when its row moves, on wheel, on a press outside. | PR #6 body; PR #6 c 0229d56; RECIPE now | L1 + L2 | — | extract `keyMenuAt` | M |
| FIL-101 | `relTo`: under root → rel; equal → `""`; outside → null; `\` normalized; a trailing slash ignored. | actions.js | L1 | — | move `relTo` herdr-free | M |
| FIL-102 | `psQuote` doubles `'` and curly single quotes. | disk.js | L1 | — | move herdr-free | L |
| FIL-103 | `roundup-files.focus`, `search`, `view:all`, `view:changed`, `source:git`, `source:disk`, `menu` run with status clean; view and source persist across a restart. | RECIPE now; PR #6 body | L3 | — | isolated Herdr; panel shown first | M |
| FIL-104 | `mod.json` has `focusable: true`, `place: "none"`, `cloned_from files 0.1.13`; layout block `files` uses `roundup-files`. | PR #6 body; CLAUDE.md | L1 | — | static | M |
| FIL-105 | View and source persist in prefs; invalid saved values fall back to `all`/`git`. | PR #6 body; RECIPE now | L2 | — | localStorage stub | M |

### Panel preview, icons

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FIL-106 | `show()`: `\0` → "Binary file · no text preview"; null → "This file is no longer available"; > 400,000 chars cut with "… (file truncated)"; language from the file name. | PR #6 c 028b202; RECIPE now | L2 | — | readTextFile + EditorState stubs | M |
| FIL-107 | Opening A, closing it and opening A again before the first read ends leaves at most one unreleased `EditorState`. | issue #8; PR #6 c bbee787 | L2 | — | EditorState stub counting `release()` | H |
| FIL-108 | `iconFor("constructor")`, `"__proto__"`, `"foo.constructor"` give the generic file icon, a folder `constructor` the generic folder. | PR #6 rc 4499340962 | L1 | — | — | H |
| FIL-109 | `iconFor`: case-insensitive; a path rule beats the name; a name beats its extension; the longest extension wins; the whole name counts as an extension; an open folder without its own open icon shows the closed one. | PR #6 body; icon.js | L1 | — | — | M |
| FIL-110 | Every id in `icons.js` has `icons/<id>.svg`; `.css`, `.html`, `.php`, `.vue` get non-generic icons; `icons/LICENSE` exists. | PR #6 body; RECIPE now | L1 | — | static | M |
| FIL-111 | `THIRD_PARTY_NOTICES.md` names `link.svg` (Lucide) and `fonts/Geist-Italic.ttf` with `fonts/OFL.txt`, and both files exist. | PR #18 rc 4506237521 | L1 | — | static | L |

## Opening files: roundup-files → roundup-preview (OPN, FLT, WIN)

### Float vs tab

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| OPN-01 | A single click on a file, no window open, only moves the cursor: no `openOverlay`, no `run`. | RECIPE now; PR #16 rc 4504147816 | L2 | — | extract click decision `clickAction` | H |
| OPN-02 | `floatSpec({file,on,token})` is `{kind:"window", key:"roundup-preview", mod:"roundup-preview", width:0.6, height:0.75, props:{file,on,float:token}}`, `on` defaulting to null. | RECIPE now | L1 | — | — | M |
| OPN-03 | A double-click writes FLOAT `{file,on,token}` before `openOverlay(floatSpec)`, then adds `id`, keeping a `copy` the window wrote in between. | RECIPE now | L2 | partly: "replacing a window: the new copy's record keeps its copy…" | herdr stub | H |
| OPN-04 | With the window open, a double-click on the file it shows opens nothing again: one `openOverlay` for presses 1+2. | PR #16 rc 4503805795 | L2 | — | herdr + gpui stub | H |
| OPN-05 | A triple-click leaves exactly one window open: the third press neither closes nor reopens it. | PR #16 rc 4503805795 | L2 | — | herdr + gpui stub | M |
| OPN-06 | A Cmd-double-click (Ctrl elsewhere) runs `tab.new {name: basename, mod:"roundup-preview", props:{file,on,token}}`, and its first press doesn't make an open window follow. | RECIPE now | L2 | partly: "openCommand: split modes and the props a tab gets" | herdr + gpui stub | H |
| OPN-07 | A Cmd-double-click on the file the window shows sets FLOAT null, `closeOverlay(id)`, then opens the tab. | RECIPE now | L2 | — | herdr stub | M |
| OPN-08 | Enter on a file opens the tab; on a folder toggles it; on a deleted file toasts "Deleted file … is no longer on disk" and opens nothing. | RECIPE now | L2 | — | herdr + gpui stub | M |
| OPN-09 | Space on a file opens the window, again on the same file closes it, on another file replaces it. | RECIPE now | L2 | — | herdr + gpui stub | M |
| OPN-10 | Esc closes the window only while `isOpen(FLOAT)`; with an unanswered probe it falls through to clearing the search. | RECIPE now; PR #16 rc 4504326704 | L2 | — | herdr + gpui stub | M |
| OPN-11 | Context menu items per file/folder/deleted file, Open and Reveal local only. | RECIPE now | L1 | — | extract `menuItems(m, mac)` (same as FIL-95) | M |
| OPN-12 | A menu request runs only in the copy whose `uid` = `from` with the same root and `on`; float and tab run deferred in `cx.spawn`, not inside `render`. | PR #16 rc 4503805893; RECIPE now | L2 | — | cx.spawn recorder | H |
| OPN-13 | While a preview tab is focused, the tree keeps the last terminal folder of that space; before any, the first terminal with a cwd, else `space.folder`. | PR #16 body; RECIPE now | L1 | — | extract `location()` (same as FIL-88) | H |
| OPN-14 | Opening `a.md` in a tab gives a tab "a.md" with a roundup-preview pane, and OPEN names it; a second open adds no tab and focuses it. | PR #16 body; RECIPE Done when | L3 | — | debug command `roundup-files.tab:<rel>`; fixture folder | H |
| OPN-15 | A float debug command makes status list a `roundup-preview` overlay; FLOAT has `id`, `token`, `copy`; `overlay.close {id}` clears FLOAT. | RECIPE now | L3 | — | debug command `roundup-files.float:<rel>` | H |

### Reuse and duplicate tabs (open-file.js)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| OPN-20 | `previewId`: one key for `C:\repo\b.md` and `c:/REPO/b.md`, different keys per machine, POSIX case kept. | PR #16 rc 4504309188 | L1 | `previewId: one key per file and machine…` | — | H |
| OPN-21 | `shownIn` returns a recorded pane only if alive and showing the file now (MOVED, else its first file), on the same machine. | PR #16 rc 4503805603 | L1 | `shownIn: a live pane…`; `shownIn: a tab is found by the file it followed a link to` | — | H |
| OPN-22 | MOVED is per token: an unrecorded second tab of the same file doesn't change what the recorded tab shows. | PR #16 rc 4504147671 | L1 | `MOVED is per tab…` | — | H |
| OPN-23 | Opening `a.md` again after its tab followed a link records the new tab; later clicks focus it; `b.md` still finds the old tab. | PR #16 rc 4503805603 | L1 | `remember: a tab that moved on stays…` | — | H |
| OPN-24 | `remember` drops OPEN entries of dead or replaced panes with their MOVED, keeps MOVED for tokens OPEN never named and the new token's early MOVED. | PR #16 rc 4503805847, 4505948223 | L1 | `remember: drops dead panes…` | — | H |
| OPN-25 | `madePane`: `{}` for two new preview panes, ignores non-preview panes, `{wait:true}` while none came; `openTab` then records nothing. | PR #16 rc 4503805676 | L1 | partly: `marked and madePane: an overlap records nothing` | — | H |
| OPN-26 | Overlapping opens record nothing rather than a wrong pane, also when the second pane comes late; after SPAN (10 s) a new open records again. | PR #16 rc 4504122495, 4504219871 | L1 | `openTab: overlapping opens with a late second pane…`; `marked and madePane…` | — | H |
| OPN-27 | A recorded open sets its OPENING `until` to now, so an open 1 s later without overlap is still recorded. | PR #16 rc 4504147635 | L1 | — | — | H |
| OPN-28 | `openTab` looks up to 5 times 200 ms apart, records the pane when it comes, calls `done` once, leaves `until: null` when the pane comes after the last look. | PR #16 rc 4504122495 | L1 | `openTab: a new tab with a token…`; `openTab: a pane later than five looks…` | — | H |
| OPN-29 | When a tab already shows the file, `openTab` only runs `pane.focus`, calls `done` at once, writes no OPENING and no `tab.new`. | RECIPE now | L1 | partly: `openTab: a new tab with a token…` | — | M |
| OPN-30 | Tabs recorded under `open.v2` are found with their MOVED; the first `open.v3` record takes them over and clears `open.v2`. | RECIPE now | L1 | `upgraded…`; `openTab after the upgrade…` | — | M |
| OPN-31 | Shared key names stay `roundup-preview.float`, `.open.v3`, `.moved.v2`, `.opening` (`.open.v2` read only). | RECIPE now | L1 | `shared keys keep their names` | — | M |
| OPN-32 | `roundup-files/open-file.js` and `paths.js` are byte copies of roundup-preview's. | PR #16 body; RECIPE now | L1 | `roundup-files' open-file.js is a copy…`; `roundup-files' paths.js is a copy…` | — | H |

### Floating window state (FLOAT)

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| FLT-01 | `isOpen`, `answered`, `unanswered`, `fresh` follow the probe rules (own token+copy, open probe only). | PR #16 rc 4504410643 | L1 | `isOpen…`; `answered…`; `unanswered…`; `a window copy that starts during a probe…`; `two panel copies ask…` | — | H |
| FLT-02 | A panel copy starting with FLOAT set writes a fresh probe and clears FLOAT after 1,500 ms if unanswered; until answered no click, ↑↓ or Space opens a window. | PR #16 rc 4504326704, 4504410643 | L2 | partly: `a saved answer from the last run doesn't count…` | timers | H |
| FLT-03 | A panel copy starting with FLOAT unset, or a window answering within 1,500 ms, leaves FLOAT intact. | PR #16 rc 4504147734, 4504309260 | L2 | — | herdr stub | H |
| FLT-04 | The window copy writes FLOAT on start only when it is null or holds its own token. | PR #16 rc 4504309260 | L2 | partly: `replacing a window…` | load preview.js | H |
| FLT-05 | The window's 500 ms timer writes FLOAT only while a probe is open. | PR #16 rc 4504410643 | L2 | partly: `answered…` | herdr stub | M |
| FLT-06 | The window's `close()` sets FLOAT null only while it holds its token and copy. | PR #16 rc 4504309260 | L2 | — | extract `releasesFloat` (preview.js:168) | H |
| FLT-07 | With the window open a click on another file re-opens it at once; ↑↓ follow after 150 ms of rest (holding ↓ over 5 rows → one `openOverlay`); opening or closing cancels a pending follow; folders and deleted files are skipped. | PR #16 rc 4503805747, 4504122545 | L2 | — | fake timer | H |
| FLT-08 | After the window follows a link or goes Back, FLOAT.file is the shown file (only while it holds its token); a Windows `/`-spelled path matches its `\` row. | PR #16 rc 4504147701, 4504219483 | L1 | — | extract `floatShows(f, file, on)` into open-file.js (both copies) | H |
| FLT-09 | The window never writes MOVED; only a tab with a token does. | PR #16 rc 4503805636 | L2 | — | herdr stub | H |
| FLT-10 | With the window open, reinstalling roundup-files keeps FLOAT and answers the probe; a stale FLOAT after a restart with no window is gone within ~1.5 s. | PR #16 rc 4504309260, 4504410643 | L3 | — | float debug command; mod reload | M |

### Window: Open in tab, keyboard

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| WIN-01 | Open in tab runs `openTab` in the window copy with `space = focused().space`; `tab.new` goes out at once; `closeOverlay` only from `done`; a second press is ignored. | PR #16 rc 4504147784, 4504326745, 4504410737 | L2 | — | herdr + gpui stub | H |
| WIN-02 | Open in tab, when a tab already shows the file, focuses it and closes the window at once. | RECIPE now | L2 | — | herdr stub | M |
| WIN-03 | A press in the window's controls or body focuses its handle and stops propagation, unless a `keepsKeys` child (PDF Go to, read-only Editor) handled it first. | PR #16 rc 4504147571, 4504309105 | L2 | — | gpui stub running child then parent | H |
| WIN-04 | A press on the header's free part focuses the handle without stopping propagation (drag still works), and Esc then closes the overlay. | PR #16 rc 4504147832, 4504219696 | L2 | — | gpui stub | H |
| WIN-05 | In the window name and folder are plain text and Open in tab/Close show; a tab has the copiers and neither button nor Esc handler. | RECIPE now | L2 | — | gpui stub | L |
| WIN-06 | From the window, Open in tab opens the tab, then the overlay is gone, FLOAT is null and OPEN names the new pane. | PR #16 rc 4504410737; RECIPE Done when | L3 | — | float debug command; a `to-tab` debug command in the overlay copy | H |

## roundup-preview (LNK, VW, CHG, MNU, PTH)

### Links and navigation

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| LNK-01 | `resolveLink`: empty → `{error:"Empty link"}`; `#h` → `{anchor:"h"}`; `?q` → `{anchor:""}`; http/https/mailto in any case → `{url}`. | RECIPE now | L1 | — | — | H |
| LNK-02 | Relative links resolve against the document (`../x/c.md#Intro` → `{file:"/x/c.md", anchor:"Intro"}`); a query is dropped; `%20` decoded; a bad `%` → "This link has an invalid path". | RECIPE now | L1 | — | — | H |
| LNK-03 | Other schemes are refused (`ftp:`, `javascript:` → "Can't open …: links here"); a Windows drive isn't taken for a scheme. | RECIPE now | L1 | — | — | H |
| LNK-04 | `file:///etc/hosts` and `file://localhost/etc/hosts` → `/etc/hosts`; in a Windows document `file:///D:/x.md` → `D:/x.md`, `/top.md` → `C:/top.md`. | RECIPE now | L1 | — | — | M |
| LNK-05 | From a Windows document a link to `\\other\s\x.md` → "Can't open links to another computer"; within `//srv/sh/` it resolves. | RECIPE now | L1 | — | — | H |
| LNK-06 | `navigate` pushes the current file onto history; Back pops it with the anchor cleared; ← only with history, tooltip "Back to <name>". | RECIPE now | L2 | — | herdr + gpui stub | M |
| LNK-07 | Showing another file resets the header size until `wc -c` answers; a reload keeps it; a late answer for the previous file is dropped and its viewer state released. | PR #16 rc 4504326783, 4504410831 | L2 | — | deferred exec | M |
| LNK-08 | A Markdown link click: url → `cx.open_url`; file → `navigate`; a known anchor shows from that heading; an unknown one → "No such heading here"; an error → "Can't open this link". | RECIPE now | L2 | — | extract `linkAction` | M |
| LNK-09 | A tab copy that starts again shows its token's MOVED file, a window copy FLOAT.file when FLOAT holds its token. | RECIPE now; PR #16 rc 4504309188 | L1 | — | extract `startFile(props, float, moved)` into open-file.js | H |
| LNK-10 | A tab without a token writes nothing to MOVED on `navigate` or Back. | RECIPE now | L2 | — | herdr stub | M |

### Viewers per kind

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| VW-01 | `viewerFor`: md/markdown/mdx → markdown; pdf; csv/tsv → table; json; png/jpg/jpeg/gif/webp/svg/bmp/tiff/heic → image; case ignored; `.env`, no extension, anything else → code. | RECIPE now | L1 | — | — | M |
| VW-02 | `languageOf` maps ts/tsx/mjs/jsx → js, yml/toml → yaml, sh/zsh → bash, py → python, unknown → itself, else "text"; `basename` handles `\` and a trailing slash. | kinds.js | L1 | — | — | L |
| VW-03 | Markdown slugs follow GitHub (lower case, punctuation dropped, link text and Unicode letters kept, spaces → dashes, duplicates `-1`, `-2`); `Constructor`/`toString` don't hit Object.prototype. | PR #16 rc 4505948187 | L1 | partly: `splitBlocks: a heading named like an Object property…` | — | H |
| VW-04 | `splitBlocks` cuts around images (also linked ones) but not inside inline code; fenced code stays whole (closing fence same char, at least the same length); reference definitions go to every text block; an empty file → `[{text:""}]`. | markdown-blocks.js; RECIPE now | L1 | — | — | M |
| VW-05 | `imageNote`: web image "on the web" / "loading…" / "couldn't load"; local "not found" or its failure. | markdown-blocks.js | L1 | — | — | L |
| VW-06 | Markdown load: prune runs before the first stage whenever there is any image; local images are staged, a remote document's aren't; web images aren't fetched until "Load them". | PR #16 rc 4505948261; PR #16 body; RECIPE Watch out | L2 | — | exec recorder | H |
| VW-07 | A Markdown reload keeps Raw, ToC and the heading shown from, refetches loaded web images; ToC only with > 1 heading and not in Raw. | RECIPE now | L2 | — | herdr + gpui stub | M |
| VW-08 | `fetchImage` names each download uniquely; a non-image MIME removes it and throws "Not an image (<mime>)"; the POSIX command has `--proto =https --proto-redir =https --max-time 10 --max-filesize 5242880`. | PR #16 rc 4505948202, 4505990760; RECIPE Watch out | L1 + L2 | — | move `key()` out of media.js | H |
| VW-09 | `imageExtension` maps png/jpeg/gif/webp/svg+xml (with parameters, any case) to extensions, else null. | mime.js | L1 | — | — | M |
| VW-10 | PDF: a remote file → "PDF previews work for files on this computer only"; prune before render; zero pages → "This PDF has no pages"; at most 500 slots with "Showing the first 500 of N pages"; zoom kept on reload. | PR #16 rc 4503805973, 4504031181; RECIPE now | L2 | — | exec returns PDFKit JSON | H |
| VW-11 | PDF renders missing pages in batches of 6, first from the page jumped to; stops after release; a failed batch shows its error. | RECIPE now | L2 | — | extract `nextBatch` | M |
| VW-12 | PDF Go to: "12" jumps to page 12 clamped to 1..count and empties the field; non-numbers ignored; ‹ › inactive at the ends. | RECIPE now; PR #16 rc 4504309105 | L2 | — | extract `jump` clamp | M |
| VW-13 | `pdfPages` rejects a page path outside `data/roundup-preview/`; the macOS message loses its "execution error: Error:" prefix and "(-2700)"; a poppler "password" error → "This PDF is password protected"; empty stderr → "Cannot render this PDF". | PR #16 body | L1 | — | — | H |
| VW-14 | `popplerPages` reads Pages, Stamp and sizes, swaps width/height at 90/270°, names pages `data/roundup-preview/<key>-<stamp>-p<n>.png`. | programs.js | L1 | — | — | M |
| VW-15 | `pictureSize` reads sips and `file` output ("480 x 270", "480x270"), skipping JPEG density and BMP resolution; zeros when no size is named. | programs.js | L1 | — | — | M |
| VW-16 | `svgSize` ignores `stroke-width`, accepts `px`, falls back to the viewBox (spaces or commas), then 300×150, matches `<svg:svg>`, 0×0 without an svg tag. | PR #16 rc 4505948234 | L1 | partly: `svgSize: stroke-width is no width` | — | M |
| VW-17 | Image: remote → "Image previews work for files on this computer only"; prune before stage; toolbar `W × H`; Fit never above 100 %; 0×0 → "This image format can't be shown"; zoom kept on reload. | RECIPE now | L2 | — | extract `fit` | M |
| VW-18 | Zoom steps 25…400 %: from Fit at 60 %, + → 75 %, − → 50 %; stops at 25 % and 400 %; the middle returns to Fit. | RECIPE now | L1 | — | extract `next` from viewers/zoom.js | M |
| VW-19 | CSV/TSV: tab for .tsv; `;` when the first record has more `;` than `,` outside quotes; RFC 4180 quotes; a last `""` record is a row; columns over all rows; widths from the first 200, clamped 48..360. | PR #16 rc 4505948143, 4505948166; RECIPE now | L1 | `delimiterOf…`; `parseDelimited: quotes…`; `parseDelimited: a last record…`; `columnWidths…` | — | H |
| VW-20 | Table toolbar "N+ rows × M columns", `+` past 100,000 rows or when cut at 1 MiB; first row is the header; Raw of a cut file carries the note. | RECIPE now; PR #16 rc 4505991102 | L2 | — | extract summary | M |
| VW-21 | `json-tree`: `flatten` summaries "{ 1 key }" / "[ 2 items ]"; pointers escape `~`/`/` and `valueAt` round-trips; `containers(v,1)` holds root and first level; `toggleDeep` opens or closes a branch. | RECIPE now | L1 | — | — | M |
| VW-22 | JSON viewer: root and first level open; invalid JSON shows Raw and "Invalid JSON: <msg>"; a BOM is stripped; a reload keeps open rows and Raw; Collapse all leaves only the root. | RECIPE now | L2 | — | herdr + gpui stub | M |
| VW-23 | Text: null → "This file is no longer available"; NUL → "Binary file · no text preview"; non-UTF-8 → "Binary or non-UTF-8 file · no text preview"; over 1 MiB code and table read the head cut back to whole lines. | text-file.js; RECIPE now | L1 + L2 | — | move `checked` to text-file.js | H |
| VW-24 | Code view: over 400,000 chars, or any cut text however short, ends with "… (file truncated)". | PR #16 rc 4505948247, 4505991102 | L2 | — | extract value builder | H |
| VW-25 | `formatSize`: 0 → "0 B", 1023 → "1023 B", 1536 → "1.5 KB", 10240 → "10 KB", stops at GB, a non-number → "". | RECIPE now | L1 | — | — | L |
| VW-26 | Header copiers: the name copies the basename, the folder the native path, each with a toast. | RECIPE now | L2 | — | gpui stub | L |
| VW-27 | `tab.new --mod roundup-preview` for .md (with a local SVG), .pdf (2 pages), .png, .csv, .json and .ts renders in a shot with status clean. | PR #16 body; RECIPE Done when | L3 | — | fixtures; isolated Herdr | H |
| VW-28 | `herdr-app check` passes for roundup-preview. | CLAUDE.md | L3 | — | isolated install | M |

### File changes and cache

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| CHG-01 | `changedFile` matches the file, its folder, the same file through a resolved folder (`/private/tmp`), and Windows verbatim paths. | RECIPE now | L1 | `changedFile: the file, or its folder…`; `changedFile: … through a resolved link` | — | H |
| CHG-02 | A `watchFolder` result naming the file reloads it, keeping the old view until the new is ready and Raw, zoom, open JSON rows and heading; a sibling's change doesn't reload. | RECIPE now | L2 | — | controllable watchFolder | H |
| CHG-03 | `realFile` resolves the folder through `pwd -P`, null when the same; a remote file isn't watched. | RECIPE now | L2 | — | temp symlinked folder | M |
| CHG-04 | When `watchFolder` rejects, the stamp is polled every 3 s; a change reloads; the poll stops on navigate and close. | RECIPE now | L2 | — | fake timer | M |
| CHG-05 | The STAGE script copies to `<key>-<mtime ns+size>.<ext>`, touches an existing copy with `-c`, copies again one pruned in between, reports GONE for a missing source; an edit within the same second gives a new name. | PR #16 rc 4505948213, 4506011450; RECIPE now | L2 | — | real sh on temp dirs | H |
| CHG-06 | Prune deletes only files older than 14 days in `data/roundup-preview/` and is awaited before staging or rendering. | PR #16 rc 4505948213, 4505990837 | L2 | — | real `find` on aged files | H |
| CHG-07 | `key()` (FNV-1a, base 36) is stable per path and differs for two. | media.js | L1 | — | move `key` to a pure file | L |
| CHG-08 | Rewriting an open .md on disk changes the shown content within ~1 s, Raw still on. | PR #16 body; RECIPE now | L3 | — | debug readout of the loaded revision | M |

### ⋯ menu, editor, external programs

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| MNU-01 | `commands`: macOS editor/open/reveal (`open`, `open -R`); Linux editor always, open/reveal only with xdg-open; Windows powershell; remote none (only the copy items). | RECIPE now | L1 | — | — | M |
| MNU-02 | `revealLabel`: "Reveal in Finder" (mac), "Open containing folder" (linux), "Show in Explorer" (windows). | platform.js | L1 | — | — | L |
| MNU-03 | The editor script opens `$VISUAL`, else `$EDITOR`, drops `--wait`/`-w`, honours quoting, accepts an unquoted path with spaces, falls back to the opener for an empty or unparseable value. | RECIPE now | L2 | — | real sh; fake editor scripts | H |
| MNU-04 | `powershell(...)` passes each value as `[char[]]` codes and its scripts contain no `"`. | platform.js | L1 | — | — | M |
| MNU-05 | `openInEditor` on a remote file throws "Open in editor works for files on this computer only"; a non-zero exit toasts "Couldn't open the editor". | editor.js; menu.js | L2 | — | herdr stub | L |
| MNU-06 | `relativePath`: from the git root when it holds the file, else `~/…`, else absolute; case-insensitive on Windows. | RECIPE now | L1 + L2 | — | — | M |

### Paths

| ID | Behaviour | Source | Level | Covered | Needs | Prio |
|---|---|---|---|---|---|---|
| PTH-01 | `samePath`/`pathKey`: Windows ignores case and `\` vs `/`, resolves `.`/`..`, verbatim `\\?\`, UNC; POSIX keeps case and a `\` in a name. | PR #16 rc 4504219483, 4504309188 | L1 | `Windows paths…`; `POSIX paths keep case…` | — | H |
| PTH-02 | `localPath` turns `//etc/x` into `/etc/x` off Windows; `native` turns `/` into `\` on Windows only; `dirname` of `/a` is `/`, of `C:/a` is `C:/`. | paths.js | L1 | partly: `POSIX paths keep case…` | — | M |

---

## Extraction candidates

Each extraction moves logic out of a `main.js` (or a file importing `herdr`/`gpui`) into a herdr-free file. A file shared by two mods must stay byte-identical in both, with a copy test and the `cmp` in `sync.sh`.

- **roundup-files**
  - `git.js` → `git-parse.js`: `parseHeader`, `parseIgnored`, `parseForced`, `parseStatus`, `parseNumstat`, `emptyGit`, `dirOf`, `ancestors`, `within`, the status constants.
  - `disk.js`: `compare`, `sortEntries`, `psQuote`, `prunedName`/`prunedAbove`/`indexDepth` (home passed in).
  - `actions.js`: `relTo`.
  - `main.js` → `rows.js`: `diskRows`, `hitRows`, `changedRows` + `mixed`, `isIgnored`/`underUntracked`, `rowStatus(git, rel)`.
  - `main.js` → `search.js`: matching, cursor rule, `outdated` (now passed in), `gitMeta`, `unindexed`, `placeable`, `unseen`, the `changed()` classification, `applyRecheck`, the `ensureIndex` decision + `gitReason`.
  - `main.js` → `panel-text.js`: `note()`, footer lines, `limits`/`thousands`, `linkTip`, `statusColor`/`changeColors`.
  - `main.js` → menu and keys: `menuItems` (platform param), `menuHeight`, `keyMenuAt`, the index math of `move`.
  - `main.js` → `location.js`: `location()` with spaces/panes/focused/lastRoot injected.
  - `main.js`: `join`; the click decision `clickAction(r, n, tab, floatsIt)`.
- **roundup-preview**
  - `open-file.js` (both copies): `floatShows(f, file, on)`, `startFile(props, float, moved)`, `releasesFloat(f, float, copy)`.
  - `viewers/`: `zoom.js` `next`, `image.js` `fit`, `pdf.js` `jump` and `nextBatch`, `table.js` summary, `markdown.js` link decision and image classification, `json.js` initial expansion and fold-all.
  - `text.js`: `checked` and the truncation value into `text-file.js`. `media.js`: `key`.
- **roundup-workspace-chrome**: `update.js` → `version.js` (`newer`, tag parse, `brief`, `pick`); `main.js` `isClick`, `herdrVersion`, brand sub line, toggle width; `info.js`/`menu.js` `when`, `infoHeight`, `menuHeight`.
- **roundup-spaces**: `alpha`, the porcelain v2 and rev-parse parsers out of `check()`, git-line text, badge, `rebuilt`, `place`/`where`, palette assignment, card grouping, `arrange`/`drop` arithmetic.
- **roundup-pane**: `paneId`, `folder` (home passed in), the name cut of `saveName`.
- **close.js / menu.js** (pane + tabs): test through the herdr stub rather than extract; export the menu row heights for PAN-13.

## Not tested, on purpose

- **Rejected or superseded review findings:**
  - PR #16 rc 4503805715: "No change needed"; later fixed through rc 4504147734 and the probe (FLT-02/03).
  - PR #16 rc 4504326660: superseded, `checkFloat` was removed in 4b41eaa.
  - PR #16 rc 4504309330: the handoff was reverted in 4b41eaa.
  - PR #18 rc 4506237489: refactor only.
- **Known gaps, kept as they are:**
  - PR #16 rc 4504147635: one overlap stops recording for ~10 s (issue #17); only "never a wrong pane" is tested (OPN-26).
  - PR #16 rc 4503805795: the triple-click flash with the window closed remains.
  - PR #18 rc 4506237385: macOS `readlink` can't keep a trailing line feed.
  - PR #6 body: `set_value("")` during render, open folders loading in parallel, five git reads per refresh.
- **Docs and refactors without behaviour:**
  - PR #16 rc 4504147816, 4504326825, 4504326879, 4504147862, 4503805939, 4504147898.
- **Windows:** FIL-48 and the Windows halves of FIL-21, FIL-49, FIL-66, CHR-14 and MNU-01 need real PowerShell; while CI is macOS-only they run only with stubs, if at all.

## Open questions

- `resolveLink("/r/a.md", "file://host/x")` gives `{file:"/host/x"}`: a file URL naming another host becomes a local path on POSIX. Refuse it, as Windows shares are, before writing that row?

## RECIPE.md drift found while building this

Fixed with this catalog: `cmd-shift-w` goes to `roundup-tabs.close-pane` (not `roundup-pane.close`); roundup-pane's overlay is 240×332; `closePane(pane)` has no `name` and roundup-pane has no key command loop.
