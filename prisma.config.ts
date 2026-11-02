import path from "node:path";
import { defineConfig } from "prisma/config";

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "file:./data/app.db";
  if (!raw.startsWith("file:")) return raw;
  const file = raw.slice("file:".length);
  return `file:${path.resolve(process.cwd(), file)}`;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "node scripts/seed.mjs" },
  datasource: { url: databaseUrl() },
});
