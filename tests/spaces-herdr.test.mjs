// node --test 'tests/*.test.mjs'
// roundup-spaces: what came over from Herdr's spaces 0.1.15 to 0.1.18 (L1 for the pure parts, L2
// for the view): the emoji avatar, a bare repo's name, the limit of looks at once, forgetting
// places and their watches, the active space kept in view, a machine that needs a login.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { herdr, reset, mount, byId, find, texts, space, tab, waitFor } from "./support/harness.mjs";
import { spaceAvatar, gitWhere } from "../mods/roundup-spaces/space-text.js";
import { repoName, parseRevParse } from "../mods/roundup-spaces/git-parse.js";

const Spaces = (await import("../mods/roundup-spaces/main.js")).default;

beforeEach(reset);
const key = (cwd, on = null) => JSON.stringify([on, cwd]);
const sidebar = (px) => ({ id: "root", type: "row", children: [{ id: "sidebar", type: "column", size: { px }, children: [] }] });
const g = (repo, extra = {}) => ({ name: "proj", branch: "main", ahead: 0, behind: 0, dirty: 0, repo: key(repo), linked: false, ...extra });
// git answers for folders under /r as one repo with its git folder /r/.git; everything else is no repo.
function fakeGit() {
  herdr.onExec(({ args, options }) => {
    if (!String(options.cwd).startsWith("/r")) return { code: 128, stderr: "fatal: not a git repository" };
    if (args.includes("status")) return { stdout: "# branch.head main\n" };
    return { stdout: `${options.cwd}\n/r/.git\n` };
  });
}
const scrolls = (view) => view.scroll.calls.filter(([m]) => m === "scroll_to_item").map(([, i]) => i);

test("SPC-42: the avatar keeps a name's whole leading emoji, else its first character in upper case", () => {
  assert.equal(spaceAvatar("🚀 api"), "🚀");
  assert.equal(spaceAvatar("👍🏽 ok"), "👍🏽", "with its skin tone");
  assert.equal(spaceAvatar("🇩🇪 docs"), "🇩🇪", "a flag is two code points");
  assert.equal(spaceAvatar("1️⃣ first"), "1️⃣", "a keycap");
  assert.equal(spaceAvatar("👨‍👩‍👧 family"), "👨‍👩‍👧", "joined emoji");
  assert.equal(spaceAvatar("api"), "A");
  assert.equal(spaceAvatar("ärger"), "Ä");
  assert.equal(spaceAvatar("1st"), "1", "a digit alone is no keycap");
  assert.equal(spaceAvatar(""), "?");
});

test("SPC-42: the git line leaves out a repo or branch the name says after its emoji", () => {
  assert.equal(gitWhere({ name: "api", branch: "main", ahead: 0, behind: 0, dirty: 0 }, false, "🚀 api"), null);
  assert.equal(gitWhere({ name: "proj", branch: "api", ahead: 1, behind: 0, dirty: 0 }, false, "🚀 API"), "proj");
  assert.equal(gitWhere({ name: "proj", branch: "feature", ahead: 0, behind: 0, dirty: 0 }, false, "🚀 api"), "proj · feature");
});

test("SPC-43: a repo kept as <project>/.bare is named after its project", () => {
  assert.equal(repoName("/src/proj/.git"), "proj");
  assert.equal(repoName("/srv/x.git"), "x");
  assert.equal(repoName("/src/proj/.bare"), "proj");
  assert.equal(repoName("/src/proj/.bare/"), "proj");
  assert.deepEqual(parseRevParse("/src/proj/main\n/src/proj/.bare\n", 0), { top: "/src/proj/main", repo: "/src/proj/.bare", name: "proj", linked: true });
});

test("SPC-44: a look git couldn't answer keeps what it knew of the place, and is asked again", async () => {
  fakeGit();
  const { view, cx } = mount(Spaces, { props: {} });
  await view.check(key("/r"), cx);
  const known = view.git[key("/r")];
  assert.equal(known.branch, "main");
  herdr.onExec((c) => (c.args.includes("status") ? { code: 128, stderr: "fatal: unable to read index" } : undefined), { times: 1 });
  await view.check(key("/r"), cx);
  assert.deepEqual(view.git[key("/r")], known, "its worktrees stay on their card");
  assert.equal(view.unsure.has(key("/r")), true);
  await view.check(key("/elsewhere"), cx);
  assert.equal(view.git[key("/elsewhere")], null, "git's own no is still kept as no repo");
});

