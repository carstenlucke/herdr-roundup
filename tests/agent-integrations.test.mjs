// node --test 'tests/*.test.mjs'
// scripts/agent-integrations.sh and the Claude status line script run for real, in a temp folder
// that is HOME, the Herdr App home and XDG_CONFIG_HOME: the person's agent configs are never touched.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, existsSync, readdirSync, realpathSync, symlinkSync, lstatSync, statSync, chmodSync } from "node:fs";
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
// The status line's command as install writes it: exec sh, the path in single quotes.
const shCommand = (p) => `exec sh '${p.replace(/'/g, "'\\''")}'`;
const backups = () => (existsSync(join(state, "backup")) ? readdirSync(join(state, "backup")) : []);

test("claude: install wraps the person's status line, keeps their other settings, and uninstall restores it exactly", () => {
  const before = { model: "opus", statusLine: { type: "command", command: "echo mine", padding: 2 }, hooks: { Stop: [] } };
  put(settings, JSON.stringify(before, null, 2));
  let r = run("install", "claude");
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /claude: on \(your status line keeps running after it: echo mine\)/);
  const on = json(settings);
  assert.deepEqual(on.statusLine, { type: "command", command: shCommand(script), padding: 2 });
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
  assert.deepEqual(json(settings), { statusLine: { type: "command", command: shCommand(script) } });
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
  assert.deepEqual(parsed.tui.terminal_title, ["activity", "thread-name", "project-name", "thread-id"]);
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

test("codex: the person's own title items stay in their order, the thread id last", { skip: !hasPython && "python3 with tomllib is needed" }, () => {
  for (const [line, items] of [
    ['terminal_title = ["activity", "project-name"]', ["activity", "project-name", "thread-id"]],
    ['terminal_title = ["model"] # mine', ["model", "thread-id"]],
    ['terminal_title = ["model",] # see [docs]', ["model", "thread-id"]],
    ["terminal_title = [ 'a]b', \"c\\\"]\" ]", ["a]b", 'c"]', "thread-id"]],
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
    assert.deepEqual(parsed.tui.terminal_title, ["activity", "thread-name", "project-name", "thread-id"], String(before));
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

test("status lists all four agents; a wrong action or agent prints the usage", () => {
  assert.deepEqual(run("status").out.split("\n"), ["claude: off", "codex: off", "pi: off", "opencode: off"]);
  for (const args of [[], ["install"], ["install", "gemini"], ["remove", "claude"]]) {
    const r = run(...args);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /usage:/);
  }
});

// --- PR #38 review: the integrations' edge cases -------------------------------------------------

const cache = (id) => join(home, ".cache/herdr-roundup/context/claude", `${id}.json`);
const statusLine = (input, extra = {}) => spawnSync("sh", [script], { input, env: { ...env, HC_TERMINAL_ID: "t7", ...extra }, encoding: "utf8", timeout: 10_000 });

test("claude: an earlier install's spelling of the script is recognised and moved to sh, keeping what uninstall restores", () => {
  const before = { statusLine: { type: "command", command: "echo mine" } };
  const rel = script.slice(home.length + 1);
  for (const old of [script, `~/${rel}`, `$HOME/${rel}`, `sh ${script}`, `/bin/sh '${script}'`, `sh '${script}'`, `exec ${script}`]) {
    put(settings, JSON.stringify(before));
    assert.equal(run("install", "claude").code, 0);
    const prev = readFileSync(join(state, "claude.json"));
    const next = readFileSync(join(state, "claude-statusline.next"));
    const on = json(settings);
    on.statusLine.command = old; // as an install before this change wrote it, or spelled by hand
    writeFileSync(settings, JSON.stringify(on));
    assert.match(run("status", "claude").out, /^claude: on \(an older form/, old);
    const r = run("install", "claude");
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /now runs through exec sh/);
    assert.equal(json(settings).statusLine.command, shCommand(script));
    assert.deepEqual(readFileSync(join(state, "claude.json")), prev, "restore point untouched");
    assert.deepEqual(readFileSync(join(state, "claude-statusline.next")), next, "the previous line untouched");
    assert.equal(run("uninstall", "claude").code, 0);
    assert.deepEqual(json(settings), before);
  }
});

test("claude: an older form without its restore point is broken, and install changes nothing", () => {
  put(settings, JSON.stringify({ statusLine: { type: "command", command: script } }));
  const r = run("install", "claude");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /broken/);
  assert.equal(json(settings).statusLine.command, script);
  assert.equal(existsSync(join(state, "claude-statusline.next")), false);
});

test("claude: a status line that only mentions the script is neither taken over nor chained", () => {
  const before = { statusLine: { type: "command", command: "bash -c 'x=1; /elsewhere/claude-statusline.sh'" } };
  put(settings, JSON.stringify(before));
  const r = run("install", "claude");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /appears to reference Roundup's script/);
  assert.deepEqual(json(settings), before);
  assert.equal(existsSync(join(state, "claude-statusline.next")), false);
  assert.equal(existsSync(join(state, "claude.json")), false);
  assert.equal(run("status", "claude").out, "claude: off");
});

test("the status line script stops a chain that leads back to it (a link of another name)", () => {
  const alias = join(home, "bin/my-line");
  mkdirSync(join(home, "bin"));
  symlinkSync(script, alias);
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "claude-statusline.next"), `sh '${alias}'; echo after`);
  const r = statusLine('{"session_id":"s1"}');
  assert.equal(r.status, 0, String(r.error ?? r.stderr));
  assert.equal(r.stdout, "after\n", "the nested copy printed nothing and ran nothing");
  assert.equal(json(cache("t7")).claude.session_id, "s1");
});

test("the status line script runs the previous line under sh, whatever $SHELL is, with stdin byte for byte", () => {
  mkdirSync(state, { recursive: true });
  const out = join(home, "seen");
  writeFileSync(join(state, "claude-statusline.next"), `cat > '${out}'; echo ran`);
  for (const input of ['{"a":1}', '{"a":1}\n', '{"a":1}\n\n']) {
    const r = statusLine(input, { SHELL: "/nonexistent/fish" });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, "ran\n", "under $SHELL (a missing fish) it couldn't run");
    assert.equal(readFileSync(out, "utf8"), input, JSON.stringify(input));
    assert.deepEqual(json(cache("t7")).claude, { a: 1 });
  }
  writeFileSync(join(state, "claude-statusline.next"), 'while IFS= read -r line; do echo "got $line"; done');
  assert.equal(statusLine('{"a":1}\n').stdout, 'got {"a":1}\n', "a reader by lines sees its only line");
});

