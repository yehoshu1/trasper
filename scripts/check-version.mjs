#!/usr/bin/env node
/**
 * Validate the application version and, when a release tag is supplied, check
 * that the tag matches package.json. Prints the version on success so CI can
 * capture it:
 *
 *   node scripts/check-version.mjs
 *   node scripts/check-version.mjs v1.2.3
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = String(pkg.version ?? "");
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!SEMVER.test(version)) {
  console.error(`package.json version "${version}" is not a valid semantic version.`);
  process.exit(1);
}

const tag = process.argv[2]?.trim();
if (tag) {
  const tagged = tag.replace(/^v/, "");
  if (tagged !== version) {
    console.error(
      `Release tag "${tag}" does not match package.json version "${version}".`,
    );
    process.exit(1);
  }
}

console.log(version);
