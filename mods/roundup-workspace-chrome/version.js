// What update.js decides without asking anyone: version order, a release tag's version, which release a
// command names and the agent's brief. No `herdr` import, so tests run it in node.
export const PAGE = "https://github.com/carstenlucke/herdr-roundup/releases";
export const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;

// a newer than b, by their leading "major.minor.patch" (a suffix such as "-rc.1" doesn't hide an update).
const LEADING = /^v?(\d+)\.(\d+)\.(\d+)/;
export function newer(a, b) {
  const x = LEADING.exec(a ?? ""), y = LEADING.exec(b ?? "");
  if (!x || !y) return false;
  for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) > Number(y[i]);
  return false;
}

// A release tag's version ("v0.8.1" → "0.8.1", leading zeros dropped), or null for anything else
// (a suffix such as "-rc.1" included: a pre-release isn't offered).
export function tagVersion(tag) {
  const m = VERSION.exec(String(tag ?? ""));
  return m ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}` : null;
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
  return `Update the Herdr layout Herdr Roundup from v${installed} to v${release.version}. Herdr's app folder is ${home}. ` +
    `First read ${home}/AGENTS.md. ` +
    `Clone https://github.com/carstenlucke/herdr-roundup at tag v${release.version} into a new empty folder (mktemp -d). ` +
    `Read its release notes (${release.url}) and README. Before changing anything, tell me what changes, whether keys in the ` +
    `\`layout:Herdr-Roundup\` section of ${home}/keys.json that I changed myself would be replaced, and whether the ` +
    `installed \`roundup-*\` mods in ${home}/mods differ from tag v${installed} (local edits that would be lost). ` +
    `Only after I agree, run \`${env}scripts/sync.sh\` in the clone, then confirm \`${env}herdr-app status\` shows no errors.`;
}
