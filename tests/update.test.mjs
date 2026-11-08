// roundup-workspace-chrome's update check (update.js, and its command loop in main.js) with herdr stubbed
// and a fake fetch: nothing reaches GitHub, no browser opens, no tab is made.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { herdr, reset, fetch, response, clock, mount, waitFor, space, tab } from "./support/harness.mjs";
import { tempDir, cleanup } from "./support/git-repo.mjs";

const update = await import("../mods/roundup-workspace-chrome/update.js");
const { RELEASES, latest, check, due, available, install, openNotes } = update;
const PAGE = "https://github.com/carstenlucke/herdr-roundup/releases";
const KEY = (k) => `roundup-workspace-chrome.update.${k}`;
const state = (k) => herdr.shared(KEY(k));
const toasts = () => herdr.calls("notify").map(([n]) => n);
const runs = () => herdr.calls("run").map(([name, args]) => ({ name, args }));
const release = (tag, extra = {}) => ({ tag_name: tag, html_url: `${PAGE}/tag/${tag}`, ...extra });
const claude = { key: "claude", name: "Claude Code", run: ["claude"], installed: true };

beforeEach(() => {
  reset();
  // No real process: `open` would show a browser.
  herdr.onExec(() => ({ code: 0 }));
});
after(cleanup);

test("latest sends one plain GET to the releases API with only Accept and User-Agent", async () => {
  fetch.reply(200, release("v0.9.0"));
  await latest();
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, RELEASES);
  assert.equal(fetch.calls[0].init.method ?? "GET", "GET");
  assert.deepEqual(fetch.calls[0].init.headers, { Accept: "application/vnd.github+json", "User-Agent": "herdr-roundup" });
  assert.equal(fetch.calls[0].init.body, undefined);
});

test("latest says why it found no version, and reads one from the tag", async () => {
  const answers = [
    [() => new TypeError("fetch failed"), { ok: false, why: "No connection to api.github.com" }],
    [() => response(404), { ok: false, why: "No release on GitHub yet" }],
    [() => response(403), { ok: false, why: "GitHub's rate limit, try again in an hour" }],
    [() => response(429), { ok: false, why: "GitHub's rate limit, try again in an hour" }],
    [() => response(500), { ok: false, why: "GitHub answered 500" }],
    [() => response(200, "{not json"), { ok: false, why: "GitHub's answer couldn't be read" }],
    [() => response(200, release("latest")), { ok: false, why: "The latest release's tag isn't a version (latest)" }],
    [() => response(200, {}), { ok: false, why: "The latest release's tag isn't a version (none)" }],
    [() => response(200, release("v0.9.0-rc.1")), { ok: false, why: "The latest release's tag isn't a version (v0.9.0-rc.1)" }],
    [() => response(200, release("v01.02.03")), { ok: true, version: "1.2.3", url: `${PAGE}/tag/v01.02.03` }],
    [() => response(200, { tag_name: "v0.9.0" }), { ok: true, version: "0.9.0", url: PAGE }],
  ];
  for (const [respond, expected] of answers) {
    fetch.respond = respond;
    assert.deepEqual(await latest(), expected);
  }
});

test("check writes lastCheck before the answer, error on failure, checked and latest only on success", async () => {
  clock.useFakeNow();
  const gate = fetch.defer();
  const running = check("0.8.1", false);
  assert.equal(state("lastCheck"), Date.now(), "written while the fetch is out");
  clock.now += 5000;
  gate.reject();
  assert.equal(await running, "No connection to api.github.com");
  assert.equal(state("error"), "No connection to api.github.com");
  assert.equal(state("checked"), null);
  assert.equal(state("latest"), null);

  fetch.reply(200, release("v0.9.0"));
  assert.equal(await check("0.8.1", false), null);
  assert.equal(state("error"), null);
  assert.equal(state("checked"), Date.now());
  assert.deepEqual(state("latest"), { version: "0.9.0", url: `${PAGE}/tag/v0.9.0` });
});

