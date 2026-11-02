/**
 * Seed reference data, settings and the first admin user.
 *
 * Run with: npm run db:seed (after prisma migrate deploy/dev)
 * Environment: ADMIN_EMAIL, ADMIN_PASSWORD, SEED_DEMO=0 to skip demo contacts.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "better-auth/crypto";

process.umask(0o077);
const root = process.cwd();
const rawUrl = process.env.DATABASE_URL ?? "file:./data/app.db";
const file = path.resolve(root, rawUrl.replace(/^file:/, ""));
const db = new DatabaseSync(file);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA busy_timeout = 5000;");
db.exec("PRAGMA foreign_keys = ON;");

const now = new Date().toISOString().replace("Z", "+00:00");

function insertSetting(key, value) {
  db.prepare("INSERT OR IGNORE INTO Setting (key, value) VALUES (?, ?)").run(key, value);
}

const env = (key, fallback = "") => process.env[key]?.trim() || fallback;
const settings = {
  "company.name": env("SEED_COMPANY_NAME", "Your Travel Agency"),
  "company.address": env("SEED_COMPANY_ADDRESS"),
  "company.email": env("SEED_COMPANY_EMAIL", "hello@example.com"),
  "company.phone": env("SEED_COMPANY_PHONE"),
  "company.website": env("SEED_COMPANY_WEBSITE"),
  "company.tin": env("SEED_COMPANY_TIN"),
  "company.timeZone": env("APP_TIMEZONE", "UTC"),
  "company.headerImage": "",
  "company.footerText": env(
    "SEED_COMPANY_FOOTER",
    "Travel quotations, itineraries and pro forma invoices.",
  ),
  "company.notes":
    "Prices are subject to availability at the time of booking. Please check all names against passports.",
  "currency.base": env("BASE_CURRENCY", "USD").toUpperCase(),
  "pricing.roundingUnit": env("PRICING_ROUNDING_UNIT", "1"),
  "pricing.defaultMarginBps": env("PRICING_DEFAULT_MARGIN_BPS", "1000"),
  "pricing.defaultValidityDays": env("PRICING_DEFAULT_VALIDITY_DAYS", "1"),
  "pricing.rateMaxAgeDays": env("PRICING_RATE_MAX_AGE_DAYS", "7"),
  "vat.enabled": env("VAT_ENABLED", "false").toLowerCase() === "true" ? "true" : "false",
  "vat.rateBps": env("VAT_RATE_BPS", "0"),
  "vat.registrationNumber": env("VAT_REGISTRATION_NUMBER"),
  "vat.label": env("VAT_LABEL", "VAT"),
  "pricing.display": env("PRICING_DISPLAY", "lump_sum"),
  "pricing.taxDisplay": env("PRICING_TAX_DISPLAY", "included"),
  "documents.serviceFeeLabel": env("SERVICE_FEE_LABEL", "Service fee"),
  "documents.taxLabel": env("TAX_LABEL", "Taxes"),
  "documents.totalLabel": env("TOTAL_LABEL", "Total"),
  "documents.perPersonLabel": env("PER_PERSON_LABEL", "Price per person"),
  "documents.taxNote": env("TAX_NOTE", ""),
  "numbering.quotation": "QT-{BRANCH}-{SEQ:4}",
  "numbering.itinerary": "IT-{YYYY}-{SEQ:4}",
  "numbering.proforma": "PF-{YYYY}-{SEQ:4}",
  "documents.paymentTerms":
    "A deposit is required on confirmation; the balance is due before ticketing.",
  "documents.quotationNotes":
    "Prices are per person unless stated otherwise and are subject to availability. Valid until the date shown. Ticketing deadlines are set by the airline.",
  "documents.quotationValidityStatement":
    "This quotation is valid for 24 hours from the date and time of issuance. All fares and seat availability are subject to change without prior notice until the ticket is issued. Final pricing will be confirmed at the time of booking and ticket issuance.",
  "documents.itineraryNotes":
    "Please check your travel documents and arrive at the airport at least two hours before departure.",
  "documents.proformaNotes":
    "Please quote the pro forma number as the payment reference. Ticketing is subject to payment by the due date.",
  "documents.proformaShowFlights": "true",
  "flights.ticketingWarningHours": "48",
};

for (const [key, value] of Object.entries(settings)) insertSetting(key, value);

const insertBranch = db.prepare(
  "INSERT OR IGNORE INTO Branch (code, name, active, createdAt, updatedAt) VALUES (?, ?, 1, ?, ?)",
);
insertBranch.run("01", "Head office", now, now);

const roles = [
  ["admin", "Administrator", ["manageUsers","manageSettings","manageContacts","viewContacts","manageQuotations","manageDocuments","recordPayments","viewDocuments","viewCosts","viewAudit","viewPaymentLedger","viewReports","exportContacts"]],
  ["agent", "Agent", ["manageContacts","viewContacts","manageQuotations","manageDocuments","viewDocuments","viewCosts"]],
  ["accountant", "Accountant", ["viewContacts","manageDocuments","recordPayments","viewDocuments","viewCosts","viewAudit","viewPaymentLedger","viewReports","exportContacts"]],
  ["viewer", "Viewer", ["viewDocuments"]],
];
const insertRole = db.prepare(
  "INSERT OR IGNORE INTO Role (key, name, capabilities, system, active, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, ?, ?)",
);
for (const [key, name, capabilities] of roles) {
  insertRole.run(key, name, JSON.stringify(capabilities), now, now);
}

const currencies = [
  ["MWK", "Malawian Kwacha", "MK"],
  ["USD", "US Dollar", "$"],
  ["EUR", "Euro", "€"],
  ["GBP", "Pound Sterling", "£"],
  ["ZAR", "South African Rand", "R"],
  ["KES", "Kenyan Shilling", "KSh"],
  ["TZS", "Tanzanian Shilling", "TSh"],
  ["AUD", "Australian Dollar", "A$"],
  ["CAD", "Canadian Dollar", "C$"],
  ["CHF", "Swiss Franc", "CHF"],
  ["AED", "UAE Dirham", "AED"],
  ["SAR", "Saudi Riyal", "SAR"],
  ["QAR", "Qatari Riyal", "QAR"],
  ["INR", "Indian Rupee", "₹"],
  ["JPY", "Japanese Yen", "¥"],
  ["CNY", "Chinese Yuan", "CN¥"],
  ["NZD", "New Zealand Dollar", "NZ$"],
  ["SGD", "Singapore Dollar", "S$"],
  ["HKD", "Hong Kong Dollar", "HK$"],
  ["THB", "Thai Baht", "฿"],
  ["TRY", "Turkish Lira", "₺"],
  ["BRL", "Brazilian Real", "R$"],
  ["MXN", "Mexican Peso", "MX$"],
  ["NGN", "Nigerian Naira", "₦"],
  ["GHS", "Ghanaian Cedi", "GH₵"],
  ["UGX", "Ugandan Shilling", "USh"],
  ["ZMW", "Zambian Kwacha", "ZK"],
  ["BWP", "Botswana Pula", "P"],
  ["MUR", "Mauritian Rupee", "₨"],
  ["MAD", "Moroccan Dirham", "MAD"],
  ["EGP", "Egyptian Pound", "E£"],
];
const insertCurrency = db.prepare(
  "INSERT OR IGNORE INTO Currency (code, name, symbol, active) VALUES (?, ?, ?, 1)",
);
for (const row of currencies) insertCurrency.run(...row);

const airlines = JSON.parse(readFileSync(path.join(root, "prisma/seed-data/airlines.json"), "utf8"));
const insertAirline = db.prepare("INSERT OR IGNORE INTO Airline (iata, name) VALUES (?, ?)");
for (const airline of airlines) insertAirline.run(airline.iata, airline.name);

const airports = JSON.parse(readFileSync(path.join(root, "prisma/seed-data/airports.json"), "utf8"));
const insertAirport = db.prepare(
  "INSERT OR IGNORE INTO Airport (iata, name, city, country, tz) VALUES (?, ?, ?, ?, ?)",
);
for (const airport of airports) {
  insertAirport.run(airport.iata, airport.name, airport.city, airport.country, airport.tz);
}

const adminEmail = (process.env.ADMIN_EMAIL ?? "admin@example.com").toLowerCase();
const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
const devLike = process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";
const PUBLIC_DEFAULT_PASSWORD = "ChangeMe12345";

if (!devLike) {
  if (!configuredPassword || configuredPassword.length < 10) {
    console.error(
      "ADMIN_PASSWORD must be set to at least 10 characters before seeding outside development.",
    );
    process.exit(1);
  }
  if (configuredPassword === PUBLIC_DEFAULT_PASSWORD) {
    console.error("ADMIN_PASSWORD is the published development default; choose a unique password.");
    process.exit(1);
  }
}
const adminPassword = configuredPassword || PUBLIC_DEFAULT_PASSWORD;
const existingAdmin = db.prepare("SELECT id FROM User WHERE email = ?").get(adminEmail);
const adminId = existingAdmin?.id ?? randomUUID();
if (!existingAdmin) {
  db.prepare(
    `INSERT INTO User (id, email, name, emailVerified, role, branch, active, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, 'admin', '01', 1, ?, ?)`,
  ).run(adminId, adminEmail, "System Administrator", now, now);
  // Never echo a password into container logs.
  console.log(
    `Created admin ${adminEmail}. The password is the value supplied in ADMIN_PASSWORD; change it after signing in.`,
  );
}

// Databases migrated from the old custom-auth build have no Better Auth
// credential account; add one so the admin can still sign in.
const existingAccount = db
  .prepare("SELECT id FROM Account WHERE userId = ? AND providerId = 'credential'")
  .get(adminId);
if (!existingAccount) {
  const passwordHash = await hashPassword(adminPassword);
  db.prepare(
    `INSERT INTO Account (id, accountId, providerId, userId, password, createdAt, updatedAt)
     VALUES (?, ?, 'credential', ?, ?, ?, ?)`,
  ).run(randomUUID(), adminId, adminId, passwordHash, now, now);
  console.log(`Created sign-in credentials for ${adminEmail} using the supplied ADMIN_PASSWORD.`);
}

if (process.env.SEED_DEMO !== "0") {
  const contactCount = db.prepare("SELECT COUNT(*) AS count FROM Contact").get().count;
  if (Number(contactCount) === 0) {
    const contactId = randomUUID();
    db.prepare(
      `INSERT INTO Contact (id, name, type, attention, poBox, city, country, physicalAddress, email, phone, notes, createdAt, updatedAt)
       VALUES (?, ?, 'organisation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      contactId,
      "Acme Group Ltd",
      "Accounts Department",
      "Box 1234",
      "London",
      "United Kingdom",
      "45 Example Road, London",
      "accounts@acme.example",
      "+44 20 7946 0100",
      "Sample contact created by the seed script.",
      now,
      now,
    );

    const passengers = [
      ["Mr", "Alex", "Morgan", "adult"],
      ["Ms", "Sam", "Morgan", "adult"],
      ["Miss", "Robin", "Morgan", "child"],
    ];
    const insertPassenger = db.prepare(
      `INSERT INTO Passenger (id, title, firstName, lastName, type, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const link = db.prepare('INSERT INTO "_ContactToPassenger" ("A", "B") VALUES (?, ?)');
    for (const [title, firstName, lastName, type] of passengers) {
      const id = randomUUID();
      insertPassenger.run(id, title, firstName, lastName, type, now, now);
      link.run(contactId, id);
    }
  }
}

db.close();
console.log("Seed complete.");
