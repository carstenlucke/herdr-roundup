// Workspace spaces, in Herdr Roundup's quiet look: a tinted initial, the name, and
// under it where its first terminal is now (repo · branch, ahead/behind, uncommitted
// changes). A repo with worktrees sits on a card with them; spaces are grouped by
// machine when more than one is known. On the right, how many agents run in it,
// colored only when one needs you (blocked, done) or works; with two or more, hovering it
// shows them by tab with a map of each tab's panes, and a click goes to one. Click to switch,
// right-click for its menu, drag to reorder.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, HoverCard } from "gpui-base";
import { place, alpha, badge, gitWhere, changesTip, rebuilt as isRebuilt } from "./space-text.js";
import { spaces, machines, panes, terminals, agents, run, openOverlay, exec, hc, theme, settings, shared, setShared, watchFolder, window, layout } from "herdr";
import { parseStatus, parseRevParse } from "./git-parse.js";
import { docValue, quicklook, fingerprint } from "./pane-map.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// A row with git under its name is two lines high.
const ROW = 32;
const ROW_TWO = 44;
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;
// The space in front, more often: a quick command in its shell (`echo x >> f`)
// ends between two looks at its pane, and Herdr tells no shell's command end.
const ACTIVE = 10000;
// Spaces there at start wait this long, at most, for their git, then show together.
const WAIT = 1500;
// roundup-menu's overlay id while it is open: the quicklook's layer would draw above it.
const MENU_OPEN = "roundup-menu.open";
// The quicklook: as wide with pane maps, as wide without, at most this high before it scrolls.
const QUICK = 330;
const QUICK_BARE = 286;
const QUICK_HIGH = 360;
// The quicklook reads its document once the pointer has rested this long on the badge (its card
// opens at 400ms; a local read takes a few ms), and forgets its card this long after the pointer
// left badge and card (the card closes 150ms after).
const ARM = 300;
const GRACE = 200;
const WORD = { blocked: "needs you", done: "done", working: "working", idle: "idle" };

// A terminal's title without the spinner or mark a program puts in front: Braille spinners
// (codex), Claude Code's stars, each followed by a space. Anything else in front stays.
export const clean = (s) => (s ?? "").trim().replace(/^(?:[\u2800-\u28ff\u2733\u273b\u273d\u2736\u2722\u00b7][\uFE0E\uFE0F]?\s+)+/u, "");

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// A space speaks up only when something in it needs you.
export function glyph(status) {
  return status === "blocked" || status === "done" ? "●" : "·";
}

export function tone(t, status) {
  return t[status] ?? t.unknown;
}