test("the automatic check gives no toast on failure and one per new version, none for a dismissed one", async () => {
  fetch.reply(500);
  await check("0.8.1", false);
  assert.deepEqual(toasts(), []);

  fetch.reply(200, release("v0.9.0"));
  await check("0.8.1", false);
  assert.deepEqual(toasts(), [{
    level: "info", title: "Herdr Roundup 0.9.0 is out", body: "You have 0.8.1 · Click to update with an agent",
    action: { name: "roundup-workspace-chrome.update@0.9.0" },
  }]);
  assert.equal(state("notified"), "0.9.0");
  await check("0.8.1", false);
  assert.equal(toasts().length, 1, "not again for the same version");

  herdr.set({ shared: { [KEY("dismissed")]: "0.10.0" } });
  fetch.reply(200, release("v0.10.0"));
  await check("0.8.1", false);
  assert.equal(toasts().length, 1, "none for a dismissed version");

  fetch.reply(200, release("v0.8.1"));
  await check("0.8.1", false);
  assert.equal(toasts().length, 1, "none when up to date");
});

test("a manual check always gives one toast, and shows a dismissed version again", async () => {
  fetch.reply(429);
  await check("0.8.1", true);
  assert.deepEqual(toasts().at(-1), { level: "warning", title: "Couldn't check for updates", body: "GitHub's rate limit, try again in an hour" });

  herdr.set({ shared: { [KEY("dismissed")]: "0.9.0", [KEY("notified")]: "0.9.0" } });
  fetch.reply(200, release("v0.9.0"));
  await check("0.8.1", true);
  assert.equal(toasts().at(-1).title, "Herdr Roundup 0.9.0 is out");
  assert.equal(state("dismissed"), null);

  fetch.reply(200, release("v0.8.1"));
  await check("0.8.1", true);
  assert.deepEqual(toasts().at(-1), { level: "success", title: "Herdr Roundup is up to date", body: "0.8.1 is the latest release" });
  fetch.reply(200, release("v0.8.0"));
  await check("0.8.1", true);
  assert.deepEqual(toasts().at(-1).body, "You have 0.8.1, the latest release is 0.8.0");
  assert.equal(toasts().length, 4);
});

test("due: only when on and a day has passed since the last request", () => {
  clock.useFakeNow();
  const DAY = 24 * 60 * 60 * 1000;
  assert.equal(due(), true, "never asked");
  herdr.set({ shared: { [KEY("lastCheck")]: Date.now() - DAY + 1 } });
  assert.equal(due(), false);
  herdr.set({ shared: { [KEY("lastCheck")]: Date.now() - DAY } });
  assert.equal(due(), true);
  herdr.set({ shared: { [KEY("auto")]: false } });
  assert.equal(due(), false, "off");
});

test("available: the latest release when newer and not dismissed", () => {
  assert.equal(available("0.8.1"), null);
  const latest = { version: "0.9.0", url: "u" };
  herdr.set({ shared: { [KEY("latest")]: latest } });
  assert.deepEqual(available("0.8.1"), latest);
  assert.equal(available("0.9.0"), null);
  herdr.set({ shared: { [KEY("dismissed")]: "0.9.0" } });
  assert.equal(available("0.8.1"), null);
});

const localActive = () => herdr.set({ spaces: [space("s1", [tab("tb1", { active: true })], { active: true })], knownAgents: [claude] });

test("install takes the release the command names, else the latest, and refuses one not newer", async () => {
  herdr.set({ appHome: "/apps/herdr", shared: { [KEY("latest")]: { version: "0.9.0", url: "https://latest.invalid" } } });
  localActive();
  await install("0.8.1", "0.9.0");
  assert.match(runs().at(-1).args.task, /\(https:\/\/latest\.invalid\)/);
  await install("0.8.1", "0.8.5");
  assert.match(runs().at(-1).args.task, new RegExp(`\\(${PAGE}/tag/v0\\.8\\.5\\)`));
  await install("0.8.1");
  assert.match(runs().at(-1).args.task, /to v0\.9\.0/);
  const before = runs().length;
  await install("0.8.1", "bogus");
  await install("0.9.0", "0.9.0");
  assert.equal(runs().length, before, "no tab");
  assert.deepEqual(toasts().map((t) => [t.level, t.title]), [["info", "Nothing to update"], ["info", "Nothing to update"]]);
});

