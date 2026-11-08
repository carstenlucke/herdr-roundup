// What the panel says: the note over an empty list, the footer's lines, a link's tooltip,
// why search can't use git's files, and git's colors (theme names, from the theme `t`).
// Pure, so tests/panel-text.test.mjs runs it in node.
import { PER_FOLDER, INDEX_DIRS, INDEX_PATHS } from "./disk-rules.js";
import { CHANGED_LIMIT } from "./rows.js";
import { FIND_LIMIT } from "./search.js";

export const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// What cut an index short, for the footer: "the first 20,000 folders and the first 40,000 files".
export const limits = (cut = []) => cut.map((c) => (c === "dirs" ? `the first ${thousands(INDEX_DIRS)} folders` : `the first ${thousands(INDEX_PATHS)} files`)).join(" and ") || "part of this folder";
// Why a folder has no repo: git found none, or no git started there.
export const noRepo = (g) => (g.missing ? "Git not found" : "Not a git repository");
export const GIT_FAILED = "Git can't read this folder";
// A link row's tooltip: where it points, as written.
export const linkTip = (r) => `${r.broken ? "Broken link" : "Link"}${r.link ? ` to ${r.link}` : ""}${r.blocked ? " (no access to check it)" : ""}`;
// Git's colors: new green and deleted red, as in Herdr's `files` and `changes`; modified
// yellow (ansi3) rather than their `blocked`, which many themes draw close to red.
export const statusColor = (t, s) => (!s ? null : s === "D" || s === "U" ? t.ansi1 : s === "?" || s === "A" || s === "C" ? t.ansi2 : s === "R" ? t.ansi4 : t.ansi3);
export const changeColors = (t) => [t.ansi2, t.ansi3, t.ansi1]; // NEW, MODIFIED, DELETED

// Why git's files can't serve a search here, once git has answered.
export function gitReason(g) {
  return !g.known ? "" : g.rootIgnored ? "Git ignores this folder" : g.repo ? "Git can't list this folder" : noRepo(g);
}

// The note over the list (null: none). s: the panel's { error, root, view, git, query,
// searching, hits, searchError, index, loading }; rows: what the list shows.
export function listNote(s, rows) {
  const g = s.git;
  if (s.error) return s.error;
  if (!s.root) return "No folder";
  if (s.view === "changed") {
    if (!g.known) return "Reading git…";
    if (!g.repo) return noRepo(g);
    if (g.failed) return GIT_FAILED;
    return rows.length ? null : s.query.trim() ? "No matching changes" : g.rootUntracked ? "This whole folder is new to git" : g.rootIgnored ? "Git ignores this whole folder" : "No changes";
  }
  if (s.searching && !rows.length) return "Searching…";
  if (s.hits && s.searchError) return s.searchError;
  if (s.hits) return rows.length ? null : s.index?.from === "git" ? "No matches · ignored files left out" : "No matches";
  if (s.loading && !rows.length) return "Loading files…";
  return rows.length ? null : "Empty folder";
}

// The footer's lines. s: the panel's { limited, hits, view, changedCut, index }.
export function footerLines(s) {
  const more = [];
  if (s.limited && !s.hits) more.push(`Folders show their first ${PER_FOLDER} entries`);
  if (s.hits?.length >= FIND_LIMIT) more.push(`First ${FIND_LIMIT} matches`);
  if (s.view === "changed" && s.changedCut) more.push(`Changed shows the first ${thousands(CHANGED_LIMIT)} paths`);
  if (s.hits && s.index && !s.index.full) more.push(`Search covers ${limits(s.index.cut)}`);
  return more;
}
