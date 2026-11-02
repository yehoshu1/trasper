/**
 * Test runner.
 *
 * The approved test tool is Vitest, but this sandbox cannot load native
 * node-addons (esbuild crashes on load), so the suite is compiled with tsc
 * and executed by Node's built-in test runner. The tests themselves are plain
 * table-driven TypeScript and use the same public modules the app uses.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    console.error(`\n${label} failed with exit code ${result.status}`);
    process.exit(result.status ?? 1);
  }
}

rmSync(join(root, ".test-dist"), { recursive: true, force: true });

run(
  process.execPath,
  [join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.test.json"],
  "TypeScript test build",
);

const testFiles = readdirSync(join(root, ".test-dist", "tests"))
  .filter((file) => file.endsWith(".test.js"))
  .map((file) => join(".test-dist", "tests", file));

if (testFiles.length === 0) {
  console.error("No compiled test files found");
  process.exit(1);
}

run(
  process.execPath,
  ["--test", "--test-reporter=spec", ...testFiles],
  "Test run",
);