test("install uses the first installed agent; with none, or when knownAgents fails, a warning and no tab", async () => {
  herdr.set({ shared: { [KEY("latest")]: { version: "0.9.0", url: "u" } } });
  localActive();
  herdr.set({ knownAgents: [{ ...claude, key: "codex", run: ["codex"], installed: false }, claude, { ...claude, run: ["pi"] }] });
  await install("0.8.1");
  assert.deepEqual(runs().at(-1).args.argv, ["claude"]);
  herdr.clear();
  herdr.set({ knownAgents: [{ ...claude, installed: false }] });
  await install("0.8.1");
  herdr.set({ knownAgents: new Error("shell failed") });
  await install("0.8.1");
  assert.deepEqual(runs(), []);
  assert.deepEqual(toasts().map((t) => [t.level, t.title]), [["warning", "No agent to update with"], ["warning", "No agent to update with"]]);
  assert.equal(toasts()[0].body, "Tell your agent: update Herdr Roundup to 0.9.0 as its README says");
});

test("install opens the tab in a space on this computer: the shown one, else selects one, else makes one", async () => {
  herdr.set({ appHome: "/apps/herdr", knownAgents: [claude], shared: { [KEY("latest")]: { version: "0.9.0", url: "u" } } });
  const remote = space("vps/s9", [], { machine: "vps", active: true });
  herdr.set({ spaces: [remote, space("s1", [], { active: false }), space("s2", [], { active: false })] });
  await install("0.8.1");
  assert.deepEqual(runs().map((r) => r.name), ["space.select", "tab.new"]);
  assert.deepEqual(runs()[0].args, { id: "s1" });
  const t = runs()[1].args;
  assert.deepEqual({ ...t, task: undefined }, { name: "Update Herdr Roundup", folder: "/apps/herdr", argv: ["claude"], task: undefined, space: "s1" });
  assert.match(t.task, /^Update the Herdr layout Herdr Roundup from v0\.8\.1 to v0\.9\.0\./);

  herdr.clear();
  herdr.set({ spaces: [space("s1"), space("s2", [], { active: true })] });
  await install("0.8.1");
  assert.deepEqual(runs().map((r) => [r.name, r.args.space]), [["tab.new", "s2"]], "the shown space, no select");

  herdr.clear();
  herdr.set({ spaces: [remote] });
  await install("0.8.1");
  assert.deepEqual(runs().map((r) => r.name), ["space.new"]);
  assert.deepEqual({ ...runs()[0].args, task: undefined }, { folder: "/apps/herdr", argv: ["claude"], task: undefined, machine: "", tab: "Update Herdr Roundup" });
});

test("install resolves with a warning when run() throws", async () => {
  herdr.set({ knownAgents: [claude], shared: { [KEY("latest")]: { version: "0.9.0", url: "u" } } });
  localActive();
  herdr.onRun(() => { throw new Error("no layout"); });
  await assert.doesNotReject(install("0.8.1"));
  assert.deepEqual(toasts().at(-1), { level: "warning", title: "Couldn't open the update tab", body: "no layout" });
});

