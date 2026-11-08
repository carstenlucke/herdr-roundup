// The update check (issue #9): this layout's latest GitHub release against the installed version.
// It only looks and tells. Installing is an agent's job, in a tab of its own, and it asks before changing anything.
import { shared, setShared, notify, knownAgents, run, appHome, exec, window, spaces } from "herdr";
import { PAGE, newer, tagVersion, pick as pickFrom, brief } from "./version.js";

export { newer } from "./version.js";

export const RELEASES = "https://api.github.com/repos/carstenlucke/herdr-roundup/releases/latest";
const DAY = 24 * 60 * 60 * 1000;

// State under this mod's name (`roundup-workspace-chrome.update.<key>`), shared so the menu's popup sees it too:
// lastCheck (ms, set before asking), checked (ms of the last answer), latest ({ version, url }),
// dismissed (a skipped version), notified (the version the toast was shown for), auto (false: only when asked),
// error (why the last check failed, null after one that didn't).
export const get = (key) => shared(`roundup-workspace-chrome.update.${key}`);
export const put = (key, value) => setShared(`roundup-workspace-chrome.update.${key}`, value);

// The release to offer over `installed`: newer and not skipped. Null otherwise.
export function available(installed) {
  const latest = get("latest");
  return latest && newer(latest.version, installed) && latest.version !== get("dismissed") ? latest : null;
}

// GitHub's latest release: { ok: true, version, url } or { ok: false, why }. Nothing but a plain GET with a generic
// User-Agent, which GitHub requires: no token, nothing about the person.
export async function latest() {
  let response;
  try {
    response = await fetch(RELEASES, { headers: { Accept: "application/vnd.github+json", "User-Agent": "herdr-roundup" } });
  } catch {
    return { ok: false, why: "No connection to api.github.com" };
  }
  if (response.status === 404) return { ok: false, why: "No release on GitHub yet" };
  if (response.status === 403 || response.status === 429) return { ok: false, why: "GitHub's rate limit, try again in an hour" };
  if (!response.ok) return { ok: false, why: `GitHub answered ${response.status}` };
  let release;
  try { release = await response.json(); } catch { return { ok: false, why: "GitHub's answer couldn't be read" }; }
  const tag = String(release?.tag_name ?? ""), version = tagVersion(tag);
  if (!version) return { ok: false, why: `The latest release's tag isn't a version (${tag || "none"})` };
  return { ok: true, version, url: release.html_url || PAGE };
}

// The release a command names (`update@0.8.0`), against the latest one known (version.js).
const pick = (version) => pickFrom(version, get("latest"));

// Whether the automatic check is due: on, and the last request more than a day ago (failures count, so a
// broken connection doesn't ask every hour).
export const due = () => get("auto") !== false && Date.now() - (get("lastCheck") ?? 0) >= DAY;

function announce(installed, release) {
  notify({
    level: "info", title: `Herdr Roundup ${release.version} is out`, body: `You have ${installed} · Click to update with an agent`,
    action: { name: `roundup-workspace-chrome.update@${release.version}` },
  });
  put("notified", release.version);
}

// One look at GitHub. The automatic one stays quiet but for one toast per new version; a manual one always
// says what it found, and shows a skipped version again. Returns the error's reason, or null.
export async function check(installed, manual) {
  put("lastCheck", Date.now());
  const r = await latest();
  put("error", r.ok ? null : r.why);
  if (!r.ok) {
    if (manual) notify({ level: "warning", title: "Couldn't check for updates", body: r.why });
    return r.why;
  }
  put("checked", Date.now());
  put("latest", { version: r.version, url: r.url });
  if (newer(r.version, installed)) {
    if (manual) {
      if (get("dismissed") === r.version) put("dismissed", null);
      announce(installed, r);
    } else if (get("dismissed") !== r.version && get("notified") !== r.version) announce(installed, r);
  } else if (manual) {
    notify({ level: "success", title: "Herdr Roundup is up to date",
      body: r.version === installed ? `${installed} is the latest release` : `You have ${installed}, the latest release is ${r.version}` });
  }
  return null;
}

// A new tab with the first installed agent (most picked first) and the brief, in a space on this computer: a tab
// stays on its space's machine, and the agents and the app's folder looked at here are this computer's. The shown
// space if it is here, else the first one here, else a new one. In the app's own folder, so an agent that asks
// whether to trust a folder asks once.
export async function install(installed, version) {
  const release = pick(version);
  if (!release || !newer(release.version, installed)) {
    notify({ level: "info", title: "Nothing to update", body: `Herdr Roundup ${installed} is the latest release known` });
    return;
  }
  const agent = (await knownAgents().catch(() => [])).find(a => a.installed);
  if (!agent) {
    notify({ level: "warning", title: "No agent to update with",
      body: `Tell your agent: update Herdr Roundup to ${release.version} as its README says` });
    return;
  }
  const home = appHome();
  const here = spaces().filter(s => s.machine === null);
  const space = here.find(s => s.active) ?? here[0];
  const tab = { folder: home, argv: agent.run, task: brief(installed, release, home) };
  try {
    if (space) {
      if (!space.active) run("space.select", { id: space.id });
      run("tab.new", { ...tab, name: "Update Herdr Roundup", space: space.id });
    } else run("space.new", { ...tab, machine: "", tab: "Update Herdr Roundup" });
  } catch (e) {
    notify({ level: "warning", title: "Couldn't open the update tab", body: String(e?.message ?? e) });
  }
}

// The release's page in the browser.
export function openNotes(version) {
  const url = pick(version)?.url ?? PAGE;
  const platform = window()?.platform;
  const [cmd, args] = platform === "macos" ? ["open", [url]] : platform === "windows" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  exec(cmd, args).catch(() => notify({ level: "warning", title: "Couldn't open the release notes", body: url }));
}
