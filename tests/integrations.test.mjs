// node --test 'tests/*.test.mjs'
// The logo menu's agent integrations (issue #48): what integrations.js decides, integrate.js running
// roundup-pane's script (stubbed, and once for real in a temp home), the menu's section, and the brand
// copy's commands and its toast after an install or an update. No agent config of the person's is read.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, cpSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { herdr, reset, mount, waitFor, walk, texts, click, makeCx } from "./support/harness.mjs";
import { tempDir, cleanup } from "./support/git-repo.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const I = await import("../mods/roundup-workspace-chrome/integrations.js");
const integrate = await import("../mods/roundup-workspace-chrome/integrate.js");
const { STATE, BUSY, TOLD } = I;

const toasts = () => herdr.calls("notify").map(([n]) => n);
const runs = () => herdr.calls("run").map(([name]) => name);
const known = (...keys) => ["claude", "codex", "pi", "opencode"].map((key) => ({ key, name: key, run: [key], installed: keys.includes(key) }));
const STATUS = "claude: off\ncodex: on\npi: broken (/x/pi-context.js is missing: run scripts/sync.sh, or install pi again)\nopencode: unknown (/h/.config/opencode/plugins/roundup-context is there and isn't Roundup's)\n";
const WHERE = "claude: /h/.claude/settings.json\ncodex: /h/.codex/config.toml\npi: /h/.pi/agent/extensions/roundup-context.js\nopencode: /h/.config/opencode/plugins/roundup-context\n";
// The script stubbed: status and where answer as above, install/uninstall as `act` says.
function script({ status = STATUS, where = WHERE, act = () => ({ code: 0, stdout: "" }) } = {}) {
  herdr.onExec((call) => {
    if (call.command !== "env") return undefined;
    const [, , , action, agent] = call.args;
    if (action === "status") return { code: 0, stdout: status };
    if (action === "where") return { code: 0, stdout: where };
    return act(action, agent);
  });
}

beforeEach(() => {
  reset();
  herdr.set({ home: "/h", appHome: "/app" });
  // Nothing real by default: every program answers empty.
  herdr.onExec(() => ({ code: 0, stdout: "" }));
});
after(cleanup);

// --- integrations.js -------------------------------------------------------------------------------

test("CHR-48: the script's status and where lines per agent; other lines left out; a path as ~/…", () => {
  assert.deepEqual(I.parseStatus(STATUS + "noise\nclaude: maybe\n"), {
    claude: { state: "off", detail: null }, codex: { state: "on", detail: null },
    pi: { state: "broken", detail: "/x/pi-context.js is missing: run scripts/sync.sh, or install pi again" },
    opencode: { state: "unknown", detail: "/h/.config/opencode/plugins/roundup-context is there and isn't Roundup's" },
  });
  assert.deepEqual(I.parseStatus("claude: on (then: echo mine)"), { claude: { state: "on", detail: "then: echo mine" } });
  assert.deepEqual(I.parseStatus(null), {});
  assert.equal(I.parseWhere(WHERE).pi, "/h/.pi/agent/extensions/roundup-context.js");
  assert.deepEqual(I.parseWhere("claude: relative/path"), {});
  assert.equal(I.tilde("/h/.claude/settings.json", "/h"), "~/.claude/settings.json");
  assert.equal(I.tilde("/hx/a", "/h"), "/hx/a");
  assert.equal(I.tilde("/etc/x", null), "/etc/x");
});

test("CHR-48: one read: state, file and installed per agent; listed are the installed ones and any not off", () => {
  const s = I.survey(STATUS, WHERE, known("claude", "codex"));
  assert.deepEqual(s.claude, { state: "off", detail: null, form: null, file: "/h/.claude/settings.json", installed: true });
  assert.equal(s.pi.installed, false);
  assert.deepEqual(I.listed(s), ["claude", "codex", "pi", "opencode"], "pi and opencode not installed but not off: listed");
  const off = I.survey("claude: off\ncodex: off\npi: off\nopencode: off\n", "", known("codex"));
  assert.deepEqual(I.listed(off), ["codex"]);
  assert.equal(off.codex.file, null, "where said nothing");
  const blind = I.survey("claude: off\ncodex: off\npi: off\nopencode: off\n", WHERE, null);
  assert.equal(blind.claude.installed, null);
  assert.deepEqual(I.listed(blind), ["claude", "codex", "pi", "opencode"], "knownAgents() couldn't tell: all");
  assert.deepEqual(I.survey("", WHERE, known("claude")), {}, "the script said nothing: no agent");
  assert.deepEqual(I.listed(null), []);
});

