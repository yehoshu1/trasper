/**
 * Smoke data for the issued-document half of the flow: advances
 * the smoke quotation to *accepted*, then writes an itinerary, a pro forma
 * with two payments (one reversed), exactly as the server actions would.
 *
 * The printed snapshots are hand-written fixtures in the shape defined by
 * src/lib/documents.ts, so the pages and templates are exercised with real
 * document JSON. Idempotent: skips anything that already exists.
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

const id = () => crypto.randomUUID();
const iso = (date) => date.toISOString().replace("Z", "+00:00");
const now = new Date();

const quotation = db
  .prepare("SELECT id, number, contactId, branch, referenceNo, currency FROM Quotation WHERE referenceNo = 'SMOKE-1'")
  .get();
if (!quotation) {
  console.error("Run scripts/smoke-quotation.mjs first.");
  process.exit(1);
}
const user = db.prepare("SELECT id FROM User WHERE role = 'admin' ORDER BY createdAt LIMIT 1").get();
const optionA = db
  .prepare("SELECT id, label, pnr FROM QuoteOption WHERE quotationId = ? ORDER BY position LIMIT 1")
  .get(quotation.id);

const settingRows = db.prepare("SELECT key, value FROM Setting WHERE key LIKE 'company.%'").all();
const setting = Object.fromEntries(settingRows.map((row) => [row.key, row.value]));
const company = {
  name: setting["company.name"] ?? "Your Travel Agency",
  address: setting["company.address"] ?? "",
  email: setting["company.email"] ?? "",
  phone: setting["company.phone"] ?? "",
  website: setting["company.website"] ?? "",
  tin: setting["company.tin"] ?? "",
  headerImage: setting["company.headerImage"] ?? "",
  footerText: setting["company.footerText"] ?? "",
  vatRegistrationNumber: setting["vat.registrationNumber"] ?? "",
};
const contact = db
  .prepare("SELECT name, attention, poBox, city, country, physicalAddress, email, phone FROM Contact WHERE id = ?")
  .get(quotation.contactId);
const docContact = {
  name: contact.name,
  attention: contact.attention ?? undefined,
  poBox: contact.poBox ?? undefined,
  city: contact.city ?? undefined,
  country: contact.country ?? undefined,
  physicalAddress: contact.physicalAddress ?? undefined,
  email: contact.email ?? undefined,
  phone: contact.phone ?? undefined,
};
const passengers = db
  .prepare(
    `SELECT p.title, p.firstName, p.lastName, p.type
       FROM FareLine f JOIN Passenger p ON p.id = f.passengerId
      WHERE f.optionId = ?`,
  )
  .all(optionA.id)
  .map((row) => ({
    title: row.title ?? undefined,
    firstName: row.firstName,
    lastName: row.lastName,
    type: row.type,
  }));

const flights = [
  {
    airline: "ET",
    airlineName: "Ethiopian Airlines",
    flightNo: "875",
    fromIata: "BLZ",
    toIata: "ADD",
    fromName: "Chileka International Airport",
    fromCity: "Blantyre",
    toName: "Addis Ababa Bole International Airport",
    toCity: "Addis Ababa",
    departLocal: "2026-11-10T06:20",
    arriveLocal: "2026-11-10T12:35",
    durationMinutes: 255,
    layoverAfterMinutes: 210,
    cabin: "Economy",
  },
  {
    airline: "ET",
    airlineName: "Ethiopian Airlines",
    flightNo: "920",
    fromIata: "ADD",
    toIata: "JNB",
    fromName: "Addis Ababa Bole International Airport",
    fromCity: "Addis Ababa",
    toName: "O. R. Tambo International Airport",
    toCity: "Johannesburg",
    departLocal: "2026-11-10T16:05",
    arriveLocal: "2026-11-10T20:30",
    durationMinutes: 265,
    cabin: "Economy",
  },
];

// ---- accept the quotation --------------------------------------------------
if (!db.prepare("SELECT status FROM Quotation WHERE id = ?").get(quotation.id).status.includes("accepted")) {
  db.prepare("UPDATE Quotation SET status = 'accepted', acceptedOptionId = ? WHERE id = ?").run(
    optionA.id,
    quotation.id,
  );
  db.prepare(
    `INSERT INTO AuditLog (id, at, userId, action, entity, entityId, diff) VALUES (?, ?, ?, 'acceptOption', 'Quotation', ?, ?)`,
  ).run(id(), iso(now), user.id, quotation.id, JSON.stringify({ after: { acceptedOptionId: optionA.id } }));
  console.log("Accepted", optionA.label);
}

// ---- freeze the option totals (as sendQuotation would) ---------------------
const frozenLines = [
  { id: "fare-john", description: "Adult — Alex Morgan", kind: "fare", priceMinor: "1332600", costMinor: "62000" },
  { id: "fare-mary", description: "Adult — Sam Morgan", kind: "fare", priceMinor: "1332600", costMinor: "62000" },
  { id: "fare-grace", description: "Child — Robin Morgan", kind: "fare", priceMinor: "814200", costMinor: "38000" },
  { id: "svc-hotel", description: "Two nights in Johannesburg", kind: "service", priceMinor: "450525", costMinor: "21000" },
];
const lineSum = frozenLines.reduce((sum, line) => sum + Number(line.priceMinor), 0);
const frozen = {
  version: 1,
  frozenAt: iso(now),
  currency: quotation.currency,
  label: optionA.label,
  pnr: optionA.pnr,
  costCurrency: "USD",
  rateMicro: "1750000000",
  marginKind: "percent",
  marginValue: "1200",
  vatEnabled: true,
  vatRateBps: "1650",
  roundingUnit: "100",
  totals: {
    costMinor: "183000",
    markupMinor: "219600",
    vatMinor: "36234",
    taxesMinor: "4575",
    totalMinor: String(lineSum),
    profitMinor: "219600",
  },
  lines: frozenLines,
  passengers: passengers.map((passenger, index) => ({ id: `p${index}`, ...passenger })),
  services: [{ category: "hotel", description: "Two nights in Johannesburg", costMinor: "21000" }],
  taxes: [{ name: "Airport tax", kind: "percent", value: "250", enabled: true, amountMinor: "4575" }],
  segments: flights.map((flight) => ({
    airline: flight.airline,
    flightNo: flight.flightNo,
    fromIata: flight.fromIata,
    toIata: flight.toIata,
    departLocal: flight.departLocal,
    arriveLocal: flight.arriveLocal,
    cabin: flight.cabin,
  })),
};
db.prepare("UPDATE QuoteOption SET frozenTotals = ? WHERE id = ?").run(
  JSON.stringify(frozen),
  optionA.id,
);
if (db.prepare("SELECT status FROM Quotation WHERE id = ?").get(quotation.id).status !== "sent") {
  db.prepare(
    "UPDATE Quotation SET status = 'sent', sentAt = ?, lockedAt = ? WHERE id = ? AND status = 'draft'",
  ).run(iso(now), iso(now), quotation.id);
}
// Re-mark accepted after the sent update (status was already accepted above).
db.prepare("UPDATE Quotation SET status = 'accepted', acceptedOptionId = ? WHERE id = ?").run(
  optionA.id,
  quotation.id,
);
console.log("Froze option totals:", frozen.totals.totalMinor, `${quotation.currency} minor`);

// ---- itinerary -------------------------------------------------------------
let itinerary = db.prepare("SELECT id, number FROM Itinerary WHERE quotationId = ?").get(quotation.id);
if (!itinerary) {
  const itineraryId = id();
  const number = "IT-2026-0001";
  const itinerarySnapshot = {
    kind: "itinerary",
    number,
    referenceNo: quotation.referenceNo,
    issueDate: "2026-10-31",
    quotationNumber: quotation.number,
    company,
    contact: docContact,
    passengers,
    optionLabel: optionA.label,
    pnr: optionA.pnr,
    flights,
    notes:
      "Please check your travel documents and arrive at the airport at least two hours before departure.",
  };
  db.prepare(
    `INSERT INTO Itinerary (id, number, quotationId, optionId, contactId, branch, referenceNo, snapshot, issuedAt, createdById)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    itineraryId,
    number,
    quotation.id,
    optionA.id,
    quotation.contactId,
    quotation.branch,
    quotation.referenceNo,
    JSON.stringify(itinerarySnapshot),
    iso(now),
    user.id,
  );
  itinerary = { id: itineraryId, number };
  console.log("Issued itinerary", number);
}

// ---- pro forma with payments ----------------------------------------------
let proforma = db.prepare("SELECT id, number FROM Proforma WHERE quotationId = ?").get(quotation.id);
if (!proforma) {
  const proformaId = id();
  const number = "PF-2026-0001";
  const total = Number(frozen.totals.totalMinor);
  const proformaSnapshot = {
    kind: "proforma",
    number,
    referenceNo: quotation.referenceNo,
    issueDate: "2026-10-31",
    dueDate: "2026-11-07",
    terms: "50% deposit on confirmation, balance before ticketing.",
    currency: quotation.currency,
    company,
    contact: docContact,
    passengers,
    optionLabel: optionA.label,
    flights: [],
    showFlights: false,
    showVat: true,
    vatMinor: frozen.totals.vatMinor,
    vatRateBps: "1650",
    vatRegistrationNumber: "",
    lines: frozenLines.map((line) => ({ description: line.description, amountMinor: line.priceMinor })),
    totalMinor: String(total),
    bank: {
      currency: quotation.currency,
      bankName: "Example Bank",
      accountName: company.name,
      accountNumber: "1001234567",
      branch: "City Centre",
      swift: "EXAMPLEMW1",
      instructions: "",
    },
    quotationNumber: quotation.number,
  };
  db.prepare(
    `INSERT INTO Proforma (id, number, quotationId, optionId, referenceNo, status, currency, totalMinor,
       issueDate, dueDate, terms, showVat, snapshot, createdById, createdAt)
     VALUES (?, ?, ?, ?, ?, 'unpaid', ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(
    proformaId,
    number,
    quotation.id,
    optionA.id,
    quotation.referenceNo,
    quotation.currency,
    total,
    iso(new Date(Date.UTC(2026, 9, 31))),
    iso(new Date(Date.UTC(2026, 10, 7))),
    proformaSnapshot.terms,
    JSON.stringify(proformaSnapshot),
    user.id,
    iso(now),
  );
  for (const [index, line] of frozenLines.entries()) {
    db.prepare(
      "INSERT INTO ProformaLine (id, proformaId, position, description, amountMinor) VALUES (?, ?, ?, ?, ?)",
    ).run(id(), proformaId, index, line.description, Number(line.priceMinor));
  }

  // Two receipts plus a reversal of the second, as an accountant would correct.
  const first = id();
  db.prepare(
    "INSERT INTO Payment (id, proformaId, paidOn, amountMinor, method, reference, recordedById, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(first, proformaId, iso(new Date(Date.UTC(2026, 10, 2))), Math.floor(total / 2), "bank_transfer", "BANK-88901", user.id, iso(now));
  const mistake = id();
  db.prepare(
    "INSERT INTO Payment (id, proformaId, paidOn, amountMinor, method, reference, recordedById, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(mistake, proformaId, iso(new Date(Date.UTC(2026, 10, 3))), 100000, "cash", "Wrong amount", user.id, iso(now));
  db.prepare(
    "INSERT INTO Payment (id, proformaId, paidOn, amountMinor, method, reference, reversesId, recordedById, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id(), proformaId, iso(new Date(Date.UTC(2026, 10, 3))), -100000, "cash", "Reversal: entered twice", mistake, user.id, iso(now));
  db.prepare("UPDATE Proforma SET status = 'part_paid' WHERE id = ?").run(proformaId);
  proforma = { id: proformaId, number };
  console.log("Issued pro forma", number, "with a part payment and a reversal");
}

console.log("Done:", JSON.stringify({ quotation: quotation.number, itinerary: itinerary.number, proforma: proforma.number }));
db.close();
