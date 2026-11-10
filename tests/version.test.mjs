// roundup-workspace-chrome's version.js: version order, release tags, the release a command names, the agent's brief.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newer, isPre, tagVersion, newest, pick, brief, PAGE } from "../mods/roundup-workspace-chrome/version.js";

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

test("newer puts a pre-release before its release, alpha before beta before rc, their numbers as numbers", () => {
  const order = ["0.9.1", "0.10.0-alpha", "0.10.0-alpha.1", "0.10.0-alpha.2", "0.10.0-alpha.10", "0.10.0-beta",
    "0.10.0-beta.1", "0.10.0-rc.1", "0.10.0", "v0.10.1-beta.1", "0.10.1"];
  for (const [i, a] of order.entries())
    for (const [j, b] of order.entries()) assert.equal(newer(a, b), i > j, `newer(${a}, ${b})`);
  assert.equal(newer("0.10.0-beta.1", "0.10.0-beta.01"), false, "numbers as numbers");
});

test("isPre: a version with a suffix", () => {
  assert.equal(isPre("0.10.0-beta.1"), true);
  assert.equal(isPre("v0.10.0-rc"), true);
  assert.equal(isPre("0.10.0"), false);
  assert.equal(isPre(undefined), false);
});

test("tagVersion reads an alpha, beta or rc tag only when pre-releases are wanted", () => {
  assert.equal(tagVersion("v0.10.0-beta.2"), null);
  assert.equal(tagVersion("v0.10.0-beta.2", true), "0.10.0-beta.2");
  assert.equal(tagVersion("v0.10.0-alpha", true), "0.10.0-alpha");
  assert.equal(tagVersion("v0.10.0-beta.0", true), "0.10.0-beta.0");
  assert.equal(tagVersion("v00.10.0-rc.1", true), null, "a leading zero: v0.10.0-rc.1 would name another tag");
  assert.equal(tagVersion("v0.10.0-beta.01", true), null);
  assert.equal(tagVersion("v0.9.1", true), "0.9.1");
  for (const tag of ["v0.10.0-pre.1", "v0.10.0-beta.x", "v0.10.0-Beta.1", "v0.10.0-beta.1; rm -rf ~", "v0.10.0-"])
    assert.equal(tagVersion(tag, true), null, tag);
});

test("newest: the highest version of the list, drafts and other tags left out, pre-releases only when wanted", () => {
  const r = (tag, extra = {}) => ({ tag_name: tag, html_url: `${PAGE}/tag/${tag}`, ...extra });
  const list = [r("v0.11.0", { draft: true }), r("v0.10.0-beta.2", { prerelease: true }), r("nightly"),
    r("v0.10.0-alpha.9", { prerelease: true }), r("v0.9.1"), r("v0.9.0")];
  assert.deepEqual(newest(list, true), { version: "0.10.0-beta.2", url: `${PAGE}/tag/v0.10.0-beta.2` });
  assert.deepEqual(newest(list, false), { version: "0.9.1", url: `${PAGE}/tag/v0.9.1` });
  assert.deepEqual(newest([r("v0.10.0-rc.1", { prerelease: true }), r("v0.10.0")], true).version, "0.10.0", "the release beats its rc");
  assert.equal(newest([r("v1.0.0", { prerelease: true })], false), null, "GitHub's flag counts too");
  assert.equal(newest([r("v1.0.0", { prerelease: true })], true), null, "flagged without a suffix: left out on both channels");
  assert.deepEqual(newest([r("v1.0.0", { prerelease: true }), r("v0.9.1")], true).version, "0.9.1");
  assert.equal(newest([r("v0.10.0-beta.1")], true).version, "0.10.0-beta.1", "a pre-release tag without the flag is one");
  assert.equal(newest([r("v0.10.0-beta.1")], false), null);
  assert.deepEqual(newest([{ tag_name: "v0.9.0" }], true), { version: "0.9.0", url: PAGE });
  assert.equal(newest([], true), null);
  assert.equal(newest({ message: "Not Found" }, true), null);
});

test("pick takes a pre-release the command names", () => {
  assert.deepEqual(pick("0.10.0-beta.1", null), { version: "0.10.0-beta.1", url: `${PAGE}/tag/v0.10.0-beta.1` });
});

test("tagVersion reads v<major>.<minor>.<patch> as written and rejects anything else, leading zeros too", () => {
  assert.equal(tagVersion("v01.02.03"), null);
  assert.equal(tagVersion("v0.0.0"), "0.0.0");
  assert.equal(tagVersion("v0.99999999999999999999.0"), "0.99999999999999999999.0", "the tag's digits, not a Number's");
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
  assert.ok(!text.includes("pre-release"), "a release isn't called a pre-release");
  const pre = brief("0.9.1", { version: "0.10.0-beta.1", url: `${PAGE}/tag/v0.10.0-beta.1` }, home);
  assert.ok(pre.includes("to v0.10.0-beta.1. It is a pre-release: say so before you start."), "a pre-release is named one");
  assert.ok(pre.includes("at tag v0.10.0-beta.1"));
});
