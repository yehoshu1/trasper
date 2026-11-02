// Copy Fumadocs UI's prebuilt stylesheet into public/.
//
// The application uses Tailwind CSS 3 while Fumadocs UI 16 targets Tailwind 4.
// Next would run the Fumadocs stylesheet through the app's Tailwind 3 PostCSS
// pipeline, which rejects `@layer base` without `@tailwind base`. Serving the
// prebuilt CSS as a static asset keeps the two toolchains separate.
//
//   npm run docs:css
//
// Run this after upgrading fumadocs-ui, then commit public/fumadocs-ui.css.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const source = "node_modules/fumadocs-ui/dist/style.css";
const target = "public/fumadocs-ui.css";

if (!existsSync(source)) {
  console.error(`Missing ${source}. Run npm install first.`);
  process.exit(1);
}

await mkdir("public", { recursive: true });
const css = await readFile(source, "utf8");
const pkg = JSON.parse(await readFile("node_modules/fumadocs-ui/package.json", "utf8"));
const banner = `/* Generated from fumadocs-ui ${pkg.version}; do not edit. Run npm run docs:css. */\n`;
await writeFile(target, banner + css);
console.log(`${target} updated from ${source} (fumadocs-ui ${pkg.version})`);
