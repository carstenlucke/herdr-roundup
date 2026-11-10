// roundup-workspace-chrome's update check (update.js, and its command loop in main.js) with herdr stubbed
// and a fake fetch: nothing reaches GitHub, no browser opens, no tab is made.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { herdr, reset, fetch, response, clock, mount, waitFor, space, tab, walk, texts, click, makeCx } from "./support/harness.mjs";
import { tempDir, cleanup } from "./support/git-repo.mjs";

const update = await import("../mods/roundup-workspace-chrome/update.js");
const { RELEASE_LIST, PER_PAGE, PAGES, put, latest, check, due, available, install, openNotes } = update;
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

test("latest sends one plain GET to the release list with only Accept and User-Agent", async () => {
  fetch.reply(200, [release("v0.9.0")]);
  await latest();
  assert.equal(fetch.calls.length, 1);
  assert.equal(fetch.calls[0].url, RELEASE_LIST);
  assert.equal(fetch.calls[0].init.method ?? "GET", "GET");
  assert.deepEqual(fetch.calls[0].init.headers, { Accept: "application/vnd.github+json", "User-Agent": "herdr-roundup" });
  assert.equal(fetch.calls[0].init.body, undefined);
});

test("latest says why it found no stable version, and reads one from the tag", async () => {
  const answers = [
    [() => new TypeError("fetch failed"), { ok: false, why: "No connection to api.github.com" }],
    [() => response(404), { ok: false, why: "No release on GitHub yet" }],
    [() => response(403), { ok: false, why: "GitHub's rate limit, try again in an hour" }],
    [() => response(429), { ok: false, why: "GitHub's rate limit, try again in an hour" }],
    [() => response(500), { ok: false, why: "GitHub answered 500" }],
    [() => response(200, "{not json"), { ok: false, why: "GitHub's answer couldn't be read" }],
    [() => response(200, release("v0.9.0")), { ok: false, why: "GitHub's answer couldn't be read" }],
    [() => response(200, []), { ok: false, why: "No release on GitHub yet" }],
    [() => response(200, [release("latest"), {}]), { ok: false, why: "No release's tag is a stable version" }],
    // A pre-release tagged without GitHub's flag is passed over, not an error for every stable check.
    [() => response(200, [release("v0.9.0-rc.1")]), { ok: false, why: "No release's tag is a stable version" }],
    [() => response(200, [release("v0.10.0-beta.1"), release("v0.9.1")]), { ok: true, version: "0.9.1", url: `${PAGE}/tag/v0.9.1` }],
    [() => response(200, [release("v01.02.03")]), { ok: false, why: "No release's tag is a stable version" }],
    [() => response(200, [{ tag_name: "v0.9.0" }]), { ok: true, version: "0.9.0", url: PAGE }],
  ];
  for (const [respond, expected] of answers) {
    fetch.respond = respond;
    assert.deepEqual(await latest(), expected);
  }
});

test("with pre-releases, latest asks for the release list the same plain way and takes its newest", async () => {
  fetch.reply(200, [release("v0.10.0-beta.1", { prerelease: true }), release("v0.9.1")]);
  assert.deepEqual(await latest(true), { ok: true, version: "0.10.0-beta.1", url: `${PAGE}/tag/v0.10.0-beta.1` });
  assert.equal(fetch.calls[0].url, RELEASE_LIST);
  assert.deepEqual(fetch.calls[0].init.headers, { Accept: "application/vnd.github+json", "User-Agent": "herdr-roundup" });
  const answers = [
    [() => response(200, []), { ok: false, why: "No release on GitHub yet" }],
    [() => response(200, release("v0.9.1")), { ok: false, why: "GitHub's answer couldn't be read" }],
    [() => response(200, [release("nightly"), release("v1.0.0", { draft: true })]), { ok: false, why: "No release's tag is a version" }],
    [() => response(403), { ok: false, why: "GitHub's rate limit, try again in an hour" }],
  ];
  for (const [respond, expected] of answers) {
    fetch.respond = respond;
    assert.deepEqual(await latest(true), expected);
  }
});

