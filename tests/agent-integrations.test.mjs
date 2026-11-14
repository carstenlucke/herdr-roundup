// node --test 'tests/*.test.mjs'
// scripts/agent-integrations.sh and the Claude status line script run for real, in a temp folder
// that is HOME, the Herdr App home and XDG_CONFIG_HOME: the person's agent configs are never touched.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, readdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));
const tool = join(repo, "scripts/agent-integrations.sh");
let home, env, script, settings, codex, state;

beforeEach(() => {
  home = mkdtempSync(join(realpathSync(tmpdir()), "integrations-"));
  const app = join(home, "app");
  mkdirSync(join(app, "mods/roundup-pane"), { recursive: true });
  cpSync(join(repo, "mods/roundup-pane/integrations"), join(app, "mods/roundup-pane/integrations"), { recursive: true });
  script = join(app, "mods/roundup-pane/integrations/claude-statusline.sh");
  settings = join(home, ".claude/settings.json");
  codex = join(home, ".codex/config.toml");
  state = join(home, ".config/herdr-roundup/integrations");
  env = { PATH: process.env.PATH, HOME: home, HERDR_APP_HOME: app, XDG_CONFIG_HOME: join(home, ".config"), SHELL: "/bin/sh" };
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const run = (...args) => {
  const r = spawnSync("sh", [tool, ...args], { env, encoding: "utf8" });
  return { code: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
};
const put = (path, text) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); };
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const toml = (path) => spawnSync("python3", ["-c", "import sys, tomllib, json; print(json.dumps(tomllib.load(open(sys.argv[1], 'rb'))))", path], { encoding: "utf8" });
const hasPython = spawnSync("python3", ["-c", "import tomllib"]).status === 0;
const backups = () => (existsSync(join(state, "backup")) ? readdirSync(join(state, "backup")) : []);

test("claude: install wraps the person's status line, keeps their other settings, and uninstall restores it exactly", () => {
  const before = { model: "opus", statusLine: { type: "command", command: "echo mine", padding: 2 }, hooks: { Stop: [] } };
  put(settings, JSON.stringify(before, null, 2));
  let r = run("install", "claude");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /claude: on \(your status line keeps running after it: echo mine\)/);
  const on = json(settings);
  assert.deepEqual(on.statusLine, { type: "command", command: script, padding: 2 });
  assert.equal(on.model, "opus");
  assert.deepEqual(on.hooks, { Stop: [] });
  assert.equal(readFileSync(join(state, "claude-statusline.next"), "utf8").trim(), "echo mine");
  assert.equal(backups().length, 1);
  assert.match(run("status", "claude").out, /^claude: on \(then: echo mine\)$/);
  // Idempotent: nothing changes, no second backup.
  r = run("install", "claude");
  assert.equal(r.out, "claude: already on");
  assert.equal(backups().length, 1);
  r = run("uninstall", "claude");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(json(settings), before);
  assert.equal(existsSync(join(state, "claude-statusline.next")), false);
  assert.equal(run("status", "claude").out, "claude: off");
  assert.equal(run("uninstall", "claude").out, "claude: already off");
});

test("claude: without settings.json install creates it and uninstall removes it again", () => {
  assert.equal(run("install", "claude").code, 0);
  assert.deepEqual(json(settings), { statusLine: { type: "command", command: script } });
  assert.equal(run("uninstall", "claude").code, 0);
  assert.equal(existsSync(settings), false);
});

test("claude: a status line changed by hand since install is left alone and reported as broken", () => {
  put(settings, "{}");
  run("install", "claude");
  writeFileSync(settings, JSON.stringify({ statusLine: { type: "command", command: "other" } }));
  assert.match(run("status", "claude").out, /^claude: broken \(the status line was changed since install/);
  const r = run("uninstall", "claude");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /no longer Roundup's/);
  assert.deepEqual(json(settings), { statusLine: { type: "command", command: "other" } });
});

test("claude: install refuses when the script isn't installed or settings.json isn't an object", () => {
  rmSync(script);
  let r = run("install", "claude");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /scripts\/sync\.sh/);
  cpSync(join(repo, "mods/roundup-pane/integrations/claude-statusline.sh"), script);
  put(settings, "[1, 2]");
  r = run("install", "claude");
  assert.notEqual(r.code, 0);
  assert.equal(readFileSync(settings, "utf8"), "[1, 2]");
});

test("the status line script keeps Claude's JSON per terminal with its pid, then runs the previous status line", () => {
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "claude-statusline.next"), "cat >/dev/null; echo previous line");
  const stdin = JSON.stringify({ session_id: "s1", context_window: { context_window_size: 1000000, current_usage: { input_tokens: 2 } } });
  const r = spawnSync("sh", [script], { input: stdin, env: { ...env, HC_TERMINAL_ID: "t7", CLAUDE_PID: "4242" }, encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), "previous line");
  const kept = json(join(home, ".cache/herdr-roundup/context/claude/t7.json"));
  assert.equal(kept.v, 1);
  assert.equal(kept.terminal, "t7");
  assert.equal(kept.pid, 4242);
  assert.ok(Math.abs(kept.at - Date.now()) < 5000);
  assert.deepEqual(kept.claude, JSON.parse(stdin));
  assert.deepEqual(readdirSync(join(home, ".cache/herdr-roundup/context/claude")), ["t7.json"], "no temp file left");
});

