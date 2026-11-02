/**
 * Create (or reset) a viewer-role test account so role redaction can be
 * verified. Uses node:sqlite directly, like scripts/seed.mjs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "better-auth/crypto";

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawUrl = process.env.DATABASE_URL ?? "file:./data/app.db";
const file = path.resolve(root, rawUrl.replace(/^file:/, ""));

const email = process.env.VIEWER_EMAIL ?? "viewer@example.com";
const configuredPassword = process.env.VIEWER_PASSWORD?.trim();
const devLike = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
if (!devLike && (!configuredPassword || configuredPassword.length < 10)) {
  console.error("VIEWER_PASSWORD must be set (10+ characters) when creating the viewer account outside development.");
  process.exit(1);
}
const password = configuredPassword || "ChangeMe12345";

const db = new DatabaseSync(file);
db.exec("PRAGMA foreign_keys = ON;");
const now = new Date().toISOString().replace("Z", "+00:00");

const passwordHash = await hashPassword(password);
const existing = db.prepare("SELECT id FROM User WHERE email = ?").get(email);

if (existing) {
  const account = db
    .prepare("SELECT id FROM Account WHERE userId = ? AND providerId = 'credential'")
    .get(existing.id);
  if (account) {
    db.prepare("UPDATE Account SET password = ? WHERE id = ?").run(passwordHash, account.id);
  } else {
    db.prepare(
      `INSERT INTO Account (id, accountId, providerId, userId, password, createdAt, updatedAt)
       VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
    ).run(crypto.randomUUID(), existing.id, existing.id, passwordHash, now, now);
  }
  console.log("Reset credentials for", email);
} else {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO User (id, email, name, emailVerified, role, active, createdAt, updatedAt)
     VALUES (?, ?, 'Read Only', 1, 'viewer', 1, ?, ?)`,
  ).run(id, email, now, now);
  db.prepare(
    `INSERT INTO Account (id, accountId, providerId, userId, password, createdAt, updatedAt)
     VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
  ).run(crypto.randomUUID(), id, id, passwordHash, now, now);
  console.log("Created viewer", email, id);
}
db.close();
