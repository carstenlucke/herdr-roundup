// roundup-files: the side panel's file browser. The focused pane's folder as a tree with
// Symbols icons and git state (each path's status, folders' counts, +/− lines, a branch
// row), a switch between all files and the changed ones, search across folders not yet
// opened, keyboard navigation, a context menu, and bounded read-only previews. A click on a
// file selects it, a double-click shows it in roundup-preview's floating window, a
// Cmd-double-click (Ctrl off macOS) or Enter in a tab of its own; Space opens and closes the window.
//
// Modified from Herdr's shipped `files` mod 0.1.13 (Apache-2.0). Parts follow
// cybertron288/herdr-mods `filetree` (MIT, (c) 2026 cybertron288), itself a port of
// claude-code-filetree (MIT, (c) 2026 Kurt Buhler): rows from a virtual list, search tree,
// keys, the context menu as a popup of this mod. See THIRD_PARTY_NOTICES.md.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, InputState, Input, Scrollbar, Popup, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, focused, readTextFile, watchFolder, theme, settings, window, props, notify, openOverlay, closeOverlay, shared, setShared, nextCommand, run } from "herdr";
import { iconFor, rootIcon } from "./icon.js";
import { listDir, buildIndex, diskSearch, kinds, prunedName, realPath, homeOf, PER_FOLDER, INDEX_DIRS, INDEX_PATHS } from "./disk.js";
import { readGit, listFiles, emptyGit, NEW, MODIFIED, DELETED } from "./git.js";
import { openExternal, revealExternal, copy, sendToAgent } from "./actions.js";
import { dirOf, baseOf, ancestors, relTo, join } from "./tree.js";
import { diskRows, hitRows, changedRows, rowStatus, CHANGED_LIMIT } from "./rows.js";
import { match, cursorAfter, outdated, classify, applyRecheck, STALE_AGE, FIND_LIMIT } from "./search.js";
// A copy of roundup-preview's: how it opens and which pane already shows a file. sync.sh
// checks that the two copies match.
import { FLOAT, openTab, timerOf, floatSpec, newToken, isOpen, unanswered, placed } from "./open-file.js";
// Also roundup-preview's: the window writes a followed link's path in its own form (/ on Windows).
import { samePath } from "./paths.js";

const NAME = "roundup-files";
const ICON = (name) => `mods/${NAME}/${name}.svg`;
// A link row's tooltip: where it points, as written.
const linkTip = (r) => `${r.broken ? "Broken link" : "Link"}${r.link ? ` to ${r.link}` : ""}${r.blocked ? " (no access to check it)" : ""}`;
const ROW = 26;
// How many folders keep their open folders, cursor and preview while another one shows.
const SAVED = 50;
// How long ↑ ↓ rest on a row before the floating window follows to it.
const FOLLOW_MS = 150;
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js", toml: "yaml", yml: "yaml", jsonc: "json", svelte: "html", vue: "html", htm: "html", sh: "bash", zsh: "bash" };
const VIEWS = [["all", "All"], ["changed", "Changed"]];
// The menu's height: 28 per entry, 9 per divider, 5 of padding above and below.
const menuHeight = (groups) => groups.reduce((n, g) => n + g.length, 0) * 28 + (groups.length - 1) * 9 + 10;
// What search in All reads: git's files (without ignored ones; the disk outside a repo and in
// an ignored folder) or the disk (everything but the pruned folders).
const SOURCES = ["git", "disk"];
// Shared: what the context menu (a popup copy of this mod) asks the panel to do. `from` names
// the panel copy that opened it: every shown copy reads the request, only that one runs it.
const REQUEST = `${NAME}.request`;

const message = (e) => String(e?.message ?? e);
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// What cut an index short, for the footer: "the first 20,000 folders and the first 40,000 files".
const limits = (cut = []) => cut.map((c) => (c === "dirs" ? `the first ${thousands(INDEX_DIRS)} folders` : `the first ${thousands(INDEX_PATHS)} files`)).join(" and ") || "part of this folder";
// Why a folder has no repo: git found none, or no git started there.
const noRepo = (g) => (g.missing ? "Git not found" : "Not a git repository");
const GIT_FAILED = "Git can't read this folder";
// Git's colors: new green and deleted red, as in Herdr's `files` and `changes`; modified
// yellow (ansi3) rather than their `blocked`, which many themes draw close to red.
const statusColor = (t, s) => (!s ? null : s === "D" || s === "U" ? t.ansi1 : s === "?" || s === "A" || s === "C" ? t.ansi2 : s === "R" ? t.ansi4 : t.ansi3);
const changeColors = (t) => [t.ansi2, t.ansi3, t.ansi1]; // NEW, MODIFIED, DELETED

// The last terminal folder shown per space, with its machine: for a tab of mod panes only
// (a preview tab), which has no folder. space.folder is only where the space's first shell
// started, so without this a click on a file would send the tree to another folder.
const lastRoot = new Map();

// The focused pane's folder; when the focused pane is a mod, the first terminal of its tab;
// in a tab without one, the folder last shown in this space.
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  let pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  if (pane && !pane.terminal) pane = panes().find((p) => p.tab === pane.tab && p.terminal && p.cwd) ?? null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const cwd = pane?.cwd || f?.cwd;
  if (cwd) { if (space) lastRoot.set(space.id, { cwd, on }); return { cwd, on }; }
  if (!space) return { cwd: null, on };
  const tabs = new Set(space.tabs.map((t) => t.id));
  return lastRoot.get(space.id) ?? { cwd: panes().find((p) => p.terminal && p.cwd && tabs.has(p.tab))?.cwd || space.folder || null, on };
}

// The context menu's entries for one path, in groups. `local`: on this computer.
function menuItems(m) {
  const mac = window()?.platform === "macos";
  return [
    [!m.dir && !m.gone && ["float", "Quick look"],
      !m.dir && !m.gone && ["tab", "Open in tab"],
      !m.dir && !m.gone && ["preview", "Preview in panel"],
      m.local && !m.dir && !m.gone && ["open", "Open with default app"],
      m.local && !m.gone && ["reveal", mac ? "Reveal in Finder" : "Show in folder"]],
    [["copy-rel", "Copy relative path"], ["copy-abs", "Copy absolute path"]],
    [["send", "Send @path to agent"]],
  ].map((g) => g.filter(Boolean)).filter((g) => g.length);
}