test("openNotes opens the release page with the platform's opener, and says so when it can't", async () => {
  herdr.set({ shared: { [KEY("latest")]: { version: "0.9.0", url: "https://latest.invalid" } } });
  const opened = () => herdr.calls("exec").map(([cmd, args]) => [cmd, args]);
  openNotes("0.9.0");
  herdr.set({ window: { ...herdr.stub.window, platform: "windows" } });
  openNotes("0.8.5");
  herdr.set({ window: { ...herdr.stub.window, platform: "linux" } });
  openNotes("bogus");
  assert.deepEqual(opened(), [
    ["open", ["https://latest.invalid"]],
    ["cmd", ["/c", "start", "", `${PAGE}/tag/v0.8.5`]],
    ["xdg-open", [PAGE]],
  ]);
  herdr.failExec("xdg-open");
  openNotes();
  await waitFor(() => toasts().length);
  assert.deepEqual(toasts(), [{ level: "warning", title: "Couldn't open the release notes", body: "https://latest.invalid" }]);
});

// The brand copy of workspace-chrome, with the layout file it reads its version from.
async function brand(version = "0.8.1") {
  const home = tempDir("roundup-app-");
  mkdirSync(join(home, "layouts"));
  if (version) writeFileSync(join(home, "layouts", "Herdr-Roundup.json"), JSON.stringify({ version, type: "column" }));
  herdr.set({ appHome: home, shared: { layout: "Herdr-Roundup", [KEY("auto")]: false } });
  const Chrome = (await import("../mods/roundup-workspace-chrome/main.js")).default;
  const m = mount(Chrome, { props: {} });
  await waitFor(() => herdr.watching(join(home, "layouts")), 2000, "the layout file read");
  return m;
}

test("the brand's commands: update@V names V, a slow or failing install holds nothing back, notes without a version", async () => {
  herdr.set({ shared: { [KEY("latest")]: { version: "0.9.0", url: "u" } } });
  const { cx } = await brand();
  localActive();
  herdr.set({ knownAgents: () => new Promise(() => {}) });
  await herdr.command("update@0.8.5");
  assert.equal(herdr.calls("knownAgents").length, 1, "install started");
  herdr.set({ knownAgents: [claude], spaces: () => { throw new Error("spaces broke"); } });
  await herdr.command("update");
  await herdr.command("notes");
  assert.deepEqual(herdr.calls("exec").at(-1).slice(0, 2), ["open", ["u"]]);
  localActive();
  await herdr.command("update@0.8.5");
  await waitFor(() => runs().length);
  assert.match(runs().at(-1).args.task, /to v0\.8\.5/);
  assert.deepEqual(cx.errors, []);
});

test("the brand's check and update wait for the version; notes don't", async () => {
  await brand(null);
  fetch.reply(200, release("v0.9.0"));
  herdr.set({ knownAgents: [claude] });
  await herdr.command("check");
  await herdr.command("update@0.9.0");
  await herdr.command("notes@0.9.0");
  assert.equal(fetch.calls.length, 0);
  assert.equal(herdr.calls("knownAgents").length, 0);
  assert.deepEqual(herdr.calls("exec").map(([cmd, args]) => [cmd, args]), [["open", [`${PAGE}/tag/v0.9.0`]]]);
});

test("a manual check asked for during a running one runs right after it, and toasts too", async () => {
  await brand();
  const first = fetch.defer();
  await herdr.command("check");
  assert.equal(fetch.calls.length, 1);
  await herdr.command("check");
  assert.equal(fetch.calls.length, 1, "waits for the running one");
  fetch.reply(200, release("v0.8.1"));
  first.resolve(200, release("v0.8.1"));
  await waitFor(() => toasts().length === 2);
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(toasts().map((t) => t.title), ["Herdr Roundup is up to date", "Herdr Roundup is up to date"]);
});

test("the auto command checks at once when due, and not otherwise", async () => {
  clock.useFakeNow();
  await brand();
  herdr.set({ shared: { [KEY("auto")]: true, [KEY("lastCheck")]: Date.now() } });
  fetch.reply(200, release("v0.8.1"));
  await herdr.command("auto");
  assert.equal(fetch.calls.length, 0, "not due");
  herdr.set({ shared: { [KEY("lastCheck")]: Date.now() - 24 * 60 * 60 * 1000 } });
  await herdr.command("auto");
  await waitFor(() => state("checked"));
  assert.equal(fetch.calls.length, 1);
});