test("claude: the script runs without an executable bit, from a path with a space and an apostrophe", () => {
  const app = join(home, "my app's home");
  mkdirSync(join(app, "mods/roundup-pane"), { recursive: true });
  cpSync(join(repo, "mods/roundup-pane/integrations"), join(app, "mods/roundup-pane/integrations"), { recursive: true });
  const odd = join(app, "mods/roundup-pane/integrations/claude-statusline.sh");
  chmodSync(odd, 0o644);
  env = { ...env, HERDR_APP_HOME: app };
  const r = run("install", "claude");
  assert.equal(r.code, 0, r.err);
  const cmd = json(settings).statusLine.command;
  assert.equal(cmd, shCommand(odd));
  assert.equal(run("status", "claude").out, "claude: on");
  assert.equal(run("install", "claude").out, "claude: already on");
  // As Claude Code runs it: a shell command.
  const ran = spawnSync("/bin/sh", ["-c", cmd], { input: '{"x":2}', env: { ...env, HC_TERMINAL_ID: "t9" }, encoding: "utf8" });
  assert.equal(ran.status, 0, ran.stderr);
  assert.deepEqual(json(cache("t9")).claude, { x: 2 });
});

test("a config that is a symlink stays one: its target is changed and restored, with its mode", () => {
  const dots = join(home, "dotfiles");
  mkdirSync(dots);
  // Claude: a relative link.
  const target = join(dots, "claude-settings.json");
  const before = JSON.stringify({ model: "opus" });
  writeFileSync(target, before);
  chmodSync(target, 0o600);
  mkdirSync(join(home, ".claude"));
  symlinkSync("../dotfiles/claude-settings.json", settings);
  assert.equal(run("install", "claude").code, 0);
  assert.ok(lstatSync(settings).isSymbolicLink(), "still a link");
  assert.equal(json(target).statusLine.command, shCommand(script));
  assert.equal(statSync(target).mode & 0o777, 0o600);
  assert.equal(run("uninstall", "claude").code, 0);
  assert.ok(lstatSync(settings).isSymbolicLink());
  assert.deepEqual(json(target), JSON.parse(before));
  // Codex: an absolute link.
  const ctarget = join(dots, "codex.toml");
  const cbefore = '[tui]\nterminal_title = ["model"]\n';
  writeFileSync(ctarget, cbefore);
  mkdirSync(join(home, ".codex"));
  symlinkSync(ctarget, codex);
  assert.equal(run("install", "codex").code, 0);
  assert.ok(lstatSync(codex).isSymbolicLink());
  assert.match(readFileSync(ctarget, "utf8"), /"model", "thread-id"/);
  assert.equal(run("status", "codex").out, "codex: on");
  assert.equal(run("uninstall", "codex").code, 0);
  assert.ok(lstatSync(codex).isSymbolicLink());
  assert.equal(readFileSync(ctarget, "utf8"), cbefore);
  assert.equal(readdirSync(dots).length, 2, "no temp file left beside the targets");
});

