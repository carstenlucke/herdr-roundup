// The logo menu's agent integrations (issue #48), run in the brand copy: the menu is a popup that ends when
// it closes, so its rows send commands here, as the update does. The script is roundup-pane's
// (mods/roundup-pane/integrations/agent-integrations.sh); what it says goes to shared state (STATE), which
// the menu and roundup-pane's card read. What is decided without asking anyone is in integrations.js.
import { exec, knownAgents, appHome, home, shared, setShared, notify, openOverlay, closeOverlay, window } from "herdr";
import { STATE, BUSY, TOLD, agentOf, survey, tilde, confirmProps, resultToast, introToast } from "./integrations.js";

export { STATE, BUSY, TOLD } from "./integrations.js";

// POSIX sh and jq: not on Windows (issue #53). The menu says so; nothing runs.
export const unsupported = () => window()?.platform === "windows";

export const script = () => `${appHome()}/mods/roundup-pane/integrations/agent-integrations.sh`;
// Through `sh`, so the file needs no executable bit; with the app's folder, which the shell exec starts may
// not have (an isolated instance's HERDR_APP_HOME).
const sh = (args, timeout) => exec("env", [`HERDR_APP_HOME=${appHome()}`, "sh", script(), ...args], { timeout });

// One read of every agent's state, kept in STATE. Reads overlap (the menu's, a switch's, the hourly one),
// and knownAgents() can be slow the first time: a read writes only when no read started after it has
// written yet, so an older one never brings back the state from before a switch. A later read that fails
// or is still running doesn't hold this one back. Resolves with the state this session last wrote (this
// read's, or a newer one's), or null when none has been written yet or the script couldn't run (STATE stays
// as it was, possibly from a run before).
let started = 0, written = 0;
export async function refresh() {
  if (unsupported()) return null;
  const mine = ++started;
  const [status, where, known] = await Promise.all([
    sh(["status"], 15000).catch(() => null),
    sh(["where"], 15000).catch(() => null),
    knownAgents().catch(() => null),
  ]);
  if (!status || status.code !== 0) return null;
  if (mine < written) return shared(STATE);
  const state = survey(status.stdout, where?.code === 0 ? where.stdout : "", known);
  written = mine;
  setShared(STATE, state);
  return state;
}

// The dialog before install: it names the file that changes, and its Switch on sends install@<agent> here.
const OPEN = "roundup-confirm.open";
export function ask(key) {
  if (!agentOf(key) || unsupported() || shared(BUSY)) return;
  const props = confirmProps(key, tilde(shared(STATE)?.[key]?.file ?? null, home()));
  if (shared(OPEN)) closeOverlay(shared(OPEN));
  setShared(OPEN, openOverlay({ mod: "roundup-confirm", kind: "dialog", width: 420, height: 200, props }));
}

// install or uninstall one agent's integration, then a toast with what happened, and STATE read again. One
// at a time: the menu's rows wait while BUSY is set, until the read after the switch is in (else the open
// menu would offer the state from before it for a click).
export async function apply(key, action) {
  if (!agentOf(key) || unsupported() || shared(BUSY)) return;
  setShared(BUSY, key);
  let r;
  try {
    try { r = await sh([action, key], 60000); } catch (e) { r = { code: -1, stdout: "", stderr: String(e?.message ?? e) }; }
    await refresh().catch(() => null);
  } finally {
    setShared(BUSY, null);
  }
  notify(resultToast(key, action, r));
}

// After an install or an update: one toast for the installed agents whose integration is off, each named once.
export function introduce(state) {
  const r = introToast(state, shared(TOLD));
  if (!r) return;
  notify(r.toast);
  setShared(TOLD, r.told);
}