export default class Files extends View {
  init(_props, cx) {
    this.menu = props()?.menu ?? null;
    if (this.menu) return;
    this.handle = cx.focus_handle();
    this.scroll = VirtualListScrollHandle.new();
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem("prefs") ?? "{}"); } catch {}
    this.view = VIEWS.some(([v]) => v === prefs.view) ? prefs.view : "all";
    this.source = SOURCES.includes(prefs.source) ? prefs.source : "git";
    this.saved = new Map();
    this.width = 368; this.measuredWidth = null; this.query = ""; this.hits = null; this.searchSeq = 0; this.shown = [];
    this.seenRequest = shared(REQUEST)?.n ?? 0;
    this.uid = newToken();
    // A floating window can outlive this copy's start (the mod reloaded); one gone with a restart,
    // a layout switch or a crash leaves FLOAT behind, as FLOAT is saved: askFloat tells them apart.
    if (shared(FLOAT)) this.askFloat(cx);
    this.input = InputState.new({ placeholder: "Search files" });
    // Only a change of the text searches: reset() empties the field while drawing, where
    // search's notify would be refused, and has emptied this.query already.
    this.input.on("change", (_e, cx) => { const v = this.input.value(); if (v !== this.query) this.search(v, cx); });
    this.input.on("submit", (_e, cx) => {
      const r = this.shown.find((x) => x.rel === this.cursor) ?? this.shown[0];
      // A file opens in a roundup-preview tab: the list takes the keyboard back from the field, so
      // the panel's keys (Space, Esc, arrows) apply when it comes back.
      if (r && !r.dir) this.handle.focus();
      this.activate(r, cx);
    });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.reset(null, null);
    cx.timer.every(10000, (cx) => {
      this.refresh(cx);
      // A known file or folder changed while no other change came after it: the hits may still
      // list it (a folder's hold normally reads it again before this).
      if (this.index && (this.index.dirty || this.index.stale) && outdated(this.index, Date.now())) this.searchAgain(cx);
    });
    // Commands (keys.json: "roundup-files.<command>"). "focus" also comes from Herdr: pane.go
    // moved onto this panel (mod.json "focusable"), or a popup over it closed.
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "focus") this.handle.focus();
        else if (c === "search") { this.closePreview(); this.input.focus(); }
        else if (c.startsWith("view:")) this.setView(c.slice(5), cx);
        else if (c.startsWith("source:")) this.setSource(c.slice(7), cx);
        else if (c === "menu") { const r = this.shown.find((x) => x.rel === this.cursor); if (r && !this.file) this.openKeyMenu(r); }
        cx.notify();
      }
    });
  }

  setView(view, cx) {
    if (view === this.view || !VIEWS.some(([v]) => v === view)) return;
    this.view = view;
    this.savePrefs();
    this.hits = null; this.searchSeq++;
    if (this.query.trim()) this.search(this.query, cx);
    this.scrollTo = this.cursor || null;
    cx.notify();
  }

  // The index of the other source is read on the next search (ensureIndex compares sources);
  // a search typed already reruns. The old index stays until then: the hits shown still need
  // its folders.
  setSource(source, cx) {
    if (source === this.source || !SOURCES.includes(source)) return;
    this.source = source;
    this.savePrefs();
    if (this.query.trim() && this.view === "all") this.search(this.query, cx);
    cx.notify();
  }

  savePrefs() {
    try { localStorage.setItem("prefs", JSON.stringify({ view: this.view, source: this.source })); } catch {}
  }

  // ── the folder shown ─────────────────────────────────────────────────────────────────
  // Each folder keeps its open folders, cursor and preview while another one shows: the last
  // SAVED of them (the Map's order is the order they were left in).
  reset(root, on) {
    if (this.ctx?.root) {
      this.saved.delete(this.ctx.key);
      this.saved.set(this.ctx.key, { folders: this.folders, shut: this.shut, cursor: this.cursor, file: this.file });
      if (this.saved.size > SAVED) this.saved.delete(this.saved.keys().next().value);
    }
    const key = JSON.stringify([root, on]), s = this.saved.get(key);
    // noDisk: buildIndex can't read the disk here (Windows; found out later: no sh).
    // base: where the repo is (readGit); drops: how often a `.git` change dropped it.
    // real: root with links resolved, as the watch reports it (watch). failed: the last index
    // build that failed, kept while git's answer is the same one (ensureIndex).
    this.ctx = { key, root, on, noDisk: !diskSearch(on), base: null, drops: 0, real: undefined, failed: null }; this.root = root; this.on = on;
    this.kmenu = null;
    this.entries = new Map(); this.folders = new Set(s?.folders); this.shut = new Set(s?.shut); this.pending = new Set();
    // searchSeq++: a search still running for the folder before ends without a word here.
    this.cursor = s?.cursor ?? ""; this.git = emptyGit(); this.index = null; this.indexing = null; this.hits = null; this.searchError = null;
    this.searchSeq++; this.searching = false;
    this.error = null; this.limited = false; this.loading = false; this.again = false; this.watched = null;
    this.scrollTo = this.cursor || null;
    if (this.query) { this.query = ""; this.input?.set_value(""); }
    this.closePreview();
    return s?.file ?? null;
  }

  current(ctx) { return this.ctx === ctx; }

  sync(cx) {
    const { cwd, on } = location();
    if (cwd === this.root && on === this.on) return;
    const file = this.reset(cwd, on);
    this.refresh(cx);
    if (file) this.show(file, cx, true);
  }

  refresh(cx) {
    if (!this.root) return;
    if (this.loading) { this.again = true; return; }
    const ctx = this.ctx;
    this.loading = true;
    // A `.git` change during this read (changed() counts them) leaves its repo unremembered.
    const drops = ctx.drops;
    cx.spawn(async (cx) => {
      try {
        // The open folders and git at once; a folder that fails closes, the root fails all.
        const [more, git] = await Promise.all([
          Promise.all(["", ...this.folders].map((path) => this.loadFolder(path, ctx).catch((e) => {
            if (!path) throw e;
            if (this.current(ctx)) { this.folders.delete(path); this.entries.delete(path); }
            return false;
          }))),
          readGit(ctx.root, ctx.on, ctx.base),
        ]);
        if (!this.current(ctx)) return;
        // Where the repo is: rev-parse runs once per folder shown (readGit's `base`).
        // Not after a failed status: the next read asks rev-parse again, rather than status twice.
        if (ctx.drops === drops) ctx.base = git.repo && !git.failed ? { top: git.top, prefix: git.prefix } : null;
        const limited = more.some(Boolean), prev = this.git;
        this.git = git; this.limited = limited; this.error = null;
        if (git.known && (!prev.known || prev.repo !== git.repo || prev.rootIgnored !== git.rootIgnored)) this.regit(cx);
        this.watch(cx);
      } catch (e) { if (this.current(ctx)) { this.error = message(e); this.git = emptyGit(true); this.entries = new Map(); } }
      finally {
        if (this.current(ctx)) {
          this.loading = false;
          if (this.again) { this.again = false; this.refresh(cx); }
        }
        cx.notify();
      }
    });
  }

  // Git's answer about the shown folder changed (a repo made or removed, the folder now ignored
  // or no longer), or came for the first time: an index for search from git, or one being
  // built, may have been read from the wrong source (git's files or the disk): it is read again.
  // Not when its source differs from what git says (ensureIndex reads the disk where git can't
  // list): that would read it again on every refresh.
  regit(cx) {
    if (this.indexing?.source === "git") this.indexing.regit = true;
    const i = this.index;
    if (i?.source === "git") { i.stale = true; i.at = 0; this.searchAgain(cx); }
  }

  // Lists one folder; answers whether it held more than PER_FOLDER.
  async loadFolder(path, ctx) {
    const { entries, more } = await listDir(join(ctx.root, path), ctx.on);
    if (!this.current(ctx) || (path && !this.folders.has(path))) return false;
    this.entries.set(path, entries);
    return more;
  }

  // Local folders refresh when something under them changes; other machines on the timer.
  // A folder reached through a link (/tmp, a linked project) is reported resolved: changed()
  // places paths against both.
  watch(cx) {
    if (this.on || this.watched === this.root) return;
    const ctx = this.ctx, root = this.root;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        if (ctx.real === undefined) ctx.real = await realPath(root).catch(() => null);
        while (this.current(ctx)) {
          const paths = await watchFolder(root);
          if (!this.current(ctx)) return;
          this.changed(paths, cx);
        }
      } catch { if (this.current(ctx)) this.watched = null; }
    });
  }

  // A batch of the folder watch (search.js's classify has the rules): the index goes stale
  // (read again once STALE_AGE old, reindex), dirty (once DIRTY_AGE old) or checks paths on
  // their own (recheck); the tree refreshes unless the batch changed nothing it shows. Only
  // the .git in the shown folder is watched: in a worktree (.git is a file there), below a
  // repo's top folder and for a global excludes file, the index catches such a change only
  // once it is INDEX_AGE old.
  changed(paths, cx) {
    const index = this.index;
    const { shown, drops, recheck } = classify(paths, { root: this.root, real: this.ctx.real, home: homeOf(this.on), git: this.git, folders: this.folders, index, job: this.indexing });
    if (drops) { this.ctx.base = null; this.ctx.drops += drops; } // a repo made or removed here: rev-parse again
    if (recheck.length) this.recheck(index, recheck, cx);
    if (index) this.reindex(index, cx);
    if (shown) this.refresh(cx);
  }

  // Reads the index again when it is due. A stale one younger than STALE_AGE is read once
  // that has passed (one hold per index), so a build making folders costs one read per 3 s.
  reindex(index, cx) {
    if (outdated(index, Date.now())) { this.searchAgain(cx); return; }
    if (!index.stale || index.held) return;
    index.held = true;
    cx.timer.after(STALE_AGE - (Date.now() - index.at), (cx) => { if (this.index === index && outdated(index, Date.now())) this.searchAgain(cx); });
  }

  // Reads what rels are now and puts that into the index: a new file goes in (from git, with
  // what git lists below a new folder and the folders above), one it took in this way and
  // that is gone comes out. A new folder from the disk, or a failed read, reads the index again;
  // a folder named like a pruned one is left out, as the index leaves it out.
  // One read at a time per index, so a later batch's answer never comes in before an earlier one's.
  recheck(index, rels, cx) {
    for (const rel of rels) index.pending.add(rel);
    if (index.checking) return;
    index.checking = true;
    const ctx = this.ctx;
    cx.spawn(async (cx) => {
      let moved = false;
      try {
        while (index.pending.size && !index.stale && this.current(ctx) && this.index === index) {
          const next = [...index.pending];
          index.pending.clear();
          const r = await this.recheckOnce(index, next, ctx);
          if (r === "stale") index.stale = true;
          else if (r === "moved") moved = true;
        }
      } finally { index.checking = false; index.pending.clear(); }
      if (!this.current(ctx) || this.index !== index) return;
      if (index.stale) this.reindex(index, cx);
      else if (moved) this.searchAgain(cx);
    });
  }

  // One read for recheck: "stale" when the index has to be read again, "moved" when it
  // changed, else "same".
  async recheckOnce(index, rels, ctx) {
    let files = [], dirs = [];
    try {
      if (index.from === "git") {
        const r = await listFiles(ctx.root, ctx.on, INDEX_PATHS, rels);
        if (!r || !r.full) return "stale";
        files = [...r.files]; dirs = [...r.dirs];
      } else {
        for (const [rel, kind] of await kinds(ctx.root, rels, ctx.on)) {
          if (kind === "d" && prunedName(ctx.root, rel, ctx.on)) continue;
          if (kind === "d") return "stale";
          files.push(rel);
        }
      }
    } catch { return "stale"; }
    if (!this.current(ctx) || this.index !== index || index.stale) return "same";
    return applyRecheck(index, rels, files, dirs);
  }

  // A search rerun in the background: the list keeps its scroll unless the cursor's row went.
  searchAgain(cx) { if (this.query.trim() && this.view === "all") this.search(this.query, cx, true); }

  toggle(r, cx) {
    if (!r?.dir || r.gone) return;
    if (this.hits) { this.reveal(r.rel, true, cx); return; }
    // Changed: a folder git lists file by file folds; an untracked one or a submodule opens
    // from disk. A search there opens every folder: nothing to fold until it is cleared.
    if (this.view === "changed" && !r.disk) {
      if (this.query.trim()) return;
      if (this.shut.has(r.rel)) this.shut.delete(r.rel); else this.shut.add(r.rel);
    } else if (this.folders.has(r.rel)) {
      for (const f of [...this.folders]) if (f === r.rel || f.startsWith(r.rel + "/")) { this.folders.delete(f); this.entries.delete(f); }
    } else this.open([r.rel], cx, null, false); // a row shown: its folders are open already (in Changed, git's)
    cx.notify();
  }

  // Opens folders (and, with parents, their folders) and loads what they hold.
  open(paths, cx, then, parents = true) {
    const ctx = this.ctx, todo = [];
    for (const p of paths) for (const d of parents ? [...ancestors(p).reverse(), p] : [p]) if (d && !this.folders.has(d)) { this.folders.add(d); todo.push(d); }
    cx.spawn(async (cx) => {
      // All at once: each is its own read (on another machine, its own round trip).
      await Promise.all(todo.map(async (d) => {
        if (!this.current(ctx) || this.entries.has(d) || this.pending.has(d)) return;
        this.pending.add(d);
        try { if (await this.loadFolder(d, ctx)) this.limited = true; }
        catch (e) {
          if (!this.current(ctx)) return;
          this.folders.delete(d);
          notify({ title: "Cannot open this folder", body: `${d}: ${message(e)}`, level: "warning", timeout: 3000 });
        }
        finally { if (this.current(ctx)) this.pending.delete(d); }
      }));
      if (this.current(ctx)) then?.();
      cx.notify();
    });
  }

  // Shows rel in the tree without a search: its folders open, the cursor on it.
  reveal(rel, openIt, cx) {
    if (this.query) this.clearSearch(cx);
    this.cursor = rel;
    this.open(openIt ? [rel] : ancestors(rel), cx, () => { this.scrollTo = rel; });
  }

  // ── search ───────────────────────────────────────────────────────────────────────────
  // All: every path below the folder, from an index (git ls-files or find). Changed: git's paths.
  search(query, cx, quiet = false) {
    this.query = query;
    const q = query.trim().toLowerCase(), seq = ++this.searchSeq;
    if (!q || this.view !== "all") { this.hits = null; this.searching = false; this.scrollTo = this.cursor || null; cx.notify(); return; }
    const ctx = this.ctx;
    this.searching = true; this.searchError = null;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const index = await this.ensureIndex(ctx);
        if (seq !== this.searchSeq || !this.current(ctx)) return;
        // index.lower: index.all in lower case, made once per index, not per keystroke.
        this.hits = match(index, q);
        const { cursor, scroll } = cursorAfter(this.hits, this.cursor, quiet);
        this.cursor = cursor;
        if (scroll) this.scrollTo = cursor;
      } catch (e) { if (seq === this.searchSeq && this.current(ctx)) { this.hits = []; this.searchError = message(e); } }
      finally { if (seq === this.searchSeq) this.searching = false; cx.notify(); }
    });
  }

  // What search in All reads here: the choice, but git's files where the disk can't be read.
  searchSource() { return this.ctx.noDisk ? "git" : this.source; }

  // One index build per source at a time; searches typed meanwhile wait for it. `from`: what
  // it was read from ("disk" also when git was asked for outside a repo or in a folder it
  // ignores). Where the disk can't be read, git's files; where git has none either, an error
  // that says why. A build that failed isn't tried again on the next keystroke: its error
  // stands until git answers again (the next refresh: a watch batch or the 10s timer).
  // Where git has said it has no files here (no repo, no git, root ignored), it isn't asked.
  ensureIndex(ctx) {
    const i = this.index, source = this.searchSource(), f = ctx.failed;
    if (i && i.source === source && !outdated(i, Date.now())) return Promise.resolve(i);
    if (f && f.source === source && f.git === this.git) return Promise.reject(f.error);
    if (this.indexing?.source !== source) {
      const job = { source };
      job.promise = (async () => {
        const g = this.git, ignored = g.known && g.repo ? g.rootIgnored : undefined;
        const files = () => (g.known && (!g.repo || g.rootIgnored) ? null : listFiles(ctx.root, ctx.on, INDEX_PATHS, undefined, ignored));
        let fromGit = source === "git" ? await files() : null, built = fromGit;
        if (!built) {
          try { built = await buildIndex(ctx.root, ctx.on); }
          catch (e) {
            if (!e?.noIndex) throw e;
            ctx.noDisk = true;
            if (source === "disk") built = fromGit = await files();
            if (!built) throw new Error(this.current(ctx) && this.gitReason() ? `${this.gitReason()} · ${e.message}` : e.message);
          }
        }
        const index = { dirs: built.dirs, all: built.all, lower: built.all.map((rel) => rel.toLowerCase()), full: built.full, cut: built.cut, files: built.all.length - built.dirs.size, source: ctx.noDisk ? "git" : source, from: fromGit ? "git" : "disk", known: new Set(built.all), added: new Set(), pending: new Set(), checking: false, at: Date.now(), stale: false, held: false, dirty: Boolean(fromGit ? job.changedGit : job.changedDisk) };
        // Git's answer changed during the build (regit): the next search, or the timer, reads it again.
        if (job.regit) { index.stale = true; index.at = 0; }
        if (this.current(ctx) && this.searchSource() === index.source) this.index = index;
        return index;
      })()
        .catch((e) => { if (this.current(ctx)) ctx.failed = { source, git: this.git, error: e }; throw e; })
        .finally(() => { if (this.current(ctx) && this.indexing === job) this.indexing = null; });
      this.indexing = job;
    }
    return this.indexing.promise;
  }

  // Why git's files can't serve a search here, once git has answered.
  gitReason() {
    const g = this.git;
    return !g.known ? "" : g.rootIgnored ? "Git ignores this folder" : g.repo ? "Git can't list this folder" : noRepo(g);
  }

  clearSearch(cx) {
    this.query = ""; this.hits = null; this.searchSeq++; this.searching = false; this.searchError = null;
    this.input.set_value("");
    this.scrollTo = this.cursor || null;
    cx.notify();
  }

  // ── rows ─────────────────────────────────────────────────────────────────────────────
  // The rows shown (rows.js); changedCut: Changed left paths out.
  rows() {
    const q = this.query.trim().toLowerCase();
    this.changedCut = false;
    if (this.error) return []; // the folder failed to load: only the error shows
    const tree = { entries: this.entries, folders: this.folders, shut: this.shut };
    if (this.view === "changed") { const { rows, cut } = changedRows(this.git, q, tree); this.changedCut = cut; return rows; }
    if (this.hits) return hitRows(this.hits, this.index?.dirs ?? new Set(), this.git.gone);
    return diskRows(tree);
  }

  // ── preview ──────────────────────────────────────────────────────────────────────────
  closePreview() {
    this.code?.release();
    this.code = null; this.file = null; this.fileError = null;
  }

  // inRender: called while drawing (a request from the menu, a folder shown again), where
  // notify is refused.
  show(rel, cx, inRender = false) {
    this.closePreview();
    this.file = rel;
    const ctx = this.ctx;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(join(ctx.root, rel), { on: ctx.on });
        if (this.file !== rel || !this.current(ctx)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        // Two loads of the same file (closed and opened again meanwhile): keep one editor.
        this.code?.release();
        const t = theme(), name = baseOf(rel), ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === rel && this.current(ctx)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
    if (!inRender) cx.notify();
  }

  // A click on a row, `n` the presses in a row, `tab` with Cmd (Ctrl off macOS) held. A folder
  // opens or closes on the first; a file gets the cursor (and the floating window, when it is
  // open, follows), the second shows it in the floating window. With `tab` the first only
  // selects and the second opens a tab (closing the window if it shows that file).
  click(r, n, cx, tab = false) {
    if (!r) return;
    this.cursor = r.rel;
    if (r.dir || r.gone) { if (n === 1) this.activate(r, cx); return; }
    if (n === 1) { if (tab) this.stopFollow(); else this.follow(cx); }
    else if (n === 2 && tab) { if (this.floats(r.rel)) this.closeFloat(); this.openPreview(r.rel, cx); }
    else if (n === 2) { if (!this.floats(r.rel)) this.openFloat(r.rel); }
  }

  // ── floating preview ─────────────────────────────────────────────────────────────────
  // One window for the whole app (one key): opening it again replaces it where it was. FLOAT
  // names it; the window's own copy clears FLOAT when it closes (× , Esc, Open in tab).
  openFloat(rel) {
    this.stopFollow();
    const file = join(this.root, rel), on = this.on ?? null;
    // The new token goes in first: a window copy that starts inside openOverlay writes its record
    // (its `copy`, by which it answers a probe) only over its own token, and keeps it then.
    const token = newToken(), record = { file, on, token };
    setShared(FLOAT, record);
    const id = openOverlay(floatSpec(record));
    setShared(FLOAT, placed(shared(FLOAT), { ...record, id }));
  }

  // Whether the window FLOAT names is still there, asked once at start: mods can't list overlays.
  // A fresh probe, always (an answer may be saved from the last run); the window's copy answers
  // from a timer within 500ms. Until then isOpen() is false: nothing follows the cursor. Unanswered
  // after 1500ms, FLOAT goes, unless a newer probe (another panel copy) or window took it since.
  askFloat(cx) {
    const probe = newToken();
    setShared(FLOAT, { ...shared(FLOAT), probe });
    cx.timer.after(1500, () => { if (unanswered(shared(FLOAT), probe)) setShared(FLOAT, null); });
  }

  closeFloat() {
    this.stopFollow();
    const f = shared(FLOAT);
    if (!f) return;
    setShared(FLOAT, null);
    try { closeOverlay(f.id); } catch {}
  }

  // The window shows `rel` of this folder now.
  floats(rel) {
    const f = shared(FLOAT);
    return isOpen(f) && Boolean(f.file) && samePath(f.file, join(this.root, rel)) && (f.on ?? null) === (this.on ?? null);
  }

  // While the window is open it follows the cursor, as Quick Look follows the selection. From
  // the keyboard (`wait` ms) only where the cursor stops: holding ↓ would open the window on
  // every row, and a PDF renders each time. The timer checks the cursor and FLOAT again when it
  // fires; opening or closing the window, or a click, cancels it.
  follow(cx, wait = 0) {
    this.stopFollow();
    const now = () => {
      const r = this.shown.find((x) => x.rel === this.cursor);
      if (isOpen(shared(FLOAT)) && r && !r.dir && !r.gone && !this.floats(r.rel)) this.openFloat(r.rel);
    };
    if (!wait || !isOpen(shared(FLOAT))) { now(); return; }
    this.following = cx.timer.after(wait, () => { this.following = null; now(); });
  }

  stopFollow() {
    this.following?.cancel();
    this.following = null;
  }

  // Enter, a click on a folder: a file opens in roundup-preview's tab, a folder opens or closes;
  // neither when it is gone.
  activate(r, cx) {
    if (!r) return;
    this.cursor = r.rel;
    if (r.gone) notify({ title: r.dir ? "Deleted folder" : "Deleted file", body: `${r.rel} is no longer on disk`, level: "info", timeout: 2500 });
    else if (r.dir) this.toggle(r, cx);
    else this.openPreview(r.rel, cx);
  }

  // A file in roundup-preview: the pane already showing it comes to the front, else a new tab,
  // recorded (shared OPEN) so the next click on the file finds it (open-file.js's openTab).
  openPreview(rel, cx) {
    openTab({ panes, run, shared, setShared }, join(this.root, rel), this.on ?? null, timerOf(cx));
  }

  // ── context menu ─────────────────────────────────────────────────────────────────────
  menuOf(r) {
    return { from: this.uid, root: this.root, on: this.on, rel: r.rel, abs: join(this.root, r.rel), dir: r.dir, gone: r.gone, local: !this.on };
  }

  // A right-click: the menu as a popup of this mod, at the pointer.
  openMenu(r) {
    const m = this.menuOf(r);
    openOverlay({ mod: NAME, kind: "popup", width: 228, height: menuHeight(menuItems(m)), props: { menu: m } });
  }

  // The Menu key, Shift-F10, the `menu` command: the panel draws the menu itself, pinned below
  // the selected row (keyMenu), so it opens there and not at the pointer. ↑ ↓ pick, Enter runs.
  openKeyMenu(r) {
    const at = this.shown.findIndex((x) => x.rel === r.rel);
    if (at < 0) return;
    const m = this.menuOf(r);
    this.kmenu = { m, items: menuItems(m).flat(), at: 0, row: at, depth: r.depth };
    this.scroll.scroll_to_item(at, "center");
    this.handle.focus();
  }

  closeKeyMenu() { this.kmenu = null; }

  // What the keyboard menu runs: here, in the panel.
  runKeyMenu(id, cx) {
    const m = this.kmenu?.m;
    this.kmenu = null;
    if (!m) return;
    if (id === "copy-rel") copy(cx, m.rel);
    else if (id === "copy-abs") copy(cx, m.abs);
    else this.request({ action: id, rel: m.rel }, cx);
    cx.notify();
  }

  // Where the keyboard menu hangs in the list's box: below its row's name. openKeyMenu centred
  // the row, so with the list's height its place is known: in the middle, or at the top or
  // bottom when the list can't scroll that far. Null before the list was measured.
  // (A virtual list's rows can't hold the menu: they take no click handlers.)
  keyMenuAt(n) {
    const k = this.kmenu;
    if (!this.listHeight) return null;
    const h = this.listHeight / this.zoom() - 4; // the list, inside the box's bottom padding
    const offset = Math.max(0, Math.min(k.row * ROW + ROW / 2 - h / 2, n * ROW - h));
    const top = k.row * ROW - offset, left = 4 + 8 + k.depth * 14 + 18;
    // Where it wouldn't fit below its row, it opens above it.
    const tall = menuHeight(menuItems(k.m)) + 4; // with its 2px margin and 1px border
    return top + ROW + tall > h ? { top, left, up: true } : { top: top + ROW, left };
  }

  // on_size_change measures in the window's pixels, which Herdr's zoom makes larger than the
  // mod's: settings() has the zoom (Herdr's picker divides the same way).
  zoom() { return Number(settings()?.zoom) || 1; }

  // A 1px point the keyboard menu's surface hangs from.
  keyMenuPin(t, at) {
    return Popup.new("rf-kmenu", div()).absolute().top(at.top).left(at.left).size(1).anchor(at.up ? "bottom_left" : "top_left")
      .content(this.keyMenu(t, at.up));
  }

  // The keyboard menu's surface.
  keyMenu(t, up) {
    return this.menuList(t, this.kmenu.m, this.kmenu.at, "rf-kmenu", (id, cx) => this.runKeyMenu(id, cx))
      .w(228).when(up, (el) => el.mb(2)).when(!up, (el) => el.mt(2)).rounded(8).border_1().border_color(t.border).bg(t.popover ?? t.surface).shadow_lg()
      .on_mouse_down_out((_e, cx) => { if (this.kmenu) { this.closeKeyMenu(); cx.notify(); } });
  }

  // The menu's entries in groups; `at`: the one the keyboard is on (-1: none).
  menuList(t, m, at, prefix, pick) {
    let n = 0;
    const item = ([id, label]) => {
      const on = n++ === at;
      return div().id(`${prefix}-${id}`).h(28).px(10).flex().items_center().rounded(6).cursor_pointer().text_size(12.5)
        .when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => pick(id, cx)).child(label);
    };
    return v_flex().p(5).text_color(t.foreground)
      .children(menuItems(m).flatMap((g, i) => [...(i ? [div().h(1).mx(6).my(4).bg(t.border)] : []), ...g.map(item)]));
  }

  // What the menu asked for, run by the panel: its tasks outlive the closed popup.
  request(req, cx) {
    const abs = join(this.root, req.rel);
    if (req.action === "preview") { this.cursor = req.rel; this.show(req.rel, cx, true); return; }
    if (req.action === "float") { this.cursor = req.rel; cx.spawn(async () => this.openFloat(req.rel)); return; }
    if (req.action === "tab") { this.cursor = req.rel; cx.spawn(async (cx) => this.openPreview(req.rel, cx)); return; }
    cx.spawn(async (cx) => {
      try {
        if (req.action === "open") await openExternal(abs);
        else if (req.action === "reveal") await revealExternal(abs);
        else if (req.action === "send") sendToAgent(cx, abs);
      } catch (e) { notify({ title: "Could not open the file", body: message(e), level: "error", timeout: 4000 }); }
    });
  }

  // The right-click menu, drawn by its popup copy: the panel runs what needs it.
  renderMenu() {
    const t = theme(), m = this.menu;
    return this.menuList(t, m, -1, "rf-menu", (id, cx) => {
      closeOverlay(props().overlay);
      if (id === "copy-rel") copy(cx, m.rel);
      else if (id === "copy-abs") copy(cx, m.abs);
      else setShared(REQUEST, { n: Date.now(), action: id, from: m.from, root: m.root, on: m.on, rel: m.rel });
    }).id("rf-menu").size_full().bg(t.popover ?? t.surface);
  }

  // ── keyboard ─────────────────────────────────────────────────────────────────────────
  move(rows, delta, cx) {
    if (!rows.length) return;
    const at = rows.findIndex((r) => r.rel === this.cursor);
    // Without a selected row, down starts at the top and up at the bottom.
    const from = at >= 0 ? at : delta > 0 ? -1 : rows.length;
    const next = Math.max(0, Math.min(rows.length - 1, from + delta));
    this.cursor = rows[next].rel;
    this.scroll.scroll_to_item(next);
    this.follow(cx, FOLLOW_MS);
  }

  key(e, cx) {
    const k = e.key, rows = this.shown, cur = rows.find((r) => r.rel === this.cursor);
    if (e.modifiers?.platform || e.modifiers?.control || e.modifiers?.alt) return;
    if (this.kmenu) {
      const km = this.kmenu, n = km.items.length;
      if (k === "down" || k === "tab") km.at = (km.at + 1) % n;
      else if (k === "up") km.at = (km.at - 1 + n) % n;
      else if (k === "home" || k === "pageup") km.at = 0;
      else if (k === "end" || k === "pagedown") km.at = n - 1;
      else if (k === "enter" || k === "space") this.runKeyMenu(km.items[km.at][0], cx);
      else if (k === "escape" || k === "left" || k === "menu" || (k === "f10" && e.modifiers?.shift)) this.closeKeyMenu();
      cx.stop_propagation(); cx.notify(); return;
    }
    if (this.typing) {
      if (k === "escape") { if (this.query) this.clearSearch(cx); else this.handle.focus(); }
      else if (k === "down" || k === "up") this.move(rows, k === "down" ? 1 : -1, cx);
      else return;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (this.file) {
      if (k === "escape" || k === "left" || k === "backspace") this.closePreview();
      else return;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (k === "up") this.move(rows, -1, cx);
    else if (k === "down") this.move(rows, 1, cx);
    else if (k === "pageup") this.move(rows, -10, cx);
    else if (k === "pagedown") this.move(rows, 10, cx);
    else if (k === "home") this.move(rows, -rows.length, cx);
    else if (k === "end") this.move(rows, rows.length, cx);
    else if (k === "/") this.input.focus();
    else if (k === "escape" && isOpen(shared(FLOAT))) this.closeFloat();
    else if (k === "escape" && this.query) this.clearSearch(cx);
    else if (!cur) return;
    else if (k === "right") { if (cur.dir && !cur.open) this.toggle(cur, cx); else if (cur.dir) this.move(rows, 1, cx); }
    else if (k === "left") {
      if (cur.dir && cur.open && !this.hits && !(this.view === "changed" && this.query.trim())) this.toggle(cur, cx);
      else { const at = rows.findIndex((r) => r.rel === dirOf(cur.rel)); if (dirOf(cur.rel) && at >= 0) { this.cursor = rows[at].rel; this.scroll.scroll_to_item(at); } }
    }
    else if (k === "space" && !cur.dir && !cur.gone) { if (this.floats(cur.rel)) this.closeFloat(); else this.openFloat(cur.rel); }
    else if (k === "enter" || k === "space") this.activate(cur, cx);
    else if (k === "menu" || (k === "f10" && e.modifiers?.shift)) this.openKeyMenu(cur);
    else return;
    cx.stop_propagation(); cx.notify();
  }

  // ── drawing ──────────────────────────────────────────────────────────────────────────
  row(r, t) {
    const g = this.git, rel = r.rel;
    const { status, ignored } = rowStatus(g, rel);
    const color = statusColor(t, status);
    const lines = g.diff.get(rel), counts = r.dir ? g.counts.get(rel) : null, selected = rel === this.cursor;
    const showLines = Boolean(lines?.[0] || lines?.[1]) && (!r.dir || this.width >= 360);
    return h_flex().id(`rf-row-${rel}`).h(ROW).flex_none().pl(8 + r.depth * 14).pr(10).gap(6).items_center().rounded(6).cursor_pointer()
      .when(selected, (el) => el.bg(t.selected)).when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
      .child(r.dir ? svg(ICON(`chevron-${r.open ? "down" : "right"}`)).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
      .child(image(iconFor(rel, r.dir, r.open)).size(16).flex_none().when(ignored || r.gone || r.broken, (el) => el.opacity(0.5)))
      // The name takes what it needs and shrinks first; the room left goes after it, so a
      // link's arrow stays right behind the name.
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(div().flex_shrink_1().min_w(0).truncate().text_color(ignored || r.broken ? t.dim : color ?? t.foreground)
          .when(r.gone, (el) => el.line_through()).when(r.link != null, (el) => el.italic()).child(r.name))
        // A link: its name in italics and an arrow after it, red when it points nowhere; its
        // target on hover. Herdr ships Geist upright only, and gpui doesn't slant a font that
        // has no italic: fonts/Geist-Italic.ttf is that italic.
        .when(r.link != null, (el) => el.child(div().id(`rf-link-${rel}`).flex_none().tooltip(linkTip(r))
          .child(svg(ICON("link")).size(14).text_color(r.broken ? t.ansi1 : t.accent)))))
      .when(Boolean(counts), (el) => el.children(counts.map((n, i) => n
        ? h_flex().flex_none().gap(3).items_center().text_size(11).text_color(changeColors(t)[i]).child(div().size(6).rounded(3).bg(changeColors(t)[i])).child(String(n))
        : null).filter(Boolean)))
      .when(showLines && Boolean(lines?.[0]), (el) => el.child(div().flex_none().text_size(11).text_color(t.ansi2).child(`+${lines[0]}`)))
      .when(showLines && Boolean(lines?.[1]), (el) => el.child(div().flex_none().text_size(11).text_color(t.ansi1).child(`−${lines[1]}`)))
      .child(div().w(12).flex_none().text_right().text_size(11).font_semibold().text_color(color ?? t.dim).child(r.dir ? "" : status ?? ""));
  }

  // The branch, ↑ ahead ↓ behind its upstream, the lines changed, and a bar of new,
  // modified and deleted paths. Always 46px high, git or not, so nothing below moves when
  // git answers.
  summary(t) {
    const g = this.git, b = g.branch;
    const box = v_flex().h(46).flex_none().px(12).gap(7).justify_center().border_b(1).border_color(t.border).text_size(12);
    const none = div().h(4);
    if (!g.known) return box.child(div().text_color(t.dim).child(this.root ? "Reading git…" : "")).child(none);
    if (!g.repo || g.failed) return box.child(h_flex().gap(6).items_center().text_color(t.dim).child(svg(ICON("branch")).size(12).flex_none()).child(g.failed ? GIT_FAILED : noRepo(g))).child(none);
    const c = g.counts.get("") ?? [0, 0, 0], total = c[0] + c[1] + c[2], lines = g.diff.get("") ?? [0, 0], colors = changeColors(t);
    const parts = [MODIFIED, NEW, DELETED].filter((i) => c[i] > 0);
    const legend = 26 * parts.length, room = Math.max(40, this.width - 26 - legend - 2 * parts.length);
    return box
      .child(h_flex().gap(6).items_center()
        .child(svg(ICON("branch")).size(12).flex_none().text_color(t.muted))
        .child(div().min_w(0).truncate().font_medium().child(b?.detached ? "HEAD (detached)" : b?.head ?? "…"))
        .when(Boolean(b?.ahead), (el) => el.child(div().flex_none().text_color(t.muted).child(`↑${b.ahead}`)))
        .when(Boolean(b?.behind), (el) => el.child(div().flex_none().text_color(t.muted).child(`↓${b.behind}`)))
        .when(Boolean(b?.gone), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("upstream gone")))
        .child(div().flex_1())
        .when(!total, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child("clean")))
        .when(Boolean(lines[0]), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.ansi2).child(`+${lines[0]}`)))
        .when(Boolean(lines[1]), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.ansi1).child(`−${lines[1]}`))))
      .child(total
        ? h_flex().h(10).gap(2).items_center()
          .children(parts.map((i) => div().h(4).w(Math.max(3, (room * c[i]) / total)).rounded(2).bg(colors[i])))
          .child(div().flex_1())
          .children(parts.map((i) => div().flex_none().w(24).text_right().text_size(10.5).text_color(colors[i]).child(String(c[i]))))
        : none);
  }

  header(t) {
    const bar = h_flex().h(42).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border);
    if (this.file) return bar
      .child(div().id("rf-back").size(22).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().text_color(t.muted)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Back to the files (Esc)")
        .on_click((_e, cx) => { this.closePreview(); this.handle.focus(); cx.notify(); }).child(svg(ICON("chevron-left")).size(14)))
      .child(image(iconFor(this.file, false, false)).size(16).flex_none())
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).child(this.file));
    const changed = this.git.records;
    return bar
      .child(div().flex_none().font_semibold().child("Files"))
      .child(h_flex().flex_none().h(24).p(2).gap(2).items_center().rounded(7).bg(t.raised).children(VIEWS.map(([id, label]) => {
        const on = this.view === id;
        return h_flex().id(`rf-view-${id}`).h(20).px(8).gap(5).items_center().rounded(5).cursor_pointer().text_size(12)
          .text_color(on ? t.foreground : t.dim).when(on, (el) => el.bg(t.background)).when(!on, (el) => el.hover((s) => s.text_color(t.foreground)))
          .on_click((_e, cx) => this.setView(id, cx))
          .child(label)
          .when(id === "changed" && changed > 0, (el) => el.child(div().text_size(11).text_color(on ? t.muted : t.dim).child(String(changed))));
      })))
      .child(h_flex().flex_1().min_w(0).gap(6).justify_end().items_center().text_size(12).text_color(t.dim)
        .when(Boolean(this.root), (el) => el.child(image(rootIcon(false)).size(14).flex_none()))
        .child(div().min_w(0).truncate().child(this.root?.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || this.root || "")));
  }

  // In the search field, inside a repo, not in a folder git ignores and where the disk can be
  // read: whether All searches git's files (lit) or the disk.
  sourceToggle(t) {
    const git = this.source === "git";
    return div().id("rf-source").size(20).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer()
      .text_color(git ? t.accent : t.dim).when(git, (el) => el.bg(t.raised)).hover((s) => s.bg(t.hover).text_color(git ? t.accent : t.foreground))
      .tooltip(git ? "Searching git's files, without ignored ones. Click to search the disk" : "Searching the disk. Click to search git's files only")
      .on_click((_e, cx) => this.setSource(git ? "disk" : "git", cx))
      .child(svg(ICON("branch")).size(13));
  }

  note(rows) {
    const g = this.git;
    if (this.error) return this.error;
    if (!this.root) return "No folder";
    if (this.view === "changed") {
      if (!g.known) return "Reading git…";
      if (!g.repo) return noRepo(g);
      if (g.failed) return GIT_FAILED;
      return rows.length ? null : this.query.trim() ? "No matching changes" : g.rootUntracked ? "This whole folder is new to git" : g.rootIgnored ? "Git ignores this whole folder" : "No changes";
    }
    if (this.searching && !rows.length) return "Searching…";
    if (this.hits && this.searchError) return this.searchError;
    if (this.hits) return rows.length ? null : this.index?.from === "git" ? "No matches · ignored files left out" : "No matches";
    if (this.loading && !rows.length) return "Loading files…";
    return rows.length ? null : "Empty folder";
  }

  render(cx) {
    if (this.menu) return this.renderMenu();
    this.sync(cx);
    const req = shared(REQUEST);
    if (req && req.n !== this.seenRequest) {
      this.seenRequest = req.n;
      // Only the copy that opened the menu, and only while it still shows the same folder.
      if (req.from === this.uid && req.root === this.root && (req.on ?? null) === (this.on ?? null)) this.request(req, cx);
    }
    const t = theme();
    // The panel's width in the mod's pixels, for the rows' +N −N and the branch row's bar.
    if (this.measuredWidth) this.width = this.measuredWidth / this.zoom();
    const root = v_flex().id(NAME).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .on_size_change((size, cx) => { if (Math.abs(size.width - (this.measuredWidth ?? 0)) > 4) { this.measuredWidth = size.width; cx.notify(); } })
      .child(this.header(t));
    if (this.file) {
      return root.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…"));
    }
    const rows = this.shown = this.rows();
    // The keyboard menu goes when its row moves or goes.
    if (this.kmenu && rows[this.kmenu.row]?.rel !== this.kmenu.m.rel) this.closeKeyMenu();
    const pin = this.kmenu ? this.keyMenuAt(rows.length) : null;
    if (this.scrollTo !== null && this.scrollTo !== undefined) {
      const at = rows.findIndex((r) => r.rel === this.scrollTo);
      if (at >= 0) { this.scroll.scroll_to_item(at, "center"); this.scrollTo = null; }
      else if (!this.pending.size && !this.loading) this.scrollTo = null;
    }
    const note = this.note(rows), more = [];
    if (this.limited && !this.hits) more.push(`Folders show their first ${PER_FOLDER} entries`);
    if (this.hits?.length >= FIND_LIMIT) more.push(`First ${FIND_LIMIT} matches`);
    if (this.view === "changed" && this.changedCut) more.push(`Changed shows the first ${thousands(CHANGED_LIMIT)} paths`);
    if (this.hits && this.index && !this.index.full) more.push(`Search covers ${limits(this.index.cut)}`);
    return root
      .child(this.summary(t))
      .child(h_flex().id("rf-search").flex_none().mx(8).mt(8).mb(4).h(28).px(8).gap(6).items_center().rounded(7).bg(t.canvas ?? t.surface)
        .border_1().border_color(this.typing ? t.accent : t.border).cursor_text()
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12).text_color(t.foreground))
        .when(Boolean(this.query), (el) => el.child(div().id("rf-clear").flex_none().text_size(13).text_color(t.dim).cursor_pointer()
          .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => this.clearSearch(cx)).child("×")))
        .when(this.view === "all" && this.git.repo && !this.git.rootIgnored && !this.ctx.noDisk, (el) => el.child(this.sourceToggle(t)))
        // Before the list was measured, the keyboard menu hangs below the search field.
        .when(Boolean(this.kmenu) && !pin, (el) => el.relative().child(this.keyMenuPin(t, { top: 28, left: 8 }))))
      .child(div().id("rf-list").flex_1().min_h(0).relative().px(4).pb(4)
        // How many presses in a row: a row's click (on_item_click) doesn't say.
        // And whether Cmd (Ctrl off macOS; `platform` is the Windows key there) was held.
        .on_mouse_down("left", (e) => {
          this.clicks = e.click_count ?? 1;
          this.tabClick = Boolean(window()?.platform === "macos" ? e.modifiers?.platform : e.modifiers?.control);
        })
        // Scrolling would take the keyboard menu's row away from under it.
        .on_scroll_wheel((_e, cx) => { if (this.kmenu) { this.closeKeyMenu(); cx.notify(); } })
        .on_size_change((size, cx) => { if (Math.abs(size.height - (this.listHeight ?? 0)) > 1) { this.listHeight = size.height; cx.notify(); } })
        .child(v_virtual_list("rf-rows", rows.length, ROW, (i) => rows[i]?.rel ?? String(i), (range) =>
          rows.slice(range.start, range.end).map((r) => this.row(r, t))).track_scroll(this.scroll).size_full()
          .on_item_click((rel, cx) => {
            const n = this.clicks ?? 1, tab = Boolean(this.tabClick);
            this.clicks = 1; this.tabClick = false; this.handle.focus();
            this.click(this.shown.find((r) => r.rel === rel), n, cx, tab); cx.notify();
          })
          .on_item_secondary_click((rel, _e, cx) => { const r = this.shown.find((x) => x.rel === rel); if (!r) return; this.cursor = rel; this.openMenu(r); cx.notify(); }))
        .child(Scrollbar.vertical("rf-rows").viewport_from_layout().absolute().inset_0())
        .when(Boolean(note), (el) => el.child(div().absolute().top(6).left(0).right(0).px(12).text_size(12).text_color(t.dim).child(note)))
        .when(Boolean(pin), (el) => el.child(this.keyMenuPin(t, pin))))
      .when(more.length > 0, (el) => el.child(div().flex_none().px(12).py(4).border_t(1).border_color(t.border).text_size(11).text_color(t.dim).child(more.join(" · "))));
  }
}
