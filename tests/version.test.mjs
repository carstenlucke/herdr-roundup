// roundup-workspace-chrome's version.js: version order, release tags, the release a command names, the agent's brief.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newer, tagVersion, pick, brief, PAGE } from "../mods/roundup-workspace-chrome/version.js";

test("newer compares major.minor.patch as numbers, takes a leading v and ignores a suffix", () => {
  assert.equal(newer("0.10.0", "0.9.0"), true);
  assert.equal(newer("0.9.0", "0.10.0"), false);
  assert.equal(newer("v1.0.0", "0.99.99"), true);
  assert.equal(newer("0.9.0", "0.8.0-rc.1"), true);
  assert.equal(newer("0.8.0-rc.1", "0.8.0"), false);
  assert.equal(newer("0.8.1", "0.8.1"), false);
  assert.equal(newer("latest", "0.8.0"), false);
  assert.equal(newer("0.9.0", undefined), false);
  assert.equal(newer(null, "0.1.0"), false);
});

test("tagVersion reads v<major>.<minor>.<patch> without leading zeros and rejects anything else", () => {
  assert.equal(tagVersion("v01.02.03"), "1.2.3");
  assert.equal(tagVersion("0.8.1"), "0.8.1");
  assert.equal(tagVersion("v0.9.0-rc.1"), null);
  assert.equal(tagVersion("latest"), null);
  assert.equal(tagVersion(undefined), null);
});

test("pick: the latest when it is named or nothing is, a release page for another valid version, else null", () => {
  const latest = { version: "0.9.0", url: "https://example.invalid/r/0.9.0" };
  assert.equal(pick("0.9.0", latest), latest);
  assert.equal(pick(undefined, latest), latest);
  assert.equal(pick("", latest), latest);
  assert.deepEqual(pick("0.8.5", latest), { version: "0.8.5", url: `${PAGE}/tag/v0.8.5` });
  assert.equal(pick("nonsense", latest), null);
  assert.equal(pick(undefined, null), null);
});

test("brief names both versions, the app home's files, the clone at the tag and asks before it changes anything", () => {
  const home = "/Users/me/my herdr";
  const text = brief("0.8.1", { version: "0.9.0", url: `${PAGE}/tag/v0.9.0` }, home);
  for (const part of ["v0.8.1", "v0.9.0", `${home}/AGENTS.md`, "at tag v0.9.0", "mktemp -d", `${PAGE}/tag/v0.9.0`,
    "`layout:Herdr-Roundup` section of /Users/me/my herdr/keys.json", `${home}/mods`, "Only after I agree"]) {
    assert.ok(text.includes(part), `brief names ${part}`);
  }
  assert.ok(text.includes('`HERDR_APP_HOME="/Users/me/my herdr" scripts/sync.sh`'), "sync.sh gets the home, quoted");
  assert.ok(text.includes('`HERDR_APP_HOME="/Users/me/my herdr" herdr-app status`'), "status gets the home, quoted");
});
