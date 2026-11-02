#!/usr/bin/env node
/**
 * Cut a release from main.
 *
 *   npm run release:patch
 *   npm run release:minor
 *   npm run release:major
 *   npm run release -- 1.2.3
 *
 * The script bumps package.json and package-lock.json with npm, promotes the
 * CHANGELOG's Unreleased section to a dated version heading, commits both and
 * creates an annotated vX.Y.Z tag. Pushing the commit and tag triggers CI,
 * which validates the tag and publishes the matching image to GHCR.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const request = process.argv[2]?.trim();
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!request) {
  console.error(
    "Usage: npm run release:patch | release:minor | release:major | release -- <x.y.z>",
  );
  process.exit(1);
}
if (!["patch", "minor", "major"].includes(request) && !SEMVER.test(request.replace(/^v/, ""))) {
  console.error(`"${request}" is not patch, minor, major or a semantic version.`);
  process.exit(1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function git(args, options = {}) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", ...options });
}

try {
  if (git(["status", "--porcelain"]).trim()) {
    fail("The working tree is not clean. Commit or stash changes before releasing.");
  }
} catch {
  fail("Releases must be cut inside a Git working tree.");
}

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).trim();
if (branch !== "main") {
  fail(`Release from main (current branch: ${branch}).`);
}

const changelogPath = path.join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const marker = "## [Unreleased]";
const markerIndex = changelog.indexOf(marker);
if (markerIndex === -1) {
  fail("CHANGELOG.md has no `## [Unreleased]` section.");
}
const nextHeading = changelog.indexOf("\n## [", markerIndex + marker.length);
const unreleased = changelog
  .slice(markerIndex + marker.length, nextHeading === -1 ? changelog.length : nextHeading)
  .trim();
if (!unreleased) {
  fail("CHANGELOG.md has no entries under `## [Unreleased]`.");
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const target = request.replace(/^v/, "");
execFileSync(npm, ["version", target, "--no-git-tag-version"], {
  cwd: root,
  stdio: "inherit",
});

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = String(pkg.version);
const date = new Date().toISOString().slice(0, 10);
const released =
  changelog.slice(0, markerIndex + marker.length) +
  `\n\n## [${version}] - ${date}` +
  changelog.slice(markerIndex + marker.length);
writeFileSync(changelogPath, released);

git(["add", "package.json", "package-lock.json", "CHANGELOG.md"], { stdio: "inherit" });
git(["commit", "-m", `Release v${version}`], { stdio: "inherit" });
git(["tag", "-a", `v${version}`, "-m", `Release v${version}`], { stdio: "inherit" });

console.log(`\nReleased v${version}.`);
console.log("Push the commit and annotated tag with:");
console.log("  git push --follow-tags");
