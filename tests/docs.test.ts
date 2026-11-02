import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Documentation integrity checks.
 *
 * The docs site is part of the application build. These tests keep the
 * Fumadocs content tree, sidebar metadata and internal links honest without
 * needing a running Next.js server.
 */

const root = path.join(process.cwd(), "content", "docs");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function routeFor(file: string): string {
  const relative = path.relative(root, file).replace(/\\/g, "/");
  const withoutExtension = relative.replace(/\.mdx$/, "");
  if (withoutExtension === "index") return "/docs";
  if (withoutExtension.endsWith("/index")) {
    return `/docs/${withoutExtension.slice(0, -"/index".length)}`;
  }
  return `/docs/${withoutExtension}`;
}

function frontmatter(file: string): string {
  const source = readFileSync(file, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  assert.ok(match, `${file} has no frontmatter`);
  return match[1];
}

const mdxFiles = walk(root).filter((file) => file.endsWith(".mdx"));
const routes = new Set(mdxFiles.map(routeFor));

describe("documentation site", () => {
  it("splits the content into user and developer roots", () => {
    const rootMeta = JSON.parse(readFileSync(path.join(root, "meta.json"), "utf8")) as {
      pages: string[];
    };
    assert.ok(rootMeta.pages.includes("user"));
    assert.ok(rootMeta.pages.includes("developer"));

    for (const section of ["user", "developer"]) {
      const meta = JSON.parse(
        readFileSync(path.join(root, section, "meta.json"), "utf8"),
      ) as { root?: boolean; pages: string[] };
      assert.equal(meta.root, true, `${section}/meta.json should be a root tab`);
      assert.ok(meta.pages.includes("index"), `${section} needs an index page`);
    }
  });

  it("has a titled page for every navigation entry", () => {
    for (const metaFile of walk(root).filter((file) => file.endsWith("meta.json"))) {
      const dir = path.dirname(metaFile);
      const meta = JSON.parse(readFileSync(metaFile, "utf8")) as { pages?: string[] };
      for (const entry of meta.pages ?? []) {
        const page = path.join(dir, `${entry}.mdx`);
        const index = path.join(dir, entry, "index.mdx");
        const folder = path.join(dir, entry);
        assert.ok(
          existsSync(page) ||
            existsSync(index) ||
            (existsSync(folder) && statSync(folder).isDirectory()),
          `${path.relative(root, metaFile)} references missing page ${entry}`,
        );
      }
    }
  });

  it("gives every page a title, description and unique route", () => {
    const titles = new Set<string>();
    for (const file of mdxFiles) {
      const fm = frontmatter(file);
      const title = /^title:\s*(.+)$/m.exec(fm)?.[1];
      const description = /^description:\s*(.+)$/m.exec(fm)?.[1];
      assert.ok(title, `${file} has no title`);
      assert.ok(description, `${file} has no description`);
      assert.ok(!titles.has(title), `duplicate documentation title: ${title}`);
      titles.add(title);
    }
    assert.equal(routes.size, mdxFiles.length);
  });

  it("keeps internal links on real pages", () => {
    const ignored = ["/docs/api/", "/docs/screenshots/"];
    for (const file of mdxFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\]\((\/docs\/[^)\s]*)\)/g)) {
        const link = match[1].split("#")[0];
        if (ignored.some((prefix) => link.startsWith(prefix))) continue;
        assert.ok(routes.has(link), `${file} links to missing page ${link}`);
      }
    }
  });

  it("has every referenced screenshot in public", () => {
    for (const file of mdxFiles) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/src="(\/docs\/screenshots\/[^"]+)"/g)) {
        const target = path.join(process.cwd(), "public", match[1]);
        assert.ok(existsSync(target), `${file} references missing screenshot ${match[1]}`);
      }
    }
  });
});