test("the check takes a pre-release from the list only while pre-releases are subscribed, and its toasts name them", async () => {
  fetch.reply(200, [release("v0.10.0-beta.1", { prerelease: true }), release("v0.9.1")]);
  await check("0.9.1", true);
  assert.equal(fetch.calls.at(-1).url, RELEASE_LIST);
  assert.deepEqual(state("latest"), { version: "0.9.1", url: `${PAGE}/tag/v0.9.1` }, "stable by default");
  assert.equal(toasts().at(-1).body, "0.9.1 is the latest release");

  herdr.set({ shared: { [KEY("prerelease")]: true } });
  fetch.reply(200, [release("v0.9.1")]);
  await check("0.9.1", true);
  assert.equal(fetch.calls.at(-1).url, RELEASE_LIST);
  assert.equal(toasts().at(-1).body, "0.9.1 is the latest release, pre-releases included");

  fetch.reply(200, [release("v0.10.0-beta.1", { prerelease: true }), release("v0.9.1")]);
  await check("0.9.1", false);
  assert.deepEqual(state("latest"), { version: "0.10.0-beta.1", url: `${PAGE}/tag/v0.10.0-beta.1` });
  assert.deepEqual(toasts().at(-1), {
    level: "info", title: "Herdr Roundup 0.10.0-beta.1 is out", body: "You have 0.9.1 · Click to update with an agent",
    action: { name: "roundup-workspace-chrome.update@0.10.0-beta.1" },
  });
  // From a beta, the release that follows it is an update.
  fetch.reply(200, [release("v0.10.0"), release("v0.10.0-beta.1", { prerelease: true })]);
  await check("0.10.0-beta.1", false);
  assert.equal(toasts().at(-1).title, "Herdr Roundup 0.10.0 is out");
});

// Pages of GitHub's release list by URL: pages[0] is the first (no &page=), pages[1] the one with &page=2, ...
const paged = (pages) => (url) => {
  const n = Number(/&page=(\d+)$/.exec(url)?.[1] ?? 1);
  return pages[n - 1] instanceof Error ? pages[n - 1] : response(200, pages[n - 1] ?? []);
};
const pres = (n, minor = 11) => Array.from({ length: n }, (_, i) => release(`v0.${minor}.0-alpha.${n - i}`, { prerelease: true }));

test("latest reads on while a page is full, and takes the highest version over all pages it read", async () => {
  // A hotfix and 29 pre-releases fill page 1; the higher stable release is on page 2.
  fetch.respond = paged([[release("v0.9.3"), ...pres(29)], [release("v0.10.0"), release("v0.9.2")]]);
  assert.deepEqual(await latest(), { ok: true, version: "0.10.0", url: `${PAGE}/tag/v0.10.0` });
  assert.deepEqual(fetch.calls.map((c) => c.url), [RELEASE_LIST, `${RELEASE_LIST}&page=2`]);
  assert.deepEqual(fetch.calls[1].init.headers, { Accept: "application/vnd.github+json", "User-Agent": "herdr-roundup" });
  assert.equal((await latest(true)).version, "0.11.0-alpha.29", "the pre channel reads both pages too");

  fetch.calls = [];
  fetch.respond = paged([[release("v0.9.3"), release("v0.9.2")]]);
  assert.equal((await latest()).version, "0.9.3");
  assert.equal(fetch.calls.length, 1, "a page short of full is the last");
});

test("latest reads at most PAGES pages, and says so when none of them has a matching release", async () => {
  assert.deepEqual([PER_PAGE, PAGES], [30, 5]);
  fetch.respond = paged(Array.from({ length: 6 }, (_, i) => pres(PER_PAGE, 20 - i)));
  assert.deepEqual(await latest(), { ok: false, why: "No matching release among the latest 150 releases" });
  assert.equal(fetch.calls.length, PAGES);
  assert.equal(fetch.calls.at(-1).url, `${RELEASE_LIST}&page=5`);
});

test("a failure on a later page fails the check", async () => {
  fetch.respond = paged([[release("v0.9.3"), ...pres(29)], new TypeError("fetch failed")]);
  assert.deepEqual(await latest(), { ok: false, why: "No connection to api.github.com" });
  fetch.respond = (url) => url === RELEASE_LIST ? response(200, [release("v0.9.3"), ...pres(29)]) : response(403);
  assert.equal(await check("0.9.1", true), "GitHub's rate limit, try again in an hour");
  assert.equal(state("latest"), null);
});

