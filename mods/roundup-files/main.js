// roundup-files: the side panel's file browser. The focused pane's folder as a tree with
// Symbols icons and git state (each path's status, folders' counts, +/− lines, a branch
// row), a switch between all files and the changed ones, search across folders not yet
// opened, keyboard navigation, a context menu, and bounded read-only previews.
//
// Modified from Herdr's shipped `files` mod 0.1.13 (Apache-2.0). Parts follow
// cybertron288/herdr-mods `filetree` (MIT, (c) 2026 cybertron288), itself a port of
// claude-code-filetree (MIT, (c) 2026 Kurt Buhler): rows from a virtual list, search tree,
// keys, the context menu as a popup of this mod. See THIRD_PARTY_NOTICES.md.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, InputState, Input, Scrollbar, v_virtual_list, VirtualListScrollHandle } from "gpui-base";
import { spaces, panes, focused, readTextFile, watchFolder, theme, settings, window, props, notify, openOverlay, closeOverlay, shared, setShared, nextCommand } from "herdr";
import { iconFor, rootIcon } from "./icon.js";
import { listDir, buildIndex, compare, pruned, PER_FOLDER, INDEX_PATHS } from "./disk.js";
import { readGit, listFiles, emptyGit, ancestors, dirOf, NEW, MODIFIED, DELETED } from "./git.js";
import { openExternal, revealExternal, copy, sendToAgent, relTo } from "./actions.js";

const NAME = "roundup-files";
const ICON = (name) => `mods/${NAME}/${name}.svg`;
const ROW = 26;
const FIND_LIMIT = 200;
// A search index older than this is read again on the next search, whatever the watch said.
const INDEX_AGE = 300000;
// After a file the index knows changed (it may be gone), the index is read again once it is
// this old: at most one rebuild per 30 s while files keep changing.
const DIRTY_AGE = 30000;
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", cjs: "js", toml: "yaml", yml: "yaml", jsonc: "json", svelte: "html", vue: "html", htm: "html", sh: "bash", zsh: "bash" };
const VIEWS = [["all", "All"], ["changed", "Changed"]];
// What search in All reads: git's files (without ignored ones; the disk outside a repo) or
// the disk (everything but the pruned folders).
const SOURCES = ["git", "disk"];
// Shared: what the context menu (a popup copy of this mod) asks the panel to do. `from` names
// the panel copy that opened it: every shown copy reads the request, only that one runs it.
const REQUEST = `${NAME}.request`;

const baseOf = (rel) => rel.slice(rel.lastIndexOf("/") + 1);
const join = (root, rel) => (rel ? (/[\\/]$/.test(root) ? root + rel : `${root}/${rel}`) : root);
const message = (e) => String(e?.message ?? e);
// Whether rel or one of its folders is in set.
const selfOrAbove = (set, rel) => {
  if (!set.size) return false;
  for (let r = rel; r; r = dirOf(r)) if (set.has(r)) return true;
  return false;
};
// A theme color with some transparency, for a highlighted row. Null unless the color is hex.
const alpha = (c, a) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c ?? "");
  if (!m) return null;
  return `#${m[1].length === 3 ? [...m[1]].map((d) => d + d).join("") : m[1]}${a}`;
};
// Git's colors: new green and deleted red, as in Herdr's `files` and `changes`; modified
// yellow (ansi3) rather than their `blocked`, which many themes draw close to red.
const statusColor = (t, s) => (!s ? null : s === "D" || s === "U" ? t.ansi1 : s === "?" || s === "A" || s === "C" ? t.ansi2 : s === "R" ? t.ansi4 : t.ansi3);
const changeColors = (t) => [t.ansi2, t.ansi3, t.ansi1]; // NEW, MODIFIED, DELETED

// The focused pane's folder; when the focused pane is a mod, the first terminal of its tab.
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  let pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  if (pane && !pane.terminal) pane = panes().find((p) => p.tab === pane.tab && p.terminal && p.cwd) ?? null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}

