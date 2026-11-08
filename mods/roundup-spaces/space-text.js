// What a space's row says and where it is: its place, the git line under its name, the
// agents badge, a tinted color, and whether its machine was rebuilt. Pure, so
// tests/space-text.test.mjs runs it in node.

// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
export function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A color with some transparency: the theme's own color under a tinted avatar or badge.
// #rgb, #rrggbb and #rrggbbaa alike (a layout's `colors` may carry their own alpha).
// Null for any other form: the caller then draws on a neutral background, so a
// letter never sits on its own color.
export const alpha = (c, a) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c ?? "");
  if (!m) return null;
  const rgb = m[1].length === 3 ? [...m[1]].map((d) => d + d).join("") : m[1];
  return `#${rgb}${a}`;
};

// Agents by urgency: the badge takes the color of the most urgent one.
const RANK = { blocked: 3, done: 2, working: 1, idle: 0 };
export const rank = (status) => RANK[status] ?? 0;

// The agents badge for their statuses (at least one): the most urgent (`top`), whether all
// are idle (`calm`), and its tooltip, by urgency.
export function badge(statuses) {
  const top = statuses.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const counts = {};
  for (const s of statuses) counts[s] = (counts[s] ?? 0) + 1;
  const n = statuses.length;
  const tip = `${n} agent${n === 1 ? "" : "s"}: ` + Object.keys(counts).sort((a, b) => rank(b) - rank(a)).map((s) => `${counts[s]} ${s}`).join(", ");
  return { top, calm: rank(top) === 0, n, tip };
}

// The git line's "repo · branch" for git answer `g` under the space `name`: the repo goes when
// the name already says it (and in a worktree, `tree`, whose card names it); the branch when
// the space is named after it (a worktree is), and master/main: nearly every space is on one.
// "" when only ↑ ↓ ± are left to show; null when nothing is.
export function gitWhere(g, tree, name) {
  const raw = g.branch ?? "detached";
  const same = (a) => a.toLowerCase() === name.toLowerCase();
  const branch = same(raw) || raw === "main" || raw === "master" ? "" : raw;
  const repo = tree || same(g.name) ? "" : g.name;
  const where = [repo, branch].filter(Boolean).join(" \u00b7 ");
  return !where && !g.ahead && !g.behind && !g.dirty ? null : where;
}
export const changesTip = (n) => `${n} uncommitted change${n === 1 ? "" : "s"}`;

// A machine replaced by another at its address: Herdr's core says so in `why`.
export const rebuilt = (machine) => machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