test("SPC-45: at most six places are looked at together, and every place is looked at", async () => {
  let running = 0, most = 0;
  const seen = new Set();
  herdr.onExec(async ({ options }) => {
    running++;
    most = Math.max(most, running);
    seen.add(options.cwd);
    await new Promise((r) => setTimeout(r, 2));
    running--;
    return { code: 128, stderr: "fatal: not a git repository" };
  });
  const { view, cx } = mount(Spaces, { props: {} });
  const keys = Array.from({ length: 20 }, (_, i) => key(`/p${i}`));
  view.refreshGit(keys, cx);
  await waitFor(() => !view.refreshing);
  assert.equal(most, 6);
  assert.equal(seen.size, 20);
  assert.deepEqual(cx.errors, []);
});

test("SPC-46: a place no space is in is forgotten, and a repo no shown place is in is no longer watched", async () => {
  fakeGit();
  const show = (folders) => herdr.set({ spaces: folders.map((f, i) => space(`s${i}`, [tab(`tb${i}`)], { folder: f, active: i === 0 })) });
  show(["/r", "/r/wt", "/plain"]);
  const { view, cx } = mount(Spaces, { props: {} });
  const look = async () => { const due = view.due(Date.now(), herdr.stub.spaces, []); if (due.size) view.refreshGit(due, cx); await waitFor(() => !view.refreshing); };
  await look();
  assert.deepEqual(Object.keys(view.git).sort(), [key("/plain"), key("/r"), key("/r/wt")].sort());
  assert.equal(herdr.watching("/r/.git"), 1, "one watch for the repo's two places");
  // A change in the repo: its places are looked at again and the watch is set again.
  herdr.clear();
  herdr.change("/r/.git");
  await waitFor(() => herdr.calls("exec").length >= 4 && !view.refreshing);
  assert.equal(herdr.watching("/r/.git"), 1);
  show(["/r/wt", "/plain"]);
  await look();
  assert.equal(key("/r") in view.git, false, "the place that went is forgotten");
  assert.equal(key("/r") in view.checked, false);
  assert.equal(herdr.watching("/r/.git"), 1, "another place is still in the repo");
  show(["/plain"]);
  await look();
  assert.deepEqual(Object.keys(view.git), [key("/plain")]);
  assert.equal(herdr.watching("/r/.git"), 0, "the watch is cancelled");
  assert.deepEqual(herdr.calls("watchFolder.cancel"), [["/r/.git"]]);
  assert.equal(view.watching.size, 0);
  assert.deepEqual(cx.errors, []);
});

test("SPC-47: the list scrolls to the active space, counted among its children: a card is one, a machine's header and note count", () => {
  herdr.onExec(() => ({ code: 128, stderr: "fatal: not a git repository" }));
  const sp = (id, extra = {}) => space(id, [tab(`tb-${id}`)], { name: id, folder: `/${id}`, ...extra });
  herdr.set({ layout: sidebar(268), spaces: [sp("a"), sp("b"), sp("c", { active: true }), sp("d")] });
  const { view, cx, render } = mount(Spaces, { props: {} });
  // b is a repo's main checkout, c its worktree: they share a card.
  Object.assign(view.git, { [key("/a")]: null, [key("/b")]: g("/b/.git"), [key("/c")]: g("/b/.git", { linked: true, branch: "c" }), [key("/d")]: null });
  let root = render();
  assert.ok(byId(root, "repo-b"), "the card");
  assert.equal(view.activeAt, 1, "a, then the card that holds c");
  assert.deepEqual(scrolls(view), [1]);
  render();
  assert.deepEqual(scrolls(view), [1], "nothing changed: not again");
  const list = find(root, (e) => e.style("track_scroll")?.[0] === view.scroll);
  list.handlers.size_change({}, cx);
  assert.deepEqual(scrolls(view), [1, 1], "the list changed size");
  herdr.set({ spaces: [sp("a"), sp("b"), sp("c"), sp("d", { active: true })] });
  render();
  assert.deepEqual([view.activeAt, scrolls(view).at(-1)], [2, 2]);
  // With another machine: this computer's header, its rows, the machine's header, its login note, its rows.
  herdr.set({ spaces: [sp("a"), sp("e", { machine: "box", active: true })], machines: [{ name: null, layout: "ready" }, { name: "box", layout: "ready" }] });
  view.machines = [{ name: "box", target: "box.example", state: "needs_login" }];
  view.git[key("/e", "box")] = null;
  root = render();
  assert.ok(byId(root, "machine-login-box"));
  assert.equal(view.activeAt, 4, "header, a, header, note, e");
  view.folded.add("box");
  render();
  assert.equal(view.activeAt, -1, "folded away: nothing to scroll to");
  assert.deepEqual(cx.errors, []);
});