test("a check whose channel is switched while GitHub answers keeps nothing and says nothing", async () => {
  const before = { [KEY("latest")]: null, [KEY("checked")]: 7, [KEY("dismissed")]: "0.9.0", [KEY("notified")]: "0.9.0", [KEY("error")]: "old" };
  const kept = () => ["latest", "checked", "dismissed", "notified", "error"].map(state);
  const directions = [[false, true, [release("v0.9.2")]], [true, false, [release("v0.10.0-beta.1", { prerelease: true }), release("v0.9.1")]]];
  for (const [from, to, answer] of directions) {
    for (const manual of [false, true]) {
      reset();
      herdr.set({ shared: { ...before, [KEY("prerelease")]: from } });
      const gate = fetch.defer();
      const running = check("0.9.1", manual);
      put("prerelease", to);
      gate.resolve(200, answer);
      assert.equal(await running, null);
      assert.deepEqual(kept(), [null, 7, "0.9.0", "0.9.0", "old"], `${from} → ${to}, manual ${manual}`);
      assert.deepEqual(toasts(), [], `${from} → ${to}, manual ${manual}`);
    }
  }
  // A failure that comes after the switch is the old channel's too: no error, no warning.
  reset();
  herdr.set({ shared: before });
  const gate = fetch.defer();
  const running = check("0.9.1", true);
  put("prerelease", true);
  gate.reject();
  assert.equal(await running, null);
  assert.equal(state("error"), "old");
  assert.deepEqual(toasts(), []);
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

  fetch.reply(200, [release("v0.9.0")]);
  assert.equal(await check("0.8.1", false), null);
  assert.equal(state("error"), null);
  assert.equal(state("checked"), Date.now());
  assert.deepEqual(state("latest"), { version: "0.9.0", url: `${PAGE}/tag/v0.9.0` });
});

test("the automatic check gives no toast on failure and one per new version, none for a dismissed one", async () => {
  fetch.reply(500);
  await check("0.8.1", false);
  assert.deepEqual(toasts(), []);

  fetch.reply(200, [release("v0.9.0")]);
  await check("0.8.1", false);
  assert.deepEqual(toasts(), [{
    level: "info", title: "Herdr Roundup 0.9.0 is out", body: "You have 0.8.1 · Click to update with an agent",
    action: { name: "roundup-workspace-chrome.update@0.9.0" },
  }]);
  assert.equal(state("notified"), "0.9.0");
  await check("0.8.1", false);
  assert.equal(toasts().length, 1, "not again for the same version");

  herdr.set({ shared: { [KEY("dismissed")]: "0.10.0" } });
  fetch.reply(200, [release("v0.10.0")]);
  await check("0.8.1", false);
  assert.equal(toasts().length, 1, "none for a dismissed version");

  fetch.reply(200, [release("v0.8.1")]);
  await check("0.8.1", false);
  assert.equal(toasts().length, 1, "none when up to date");
});