test("a config symlink that leads nowhere or in a circle is refused before anything changes", () => {
  mkdirSync(join(home, ".claude"));
  symlinkSync(join(home, "gone.json"), settings);
  let r = run("install", "claude");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /leads nowhere or in a circle/);
  assert.equal(existsSync(join(home, "gone.json")), false);
  mkdirSync(join(home, ".codex"));
  symlinkSync(join(home, ".codex/loop-b"), codex);
  symlinkSync(codex, join(home, ".codex/loop-b"));
  r = run("install", "codex");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /leads nowhere or in a circle/);
  assert.equal(existsSync(state), false, "no state written");
});

test("codex: backslashes and quotes in the title line survive install and uninstall exactly", () => {
  const line = String.raw`terminal_title = ["activity", 'C:\tools', "a\\b\"c"] # C:\new\table "q"`;
  const before = `[tui]\n${line}\n`;
  put(codex, before);
  assert.equal(run("install", "codex").code, 0);
  const to = json(join(state, "codex.json")).to;
  assert.ok(readFileSync(codex, "utf8").split("\n").includes(to), "the saved line is the written one");
  assert.ok(to.includes(String.raw`'C:\tools', "a\\b\"c", "thread-id"] # C:\new\table "q"`), to);
  assert.equal(run("status", "codex").out, "codex: on");
  assert.equal(run("uninstall", "codex").code, 0);
  assert.equal(readFileSync(codex, "utf8"), before);
});

test("codex: an install with the thread id not last says so, while its line is still there", () => {
  const from = 'terminal_title = ["activity", "project-name"]';
  const to = 'terminal_title = ["activity", "thread-id", "project-name"]';
  put(codex, `[tui]\n${to}\n`);
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "codex.json"), JSON.stringify({ mode: "replace", from, to, existed: true }));
  const notLast = /thread id not last: run uninstall, then install/;
  assert.match(run("status", "codex").out, notLast);
  assert.match(run("install", "codex").out, notLast);
  assert.equal(readFileSync(codex, "utf8"), `[tui]\n${to}\n`, "not migrated");
  // The line changed since: broken, and install doesn't claim it.
  writeFileSync(codex, '[tui]\nterminal_title = ["thread-id", "model"]\n');
  assert.match(run("status", "codex").out, /^codex: broken/);
  assert.equal(run("install", "codex").out, "codex: already on (terminal_title has the thread id)");
  assert.equal(run("uninstall", "codex").code, 1);
});