test("SPC-48: a machine that needs a login says the command with a Copy button; on the rail its tooltip says so and a click opens Settings", () => {
  herdr.onExec(() => ({ code: 128, stderr: "fatal: not a git repository" }));
  herdr.set({ layout: sidebar(268), spaces: [space("s1", [tab("tb1")], { active: true, name: "srv", machine: "box" })] });
  const { view, cx, render } = mount(Spaces, { props: {} });
  view.machines = [{ name: "box", target: "box.example", state: "needs_login" }];
  let root = render();
  const note = byId(root, "machine-login-box");
  assert.deepEqual(texts(note), ["needs a login: run", "hc machine login box", "Copy"]);
  assert.ok(!texts(byId(root, "machine-box")).includes("needs login"), "the state word is left out beside the note");
  byId(root, "machine-login-copy-box").handlers.click({}, cx);
  assert.equal(cx.clipboard, "hc machine login box");
  assert.ok(texts(byId(render(), "machine-login-box")).includes("Copied"));
  herdr.set({ layout: sidebar(44) });
  root = render();
  assert.equal(find(root, (e) => e.elementId === "machine-login-box"), undefined, "no note on the rail");
  const head = byId(root, "machine-box");
  assert.deepEqual(head.style("tooltip"), ["box needs a login: run hc machine login box. Click for Copy."]);
  head.handlers.click({}, cx);
  assert.deepEqual(herdr.calls("run").at(-1), ["app.settings", { section: "machines" }]);
  assert.ok(!view.folded.has("box"), "the click doesn't fold");
  assert.deepEqual(cx.errors, []);
});

test("SPC-49: a machine whose programs stop at logout shows a warning in its header that opens the fix", () => {
  herdr.onExec(() => ({ code: 128, stderr: "fatal: not a git repository" }));
  herdr.set({ layout: sidebar(268), spaces: [space("s1", [tab("tb1")], { active: true, name: "srv", machine: "box" })] });
  const { view, cx, render } = mount(Spaces, { props: {} });
  view.machines = [{ name: "box", target: "box.example", state: "connected", keeps_running_after_logout: false }];
  const warn = byId(render(), "machine-logout-box");
  assert.deepEqual([texts(warn), warn.style("text_color"), warn.style("tooltip")], [["⚠"], ["blocked"], ["Agents stop when you disconnect. Click for the fix."]]);
  warn.handlers.click({}, cx);
  assert.deepEqual(herdr.calls("openOverlay").at(-1)[0], { mod: "machine-add", kind: "dialog", width: 560 });
  assert.equal(cx.stopped, 1, "the header doesn't fold");
  view.machines = [{ name: "box", target: "box.example", state: "connected", keeps_running_after_logout: true }];
  assert.equal(find(render(), (e) => e.elementId === "machine-logout-box"), undefined);
});

test("SPC-50: what localStorage holds of machines is read with care", () => {
  localStorage.setItem("machines.reconnecting", "{broken");
  localStorage.setItem("machines.folded", "oops");
  let view = mount(Spaces, { props: {} }).view;
  assert.deepEqual([view.reconnecting, [...view.folded]], [{}, []]);
  localStorage.setItem("machines.reconnecting", JSON.stringify(["box"]));
  localStorage.setItem("machines.folded", JSON.stringify(["box"]));
  view = mount(Spaces, { props: {} }).view;
  assert.deepEqual([view.reconnecting, [...view.folded]], [{}, ["box"]]);
});

test("SPC-51: while herdr-app check loads the mod, it asks hc for nothing", async () => {
  herdr.set({ checking: true });
  mount(Spaces, { props: {} });
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(herdr.calls("hc"), []);
  herdr.set({ checking: false });
  mount(Spaces, { props: {} });
  await waitFor(() => herdr.calls("hc").length === 1);
  assert.deepEqual(herdr.calls("hc"), [[["machine", "ls", "--json"]]]);
});
