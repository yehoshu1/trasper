import { chmodSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import { PrismaClient } from "@/generated/prisma/client";
import { PrismaSqlite } from "prisma-adapter-sqlite";

/**
 * The database URL is a SQLite file path. It is resolved against the project
 * root so the CLI, the app and the backup script all use the same file.
 */
export function databaseFile(): string {
  const raw = process.env.DATABASE_URL ?? "file:./data/app.db";
  const withoutScheme = raw.startsWith("file:") ? raw.slice("file:".length) : raw;
  return path.resolve(process.cwd(), withoutScheme);
}

function prepareDatabase(): string {
  const file = databaseFile();
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  // The database holds password hashes and customer data. Keep it readable by
  // the service account only (best effort on filesystems that ignore modes).
  try {
    chmodSync(file, 0o600);
  } catch {
    // The file may not exist yet; SQLite creates it below.
  }
  // WAL lets reads continue while a write is happening; the busy timeout
  // makes a second writer wait instead of failing immediately.
  //
  // Several workers can open the file at once (Next's build fans out page
  // data collection), and switching a database to WAL takes a brief lock.
  // The first opener sets WAL; the others simply carry on, because the mode
  // is persistent in the file itself.
  for (let attempt = 0; ; attempt += 1) {
    try {
      const db = new DatabaseSync(file);
      try {
        db.exec("PRAGMA journal_mode = WAL;");
        db.exec("PRAGMA busy_timeout = 5000;");
        db.exec("PRAGMA synchronous = NORMAL;");
        db.exec("PRAGMA foreign_keys = ON;");
      } finally {
        db.close();
      }
      try {
        chmodSync(file, 0o600);
      } catch {
        // Read-only or mode-less filesystem; the operator controls the volume.
      }
      return file;
    } catch (error) {
      const locked = /locked|busy/i.test(error instanceof Error ? error.message : "");
      if (!locked || attempt >= 20) throw error;
      // Brief backoff, then retry: another worker is mid-switch or mid-write.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25 * (attempt + 1));
    }
  }
}

function createClient(): PrismaClient {
  const file = prepareDatabase();
  const adapter = new PrismaSqlite({
    url: file,
    timeout: 5_000,
    enableForeignKeyConstraints: true,
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.LOG_LEVEL === "debug"
        ? [{ emit: "stdout", level: "query" }, { emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }]
        : [{ emit: "stdout", level: "warn" }, { emit: "stdout", level: "error" }],
  });
}

const globalForPrisma = globalThis as unknown as { appPrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.appPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.appPrisma = prisma;
}

/** JSON.stringify with BigInt support for audit diffs and snapshots. */
export function jsonSafe(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

export function parseJsonSafe<T>(value: string): T {
  return JSON.parse(value) as T;
}