// --- Codex's review of the fixes ------------------------------------------------------------------

test("codex: an array whose first line has a comment with a bracket spans lines: refused, nothing changed", () => {
  const before = '[tui]\nterminal_title = [ # a closing bracket in this comment: ]\n  "model",\n]\n';
  put(codex, before);
  const r = run("install", "codex");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /several lines/);
  assert.equal(readFileSync(codex, "utf8"), before);
  assert.equal(existsSync(join(state, "codex.json")), false);
});

test("codex: an id only in a comment is no id: install adds it to the array", { skip: !hasPython && "python3 with tomllib is needed" }, () => {
  put(codex, '[tui]\nterminal_title = ["model"] # add "thread-id" later\n');
  assert.equal(run("status", "codex").out, "codex: off");
  assert.equal(run("install", "codex").code, 0);
  assert.deepEqual(JSON.parse(toml(codex).stdout).tui.terminal_title, ["model", "thread-id"]);
});

test("codex: an id-last example in a comment doesn't hide that the real id isn't last", () => {
  const from = 'terminal_title = ["model"]';
  const to = 'terminal_title = ["thread-id", "model"] # old example ["thread-id"]';
  put(codex, `[tui]\n${to}\n`);
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, "codex.json"), JSON.stringify({ mode: "replace", from, to, existed: true }));
  assert.match(run("status", "codex").out, /thread id not last/);
  assert.match(run("install", "codex").out, /thread id not last/);
});

test("a config install created, moved into dotfiles and linked since, keeps its target on uninstall", () => {
  const dots = join(home, "dotfiles");
  mkdirSync(dots);
  for (const [agent, path, name] of [["claude", settings, "settings.json"], ["codex", codex, "config.toml"]]) {
    assert.equal(run("install", agent).code, 0); // no config before: existed false
    const target = join(dots, name);
    cpSync(path, target);
    rmSync(path);
    symlinkSync(target, path);
    const r = run("uninstall", agent);
    assert.equal(r.code, 0, r.err);
    assert.ok(lstatSync(path).isSymbolicLink(), `${agent}: still a link`);
    assert.ok(existsSync(target), `${agent}: its target stays`);
    const text = readFileSync(target, "utf8");
    assert.ok(!text.includes("claude-statusline") && !text.includes("thread-id"), `${agent}: nothing of Roundup's left: ${text}`);
  }
  assert.deepEqual(json(join(dots, "settings.json")), {});
});

test("a config's mode is kept where stat is GNU's (Linux), whose -f prints a file system block before failing", { skip: !hasPython && "python3 is needed" }, () => {
  // A stat that answers as GNU coreutils does: -c %a the mode; -f the file system's block on
  // stdout, then exit 1 (it takes the format for a file name).
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "stat"), [
    "#!/bin/sh",
    'case "$1" in',
    "  -c) [ \"$2\" = %a ] || exit 1; exec python3 -c 'import os, sys; print(format(os.stat(sys.argv[1]).st_mode & 0o777, \"o\"))' \"$3\" ;;",
    "  -f) printf '  File: \"%s\"\\n    ID: 1000000 Namelen: 255 Type: ext2/ext3\\n' \"$3\"; echo \"stat: cannot read file system information for '$2'\" >&2; exit 1 ;;",
    "esac",
    "exit 1",
    "",
  ].join("\n"));
  chmodSync(join(bin, "stat"), 0o755);
  env.PATH = `${bin}:${env.PATH}`;
  assert.equal(spawnSync("stat", ["-f", "%Lp", tool], { env, encoding: "utf8" }).stdout.includes("File:"), true, "the fake prints the block");
  put(settings, JSON.stringify({ model: "opus" }));
  chmodSync(settings, 0o600);
  put(codex, '[tui]\nterminal_title = ["model"]\n');
  chmodSync(codex, 0o600);
  for (const action of ["install", "uninstall"]) {
    for (const agent of ["claude", "codex"]) {
      const r = run(action, agent);
      assert.equal(r.code, 0, r.err);
      assert.equal(statSync(agent === "claude" ? settings : codex).mode & 0o777, 0o600, `${action} ${agent} keeps 0600`);
    }
  }
  assert.equal(readdirSync(join(home, ".claude")).length, 1, "no temp file left");
  assert.equal(readdirSync(join(home, ".codex")).length, 1);
});

