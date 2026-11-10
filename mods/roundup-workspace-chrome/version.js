// What update.js decides without asking anyone: version order, a release tag's version, which release a
// command names and the agent's brief. No `herdr` import, so tests run it in node.
export const PAGE = "https://github.com/carstenlucke/herdr-roundup/releases";
// A version this layout releases: major.minor.patch, a pre-release with an alpha, beta or rc suffix
// ("0.10.0-beta.2"). Anything else in a tag isn't offered.
export const VERSION = /^v?(\d+)\.(\d+)\.(\d+)(?:-((?:alpha|beta|rc)(?:\.\d+)?))?$/;

// Whether a version is a pre-release ("0.10.0-beta.2").
export const isPre = (v) => /^v?\d+\.\d+\.\d+-/.test(String(v ?? ""));

// a newer than b by SemVer's order: major.minor.patch as numbers, then a pre-release before its release
// (0.10.0-alpha.1 < 0.10.0-beta.1 < 0.10.0-rc.1 < 0.10.0), its parts compared one by one, numbers as numbers.
const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/;
function preOrder(a, b) {
  if (a === b) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  const x = a.split("."), y = b.split(".");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    const nx = /^\d+$/.test(x[i]), ny = /^\d+$/.test(y[i]);
    if (nx && ny) { if (Number(x[i]) !== Number(y[i])) return Number(x[i]) > Number(y[i]) ? 1 : -1; }
    else if (nx !== ny) return nx ? -1 : 1;
    else if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}
export function newer(a, b) {
  const x = SEMVER.exec(a ?? ""), y = SEMVER.exec(b ?? "");
  if (!x || !y) return false;
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) > Number(y[i]);
  return preOrder(x[4], y[4]) > 0;
}

// A release tag's version ("v0.8.1" → "0.8.1", leading zeros dropped), or null for anything else. A pre-release
// ("v0.10.0-beta.2") only with `pre`: without it a pre-release isn't offered.
export function tagVersion(tag, pre = false) {
  const m = VERSION.exec(String(tag ?? ""));
  if (!m || (m[4] && !pre)) return null;
  return `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}${m[4] ? `-${m[4]}` : ""}`;
}

// The newest of GitHub's release list (GET …/releases) as { version, url }, or null: drafts and tags that aren't
// a version left out, pre-releases (by tag or GitHub's flag) only with `pre`.
export function newest(list, pre) {
  let best = null;
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || r.draft || (r.prerelease && !pre)) continue;
    const version = tagVersion(r.tag_name, pre);
    if (version && (!best || newer(version, best.version))) best = { version, url: r.html_url || PAGE };
  }
  return best;
}

// The release a command names (`update@0.8.0`, from the menu or the toast): what its label said, even if a check
// found a newer one between the click and the command. Without a version (a key), `latest`: the latest known one.
export function pick(version, latest) {
  if (!version || latest?.version === version) return latest;
  return VERSION.test(version) ? { version, url: `${PAGE}/tag/v${version}` } : null;
}

// What the agent is told. It reads the release and checks for local changes before it touches anything.
// `home` is the app's folder (appHome(), with HERDR_APP_HOME not the usual one): every path names it, and
// sync.sh and `herdr-app status` get the variable, which the agent's shell may not have.
export function brief(installed, release, home) {
  const env = `HERDR_APP_HOME=${JSON.stringify(home)} `;
  const pre = isPre(release.version) ? ` It is a pre-release: say so before you start.` : "";
  return `Update the Herdr layout Herdr Roundup from v${installed} to v${release.version}.${pre} Herdr's app folder is ${home}. ` +
    `First read ${home}/AGENTS.md. ` +
    `Clone https://github.com/carstenlucke/herdr-roundup at tag v${release.version} into a new empty folder (mktemp -d). ` +
    `Read its release notes (${release.url}) and README. Before changing anything, tell me what changes, whether keys in the ` +
    `\`layout:Herdr-Roundup\` section of ${home}/keys.json that I changed myself would be replaced, and whether the ` +
    `installed \`roundup-*\` mods in ${home}/mods differ from tag v${installed} (local edits that would be lost). ` +
    `Only after I agree, run \`${env}scripts/sync.sh\` in the clone, then confirm \`${env}herdr-app status\` shows no errors.`;
}