test("the status line script writes nothing outside a Herdr terminal or for an odd terminal id, and prints nothing without a previous line", () => {
  for (const id of [undefined, "../x", "t 7"]) {
    const e = { ...env };
    if (id !== undefined) e.HC_TERMINAL_ID = id;
    const r = spawnSync("sh", [script], { input: "{}", env: e, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "");
  }
  assert.equal(existsSync(join(home, ".cache/herdr-roundup")), false);
});

test("codex: without terminal_title install adds Codex's defaults with the thread id, and uninstall takes it out again", { skip: !hasPython && "python3 with tomllib is needed to check the TOML" }, () => {
  const before = 'model = "gpt-6.1-sol"\n\n[tui]\nscreen_reader_detection_done = true\n\n[tui.model_availability_nux]\n"gpt-5.5" = 4\n';
  put(codex, before);
  let r = run("install", "codex");
  assert.equal(r.code, 0, r.err);
  const parsed = JSON.parse(toml(codex).stdout);
  assert.deepEqual(parsed.tui.terminal_title, ["activity", "thread-id", "thread-name", "project-name"]);
  assert.equal(parsed.tui.screen_reader_detection_done, true);
  assert.equal(parsed.tui.model_availability_nux["gpt-5.5"], 4);
  assert.equal(run("status", "codex").out, "codex: on");
  assert.equal(run("install", "codex").out, "codex: already on (terminal_title has the thread id)");
  assert.equal(backups().length, 1);
  r = run("uninstall", "codex");
  assert.equal(r.code, 0, r.err);
  assert.equal(readFileSync(codex, "utf8"), before);
  assert.equal(run("status", "codex").out, "codex: off");
});

test("codex: the person's own title items stay, the thread id after their activity or first", { skip: !hasPython && "python3 with tomllib is needed" }, () => {
  for (const [line, items] of [
    ['terminal_title = ["activity", "project-name"]', ["activity", "thread-id", "project-name"]],
    ['terminal_title = ["model"] # mine', ["thread-id", "model"]],
    ["terminal_title = []", ["thread-id"]],
  ]) {
    const before = `[tui]\n${line}\n`;
    put(codex, before);
    assert.equal(run("install", "codex").code, 0);
    assert.deepEqual(JSON.parse(toml(codex).stdout).tui.terminal_title, items, line);
    assert.equal(run("uninstall", "codex").code, 0);
    assert.equal(readFileSync(codex, "utf8"), before);
  }
});

test("codex: no [tui] table, a missing file, or only dotted tui keys get a dotted key at the top", { skip: !hasPython && "python3 with tomllib is needed" }, () => {
  for (const before of ['model = "x"\n\n[profiles.a]\nmodel = "y"\n', "", 'tui.animations = false\n[profiles.a]\nmodel = "y"\n', null]) {
    rmSync(codex, { force: true });
    if (before !== null) put(codex, before);
    assert.equal(run("install", "codex").code, 0);
    const parsed = JSON.parse(toml(codex).stdout);
    assert.deepEqual(parsed.tui.terminal_title, ["activity", "thread-id", "thread-name", "project-name"], String(before));
    assert.equal(run("uninstall", "codex").code, 0);
    if (before === null) assert.equal(existsSync(codex), false, "a file install made goes again");
    else assert.equal(readFileSync(codex, "utf8"), before);
  }
});

test("codex: a title that has the thread id already, or one spread over lines, is not changed", () => {
  put(codex, '[tui]\nterminal_title = ["session-id"]\n');
  assert.match(run("install", "codex").out, /already on/);
  assert.equal(run("status", "codex").out, "codex: on (set by hand)");
  assert.equal(existsSync(join(state, "codex.json")), false);
  put(codex, '[tui]\nterminal_title = [\n  "activity",\n]\n');
  const r = run("install", "codex");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /several lines/);
  assert.equal(readFileSync(codex, "utf8"), '[tui]\nterminal_title = [\n  "activity",\n]\n');
});

test("codex: a line changed by hand since install is left alone", () => {
  put(codex, "[tui]\n");
  run("install", "codex");
  writeFileSync(codex, '[tui]\nterminal_title = ["model"]\n');
  assert.match(run("status", "codex").out, /^codex: broken/);
  assert.notEqual(run("uninstall", "codex").code, 0);
  assert.equal(readFileSync(codex, "utf8"), '[tui]\nterminal_title = ["model"]\n');
});

test("status lists both agents; a wrong action or agent prints the usage", () => {
  assert.deepEqual(run("status").out.split("\n"), ["claude: off", "codex: off"]);
  for (const args of [[], ["install"], ["install", "pi"], ["remove", "claude"]]) {
    const r = run(...args);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /usage:/);
  }
});