test("a config whose mode can't be read is not changed, and no temp file is left", () => {
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "stat"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, "stat"), 0o755);
  env.PATH = `${bin}:${env.PATH}`;
  const before = '[tui]\nterminal_title = ["model"]\n';
  put(codex, before);
  const r = run("install", "codex");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /mode of .* can't be read: not changed/);
  assert.equal(readFileSync(codex, "utf8"), before);
  assert.deepEqual(readdirSync(join(home, ".codex")), ["config.toml"]);
});

test("a config whose mode can't be kept (chmod fails) is not changed, and no temp file is left", () => {
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "chmod"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, "chmod"), 0o755);
  env.PATH = `${bin}:${env.PATH}`;
  const before = JSON.stringify({ model: "opus" });
  put(settings, before);
  const r = run("install", "claude");
  assert.notEqual(r.code, 0);
  assert.match(r.err, /mode of .* can't be kept: not changed/);
  assert.equal(readFileSync(settings, "utf8"), before);
  assert.deepEqual(readdirSync(join(home, ".claude")), ["settings.json"]);
});

test("codex: tui assigned at the top (an inline table, bare or quoted) is refused, the file unchanged, status unknown", () => {
  const forms = [
    "tui = { notifications = true }\n",
    'model = "o"\n"tui" = { notifications = true }\n',
    "'tui'= { notifications = true }\n",
    'tui = { terminal_title = ["activity", "thread-id"] }\n',
  ];
  for (const text of forms) {
    put(codex, text);
    const r = run("install", "codex");
    assert.notEqual(r.code, 0, text);
    assert.match(r.err, /tui in .* is an inline table: add "thread-id" to its terminal_title by hand/);
    assert.equal(readFileSync(codex, "utf8"), text, "byte for byte");
    assert.equal(existsSync(join(state, "codex.json")), false);
    assert.equal(run("status", "codex").out, "codex: unknown (inline tui table; inspect by hand)");
  }
});

test("codex: a key that only starts with tui, or tui inside another table, is no inline tui", { skip: !hasPython && "python3 with tomllib is needed" }, () => {
  for (const text of ["tui_extra = 1\n", '[profiles.work]\ntui = { notifications = true }\n']) {
    put(codex, text);
    const r = run("install", "codex");
    assert.equal(r.code, 0, r.err);
    const parsed = toml(codex);
    assert.equal(parsed.status, 0, parsed.stderr);
    assert.deepEqual(JSON.parse(parsed.stdout).tui.terminal_title.at(-1), "thread-id");
    assert.equal(run("uninstall", "codex").code, 0);
    assert.equal(readFileSync(codex, "utf8"), text);
  }
});

