// This deployment target cannot load native node-addons, so Next.js is run
// with its WebAssembly SWC build. Remove the native packages if a normal
// `npm install` fetched them, otherwise loading one crashes the process.
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";

const native = [
  "@next/swc-linux-x64-gnu",
  "@next/swc-linux-x64-musl",
  "@next/swc-darwin-arm64",
  "@next/swc-darwin-x64",
  "@next/swc-win32-x64-msvc",
  "@next/swc-win32-arm64-msvc",
];

for (const pkg of native) {
  const dir = `node_modules/${pkg}`;
  if (existsSync(dir)) {
    await rm(dir, { recursive: true, force: true });
    console.log(`removed native package ${pkg} (using WebAssembly SWC)`);
  }
}
