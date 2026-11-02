import { defineConfig, defineDocs } from "fumadocs-mdx/config";

/**
 * Collections for the staff documentation site.
 *
 * The Config API generates typed entries in `.source` (aliased as
 * `collections/*`). This avoids the Macro API, whose TypeScript analyser needs
 * the optional `yuku-core` native binding; this repository installs with
 * `omit=optional`.
 */
export const docs = defineDocs({
  dir: "content/docs",
});

export default defineConfig();