test("CHR-49: the section's rows: a check per agent, broken and unknown with a mark, one at a time while busy", () => {
  const s = I.survey(STATUS, WHERE, known("claude", "codex", "pi", "opencode"));
  const rows = I.sectionRows(I.listed(s), s, null);
  assert.deepEqual(rows.map((r) => [r.label, Boolean(r.check), r.icon ?? null, r.does]), [
    ["Claude Code", false, null, "on"], ["Codex", true, null, "off"],
    ["Pi · broken", false, "circle-alert", "why"], ["OpenCode · unknown", false, "circle-alert", "why"],
  ]);
  const busy = I.sectionRows(["claude", "codex"], s, "claude");
  assert.deepEqual(busy.map((r) => [r.label, r.icon ?? null, Boolean(r.spin), Boolean(r.dim), r.does]), [
    ["Claude Code", "spinner", true, true, null], ["Codex", null, false, true, null],
  ]);
  assert.equal(busy[1].check, true, "the waiting row keeps its check");
  assert.deepEqual(I.sectionRows(null, null, null).map((r) => [r.label, r.does]), [["Reading…", null]]);
  assert.deepEqual(I.sectionRows([], s, null).map((r) => r.label), ["No agent installed that has one"]);
  assert.deepEqual(I.sectionRows(["claude"], s, null, true).map((r) => [r.label, r.dim, r.does]), [["Not on Windows yet", true, null]]);
  assert.deepEqual(I.sectionRows(["claude"], {}, null).map((r) => [r.dim, r.does]), [[true, null]], "gone from the last read");
});