test("the installed command gives the status line Claude's pid as $PPID, also under a shell that forks for a plain command", () => {
  assert.equal(run("install", "claude").code, 0);
  const cmd = json(settings).statusLine.command;
  // As Claude Code runs it: `<shell> -c <command>`. The trailing `:` keeps that shell from
  // replacing itself on its own, as dash before 0.5.11 or a wrapper never does: only the
  // command's `exec` makes the script this process's child. No CLAUDE_PID, as in Claude Code.
  const call = (command) => {
    const r = spawnSync("/bin/sh", ["-c", `${command}; :`], { input: '{"session_id":"s1"}', env: { ...env, HC_TERMINAL_ID: "t7" }, encoding: "utf8", timeout: 10_000 });
    assert.equal(r.status, 0, String(r.error ?? r.stderr));
    return json(cache("t7")).pid;
  };
  assert.equal(call(cmd), process.pid, "the pid of the process that started the command");
  assert.notEqual(call(shCommand(script).replace(/^exec /, "")), process.pid, "without exec: the forking shell's pid (what the fix is for)");
});

// --- pi and opencode: a link to the layout's file ------------------------------------------------

const piLink = () => join(home, ".pi/agent/extensions/roundup-context.js");
const opencodeLink = () => join(home, ".config/opencode/plugins/roundup-context");
const target = (rel) => join(env.HERDR_APP_HOME, "mods/roundup-pane/integrations", rel);

for (const [agent, link, rel] of [["pi", piLink, "pi-context.js"], ["opencode", opencodeLink, "opencode"]]) {
  test(`${agent}: install links the layout's ${rel}, is idempotent, and uninstall removes only that link`, () => {
    let r = run("install", agent);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, new RegExp(`^${agent}: on`));
    assert.equal(lstatSync(link()).isSymbolicLink(), true);
    assert.equal(spawnSync("readlink", [link()], { encoding: "utf8" }).stdout.trim(), target(rel));
    assert.equal(run("status", agent).out, `${agent}: on`);
    assert.equal(run("install", agent).out, `${agent}: already on`);
    assert.equal(backups().length, 0, "nothing of the person's changed: no backup");
    r = run("uninstall", agent);
    assert.equal(r.code, 0, r.err);
    assert.equal(r.out, `${agent}: off`);
    assert.equal(existsSync(link()), false);
    assert.equal(existsSync(target(rel)), true, "the layout's file stays");
    assert.equal(run("status", agent).out, `${agent}: off`);
    assert.equal(run("uninstall", agent).out, `${agent}: already off`);
  });

  test(`${agent}: the person's own file there is left alone; a link whose file went is broken; an older home's link is ours`, () => {
    put(link(), "mine\n");
    let r = run("install", agent);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /isn't Roundup's: not changed/);
    assert.match(run("status", agent).out, new RegExp(`^${agent}: unknown`));
    assert.notEqual(run("uninstall", agent).code, 0);
    assert.equal(readFileSync(link(), "utf8"), "mine\n");
    rmSync(link());
    // Another Herdr App home's link (the layout installed elsewhere before): ours, pointed here again.
    const old = join(home, "old-app/mods/roundup-pane/integrations", rel);
    mkdirSync(join(old, ".."), { recursive: true });
    symlinkSync(old, link());
    assert.match(run("status", agent).out, /broken \(.* is missing/);
    r = run("install", agent);
    assert.equal(r.code, 0, r.err);
    assert.equal(spawnSync("readlink", [link()], { encoding: "utf8" }).stdout.trim(), target(rel));
    // The layout's file gone (no sync yet): install refuses, status says broken.
    rmSync(target(rel), { recursive: true });
    assert.match(run("status", agent).out, /broken/);
    rmSync(link());
    r = run("install", agent);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /scripts\/sync\.sh/);
  });
}

test("pi follows PI_CODING_AGENT_DIR (with ~), opencode OPENCODE_CONFIG_DIR", () => {
  env.PI_CODING_AGENT_DIR = "~/pi-home";
  env.OPENCODE_CONFIG_DIR = join(home, "oc");
  assert.equal(run("install", "pi").code, 0);
  assert.equal(run("install", "opencode").code, 0);
  assert.equal(lstatSync(join(home, "pi-home/extensions/roundup-context.js")).isSymbolicLink(), true);
  assert.equal(lstatSync(join(home, "oc/plugins/roundup-context")).isSymbolicLink(), true);
});