export default class Spaces extends View {
  init(_props, cx) {
    this.git = {}; // where() -> { name, branch, ahead, behind, dirty, repo, linked }, null: not a repo
    this.checked = {}; // where() -> when it was last looked at
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    this.pending = new Set(); // where()s to look at next
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    this.turns = {}; // pane -> its agent's turn count (a turn shorter than a look still counts)
    this.ready = {}; // machine -> its layout was readable at the last look
    this.at = {}; // space -> its where() at the last look
    this.front = null; // the window was in front at the last look (null: not looked yet)
    this.watching = new Set(); // local repos' git folders
    // Spaces wait (at most a moment) for their git, so a worktree appears under its
    // repo instead of jumping there. Those there at start show together, so the list
    // doesn't grow and regroup row by row. A cache of the last run's git would show them
    // sooner but could show an old state; it can go on top of this if the wait gets long.
    this.shown = new Set();
    this.first = new Set(spaces().map((s) => s.id));
    this.start = Date.now();
    this.born = {};
    this.pressed = null;
    this.over = null;
    this.machines = [];
    // The quicklook: each machine's core document ("" here) as last read well, the machines being
    // read, those whose last read failed (logged once), the agents (fingerprint) each space's tree
    // was last read for. The hover: the space whose card has content, the one whose hover lasted
    // ARM (it may read), the badge and the card under the pointer, the agent whose row is hovered,
    // the timers that arm and drop it, and its generation (a timer of an older one does nothing).
    this.docs = {};
    this.reading = new Set();
    this.failed = new Set();
    this.tried = {};
    this.peek = null;
    this.armed = null;
    this.hot = null;
    this.cardHot = null;
    this.lit = null;
    this.arming = null;
    this.dropping = null;
    this.gen = 0;
    // A press that began on a badge (its release jumps); the card kept empty after a jump until
    // the badge is next entered or left, and while the menu is open until the badge was left.
    this.badgePress = null;
    this.jumped = false;
    this.quiet = false;
    this.left = true;
    // roundup-menu.open is the menu's own: a menu open while this mod reloads keeps it. One left by
    // a crash goes with the next menu, which writes its id and clears it on closing.
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    this.rereadDue(sp, cx);
    if (sp.some((s) => !this.shown.has(s.id)) || this.orderingDue(now)) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    const turn = {}; // terminal -> its agent's turns so far (this computer's core)
    for (const x of terminals() ?? []) if (x?.address) turn[x.address] = x.turn;
    const busy = {}, turns = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      turns[p.pane] = turn[p.terminal];
      const ended = this.busy[p.pane] && !busy[p.pane];
      const turned = typeof turns[p.pane] === "number" && typeof this.turns[p.pane] === "number" && turns[p.pane] !== this.turns[p.pane];
      if (ended || turned) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    this.turns = turns;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    // Back in front: files saved outside Herdr (an editor) change no .git, so
    // look at every place again instead of waiting for the fallback.
    const front = Boolean(window()?.active);
    const back = front && this.front === false;
    this.front = front;
    if (front) {
      const active = at[sp.find((s) => s.active)?.id];
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        const every = k === active ? ACTIVE : FALLBACK;
        if (asks && !this.folded.has(JSON.parse(k)[0]) && (back || now - (this.checked[k] ?? 0) > every)) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (JSON.parse(r.stdout).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  rebuilt(machine) { return isRebuilt(machine); }

  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(e.message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo and whether this is a worktree of it, in one process (git-parse.js).
      const rp = await exec("git", ["rev-parse", "--show-toplevel", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const { repo, name, linked } = parseRevParse(rp.stdout, rp.code);
      const info = { name, ...parseStatus(r.stdout), repo: JSON.stringify([on, repo]), linked };
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  menu(w, cx) {
    // A popup is as tall as its items; height is only the most. roundup-menu, a clone of Herdr's
    // menu, says while it is open: the quicklook's layer is above popups.
    openOverlay({ mod: "roundup-menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } });
    // Empty from now until the badge was left and the menu is closed, in either order.
    this.quiet = true;
    this.left = this.hot === null;
    this.endHover();
    cx?.notify();
  }

  // A machine's core document `herdr-app`, where its tabs' splits are (pane-map.js); one read
  // per machine at a time. Not on Windows (no sh). False only when that machine's read is still
  // running (the caller tries again later); true when one started, or on Windows, where none
  // ever can. Only a readable answer replaces the last one; without any, no maps.
  docOf(machine, cx) {
    const key = machine ?? "";
    if (window()?.platform === "windows") return true;
    if (this.reading.has(key)) return false;
    this.reading.add(key);
    const rpc = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "doc.get", params: { name: "herdr-app", on: machine ?? null } });
    cx.spawn(async (cx) => {
      let doc = null, why;
      try {
        const r = await exec("sh", ["-c", 'printf "%s\\n" "$1" | hc connect', "sh", rpc], { timeout: 3000 });
        if (r.code === 0) doc = docValue(r.stdout);
        why = r.code === 0 ? "no document in the answer" : `exit ${r.code}: ${(r.stderr ?? "").split("\n")[0]}`;
      } catch (e) {
        why = String(e?.message ?? e);
      } finally {
        this.reading.delete(key);
      }
      if (doc) {
        this.docs[key] = doc;
        this.failed.delete(key);
      } else if (!this.failed.has(key)) {
        // Once per machine until a read works again: without hc on PATH the maps only stay away.
        this.failed.add(key);
        console.log(`roundup-spaces: no pane maps (${key || "this computer"}): ${why}`);
      }
      cx.notify();
    });
    return true;
  }

  // The space whose quicklook may read: shown in the sidebar with two or more agents, nothing
  // keeping its card empty. { s, crew } or null.
  live(id, sp = spaces()) {
    const s = id && !narrow() ? sp.find((x) => x.id === id) : null;
    const crew = s ? agents().filter((a) => a.space === s.id) : [];
    if (crew.length < 2) return null;
    if (this.pressed !== null || this.quiet || this.jumped || shared(MENU_OPEN)) return null;
    return { s, crew };
  }

  // The pointer entered a badge with two or more agents. A hover of it that has armed and is not
  // forgotten yet (the pointer back from the card, or away for less than GRACE, the native card
  // perhaps closed already) goes on without a new read; otherwise a new hover begins,
  // and only once it has lasted ARM does it read (a pointer crossing the badge reads nothing).
  enterBadge(id, cx) {
    this.dropping?.cancel();
    if (this.armed === id && this.peek === id) return;
    this.endHover();
    this.peek = id;
    delete this.tried[id];
    const gen = this.gen;
    this.arming = cx.timer.after(ARM, (cx) => {
      if (gen !== this.gen || (this.hot !== id && this.cardHot !== id)) return;
      const on = this.live(id);
      if (!on) return;
      this.armed = id;
      if (this.docOf(on.s.machine ?? null, cx)) this.tried[id] = fingerprint(on.crew);
    });
  }

  // The pointer left the badge or its card: once it is on neither for GRACE, the card is gone.
  leaveHover(id, cx) {
    this.dropping?.cancel();
    const gen = this.gen;
    this.dropping = cx.timer.after(GRACE, (cx) => {
      if (gen !== this.gen || this.peek !== id || this.hot === id || this.cardHot === id) return;
      this.endHover();
      cx.notify();
    });
  }

  // No hover any more: no card content, no reads, no timer of it left to fire. Also on a menu,
  // a jump or a press on a row: the next entry starts anew.
  endHover() {
    this.arming?.cancel();
    this.dropping?.cancel();
    this.arming = this.dropping = null;
    this.gen++;
    this.peek = this.armed = this.lit = this.cardHot = null;
  }

  // While a card is open (its hover lasted ARM): its agents moved where the tree read doesn't
  // have them (a new split, a new tab), read once more, once per new set of agents, failed or
  // not. A hover whose space is gone or down to one agent ends here.
  rereadDue(sp, cx) {
    if (!this.peek) return;
    const s = sp.find((x) => x.id === this.peek);
    if (!s || narrow() || agents().filter((a) => a.space === s.id).length < 2) { this.endHover(); return; }
    if (this.armed !== this.peek) return;
    const on = this.live(this.peek, sp);
    if (!on) return;
    const fp = fingerprint(on.crew);
    if (this.tried[s.id] === fp) return;
    const doc = this.docs[s.machine ?? ""]?.value ?? null;
    if (!quicklook(on.crew, s.tabs, doc, s.machine ?? null).some((g) => !g.map) || this.docOf(s.machine ?? null, cx)) this.tried[s.id] = fp;
  }

  // To an agent's pane: its space and tab come with it.
  jump(a, cx) {
    run("pane.focus", { pane: a.pane });
    this.jumped = true;
    this.endHover();
    cx.notify();
  }

  orderingDue(now) {
    return this.ordering && now - this.ordering.at >= 1000
      && this.ordering.machines.every(name => machines().some(m => m.name === name && m.layout === "ready"));
  }

  // Spaces in order, a repo's worktree spaces together: under its main checkout's
  // space, or, when no space is there (Herdr makes each worktree its own space),
  // where the first of them was.
  ordered() {
    const sp = spaces(), ps = panes();
    // Answered: git spoke for its place, or it has no place to ask about.
    const answered = (w) => !JSON.parse(where(w, ps))[1] || where(w, ps) in this.git;
    const late = (since) => Date.now() - since > WAIT;
    const firstReady = late(this.start) || sp.every((w) => !this.first.has(w.id) || answered(w));
    const ready = (w) => this.shown.has(w.id)
      || (this.first.has(w.id) ? firstReady : answered(w) || late(this.born[w.id] ??= Date.now()));
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null }));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    const trees = {}; // repo -> how many worktree spaces it has
    for (const r of list) if (r.g?.linked) trees[r.g.repo] = (trees[r.g.repo] ?? 0) + 1;
    // A lone worktree without its main checkout stays a space of its own.
    const nested = (r) => r.g?.linked && (mains.has(r.g.repo) || trees[r.g.repo] > 1);
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed
    // `tree`: a worktree row, drawn on its repo's card.
    const kids = (repo) => list.filter((k) => nested(k) && k.g.repo === repo).map((k) => ({ ...k, tree: true }));
    this.cards = {}; // space -> the spaces of its card, in order (only spaces on a card)
    const card = (rows) => {
      const ids = rows.map((r) => r.w.id);
      if (ids.length > 1) for (const id of ids) this.cards[id] = ids;
      out.push(...rows);
    };
    for (const r of list) {
      if (nested(r)) {
        if (mains.has(r.g.repo) || placed.has(r.g.repo)) continue;
        placed.add(r.g.repo);
        card(kids(r.g.repo));
        continue;
      }
      if (!r.g || r.g.linked || placed.has(r.g.repo)) { out.push({ ...r, tree: false }); continue; }
      placed.add(r.g.repo);
      card([{ ...r, tree: false }, ...kids(r.g.repo)]);
    }
    // Not before the first answers: half the git known, worktrees would move twice.
    // An attempted write can lose a sync conflict: allow the echo to settle before retrying.
    const order = sp.map(w => w.id);
    const target = out.map(r => r.w.id);
    const key = JSON.stringify([order, target, machines()]);
    if (order.every((id, i) => id === target[i])) {
      this.ordering = null;
    } else if (firstReady && (this.ordering?.key !== key || this.orderingDue(Date.now()))) {
      this.ordering = { key, at: Date.now(), machines: this.arrange(order, target) };
    }
    return out.filter(r => this.shown.has(r.w.id));
  }

  // Moves the spaces from `order` into `target` (both: space ids, all of them).
  // Simulates the batch so later indexes include earlier moves. Returns the
  // machines that had a space moved.
  arrange(order, target) {
    const on = Object.fromEntries(spaces().map((s) => [s.id, s.machine ?? null]));
    const now = [...order];
    const moved = new Set();
    for (let i = 0; i < target.length; i++) {
      const from = now.indexOf(target[i]);
      if (from === i || from === -1) continue;
      run("space.move", { id: target[i], index: i + 1 });
      moved.add(on[target[i]] ?? null);
      now.splice(i, 0, now.splice(from, 1)[0]);
    }
    return [...moved];
  }

  // A drag from `from` let go on `onto`: above it when it came from below, under
  // it when from above. A card's first row (or its header) carries the whole card,
  // so a card without a space in its main checkout keeps its first worktree on top;
  // any other row moves alone, and back onto its card if it left it.
  drop(from, onto) {
    const order = spaces().map((s) => s.id);
    const card = this.cards?.[from];
    const rows = card && card[0] === from && !card.includes(onto) ? card : [from];
    const down = order.indexOf(from) < order.indexOf(onto);
    const target = order.filter((id) => !rows.includes(id));
    const at = target.indexOf(onto);
    if (at === -1) return;
    target.splice(at + (down ? 1 : 0), 0, ...rows);
    this.arrange(order, target);
  }

  // Press, move over and let go: a row's drag, or a card header's for its first row.
  draggable(el, id, machine, click) {
    return el
      .on_mouse_down("left", () => {
        this.pressed = id;
        this.over = id;
        this.badgePress = null;
        this.endHover();
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === machine ? id : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === id && from !== id) this.drop(from, id);
        else if (from === id) click?.();
        cx.notify();
      });
  }

  // The rows, under a header per machine once one isn't this computer.
  grouped(t, collapsed) {
    const rows = this.ordered();
    const crew = {}; // space -> its agents
    for (const a of agents()) (crew[a.space] ??= []).push(a);
    const tint = settings().dark ? "2e" : "24"; // the avatar's tint, read once per draw
    const one = (r) => (collapsed ? this.compact(r, t) : this.row(r, t, crew[r.w.id] ?? [], tint));
    // A repo and its worktrees: one card, a little apart from the rest. Without a
    // space in the main checkout, the repo's name heads the card.
    const draw = (list) => {
      const groups = [];
      for (const r of list) {
        const last = groups[groups.length - 1];
        if (r.tree && last && last[0].g?.repo === r.g.repo) last.push(r);
        else groups.push([r]);
      }
      // Dragging a card's first row carries the card: the card fades, not the row.
      const away = (g) => this.pressed === g[0].w.id && !g.some((r) => r.w.id === this.over);
      return groups.map((g) => ((g.length < 2 && !g[0].tree) || collapsed ? g.map(one) : [
        v_flex().id(`repo-${g[0].w.id}`).flex_none().my(6).p(3).gap(2).rounded(10).border_1().border_color(t.border)
          .when(away(g), (el) => el.opacity(0.5))
          .when(Boolean(g[0].tree), (el) => el.child(this.draggable(h_flex().id(`repo-head-${g[0].w.id}`)
            .h(24).flex_none().px(9).gap(7).items_center()
            .text_size(11.5).text_color(t.muted)
            .child(svg("mods/workspace-chrome/folder.svg").size(12).flex_none().text_color(t.dim))
            .child(div().min_w(0).truncate().font_medium().child(g[0].g.name)), g[0].w.id, g[0].w.machine ?? null)))
          .children(g.map(one)),
      ])).flat();
    };
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    const loadingRow = m => div().id(`machine-loading-${m ?? "local"}`).h(28).flex_none().px(8).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : draw(rows);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const head = h_flex().id(`machine-${m ?? "local"}`).h(26).flex_none().px(collapsed ? 2 : 8).gap(7).items_center().text_size(11).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => {
          folded ? this.folded.delete(m) : this.folded.add(m);
          localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${m ? "server" : "monitor"}.svg`).size(13).flex_none())
        .when(!collapsed, el => el.child(div().flex_1().truncate().child(m ?? "This computer"))
          .when(!connected && !rebuilt, el => el.child(div().flex_none().child((machine?.state ?? "asleep").replace(/_/g, " "))))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center()
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(connected, el => el.child(div().id(`machine-add-${m ?? "local"}`).flex_none().px(4).rounded(4).hover(s => s.bg(t.hover).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); run("space.new", { machine: m ?? "" }); }).child("+")))
          .child(div().size(6).rounded(3).flex_none().bg(connected ? t.ansi2 : t.dim))
          .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none()));
      const empty = h_flex().id(`machine-new-${m ?? "local"}`).h(28).flex_none().px(8).gap(7).items_center().rounded(7)
        .text_size(12).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click(() => run("space.new", { machine: m ?? "" }))
        .child(svg("mods/workspace-chrome/plus.svg").size(12)).when(!collapsed, el => el.child("New space there"));
      if (!collapsed && rebuilt) return [head];
      return [head, ...(folded ? [] : mine.length ? draw(mine) : [loading(m) ? loadingRow(m) : empty])];
    });
  }

  // Under the name: "repo · branch ↑2 ↓1 ±3" (space-text.js's gitWhere says what goes).
  // A worktree row has the branch icon on its left already. Null: nothing to show.
  gitLine(g, tree, name, t, id) {
    const where = gitWhere(g, tree, name);
    if (where === null) return null;
    return h_flex()
      .min_w(0)
      .gap(5)
      .items_center()
      .text_size(11.5)
      .text_color(t.dim)
      .when(Boolean(where), (el) => el
        .when(!tree, (el) => el.child(svg("mods/workspace-chrome/branch.svg").size(11).flex_none()))
        .child(div().min_w(0).truncate().child(where)))
      .when(g.ahead > 0, (el) => el.child(div().flex_none().text_color(t.muted).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().flex_none().text_color(t.muted).child(`\u2193${g.behind}`)))
      .when(g.dirty > 0, (el) => el.child(div().id(`dirty-${id}`).flex_none().tooltip(changesTip(g.dirty)).child(`\u00b1${g.dirty}`)));
  }

  // How many agents run in the space. Gray while they all rest; else the color
  // of the most urgent one (blocked > done > working). One agent: its tooltip, and a click goes
  // to it. Two or more: the quicklook on hover.
  crewBadge(w, crew, t) {
    const id = w.id;
    const { top, calm, n, tip } = badge(crew.map((a) => a.status));
    const color = calm ? t.dim : tone(t, top);
    const many = crew.length > 1;
    const pill = h_flex()
      .id(`crew-${id}`)
      .flex_none()
      .h(18)
      .px(6)
      .gap(4)
      .items_center()
      .rounded(9)
      .text_size(11)
      .font_semibold()
      .bg(calm ? t.selected : alpha(color, "26") ?? t.selected)
      .text_color(color)
      .when(!many, (el) => el.tooltip(tip))
      .on_hover((on, cx) => {
        if (on) {
          this.hot = id;
          this.jumped = false;
          if (many) this.enterBadge(id, cx);
        } else {
          if (this.hot === id) this.hot = null;
          this.badgePress = null;
          this.jumped = false;
          this.left = true;
          if (this.quiet && !shared(MENU_OPEN)) this.quiet = false;
          if (many) this.leaveHover(id, cx);
        }
        cx.notify();
      })
      // A press here starts no space drag; its release still ends one (a drop on this row).
      .on_mouse_down("left", (_e, cx) => {
        this.badgePress = id;
        cx.stop_propagation();
      })
      // Its own press let go here: to the one agent, or with more to the space (the row's click,
      // which the stopped press never reached), the card then empty as after a jump.
      .on_mouse_up("left", (_e, cx) => {
        const mine = this.badgePress === id;
        this.badgePress = null;
        if (!mine) return;
        if (!many) return this.jump(crew[0], cx);
        run("space.select", { id });
        this.jumped = true;
        this.endHover();
        cx.notify();
      })
      .child(svg("mods/roundup-spaces/bot.svg").size(11))
      .child(String(n));
    if (!many) return pill;
    // Only the badge entered last can have its card open. The card's layer is above popups: empty
    // while the menu is open, after a jump and during a drag.
    const shown = this.peek === id && !this.quiet && !this.jumped && this.pressed === null && !shared(MENU_OPEN);
    return HoverCard.new(`quick-${id}`).anchor("top_left").open_delay(400).close_delay(150).trigger(pill)
      .content(shown ? this.quickCard(w, crew, t) : div());
  }

  // The quicklook: the space's agents by tab, each tab with a map of its panes when the core
  // document has them all (pane-map.js); without, the same rows on a narrower card.
  quickCard(w, crew, t) {
    const machine = w.machine ?? null;
    const groups = quicklook(crew, w.tabs, this.docs[machine ?? ""]?.value ?? null, machine);
    const maps = groups.some((g) => g.map);
    const word = (s) => (s === "idle" ? t.dim : tone(t, s));
    const dot = (s) => (s === "idle"
      ? div().size(7).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim)
      : div().size(7).flex_none().rounded(4).bg(tone(t, s)));
    const row = (a) => h_flex().id(`quick-row-${a.address}`).h(26).px(6).gap(8).items_center().rounded(6).cursor_pointer()
      .text_size(12).text_color(t.foreground)
      .when(this.lit === a.address, (el) => el.bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .on_hover((on, cx) => {
        if (on) this.lit = a.address;
        else if (this.lit === a.address) this.lit = null;
        cx.notify();
      })
      .on_click((_e, cx) => this.jump(a, cx))
      .child(dot(a.status))
      .when(Boolean(a.program?.icon), (el) => el.child(icon(a.program, 14, t.foreground)))
      .child(div().flex_1().min_w(0).truncate().child(clean(a.title) || a.program?.name || a.address))
      .child(div().flex_none().text_size(11).text_color(word(a.status)).child(WORD[a.status] ?? a.status));
    // Each child as wide (in a row) or high (in a column) as its weight, the frame fixed. Across
    // the axis every child fills its parent: h_flex centers its children, which would leave a
    // row's panes 0px high.
    const tile = (n) => {
      const el = (n.children ? (n.dir === "row" ? h_flex() : v_flex()).items_stretch().gap(2) : div().rounded(2))
        .flex_basis(0).flex_grow(n.weight).flex_shrink(1).min_w(0).min_h(0).self_stretch();
      if (n.children) return el.children(n.children.map(tile));
      if (n.agent) {
        const a = n.agent, lit = this.lit === a.address;
        return el.id(`quick-pane-${a.address}`).cursor_pointer().bg(tone(t, a.status)).opacity(lit ? 1 : 0.45)
          .when(lit, (el) => el.border(1).border_color(t.foreground))
          .on_click((_e, cx) => this.jump(a, cx));
      }
      return n.mod ? el.border(1).border_color(t.selected) : el.bg(t.selected);
    };
    const map = (g) => h_flex().w(60).h(40).flex_none().self_center().items_stretch().p(2).rounded(5).border(1).border_color(t.border)
      .child(tile(g.map));
    const section = (g, i) => v_flex().flex_none()
      .when(i > 0, (el) => el.child(div().h(1).mx(6).my(3).bg(t.border)))
      .child(h_flex().px(8).pt(7).pb(4).gap(8).text_size(11).text_color(t.dim)
        .child(div().flex_none().font_semibold().text_color(t.muted).child(String(g.index)))
        .when(g.name !== String(g.index), (el) => el.child(div().min_w(0).truncate().child(g.name))))
      .child(h_flex().px(4).pb(4).gap(8)
        .child(v_flex().flex_1().min_w(0).gap(1).children(g.rows.map(row)))
        .when(Boolean(g.map), (el) => el.child(map(g))));
    return v_flex().id(`quick-card-${w.id}`).mt(4).w(maps ? QUICK : QUICK_BARE).p(6).rounded(10).border(1).border_color(t.border)
      .bg(t.popover).shadow_lg()
      // The pointer on the card keeps it (and its reads) as on the badge.
      .on_hover((on, cx) => {
        if (on) {
          this.cardHot = w.id;
          this.dropping?.cancel();
        } else {
          if (this.cardHot === w.id) this.cardHot = null;
          this.leaveHover(w.id, cx);
        }
      })
      // Its presses stay here: none starts a drag of the row under it or opens that row's menu.
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_mouse_down("right", (_e, cx) => cx.stop_propagation())
      .child(v_flex().id(`quick-list-${w.id}`).max_h(QUICK_HIGH).overflow_y_scrollbar().children(groups.map(section)));
  }

  row({ w, i, g, tree }, t, crew, tint) {
    const on = w.active;
    const fromIndex = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const colors = shared("space.colors") ?? {};
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (t[color] ?? t.accent);
    const line = g ? this.gitLine(g, tree, w.name, t, w.id) : null;
    return this.draggable(v_flex()
      .relative()
      .id(`space-${w.id}`)
      .pl(tree ? 12 : 8)
      .pr(8)
      .h(line ? ROW_TWO : ROW)
      .flex_none()
      .justify_center()
      .rounded(8)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id && this.cards?.[w.id]?.[0] !== w.id, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === w.id && this.pressed !== w.id, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(fromIndex < i, bar => bar.bottom(0))
          .when(fromIndex > i, bar => bar.top(0)),
      ))
      .on_mouse_down("right", (_e, cx) => this.menu(w, cx))
      .child(
        h_flex()
          .gap(9)
          .items_center()
          .when(Boolean(tree), el => el.child(h_flex().size(22).flex_none().items_center().justify_center().text_color(t.dim)
            .child(svg("mods/workspace-chrome/branch.svg").size(13))))
          .when(!tree, el => el.child(h_flex().size(22).flex_none().rounded(6).bg(alpha(fill, tint) ?? t.selected)
            .items_center().justify_center().text_size(11.5).font_bold().text_color(fill).child([...w.name][0]?.toUpperCase() ?? "?")))
          .child(v_flex().flex_1().min_w(0).gap(2)
            .child(div().min_w(0).truncate().font_medium().text_color(t.foreground).child(w.name))
            .when(Boolean(line), el => el.child(line)))
          .when(crew.length > 0, el => el.child(this.crewBadge(w, crew, t))),
      ), w.id, w.machine ?? null, () => run("space.select", { id: w.id }));
  }

  compact({ w, i }, t) {
    return h_flex()
      .id(`space-${w.id}`)
      .h(26)
      .flex_none()
      .justify_center()
      .gap(4)
      .when(w.active, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().text_color(tone(t, w.status)).child(glyph(w.status)));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    // The menu closed after the badge was left (or before): the card may show again.
    if (this.quiet && this.left && !shared(MENU_OPEN)) this.quiet = false;
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new")).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(8).pb(14).gap(2).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; this.badgePress = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}