test("CHR-50: the dialog names the file that changes and what switching off does; links change no file of the person's", () => {
  const c = I.confirmProps("claude", "~/.claude/settings.json");
  assert.equal(c.title, "Switch on Claude Code's integration?");
  assert.equal(c.detail, "Roundup's status line goes into ~/.claude/settings.json; one of yours keeps running after it. A backup is kept, and switching off restores the file.");
  assert.equal(c.yes, "Switch on");
  assert.deepEqual(c.command, { name: "roundup-workspace-chrome.install@claude" });
  assert.match(I.confirmProps("codex", "~/.codex/config.toml").detail, /"thread-id" joins tui\.terminal_title in ~\/\.codex\/config\.toml, so Codex's titles end in the thread's id\./);
  assert.match(I.confirmProps("pi", "~/.pi/agent/extensions/roundup-context.js").detail, /A link to Roundup's extension at ~\/\.pi\/agent\/extensions\/roundup-context\.js\. No file of yours changes\./);
  assert.match(I.confirmProps("opencode", "~/x").detail, /A link to Roundup's plugin at ~\/x\./);
  assert.match(I.confirmProps("claude", null).detail, /goes into its config/);
  assert.equal(I.confirmProps("nobody", "x"), null);
});

test("CHR-51: the toast after install or uninstall: what happened, a restart for running sessions, the script's own words on failure", () => {
  const ok = (stdout) => ({ code: 0, stdout, stderr: "" });
  assert.deepEqual(I.resultToast("claude", "install", ok("claude: on (your status line keeps running after it: echo mine)\n")),
    { level: "success", title: "Claude Code's integration is on", body: "New Claude Code sessions pass on their own numbers. One already running may need a restart." });
  assert.deepEqual(I.resultToast("pi", "uninstall", ok("pi: off")),
    { level: "success", title: "Pi's integration is off", body: "A Pi session already running keeps it until it restarts." });
  assert.deepEqual(I.resultToast("codex", "install", ok("codex: already on (thread id not last: run uninstall, then install, to move it)")),
    { level: "info", title: "Codex's integration is already on", body: "thread id not last: run uninstall, then install, to move it" });
  assert.deepEqual(I.resultToast("opencode", "uninstall", ok("opencode: already off")), { level: "info", title: "OpenCode's integration is already off" });
  assert.deepEqual(I.resultToast("claude", "install", { code: 1, stdout: "", stderr: "jq is needed (brew install jq)\n" }),
    { level: "warning", title: "Couldn't switch on Claude Code's integration", body: "jq is needed (brew install jq)" });
  assert.deepEqual(I.resultToast("pi", "uninstall", { code: 1, stdout: "", stderr: "pi: /h/x isn't Roundup's: left as it is" }),
    { level: "warning", title: "Couldn't switch off Pi's integration", body: "/h/x isn't Roundup's: left as it is" });
  assert.equal(I.resultToast("claude", "install", { code: 0, stdout: "", stderr: "" }).level, "warning", "no answer is no success");
  assert.equal(I.resultToast("claude", "install", null).body, "The script ended with an error");
  assert.deepEqual(I.whyToast("pi", { pi: { state: "broken", detail: "the link leads nowhere" } }),
    { level: "warning", title: "Pi's integration is broken", body: "the link leads nowhere" });
  assert.equal(I.whyToast("claude", { claude: { state: "unknown", detail: "jq is needed" } }).title, "Whether Claude Code's integration is on can't be told");
});

test("CHR-52: the toast after an install or an update names the installed agents that are off, each once ever, and opens the menu", () => {
  const s = I.survey("claude: off\ncodex: off\npi: on\nopencode: off\n", "", known("claude", "codex", "pi"));
  const r = I.introToast(s, null);
  assert.deepEqual(r.toast, {
    level: "info", title: "Exact numbers for Claude Code and Codex",
    body: "Their integrations are off. Switch them on in the Herdr Roundup menu (top left): click to open it.",
    action: { name: "roundup-workspace-chrome.menu" },
  });
  assert.deepEqual(r.told, ["claude", "codex"]);
  assert.equal(I.introToast(s, r.told), null, "named before: no second toast");
  const more = I.survey("claude: off\ncodex: off\npi: on\nopencode: off\n", "", known("claude", "codex", "pi", "opencode"));
  const next = I.introToast(more, r.told);
  assert.equal(next.toast.title, "Exact numbers for OpenCode");
  assert.equal(next.toast.body, "Its integration is off. Switch it on in the Herdr Roundup menu (top left): click to open it.");
  assert.deepEqual(next.told, ["claude", "codex", "opencode"]);
  assert.equal(I.introToast(I.survey("claude: off\n", "", null), null), null, "knownAgents() couldn't tell: nothing");
  assert.equal(I.introToast(I.survey("claude: on\ncodex: broken (x)\n", "", known("claude", "codex")), null), null, "none off");
  const three = I.introToast(I.survey("claude: off\ncodex: off\npi: off\n", "", known("claude", "codex", "pi")), []);
  assert.equal(three.toast.title, "Exact numbers for Claude Code, Codex and Pi");
});

// --- integrate.js ----------------------------------------------------------------------------------

test("CHR-53: refresh runs roundup-pane's script through sh with the app's folder and keeps what it says; a script that can't run keeps the last", async () => {
  script();
  herdr.set({ knownAgents: known("claude") });
  const s = await integrate.refresh();
  const calls = herdr.calls("exec").map(([cmd, args]) => [cmd, args]);
  assert.deepEqual(calls, [
    ["env", ["HERDR_APP_HOME=/app", "sh", "/app/mods/roundup-pane/integrations/agent-integrations.sh", "status"]],
    ["env", ["HERDR_APP_HOME=/app", "sh", "/app/mods/roundup-pane/integrations/agent-integrations.sh", "where"]],
  ]);
  assert.deepEqual(herdr.shared(STATE), s);
  assert.equal(s.claude.installed, true);
  herdr.onExec(() => new Error("no sh"));
  assert.equal(await integrate.refresh(), null);
  assert.deepEqual(herdr.shared(STATE), s, "kept");
  herdr.onExec(() => ({ code: 127, stdout: "", stderr: "not found" }));
  assert.equal(await integrate.refresh(), null);
  herdr.clear();
  herdr.set({ window: { platform: "windows" } });
  assert.equal(await integrate.refresh(), null);
  assert.deepEqual(herdr.calls("exec"), [], "nothing runs on Windows");
});

test("CHR-54: ask opens roundup-confirm with the file as ~/…, replacing an open confirm; not while one runs, not for an unknown agent", async () => {
  script();
  await integrate.refresh();
  herdr.set({ shared: { "roundup-confirm.open": "ov-old" } });
  integrate.ask("claude");
  assert.deepEqual(herdr.calls("closeOverlay"), [["ov-old"]]);
  const [spec, id] = herdr.calls("openOverlay")[0];
  assert.equal(spec.mod, "roundup-confirm");
  assert.equal(spec.kind, "dialog");
  assert.match(spec.props.detail, /~\/\.claude\/settings\.json/);
  assert.deepEqual(spec.props.command, { name: "roundup-workspace-chrome.install@claude" });
  assert.equal(herdr.shared("roundup-confirm.open"), id);
  herdr.clear();
  integrate.ask("nobody");
  herdr.set({ shared: { [BUSY]: "codex" } });
  integrate.ask("claude");
  assert.deepEqual(herdr.calls("openOverlay"), []);
});

test("CHR-55: apply runs install or uninstall, marks the row busy meanwhile, reads again, then one toast; one at a time", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  let busyDuring = null;
  script({ act: async (action, agent) => { busyDuring = herdr.shared(BUSY); await gate; return { code: 0, stdout: `${agent}: ${action === "install" ? "on" : "off"}\n` }; } });
  const run = integrate.apply("claude", "install");
  await waitFor(() => busyDuring !== null);
  assert.equal(busyDuring, "claude");
  await integrate.apply("codex", "install"); // while claude's runs: nothing
  assert.equal(herdr.calls("exec").filter(([, args]) => args.includes("install")).length, 1);
  release();
  await run;
  assert.equal(herdr.shared(BUSY), null);
  assert.ok(herdr.calls("exec").some(([, args]) => args.at(-1) === "status"), "read again");
  assert.deepEqual(toasts().map((t) => [t.level, t.title]), [["success", "Claude Code's integration is on"]]);
  // A failure to start is a warning, and the row isn't left busy.
  herdr.clear();
  script({ act: () => new Error("spawn env ENOENT") });
  await integrate.apply("pi", "uninstall");
  assert.deepEqual(toasts(), [{ level: "warning", title: "Couldn't switch off Pi's integration", body: "spawn env ENOENT" }]);
  assert.equal(herdr.shared(BUSY), null);
  herdr.clear();
  await integrate.apply("nobody", "install");
  assert.deepEqual(herdr.calls("exec"), []);
});

test("CHR-55: refresh and apply against the real script in a temp home: pi switched on and off, the menu's state follows", async () => {
  const home = realpathSync(tempDir("integrations-home-"));
  const app = join(home, "app");
  mkdirSync(join(app, "mods/roundup-pane"), { recursive: true });
  cpSync(join(repo, "mods/roundup-pane/integrations"), join(app, "mods/roundup-pane/integrations"), { recursive: true });
  const env = { PATH: process.env.PATH, HOME: home, XDG_CONFIG_HOME: join(home, ".config") };
  herdr.set({ home, appHome: app, knownAgents: known("pi") });
  // The real process, with this HOME: the person's configs stay out of reach.
  herdr.onExec((call) => {
    const r = spawnSync(call.command, call.args, { env, encoding: "utf8" });
    return { code: r.status, stdout: r.stdout, stderr: r.stderr };
  });
  let s = await integrate.refresh();
  assert.deepEqual(Object.keys(s), ["claude", "codex", "pi", "opencode"]);
  assert.equal(s.pi.state, "off");
  assert.equal(s.pi.file, join(home, ".pi/agent/extensions/roundup-context.js"));
  await integrate.apply("pi", "install");
  assert.equal(herdr.shared(STATE).pi.state, "on");
  assert.equal(toasts().at(-1).title, "Pi's integration is on");
  await integrate.apply("pi", "uninstall");
  assert.equal(herdr.shared(STATE).pi.state, "off");
  // Claude without jq's answer would differ by machine; with jq it is off in an empty home.
  assert.ok(["off", "unknown"].includes(herdr.shared(STATE).claude.state));
});

// --- the menu ----------------------------------------------------------------------------------------

async function chromeMenu(menu) {
  herdr.set({ props: { menu, overlay: "ov1" } });
  const { menuView } = await import("../mods/roundup-workspace-chrome/menu.js");
  const tree = menuView({ at: 0, handle: {} });
  const row = (label) => [...walk(tree)].find((e) => /^mi-\d+$/.test(e.elementId ?? "") && texts(e).includes(label));
  const checked = (label) => [...walk(row(label))].some((e) => e.type === "svg" && String(e.arg).endsWith("/check.svg"));
  return { tree, row, checked };
}
const BASE = { installed: "0.11.0", release: null, error: null };

test("CHR-56: the menu's section: its heading, a check per agent listed at opening, switching on closes the menu, off and why keep it", async () => {
  script();
  herdr.set({ knownAgents: known("claude", "codex", "pi", "opencode") });
  await integrate.refresh();
  const m = await chromeMenu({ ...BASE, integrations: ["claude", "codex", "pi", "opencode"] });
  assert.ok(texts(m.tree).includes("Agent integrations"));
  assert.equal(m.checked("Codex"), true);
  assert.equal(m.checked("Claude Code"), false);
  click(m.row("Codex"), makeCx());
  assert.deepEqual(herdr.calls("closeOverlay"), [], "switching off keeps the menu open");
  assert.deepEqual(runs(), ["roundup-workspace-chrome.uninstall@codex"]);
  click(m.row("Pi · broken"), makeCx());
  assert.equal(toasts().at(-1).title, "Pi's integration is broken");
  assert.deepEqual(herdr.calls("closeOverlay"), []);
  click(m.row("Claude Code"), makeCx());
  assert.deepEqual(herdr.calls("closeOverlay"), [["ov1"]], "the dialog comes next: the menu closes");
  assert.equal(runs().at(-1), "roundup-workspace-chrome.integrate@claude");
});

test("CHR-56: the menu lists only the agents fixed at opening; a busy row spins and does nothing; before the first read, Reading…", async () => {
  script();
  await integrate.refresh();
  let m = await chromeMenu({ ...BASE, integrations: ["codex"] });
  assert.equal(m.row("Claude Code"), undefined);
  herdr.set({ shared: { [BUSY]: "codex" } });
  m = await chromeMenu({ ...BASE, integrations: ["codex"] });
  assert.ok([...walk(m.row("Codex"))].some((e) => e.type === "svg" && String(e.arg).endsWith("/spinner.svg") && e.has("spin")));
  click(m.row("Codex"), makeCx());
  assert.deepEqual(runs(), []);
  m = await chromeMenu({ ...BASE, integrations: null });
  assert.ok(m.row("Reading…"));
  herdr.set({ window: { platform: "windows" } });
  m = await chromeMenu({ ...BASE, integrations: null });
  assert.ok(m.row("Not on Windows yet"));
});

test("CHR-56: the popup's height counts the section: a heading, a divider and a row per agent", async () => {
  const { menuHeight } = await import("../mods/roundup-workspace-chrome/menu.js");
  const none = menuHeight({ ...BASE, integrations: [] });
  assert.equal(menuHeight({ ...BASE, integrations: ["claude", "codex", "pi"] }) - none, 2 * 31);
  assert.equal(menuHeight({ ...BASE, integrations: null }), none, "Reading… is one row too");
});

// --- the brand copy --------------------------------------------------------------------------------

async function brand({ version = "0.11.0" } = {}) {
  const home = tempDir("roundup-app-");
  mkdirSync(join(home, "layouts"));
  writeFileSync(join(home, "layouts", "Herdr-Roundup.json"), JSON.stringify({ version, type: "column" }));
  herdr.set({ appHome: home, shared: { layout: "Herdr-Roundup", "roundup-workspace-chrome.update.auto": false } });
  const Chrome = (await import("../mods/roundup-workspace-chrome/main.js")).default;
  const m = mount(Chrome, { props: {} });
  await waitFor(() => herdr.watching(join(home, "layouts")), 2000, "the layout file read");
  return m;
}

test("CHR-57: at start the brand reads the integrations and toasts once about the installed ones that are off; a later start says nothing", async () => {
  script({ status: "claude: off\ncodex: on\npi: off\nopencode: off\n" });
  herdr.set({ knownAgents: known("claude", "codex") });
  await brand();
  await waitFor(() => toasts().length === 1);
  assert.equal(toasts()[0].title, "Exact numbers for Claude Code");
  assert.deepEqual(herdr.shared(TOLD), ["claude"]);
  herdr.clear();
  await brand();
  await waitFor(() => herdr.shared(STATE)?.claude && herdr.calls("knownAgents").length);
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(toasts(), []);
});

test("CHR-57: in herdr-app check, and on Windows, the brand runs no script at start; BUSY left from a quit is cleared", async () => {
  herdr.set({ checking: true, shared: { [BUSY]: "claude" } });
  await brand();
  assert.equal(herdr.shared(BUSY), null);
  assert.deepEqual(herdr.calls("exec").filter(([cmd]) => cmd === "env"), []);
  reset();
  herdr.onExec(() => ({ code: 0, stdout: "" }));
  herdr.set({ window: { platform: "windows" } });
  await brand();
  assert.deepEqual(herdr.calls("exec").filter(([cmd]) => cmd === "env"), []);
});

test("CHR-58: the brand's commands: integrate asks, install and uninstall run, integrations reads, menu opens the popup by the brand", async () => {
  script({ act: (action, agent) => ({ code: 0, stdout: `${agent}: ${action === "install" ? "on" : "off"}` }) });
  const { cx } = await brand();
  await waitFor(() => herdr.shared(STATE) !== null);
  herdr.clear();
  await herdr.command("integrate@claude");
  assert.equal(herdr.calls("openOverlay")[0][0].mod, "roundup-confirm");
  await herdr.command("install@claude");
  await waitFor(() => toasts().length === 1);
  assert.equal(toasts()[0].title, "Claude Code's integration is on");
  await herdr.command("uninstall@codex");
  await waitFor(() => toasts().length === 2);
  assert.equal(toasts()[1].title, "Codex's integration is off");
  herdr.clear();
  await herdr.command("install@nobody");
  await herdr.command("integrations");
  await waitFor(() => herdr.calls("exec").length >= 2);
  assert.deepEqual(herdr.calls("exec").map(([, args]) => args.at(-1)).sort(), ["status", "where"]);
  herdr.clear();
  await herdr.command("menu");
  const [spec] = herdr.calls("openOverlay")[0];
  assert.equal(spec.kind, "popup");
  assert.deepEqual(spec.at, { x: 76, y: 40 }, "beside macOS's traffic lights, under the brand");
  // No agent installed (knownAgents() is empty here): codex is on, pi broken and opencode unknown, claude off.
  assert.deepEqual(spec.props.menu.integrations, ["codex", "pi", "opencode"]);
  assert.deepEqual(cx.errors, []);
});

test("CHR-58: a click on the brand opens the menu with the agents listed then, and reads their states again", async () => {
  script();
  herdr.set({ knownAgents: known("codex") });
  const { view } = await brand();
  await waitFor(() => herdr.shared(STATE)?.codex);
  herdr.clear();
  view.pressed({ position: { x: 1, y: 1 } });
  view.openMenu({ position: { x: 1, y: 1 }, click_count: 1 });
  const [spec] = herdr.calls("openOverlay")[0];
  assert.equal(spec.at, undefined, "at the pointer");
  // pi broken and opencode unknown are listed though not installed: they can be looked at.
  assert.deepEqual(spec.props.menu.integrations, ["codex", "pi", "opencode"]);
  await waitFor(() => herdr.calls("exec").length >= 2);
});

// --- PR #54 review (agreed with Codex 2026-11-24) ---------------------------------------------------

// knownAgents() answering when the test says: each call waits for its own release (gates[i]()).
function heldKnown() {
  const gates = [];
  herdr.set({ knownAgents: () => new Promise((resolve) => gates.push(() => resolve(known("claude", "codex", "pi", "opencode")))) });
  return gates;
}
// The script's status answering what `now.status` holds when it is run (code 1 when null).
function liveStatus(now) {
  herdr.onExec((call) => {
    if (call.command !== "env") return undefined;
    const action = call.args[3];
    if (action === "status") return now.status === null ? { code: 1, stdout: "", stderr: "broken" } : { code: 0, stdout: now.status };
    if (action === "where") return { code: 0, stdout: WHERE };
    return { code: 0, stdout: `${call.args[4]}: ${action === "install" ? "on" : "off"}\n` };
  });
}

test("CHR-60: an older read never overwrites a newer one; a newer read that fails or is pending doesn't hold back an older one", async () => {
  const gates = heldKnown(), now = { status: "claude: on\n" };
  liveStatus(now);
  const a = integrate.refresh(); // the menu's read: knownAgents() slow
  await waitFor(() => gates.length === 1);
  now.status = "claude: off\n"; // switched off meanwhile
  const b = integrate.refresh(); // the switch's read
  await waitFor(() => gates.length === 2);
  gates[1]();
  assert.equal((await b).claude.state, "off");
  gates[0]();
  assert.equal((await a).claude.state, "off", "the older read answers with what is kept");
  assert.equal(herdr.shared(STATE).claude.state, "off", "and doesn't write the state from before the switch");
  // Reads started later, one failing and one still running, don't stop an earlier one from writing.
  now.status = "claude: on\n";
  const c = integrate.refresh();
  await waitFor(() => gates.length === 3);
  now.status = null;
  const failed = integrate.refresh();
  await waitFor(() => gates.length === 4);
  gates[3]();
  assert.equal(await failed, null, "a read whose script fails: null, nothing written");
  now.status = "claude: off\n";
  const d = integrate.refresh();
  await waitFor(() => gates.length === 5);
  gates[2]();
  assert.equal((await c).claude.state, "on");
  assert.equal(herdr.shared(STATE).claude.state, "on");
  gates[4]();
  assert.equal((await d).claude.state, "off", "the newest read still writes");
});

test("CHR-61: a switch keeps the rows busy until the read after it is in; a second switch meanwhile does nothing", async () => {
  liveStatus({ status: "pi: off\n" });
  const gates = heldKnown();
  const run = integrate.apply("pi", "install");
  await waitFor(() => gates.length === 1);
  assert.equal(herdr.shared(BUSY), "pi", "the read after the switch runs: still busy");
  await integrate.apply("codex", "install");
  assert.equal(herdr.calls("exec").filter(([, args]) => args.includes("install")).length, 1, "the second switch didn't run");
  gates[0]();
  await run;
  assert.equal(herdr.shared(BUSY), null);
  assert.equal(toasts().length, 1);
});

test("CHR-62: an install in an older form keeps its check with a warning and a tooltip; Codex's id set by hand only says why", async () => {
  const status = [
    "claude: on (an older form: run install claude again, so it runs through exec sh)",
    "codex: on (set by hand)",
    "pi: on (an older install: run install pi again, so it follows this layout)",
    "opencode: on (then: something else)",
  ].join("\n");
  const s = I.survey(status, WHERE, known("claude", "codex", "pi", "opencode"));
  assert.deepEqual(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.form])), { claude: "older", codex: "manual", pi: "older", opencode: null });
  assert.equal(I.formOf("on", "thread id not last: run uninstall, then install, to move it"), "older");
  assert.equal(I.formOf("broken", "an older form"), null, "only an on has a form");
  const rows = I.sectionRows(["claude", "codex", "pi", "opencode"], s, null);
  assert.deepEqual(rows[0], { key: "claude", label: "Claude Code · older form", check: true, flag: "circle-alert", warn: true,
    tip: "Installed in an older form: switch it off, then on again, to update it", does: "off" });
  assert.deepEqual(rows[1], { key: "codex", label: "Codex · set by hand", check: true, does: "why" });
  assert.equal(rows[2].label, "Pi · older form");
  assert.deepEqual(rows[3], { key: "opencode", label: "OpenCode", check: true, does: "off" });
  assert.deepEqual(I.whyToast("codex", s, "/h"), {
    level: "info", title: "Codex's integration was set by hand",
    body: '"thread-id" (or "session-id") is in tui.terminal_title in ~/.codex/config.toml, not put there by Roundup, so Roundup leaves it alone. To switch it off, take it out there.',
  });
  // In the menu: the check stays in its place, the warning after the label, the tooltip on the row.
  script({ status });
  herdr.set({ knownAgents: known("claude", "codex", "pi", "opencode") });
  await integrate.refresh();
  const m = await chromeMenu({ ...BASE, integrations: ["claude", "codex", "pi", "opencode"] });
  const row = m.row("Claude Code · older form");
  assert.equal(m.checked("Claude Code · older form"), true);
  assert.ok([...walk(row)].some((e) => e.type === "svg" && String(e.arg).endsWith("/circle-alert.svg")));
  assert.deepEqual(row.style("tooltip"), ["Installed in an older form: switch it off, then on again, to update it"]);
  click(row, makeCx());
  assert.equal(runs().at(-1), "roundup-workspace-chrome.uninstall@claude", "a click switches off, as on any checked row");
  assert.equal(m.checked("Codex · set by hand"), true);
  click(m.row("Codex · set by hand"), makeCx());
  assert.equal(toasts().at(-1).title, "Codex's integration was set by hand");
  assert.equal(runs().filter((r) => r.endsWith("@codex")).length, 0, "nothing runs for it");
});