test("a manual check always gives one toast, and shows a dismissed version again", async () => {
  fetch.reply(429);
  await check("0.8.1", true);
  assert.deepEqual(toasts().at(-1), { level: "warning", title: "Couldn't check for updates", body: "GitHub's rate limit, try again in an hour" });

  herdr.set({ shared: { [KEY("dismissed")]: "0.9.0", [KEY("notified")]: "0.9.0" } });
  fetch.reply(200, [release("v0.9.0")]);
  await check("0.8.1", true);
  assert.equal(toasts().at(-1).title, "Herdr Roundup 0.9.0 is out");
  assert.equal(state("dismissed"), null);

  fetch.reply(200, [release("v0.8.1")]);
  await check("0.8.1", true);
  assert.deepEqual(toasts().at(-1), { level: "success", title: "Herdr Roundup is up to date", body: "0.8.1 is the latest release" });
  fetch.reply(200, [release("v0.8.0")]);
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

test("available offers a pre-release only while subscribed", () => {
  const beta = { version: "0.10.0-beta.1", url: "u" };
  herdr.set({ shared: { [KEY("latest")]: beta } });
  assert.equal(available("0.9.1"), null, "left from before the switch went off");
  herdr.set({ shared: { [KEY("prerelease")]: true } });
  assert.deepEqual(available("0.9.1"), beta);
  assert.equal(available("0.10.0-beta.1"), null);
  assert.equal(available("0.10.0"), null, "the release is newer than its beta");
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

test("install takes a pre-release only while subscribed", async () => {
  herdr.set({ appHome: "/apps/herdr", shared: { [KEY("latest")]: { version: "0.10.0-beta.1", url: "u" } } });
  localActive();
  await install("0.9.1", "0.10.0-beta.1");
  assert.deepEqual(runs(), [], "a toast from before the switch went off");
  assert.deepEqual(toasts().map((t) => t.title), ["Nothing to update"]);
  herdr.set({ shared: { [KEY("prerelease")]: true } });
  await install("0.9.1", "0.10.0-beta.1");
  assert.match(runs().at(-1).args.task, /to v0\.10\.0-beta\.1\. It is a pre-release/);
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
  fetch.reply(200, [release("v0.9.0")]);
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
  fetch.reply(200, [release("v0.8.1")]);
  first.resolve(200, [release("v0.8.1")]);
  await waitFor(() => toasts().length === 2);
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(toasts().map((t) => t.title), ["Herdr Roundup is up to date", "Herdr Roundup is up to date"]);
});

test("switched during a running check, the queued manual one asks on the new channel and only it says what it found", async () => {
  await brand("0.9.1");
  const first = fetch.defer();
  await herdr.command("check");
  // The menu's Include pre-releases: flip, forget, check (queued behind the running one).
  put("prerelease", true); put("latest", null);
  await herdr.command("check");
  fetch.reply(200, [release("v0.10.0-beta.1", { prerelease: true }), release("v0.9.1")]);
  first.resolve(200, [release("v0.9.1")]);
  await waitFor(() => toasts().length === 1);
  await waitFor(() => state("checking") === false);
  assert.equal(fetch.calls.length, 2);
  assert.deepEqual(toasts().map((t) => t.title), ["Herdr Roundup 0.10.0-beta.1 is out"]);
  assert.equal(state("latest").version, "0.10.0-beta.1");
});

test("the menu opens 300 px wide, whatever it offers when it opens", async () => {
  const { view } = await brand("0.9.1");
  const open = () => { view.pressed({ position: { x: 1, y: 1 } }); view.openMenu({ position: { x: 1, y: 1 }, click_count: 1 }); };
  for (const latest of [null, { version: "0.9.2", url: "u" }, { version: "0.10.0-alpha.12", url: "u" }]) {
    herdr.set({ shared: { [KEY("latest")]: latest, [KEY("prerelease")]: true } });
    open();
  }
  assert.deepEqual(herdr.calls("openOverlay").map(([spec]) => [spec.kind, spec.width]), [["popup", 300], ["popup", 300], ["popup", 300]]);
});

test("the auto command checks at once when due, and not otherwise", async () => {
  clock.useFakeNow();
  await brand();
  herdr.set({ shared: { [KEY("auto")]: true, [KEY("lastCheck")]: Date.now() } });
  fetch.reply(200, [release("v0.8.1")]);
  await herdr.command("auto");
  assert.equal(fetch.calls.length, 0, "not due");
  herdr.set({ shared: { [KEY("lastCheck")]: Date.now() - 24 * 60 * 60 * 1000 } });
  await herdr.command("auto");
  await waitFor(() => state("checked"));
  assert.equal(fetch.calls.length, 1);
});

// The chrome menu (menu.js) as its popup draws it, with the props openMenu gives it.
async function chromeMenu(menu) {
  herdr.set({ props: { menu, overlay: "ov1" } });
  const { menuView } = await import("../mods/roundup-workspace-chrome/menu.js");
  const tree = menuView({ at: 0, handle: {} });
  const row = (label) => [...walk(tree)].find((e) => /^mi-\d+$/.test(e.elementId ?? "") && texts(e).includes(label));
  const checked = (label) => [...walk(row(label))].some((e) => e.type === "svg" && String(e.arg).endsWith("/check.svg"));
  return { tree, row, checked };
}

test("the menu's Include pre-releases is a check that switches the channel, forgets the other's answer and checks at once, the menu left open", async () => {
  herdr.set({ shared: { [KEY("latest")]: { version: "0.9.1", url: "u" } } });
  let m = await chromeMenu({ installed: "0.9.1", release: null, error: null });
  const off = m.row("Include pre-releases");
  assert.ok(off, "the row is there");
  assert.equal(m.checked("Include pre-releases"), false, "off by default");
  click(off, makeCx());
  assert.deepEqual(herdr.calls("closeOverlay"), [], "the menu stays open");
  assert.equal(state("prerelease"), true);
  assert.equal(state("latest"), null);
  assert.deepEqual(runs().at(-1), { name: "roundup-workspace-chrome.check", args: undefined });

  m = await chromeMenu({ installed: "0.9.1", release: null, error: null });
  assert.equal(m.checked("Include pre-releases"), true, "checked while on");
  click(m.row("Include pre-releases"), makeCx());
  assert.equal(state("prerelease"), false, "and off again");
});

test("the menu stays open for Check, Daily, Only when I ask and Show details; Update, Release notes and Skip close it", async () => {
  herdr.set({ shared: { [KEY("latest")]: { version: "0.9.2", url: "u" } } });
  const offered = { version: "0.9.2", url: "u" };
  const kept = ["Check for updates", "Daily", "Only when I ask", "Show details on hover"];
  for (const label of kept) {
    const m = await chromeMenu({ installed: "0.9.1", release: offered, error: null });
    click(m.row(label), makeCx());
  }
  assert.deepEqual(herdr.calls("closeOverlay"), [], kept.join(", "));
  assert.deepEqual(runs().map((r) => r.name), ["roundup-workspace-chrome.check", "roundup-workspace-chrome.auto"]);
  assert.equal(state("auto"), false);
  assert.equal(herdr.shared("roundup-workspace-chrome.details"), false);
  for (const label of ["Update to 0.9.2 with an agent…", "Release notes 0.9.2", "Skip 0.9.2"]) {
    herdr.clear();
    const m = await chromeMenu({ installed: "0.9.1", release: offered, error: null });
    click(m.row(label), makeCx());
    assert.deepEqual(herdr.calls("closeOverlay").map(([id]) => id), ["ov1"], label);
  }
  assert.equal(state("dismissed"), "0.9.2");
});

test("an offer gone while the menu is open stays as dimmed rows that do nothing", async () => {
  // Opened with 0.10.0-beta.1 on offer, then pre-releases switched off: nothing is offered now.
  herdr.set({ shared: { [KEY("latest")]: { version: "0.10.0-beta.1", url: "u" } } });
  const m = await chromeMenu({ installed: "0.9.1", release: { version: "0.10.0-beta.1", url: "u" }, error: null });
  const row = m.row("Update to 0.10.0-beta.1 with an agent…");
  assert.deepEqual(row.style("text_color"), ["dim"]);
  click(row, makeCx());
  click(m.row("Skip 0.10.0-beta.1"), makeCx());
  assert.deepEqual([runs(), herdr.calls("closeOverlay"), state("dismissed")], [[], [], null]);
});

test("the open menu's head shows a check under way and a failure in the Checked line, the reason only where there is room", async () => {
  const checkedLine = (tree) => texts([...walk(tree)].find((e) => e.type === "h_flex" && texts(e)[0] === "Checked")).at(-1);
  herdr.set({ shared: { [KEY("checking")]: true, [KEY("checked")]: Date.now() } });
  let m = await chromeMenu({ installed: "0.9.1", release: null, error: null });
  assert.equal(checkedLine(m.tree), "checking…");
  assert.ok(!texts(m.tree).some((x) => /Checking for updates…/.test(x)), "no status line: the popup has no room for it");

  herdr.set({ shared: { [KEY("checking")]: false, [KEY("error")]: "GitHub answered 500" } });
  m = await chromeMenu({ installed: "0.9.1", release: null, error: null });
  assert.equal(checkedLine(m.tree), "failed");
  assert.ok(!texts(m.tree).some((x) => /Couldn't check/.test(x)));

  // Opened with an error: its line has room, and shows the reason of now.
  m = await chromeMenu({ installed: "0.9.1", release: null, error: "No connection to api.github.com" });
  assert.ok(texts(m.tree).includes("Couldn't check: GitHub answered 500"));
  assert.notEqual(checkedLine(m.tree), "failed");
  herdr.set({ shared: { [KEY("error")]: null } });
  m = await chromeMenu({ installed: "0.9.1", release: null, error: "No connection to api.github.com" });
  assert.ok(!texts(m.tree).some((x) => /Couldn't check/.test(x)), "gone after a check that didn't fail");
});

test("the brand copy shares whether its check runs", async () => {
  herdr.set({ shared: { [KEY("checking")]: true } });
  await brand();
  assert.equal(state("checking"), false, "a check cut off by a quit doesn't stay");
  const gate = fetch.defer();
  await herdr.command("check");
  assert.equal(state("checking"), true);
  gate.resolve(200, [release("v0.8.1")]);
  await waitFor(() => state("checking") === false);
});
