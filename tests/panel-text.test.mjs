// node --test 'tests/*.test.mjs' (Node 22.15 or later: it loads the mods' files as ES modules without a package.json).
// What roundup-files' panel says: notes, footer, link tooltips, git's colors.
import { test } from "node:test";
import assert from "node:assert/strict";
import { listNote, footerLines, linkTip, statusColor, changeColors, gitReason, limits, thousands } from "../mods/roundup-files/panel-text.js";

const git = (over = {}) => ({ repo: true, known: true, missing: false, failed: false, rootUntracked: false, rootIgnored: false, ...over });
const panel = (over = {}) => ({ error: null, root: "/r", view: "all", git: git(), query: "", searching: false, hits: null, searchError: null, index: null, loading: false, ...over });
const changed = (gitOver, over = {}) => listNote(panel({ view: "changed", git: git(gitOver), ...over }), []);

test("Changed notes: reading git, no repo or no git, git failed, new or ignored folder, no changes", () => {
  assert.equal(changed({ known: false }), "Reading git…");
  assert.equal(changed({ repo: false }), "Not a git repository");
  assert.equal(changed({ repo: false, missing: true }), "Git not found");
  assert.equal(changed({ failed: true }), "Git can't read this folder");
  assert.equal(changed({ rootUntracked: true }), "This whole folder is new to git");
  assert.equal(changed({ rootIgnored: true }), "Git ignores this whole folder");
  assert.equal(changed({}), "No changes");
  assert.equal(changed({}, { query: " x " }), "No matching changes");
  assert.equal(listNote(panel({ view: "changed" }), [{ rel: "a" }]), null);
});

test("All notes: no folder, loading, empty, searching, no matches with or without ignored files", () => {
  assert.equal(listNote(panel({ root: null }), []), "No folder");
  assert.equal(listNote(panel({ loading: true }), []), "Loading files…");
  assert.equal(listNote(panel(), []), "Empty folder");
  assert.equal(listNote(panel(), [{ rel: "a" }]), null);
  assert.equal(listNote(panel({ searching: true }), []), "Searching…");
  assert.equal(listNote(panel({ hits: [], index: { from: "git" } }), []), "No matches · ignored files left out");
  assert.equal(listNote(panel({ hits: [], index: { from: "disk" } }), []), "No matches");
  assert.equal(listNote(panel({ hits: [], searchError: "Cannot open this folder" }), []), "Cannot open this folder");
  // A folder that failed to load says why, in either view.
  assert.equal(listNote(panel({ error: "boom", view: "changed" }), []), "boom");
});

test("The footer: folders cut at 500, 200 matches, Changed's 2,000 paths, an index cut short", () => {
  assert.deepEqual(footerLines({ limited: true, hits: null }), ["Folders show their first 500 entries"]);
  assert.deepEqual(footerLines({ limited: true, hits: [] }), []);
  assert.deepEqual(footerLines({ hits: Array(200).fill("a") }), ["First 200 matches"]);
  assert.deepEqual(footerLines({ hits: Array(199).fill("a") }), []);
  assert.deepEqual(footerLines({ view: "changed", changedCut: true }), ["Changed shows the first 2,000 paths"]);
  assert.deepEqual(footerLines({ view: "changed", changedCut: false }), []);
  assert.deepEqual(footerLines({ hits: [], index: { full: false, cut: ["dirs"] } }), ["Search covers the first 20,000 folders"]);
  assert.deepEqual(footerLines({ hits: [], index: { full: false, cut: ["dirs", "files"] } }), ["Search covers the first 20,000 folders and the first 40,000 files"]);
  assert.equal(limits([]), "part of this folder");
  assert.equal(thousands(1234567), "1,234,567");
  assert.equal(thousands(999), "999");
});

test("linkTip: link, broken link, empty target, no access", () => {
  assert.equal(linkTip({ link: "a.md", broken: false, blocked: false }), "Link to a.md");
  assert.equal(linkTip({ link: "gone", broken: true, blocked: false }), "Broken link to gone");
  assert.equal(linkTip({ link: "", broken: false, blocked: false }), "Link");
  assert.equal(linkTip({ link: "/secret/x", broken: false, blocked: true }), "Link to /secret/x (no access to check it)");
});

test("Status colors are theme names", () => {
  const t = new Proxy({}, { get: (_, k) => k });
  const of = (s) => statusColor(t, s);
  assert.deepEqual(["D", "U", "?", "A", "C", "R", "M", "T"].map(of), ["ansi1", "ansi1", "ansi2", "ansi2", "ansi2", "ansi4", "ansi3", "ansi3"]);
  assert.equal(of(null), null);
  assert.deepEqual(changeColors(t), ["ansi2", "ansi3", "ansi1"]);
});

test("gitReason says why git's files can't serve a search, once git has answered", () => {
  assert.equal(gitReason(git({ known: false })), "");
  assert.equal(gitReason(git({ rootIgnored: true })), "Git ignores this folder");
  assert.equal(gitReason(git()), "Git can't list this folder");
  assert.equal(gitReason(git({ repo: false })), "Not a git repository");
  assert.equal(gitReason(git({ repo: false, missing: true })), "Git not found");
});
