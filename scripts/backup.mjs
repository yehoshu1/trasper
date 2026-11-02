/**
 * Backup job.
 *
 * Takes a consistent copy of the SQLite database with SQLite's own
 * `VACUUM INTO` (safe while the app is running), gzips it, copies the uploads
 * folder, and prunes old copies: 14 daily, 8 weekly, 12 monthly.
 *
 *   npm run backup
 *
 * Environment:
 *   DATABASE_URL  the SQLite file (default file:./data/app.db)
 *   UPLOAD_DIR    logos and the header image (default ./uploads)
 *   BACKUP_DIR    where copies are written (default ./backups)
 *   BACKUP_REMOTE optional folder to copy the result to (rsync target or path)
 *   BACKUP_KEEP_DAILY / _WEEKLY / _MONTHLY  override the retention counts
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

process.umask(0o077);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function envPath(name, fallback) {
  const raw = process.env[name] ?? fallback;
  return path.resolve(root, raw.replace(/^file:/, ""));
}

const database = envPath("DATABASE_URL", "./data/app.db");
const uploads = envPath("UPLOAD_DIR", "./uploads");
const backupDir = envPath("BACKUP_DIR", "./backups");
const remote = process.env.BACKUP_REMOTE ? envPath("BACKUP_REMOTE", "") : null;
const keepDaily = Number(process.env.BACKUP_KEEP_DAILY ?? 14);
const keepWeekly = Number(process.env.BACKUP_KEEP_WEEKLY ?? 8);
const keepMonthly = Number(process.env.BACKUP_KEEP_MONTHLY ?? 12);

if (!existsSync(database)) {
  console.error(`No database at ${database} — nothing to back up.`);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });

const now = new Date();
const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const fileName = `app-${stamp}.sqlite3.gz`;
const target = path.join(backupDir, fileName);

// VACUUM INTO writes a transactionally consistent snapshot, WAL included,
// without stopping the app.
const snapshot = `${target}.tmp`;
const db = new DatabaseSync(database, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${snapshot.replace(/'/g, "''")}'`);
} finally {
  db.close();
}

// Compress with gzip (available everywhere the app runs).
execFileSync("gzip", ["-f", snapshot]);
renameSync(`${snapshot}.gz`, target);

// Backups contain password hashes, customer data and encrypted settings.
try {
  chmodSync(target, 0o600);
} catch {
  // Filesystem may not support POSIX modes.
}
const sizeMb = (statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`Database  -> ${target} (${sizeMb} MB)`);

// Uploads alongside the database.
let uploadsNote = "no uploads folder";
if (existsSync(uploads)) {
  const uploadsTarget = path.join(backupDir, `uploads-${stamp}.tar`);
  execFileSync("tar", ["-cf", uploadsTarget, "-C", path.dirname(uploads), path.basename(uploads)]);
  execFileSync("gzip", ["-f", uploadsTarget]);
  try {
    chmodSync(`${uploadsTarget}.gz`, 0o600);
  } catch {
    // Filesystem may not support POSIX modes.
  }
  uploadsNote = `${uploadsTarget}.gz (${(statSync(`${uploadsTarget}.gz`).size / 1024 / 1024).toFixed(1)} MB)`;
}
console.log(`Uploads   -> ${uploadsNote}`);

// Optional off-site copy (an rsync mount, a mounted drive, a synced folder).
if (remote) {
  mkdirSync(remote, { recursive: true });
  copyFileSync(target, path.join(remote, fileName));
  try {
    chmodSync(path.join(remote, fileName), 0o600);
  } catch {
    // Filesystem may not support POSIX modes.
  }
  if (existsSync(`${backupDir}/uploads-${stamp}.tar.gz`)) {
    copyFileSync(`${backupDir}/uploads-${stamp}.tar.gz`, path.join(remote, `uploads-${stamp}.tar.gz`));
    try {
      chmodSync(path.join(remote, `uploads-${stamp}.tar.gz`), 0o600);
    } catch {
      // Filesystem may not support POSIX modes.
    }
  }
  console.log(`Remote    -> ${remote}`);
}

// ---- retention: 14 daily, 8 weekly, 12 monthly ----------------------------
const files = readdirSync(backupDir)
  .filter((name) => /^app-\d{8}-\d{6}\.sqlite3\.gz$/.test(name))
  .map((name) => ({
    name,
    date: parseStamp(name),
  }))
  .filter((entry) => entry.date)
  .sort((a, b) => b.date - a.date);

const keep = new Set();
const weekKey = (date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};
const monthKey = (date) => date.toISOString().slice(0, 7);

let daily = 0;
for (const entry of files) {
  if (daily >= keepDaily) break;
  keep.add(entry.name);
  daily += 1;
}
let weekly = 0;
const seenWeeks = new Set();
for (const entry of files) {
  if (weekly >= keepWeekly) break;
  const key = weekKey(entry.date);
  if (seenWeeks.has(key)) continue;
  seenWeeks.add(key);
  keep.add(entry.name);
  weekly += 1;
}
let monthly = 0;
const seenMonths = new Set();
for (const entry of files) {
  if (monthly >= keepMonthly) break;
  const key = monthKey(entry.date);
  if (seenMonths.has(key)) continue;
  seenMonths.add(key);
  keep.add(entry.name);
  monthly += 1;
}

let pruned = 0;
for (const entry of files) {
  if (keep.has(entry.name)) continue;
  rmSync(path.join(backupDir, entry.name), { force: true });
  const uploadsCopy = path.join(backupDir, entry.name.replace(/^app-/, "uploads-").replace(/\.sqlite3\.gz$/, ".tar.gz"));
  rmSync(uploadsCopy, { force: true });
  pruned += 1;
}
console.log(`Retention -> kept ${keep.size} (${keepDaily}d/${keepWeekly}w/${keepMonthly}m), pruned ${pruned}`);

function parseStamp(name) {
  const match = /^app-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.sqlite3\.gz$/.exec(name);
  if (!match) return null;
  const [, y, m, d, h, mi, s] = match;
  const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) ? null : date;
}
