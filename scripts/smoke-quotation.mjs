/**
 * Smoke-test data: create one draft quotation with two options, real airport
 * codes and passenger fares, using the same values and numbering the app's
 * server actions would write. Idempotent: skips creation when the quotation
 * already exists. Uses node:sqlite directly, like scripts/seed.mjs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rawUrl = process.env.DATABASE_URL ?? "file:./data/app.db";
const file = path.resolve(root, rawUrl.replace(/^file:/, ""));
const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA foreign_keys = ON;");

const now = new Date();
const iso = (date) => date.toISOString().replace("Z", "+00:00");
const id = () => crypto.randomUUID();

const existing = db
  .prepare("SELECT id, number FROM Quotation WHERE referenceNo = ?")
  .get("SMOKE-1");
if (existing) {
  console.log("Quotation already exists:", existing.number, existing.id);
  process.exit(0);
}

const contact = db.prepare("SELECT id FROM Contact ORDER BY createdAt LIMIT 1").get();
const baseCurrency = db.prepare("SELECT value FROM Setting WHERE key = 'currency.base'").get()?.value ?? "USD";
const user = db.prepare("SELECT id FROM User ORDER BY createdAt LIMIT 1").get();
const passengers = db.prepare("SELECT id, type FROM Passenger ORDER BY lastName, firstName").all();
if (!contact || !user || passengers.length === 0) {
  console.error("Run the seed script first: npm run db:seed");
  process.exit(1);
}

const seqKey = "quotation:01";
db.prepare(
  "INSERT INTO Sequence (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1",
).run(seqKey);
const value = db.prepare("SELECT value FROM Sequence WHERE key = ?").get(seqKey).value;
const number = `QT-01-${String(value).padStart(4, "0")}`;

const quotationId = id();
const issueDate = iso(now);
const validUntil = iso(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

db.prepare(
  `INSERT INTO Quotation (id, number, revision, referenceNo, contactId, status, currency,
     issueDate, validUntil, vatOverride, notes, createdById, createdAt, updatedAt)
   VALUES (?, ?, 1, 'SMOKE-1', ?, 'draft', ?, ?, ?, NULL, '', ?, ?, ?)`,
).run(quotationId, number, contact.id, baseCurrency, issueDate, validUntil, user.id, iso(now), iso(now));

const insertOption = db.prepare(
  `INSERT INTO QuoteOption (id, quotationId, position, label, pnr, costCurrency, rateMicro,
     marginKind, marginValue)
   VALUES (?, ?, ?, ?, ?, ?, 1000000, ?, ?)`,
);
const insertSegment = db.prepare(
  `INSERT INTO Segment (id, optionId, position, airline, flightNo, fromIata, toIata,
     departLocal, arriveLocal, cabin)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Economy')`,
);
const insertFare = db.prepare(
  `INSERT INTO FareLine (id, optionId, passengerId, costMinor) VALUES (?, ?, ?, ?)`,
);
const insertService = db.prepare(
  `INSERT INTO ServiceLine (id, optionId, category, description, costMinor) VALUES (?, ?, ?, ?, ?)`,
);
const insertTax = db.prepare(
  `INSERT INTO TaxLine (id, optionId, name, kind, value, enabled) VALUES (?, ?, ?, ?, ?, 1)`,
);

const optionA = id();
insertOption.run(optionA, quotationId, 0, "Option A", "SMOKEAB", baseCurrency, "percent", "1200");
insertSegment.run(id(), optionA, 0, "ET", "875", "BLZ", "ADD", "2026-11-10T06:20", "2026-11-10T12:35");
insertSegment.run(id(), optionA, 1, "ET", "920", "ADD", "JNB", "2026-11-10T16:05", "2026-11-10T20:30");
for (const passenger of passengers) {
  insertFare.run(id(), optionA, passenger.id, passenger.type === "child" ? 38000 : 62000);
}
insertService.run(id(), optionA, "hotel", "Two nights in Johannesburg", 21000);
insertTax.run(id(), optionA, "Airport tax", "percent", "250");

const optionB = id();
insertOption.run(optionB, quotationId, 1, "Option B", "SMOKECD", baseCurrency, "lump", "250000");
insertSegment.run(id(), optionB, 0, "ET", "875", "BLZ", "ADD", "2026-11-17T06:20", "2026-11-17T12:35");
insertFare.run(id(), optionB, passengers[0].id, 62000);

db.prepare(
  `INSERT INTO AuditLog (id, at, userId, action, entity, entityId, diff)
   VALUES (?, ?, ?, 'createQuotation', 'Quotation', ?, ?)`,
).run(id(), iso(now), user.id, quotationId, JSON.stringify({ before: null, after: { number } }));

console.log("Created quotation", number, quotationId);
db.close();