// The context menu's entries for one path, in groups. `local`: on this computer.
function menuItems(m) {
  const mac = window()?.platform === "macos";
  return [
    [!m.dir && !m.gone && ["preview", "Preview"],
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
    // Per-path highlights, for a later source (an agent's reads and writes, say):
    // rel → { color: a theme color name, at: ms }. Rows tint from it; nothing writes it yet.
    this.highlights = new Map();
    this.width = 368; this.query = ""; this.hits = null; this.searchSeq = 0; this.shown = [];
    this.seenRequest = shared(REQUEST)?.n ?? 0;
    this.uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    this.input = InputState.new({ placeholder: "Search files" });
    this.input.on("change", (_e, cx) => this.search(this.input.value(), cx));
    this.input.on("submit", (_e, cx) => {
      const r = this.shown.find((x) => x.rel === this.cursor) ?? this.shown[0];
      // A preview hides the input: the keys (Esc, Left) go to the panel then.
      if (r && !r.dir) this.handle.focus();
      this.activate(r, cx);
    });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.reset(null, null);
    cx.timer.every(10000, (cx) => {
      this.refresh(cx);
      // A known file changed while no other change came after it: the hits may still list it.
      if (this.index?.dirty && this.outdated(this.index)) this.searchAgain(cx);
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
        else if (c === "menu") { const r = this.shown.find((x) => x.rel === this.cursor); if (r) this.openMenu(r); }
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
  // Each folder keeps its open folders, cursor and preview while another one shows.
  reset(root, on) {
    if (this.ctx?.root) this.saved.set(this.ctx.key, { folders: this.folders, shut: this.shut, cursor: this.cursor, file: this.file });
    const key = JSON.stringify([root, on]), s = this.saved.get(key);
    this.ctx = { key, root, on }; this.root = root; this.on = on;
    this.entries = new Map(); this.folders = new Set(s?.folders); this.shut = new Set(s?.shut); this.pending = new Set();
    this.cursor = s?.cursor ?? ""; this.git = emptyGit(); this.index = null; this.indexing = null; this.hits = null; this.searchError = null;
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
    cx.spawn(async (cx) => {
      try {
        // The open folders and git at once; a folder that fails closes, the root fails all.
        const [more, git] = await Promise.all([
          Promise.all(["", ...this.folders].map((path) => this.loadFolder(path, ctx).catch((e) => {
            if (!path) throw e;
            if (this.current(ctx)) { this.folders.delete(path); this.entries.delete(path); }
            return false;
          }))),
          readGit(ctx.root, ctx.on),
        ]);
        if (!this.current(ctx)) return;
        const limited = more.some(Boolean);
        this.git = git; this.limited = limited; this.error = null;
        this.watch(cx);
      } catch (e) { if (this.current(ctx)) { this.error = message(e); this.git = emptyGit(true); } }
      finally {
        if (this.current(ctx)) {
          this.loading = false;
          if (this.again) { this.again = false; this.refresh(cx); }
        }
        cx.notify();
      }
    });
  }

  // Lists one folder; answers whether it held more than PER_FOLDER.
  async loadFolder(path, ctx) {
    const { entries, more } = await listDir(join(ctx.root, path), ctx.on);
    if (!this.current(ctx) || (path && !this.folders.has(path))) return false;
    this.entries.set(path, entries);
    return more;
  }

  // Local folders refresh when something under them changes; other machines on the timer.
  watch(cx) {
    if (this.on || this.watched === this.root) return;
    const ctx = this.ctx, root = this.root;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.current(ctx)) {
          const paths = await watchFolder(root);
          if (!this.current(ctx)) return;
          this.changed(paths, cx);
        }
      } catch { if (this.current(ctx)) this.watched = null; }
    });
  }

  // A path the index doesn't know, a folder it knows, or the root (too many changes to
  // list) means the folder structure may have changed: the index is read again. A file it
  // knows may have been deleted: the index is read again once it is DIRTY_AGE old, not on
  // every save. Paths the index never holds don't count: .git and, from the disk, the pruned
  // folders, from git, what it ignores. From git, a changed .gitignore counts.
  // A change during an index build may be missing from it: that index comes out dirty.
  changed(paths, cx) {
    const index = this.index, job = this.indexing, fromGit = index?.from === "git";
    for (const abs of paths) {
      const rel = relTo(this.root, abs);
      if (rel === null) continue;
      if (job && (baseOf(rel) === ".gitignore" || !this.unindexed(rel, job.source === "git"))) job.changed = true;
      if (!index) continue;
      if (fromGit && baseOf(rel) === ".gitignore") { index.stale = true; continue; }
      if (this.unindexed(rel, fromGit)) continue;
      if (rel === "" || index.dirs.has(rel) || !index.known.has(rel)) index.stale = true;
      else index.dirty = true;
    }
    if (index && this.outdated(index)) this.searchAgain(cx);
    this.refresh(cx);
  }

  // Whether an index never holds rel: .git and, from git, what it ignores; from the disk, the
  // pruned folders.
  unindexed(rel, fromGit) {
    return Boolean(rel) && (fromGit ? rel.split("/").includes(".git") || this.isIgnored(rel) : pruned(this.root, rel));
  }

  // Whether the next search reads the index again.
  outdated(i) {
    const age = Date.now() - i.at;
    return i.stale || age >= INDEX_AGE || (i.dirty && age >= DIRTY_AGE);
  }

  // A search rerun in the background: the list keeps its scroll unless the cursor's row went.
  searchAgain(cx) { if (this.query.trim() && this.view === "all") this.search(this.query, cx, true); }

  toggle(r, cx) {
    if (!r?.dir) return;
    if (this.hits) { this.reveal(r.rel, true, cx); return; }
    // Changed: a folder git lists file by file folds; an untracked one opens from disk.
    // A search there opens every folder: nothing to fold until it is cleared.
    if (this.view === "changed" && !this.underUntracked(r.rel)) {
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
      for (const d of todo) {
        if (!this.current(ctx)) return;
        if (this.entries.has(d) || this.pending.has(d)) continue;
        this.pending.add(d);
        try { if (await this.loadFolder(d, ctx)) this.limited = true; }
        catch (e) {
          if (!this.current(ctx)) return;
          this.folders.delete(d);
          notify({ title: "Cannot open this folder", body: `${d}: ${message(e)}`, level: "warning", timeout: 3000 });
        }
        finally { if (this.current(ctx)) this.pending.delete(d); }
      }
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
        const matches = index.all.filter((rel) => rel.toLowerCase().includes(q));
        const named = matches.filter((rel) => baseOf(rel).toLowerCase().includes(q));
        this.hits = [...new Set([...named, ...matches])].slice(0, FIND_LIMIT);
        const before = this.cursor;
        if (!this.hits.includes(this.cursor)) this.cursor = this.hits[0] ?? "";
        if (!quiet || this.cursor !== before) this.scrollTo = this.cursor;
      } catch (e) { if (seq === this.searchSeq && this.current(ctx)) { this.hits = []; this.searchError = message(e); } }
      finally { if (seq === this.searchSeq) this.searching = false; cx.notify(); }
    });
  }

  // One index build per source at a time; searches typed meanwhile wait for it. `from`: what
  // it was read from ("disk" also when git was asked for outside a repo).
  ensureIndex(ctx) {
    const i = this.index, source = this.source;
    if (i && i.source === source && !this.outdated(i)) return Promise.resolve(i);
    if (this.indexing?.source !== source) {
      const job = { source };
      job.promise = (async () => {
        const fromGit = source === "git" ? await listFiles(ctx.root, ctx.on, INDEX_PATHS) : null;
        const built = fromGit ?? await buildIndex(ctx.root, ctx.on);
        const index = { ...built, source, from: fromGit ? "git" : "disk", known: new Set(built.all), at: Date.now(), stale: false, dirty: Boolean(job.changed) };
        if (this.current(ctx) && this.source === source) this.index = index;
        return index;
      })().finally(() => { if (this.current(ctx) && this.indexing === job) this.indexing = null; });
      this.indexing = job;
    }
    return this.indexing.promise;
  }

  clearSearch(cx) {
    this.query = ""; this.hits = null; this.searchSeq++; this.searching = false; this.searchError = null;
    this.input.set_value("");
    this.scrollTo = this.cursor || null;
    cx.notify();
  }

  // ── rows ─────────────────────────────────────────────────────────────────────────────
  // Every row: { rel, name, dir, depth, open, gone }. gone: a deleted file, not on disk.
  rows() {
    const out = [], q = this.query.trim().toLowerCase();
    if (this.view === "changed") return this.changedRows(q);
    if (this.hits) return this.hitRows();
    this.diskRows("", 0, out);
    return out;
  }

  diskRows(prefix, depth, out) {
    for (const e of this.entries.get(prefix) ?? []) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name, open = e.dir && this.folders.has(rel);
      out.push({ rel, name: e.name, dir: e.dir, depth, open, gone: false });
      if (open && depth < 40) this.diskRows(rel, depth + 1, out);
    }
  }

  // Search matches as a tree: each match under its folders, all open. Git still lists a file
  // deleted but not yet committed; it shows struck through, as in Changed.
  hitRows() {
    const out = [], keep = new Set(), kids = new Map(), dirs = this.index?.dirs ?? new Set();
    for (const h of this.hits) { keep.add(h); for (const a of ancestors(h)) keep.add(a); }
    for (const rel of keep) { const p = dirOf(rel); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(rel); }
    const walk = (p, depth) => {
      const list = (kids.get(p) ?? []).sort((a, b) => Number(dirs.has(b)) - Number(dirs.has(a)) || compare(baseOf(a), baseOf(b)));
      for (const rel of list) {
        out.push({ rel, name: baseOf(rel), dir: dirs.has(rel), depth, open: kids.has(rel), gone: this.git.files.get(rel) === DELETED });
        if (kids.has(rel)) walk(rel, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }

  // Exactly the paths git status lists, as a tree: deleted files too, untracked folders
  // as one row that opens from disk. A search filters them.
  changedRows(q) {
    const g = this.git, out = [], kids = new Map(), dirs = new Set(g.untracked);
    const add = (rel) => { const p = dirOf(rel); if (!kids.has(p)) kids.set(p, new Set()); kids.get(p).add(rel); };
    for (const rel of g.files.keys()) {
      if (q && !rel.toLowerCase().includes(q)) continue;
      add(rel);
      for (const a of ancestors(rel)) { dirs.add(a); add(a); }
    }
    const walk = (p, depth) => {
      const list = [...(kids.get(p) ?? [])].sort((a, b) => Number(dirs.has(b)) - Number(dirs.has(a)) || compare(baseOf(a), baseOf(b)));
      for (const rel of list) {
        const dir = dirs.has(rel);
        if (g.untracked.has(rel)) {
          const open = this.folders.has(rel);
          out.push({ rel, name: baseOf(rel), dir: true, depth, open, gone: false });
          if (open) this.diskRows(rel, depth + 1, out);
        } else if (dir) {
          const open = Boolean(q) || !this.shut.has(rel);
          out.push({ rel, name: baseOf(rel), dir: true, depth, open, gone: false });
          if (open) walk(rel, depth + 1);
        } else out.push({ rel, name: baseOf(rel), dir: false, depth, open: false, gone: g.files.get(rel) === DELETED });
      }
    };
    walk("", 0);
    return out;
  }

  isIgnored(rel) { return selfOrAbove(this.git.ignored, rel); }

  underUntracked(rel) { return this.git.rootUntracked || selfOrAbove(this.git.untracked, rel); }

  highlightOf(rel, t) {
    const h = this.highlights.get(rel);
    return h ? { color: t[h.color] ?? null, at: h.at } : null;
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

  // Enter, a click: a file previews (unless it is gone), a folder opens or closes.
  activate(r, cx) {
    if (!r) return;
    this.cursor = r.rel;
    if (r.dir) this.toggle(r, cx);
    else if (r.gone) notify({ title: "Deleted file", body: `${r.rel} is no longer on disk`, level: "info", timeout: 2500 });
    else this.show(r.rel, cx);
  }

  // ── context menu ─────────────────────────────────────────────────────────────────────
  openMenu(r) {
    const m = { from: this.uid, root: this.root, on: this.on, rel: r.rel, abs: join(this.root, r.rel), dir: r.dir, gone: r.gone, local: !this.on };
    const groups = menuItems(m), items = groups.reduce((n, g) => n + g.length, 0);
    openOverlay({ mod: NAME, kind: "popup", width: 228, height: items * 28 + (groups.length - 1) * 9 + 10, props: { menu: m } });
  }

  // What the menu asked for, run by the panel: its tasks outlive the closed popup.
  request(req, cx) {
    const abs = join(this.root, req.rel);
    if (req.action === "preview") { this.cursor = req.rel; this.show(req.rel, cx, true); return; }
    cx.spawn(async (cx) => {
      try {
        if (req.action === "open") await openExternal(abs);
        else if (req.action === "reveal") await revealExternal(abs);
        else if (req.action === "send") sendToAgent(cx, abs);
      } catch (e) { notify({ title: "Could not open the file", body: message(e), level: "error", timeout: 4000 }); }
    });
  }

  renderMenu() {
    const t = theme(), m = this.menu, close = () => closeOverlay(props().overlay);
    const item = ([id, label]) => div().id(`rf-menu-${id}`).h(28).px(10).flex().items_center().rounded(6).cursor_pointer().text_size(12.5)
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => {
        close();
        if (id === "copy-rel") copy(cx, m.rel);
        else if (id === "copy-abs") copy(cx, m.abs);
        else setShared(REQUEST, { n: Date.now(), action: id, from: m.from, root: m.root, on: m.on, rel: m.rel });
      }).child(label);
    const groups = menuItems(m);
    return v_flex().id("rf-menu").size_full().p(5).bg(t.popover ?? t.surface).text_color(t.foreground)
      .children(groups.flatMap((g, i) => [...(i ? [div().h(1).mx(6).my(4).bg(t.border)] : []), ...g.map(item)]));
  }

  // ── keyboard ─────────────────────────────────────────────────────────────────────────
  move(rows, delta) {
    if (!rows.length) return;
    const at = rows.findIndex((r) => r.rel === this.cursor);
    // Without a selected row, down starts at the top and up at the bottom.
    const from = at >= 0 ? at : delta > 0 ? -1 : rows.length;
    const next = Math.max(0, Math.min(rows.length - 1, from + delta));
    this.cursor = rows[next].rel;
    this.scroll.scroll_to_item(next);
  }

  key(e, cx) {
    const k = e.key, rows = this.shown, cur = rows.find((r) => r.rel === this.cursor);
    if (e.modifiers?.platform || e.modifiers?.control || e.modifiers?.alt) return;
    if (this.typing) {
      if (k === "escape") { if (this.query) this.clearSearch(cx); else this.handle.focus(); }
      else if (k === "down" || k === "up") this.move(rows, k === "down" ? 1 : -1);
      else return;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (this.file) {
      if (k === "escape" || k === "left" || k === "backspace") this.closePreview();
      else return;
      cx.stop_propagation(); cx.notify(); return;
    }
    if (k === "up") this.move(rows, -1);
    else if (k === "down") this.move(rows, 1);
    else if (k === "pageup") this.move(rows, -10);
    else if (k === "pagedown") this.move(rows, 10);
    else if (k === "home") this.move(rows, -rows.length);
    else if (k === "end") this.move(rows, rows.length);
    else if (k === "/") this.input.focus();
    else if (k === "escape" && this.query) this.clearSearch(cx);
    else if (!cur) return;
    else if (k === "right") { if (cur.dir && !cur.open) this.toggle(cur, cx); else if (cur.dir) this.move(rows, 1); }
    else if (k === "left") {
      if (cur.dir && cur.open && !this.hits && !(this.view === "changed" && this.query.trim())) this.toggle(cur, cx);
      else { const at = rows.findIndex((r) => r.rel === dirOf(cur.rel)); if (dirOf(cur.rel) && at >= 0) { this.cursor = rows[at].rel; this.scroll.scroll_to_item(at); } }
    }
    else if (k === "enter" || k === "space") this.activate(cur, cx);
    else if (k === "menu" || (k === "f10" && e.modifiers?.shift)) this.openMenu(cur);
    else return;
    cx.stop_propagation(); cx.notify();
  }

  // ── drawing ──────────────────────────────────────────────────────────────────────────
  row(r, t) {
    const g = this.git, rel = r.rel;
    const status = g.status.get(rel) ?? (this.underUntracked(rel) ? "?" : null);
    const ignored = !status && this.isIgnored(rel);
    const color = statusColor(t, status), hl = this.highlightOf(rel, t);
    const lines = g.diff.get(rel), counts = r.dir ? g.counts.get(rel) : null, selected = rel === this.cursor;
    const showLines = Boolean(lines?.[0] || lines?.[1]) && (!r.dir || this.width >= 360);
    return h_flex().id(`rf-row-${rel}`).h(ROW).flex_none().pl(8 + r.depth * 14).pr(10).gap(6).items_center().rounded(6).cursor_pointer()
      .when(selected, (el) => el.bg(t.selected)).when(!selected, (el) => el.hover((s) => s.bg(t.hover)))
      .when(Boolean(hl?.color) && !selected, (el) => el.bg(alpha(hl.color, "22") ?? t.hover))
      .child(r.dir ? svg(ICON(`chevron-${r.open ? "down" : "right"}`)).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
      .child(image(iconFor(rel, r.dir, r.open)).size(16).flex_none().when(ignored || r.gone, (el) => el.opacity(0.5)))
      .child(div().flex_1().min_w(0).truncate().text_color(hl?.color ?? (ignored ? t.dim : color ?? t.foreground))
        .when(r.gone, (el) => el.line_through()).child(r.name))
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
    if (!g.repo) return box.child(h_flex().gap(6).items_center().text_color(t.dim).child(svg(ICON("branch")).size(12).flex_none()).child("Not a git repository")).child(none);
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

  // In the search field, inside a repo: whether All searches git's files (lit) or the disk.
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
      if (!g.repo) return "Not a git repository";
      return rows.length ? null : this.query.trim() ? "No matching changes" : g.rootUntracked ? "This whole folder is new to git" : "No changes";
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
    const root = v_flex().id(NAME).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 4) { this.width = size.width; cx.notify(); } })
      .child(this.header(t));
    if (this.file) {
      return root.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…"));
    }
    const rows = this.shown = this.rows();
    if (this.scrollTo !== null && this.scrollTo !== undefined) {
      const at = rows.findIndex((r) => r.rel === this.scrollTo);
      if (at >= 0) { this.scroll.scroll_to_item(at, "center"); this.scrollTo = null; }
      else if (!this.pending.size && !this.loading) this.scrollTo = null;
    }
    const note = this.note(rows), more = [];
    if (this.limited && !this.hits) more.push(`Folders show their first ${PER_FOLDER} entries`);
    if (this.hits?.length >= FIND_LIMIT) more.push(`First ${FIND_LIMIT} matches`);
    if (this.hits && this.index && !this.index.full) more.push(`Search covers the first ${String(INDEX_PATHS).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} paths`);
    return root
      .child(this.summary(t))
      .child(h_flex().flex_none().mx(8).mt(8).mb(4).h(28).px(8).gap(6).items_center().rounded(7).bg(t.canvas ?? t.surface)
        .border_1().border_color(this.typing ? t.accent : t.border).cursor_text()
        .child(svg(ICON("search")).size(13).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(12).text_color(t.foreground))
        .when(Boolean(this.query), (el) => el.child(div().id("rf-clear").flex_none().text_size(13).text_color(t.dim).cursor_pointer()
          .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => this.clearSearch(cx)).child("×")))
        .when(this.view === "all" && this.git.repo, (el) => el.child(this.sourceToggle(t))))
      .child(div().flex_1().min_h(0).relative().px(4).pb(4)
        .child(v_virtual_list("rf-rows", rows.length, ROW, (i) => rows[i]?.rel ?? String(i), (range) =>
          rows.slice(range.start, range.end).map((r) => this.row(r, t))).track_scroll(this.scroll).size_full()
          .on_item_click((rel, cx) => { this.handle.focus(); this.activate(this.shown.find((r) => r.rel === rel), cx); cx.notify(); })
          .on_item_secondary_click((rel, _e, cx) => { const r = this.shown.find((x) => x.rel === rel); if (!r) return; this.cursor = rel; this.openMenu(r); cx.notify(); }))
        .child(Scrollbar.vertical("rf-rows").viewport_from_layout().absolute().inset_0())
        .when(Boolean(note), (el) => el.child(div().absolute().top(6).left(0).right(0).px(12).text_size(12).text_color(t.dim).child(note))))
      .when(more.length > 0, (el) => el.child(div().flex_none().px(12).py(4).border_t(1).border_color(t.border).text_size(11).text_color(t.dim).child(more.join(" · "))));
  }
}
