# Herdr Roundup 0.8.0

Files now open in a real preview. A double-click in the Files panel shows a file in a floating window over the layout; a Cmd-double-click opens it in a tab of its own. Markdown is rendered, PDFs and pictures are drawn, CSV and JSON get their own views, and everything else shows as code.

![Herdr Roundup](https://raw.githubusercontent.com/carstenlucke/herdr-roundup/v0.8.0/preview.png)

## Highlights

- **A floating preview:** double-click a file, or press Space, and it opens in a window over the layout. While the window is open, it follows the selection in the Files panel.
- **Preview tabs:** Cmd-double-click (Ctrl on Windows and Linux) or Enter opens a file in a tab of its own. A file that already has a tab brings that tab to the front instead of opening a second one.
- **A viewer for each kind of file:** rendered Markdown, PDF pages, pictures, CSV and TSV tables, a JSON tree, and read-only code for the rest.
- **Previews stay current:** a preview reloads when the file changes on disk, and a preview tab still shows its file after a restart.

## Files panel

- **Click** selects a file. **Double-click** or **Space** shows it in the floating preview. **Cmd-double-click** or **Enter** opens it in a preview tab.
- While the floating preview is open, it follows the selection: right away on a click, and once you stop on ↑ ↓, so holding an arrow key doesn't open a preview for every row on the way.
- The right-click menu has **Quick look**, **Open in tab** and **Preview in panel**. Preview in panel is the panel's own read-only view from 0.7.0.
- With a preview tab in front, the panel keeps showing the terminal's folder instead of jumping elsewhere.
- **Esc** closes the floating preview.

## Floating preview

- Opens at 60% × 75% of the window, centered the first time. After that it opens where you last left it.
- Drag it by its header. **Open in tab** moves the file into a tab (or to the tab that already shows it), and **Close** or Esc closes the window.

## Preview tabs

- The tab is named after the file. Its header shows the name, the folder and the size: click the name to copy it, click the folder to copy the full path.
- **⋯** opens the file in your editor (`$VISUAL` or `$EDITOR`, otherwise the default app), opens it with the default app, reveals it in Finder, or copies its path.
- A tab that followed a link to another file remembers that file: it comes to the front when you open that file again, and after a restart it shows the file it was showing.

## What the preview shows

- **Markdown:** rendered, with local images drawn inline, a table of contents, and Preview | Raw.
  - Links to web pages and mail addresses open in your system. A link to a local file opens in the same preview, and ← brings you back. `#heading` links jump to that heading.
  - Web images load only after you click **Load them**, so opening a document doesn't tell an image's host that you are reading it.
- **PDF:** every page, with ‹ › and Go to for jumping, and zoom from 25% to 400%. Pages render in batches, up to 500 pages.
- **Pictures:** fitted to the window, with their pixel size and zoom.
- **CSV and TSV:** a table with a fixed header row, row numbers, and Table | Raw. Semicolon-separated files are recognized.
- **JSON:** a tree that opens and closes row by row (alt-click opens or closes a whole branch), plus Raw.
- **Everything else:** read-only code with syntax colors. A file that is too large to show in full says so.
- Files on another machine show in the text viewers (Markdown, CSV, JSON, code); pictures and PDFs preview only for files on this computer.

## Before you update

For the person, or the agent, installing this release:

- `scripts/sync.sh` replaces the layout file, every `roundup-*` mod, the repo's themes and the `layout:Herdr-Roundup` section of `keys.json`, as in 0.7.0. It now also installs the new `roundup-preview` mod. Edits you made to those files are lost. Your global keys, other layouts and Herdr's own mods stay untouched.
- No key changes in this release.
- **What the new mod reaches:**
  - `roundup-preview` reads the file it shows and the local images that a Markdown file names.
  - It writes only to its cache in the Herdr home, `data/roundup-preview/`, and clears out entries older than 14 days.
  - It downloads a Markdown file's web images (https only, up to 5 MB, 10 s timeout) only after you click **Load them**.
  - Programs it runs:
    - on macOS: `sips` and PDFKit (through `osascript`)
    - on Linux: `file`, `pdftoppm` and `pdfinfo`
    - on Windows: PowerShell
    - everywhere: `curl` (for the web images), and your editor when you choose Open in editor.
- **Linux:** PDF previews need `pdftoppm` and `pdfinfo` from poppler-utils; without them, a PDF preview says so.
- **Known limit:** when you open files in tabs less than ten seconds apart, a later click on one of them may open a second tab instead of bringing the first one to the front. Herdr doesn't yet tell a mod which pane it just opened; the layout will catch up once it does.
- The preview is based on the `file-preview` mod from gsydler/herdr-cria (Apache-2.0); `THIRD_PARTY_NOTICES.md` lists it.
