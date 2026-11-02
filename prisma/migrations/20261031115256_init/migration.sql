-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "attention" TEXT,
    "poBox" TEXT,
    "city" TEXT,
    "country" TEXT,
    "physicalAddress" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Passenger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "referenceNo" TEXT,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "validUntil" DATETIME NOT NULL,
    "vatOverride" BOOLEAN,
    "acceptedOptionId" TEXT,
    "notes" TEXT,
    "sentAt" DATETIME,
    "lockedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "pnr" TEXT,
    "ticketingDeadline" DATETIME,
    "costCurrency" TEXT NOT NULL,
    "rateMicro" BIGINT NOT NULL,
    "marginKind" TEXT NOT NULL,
    "marginValue" BIGINT NOT NULL,
    "frozenTotals" TEXT,
    CONSTRAINT "QuoteOption_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "airline" TEXT NOT NULL,
    "flightNo" TEXT NOT NULL,
    "fromIata" TEXT NOT NULL,
    "toIata" TEXT NOT NULL,
    "departLocal" TEXT NOT NULL,
    "arriveLocal" TEXT NOT NULL,
    "cabin" TEXT,
    CONSTRAINT "Segment_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FareLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "costMinor" BIGINT NOT NULL,
    CONSTRAINT "FareLine_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FareLine_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "Passenger" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costMinor" BIGINT NOT NULL,
    CONSTRAINT "ServiceLine_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "TaxLine_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Itinerary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "referenceNo" TEXT,
    "snapshot" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "supersededAt" DATETIME,
    "supersededBy" TEXT,
    CONSTRAINT "Itinerary_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Itinerary_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proforma" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "referenceNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unpaid',
    "currency" TEXT NOT NULL,
    "totalMinor" BIGINT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "terms" TEXT,
    "showVat" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" TEXT NOT NULL,
    "cancelledReason" TEXT,
    "cancelledAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Proforma_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Proforma_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProformaLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proformaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    CONSTRAINT "ProformaLine_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "Proforma" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proformaId" TEXT NOT NULL,
    "paidOn" DATETIME NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "reversesId" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "Proforma" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Airline" (
    "iata" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "logoPath" TEXT
);

-- CreateTable
CREATE TABLE "Airport" (
    "iata" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "tz" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromCcy" TEXT NOT NULL,
    "toCcy" TEXT NOT NULL,
    "rateMicro" BIGINT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "currency" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "branch" TEXT,
    "swift" TEXT,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TaxPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Sequence" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" TEXT NOT NULL,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_ContactToPassenger" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ContactToPassenger_A_fkey" FOREIGN KEY ("A") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ContactToPassenger_B_fkey" FOREIGN KEY ("B") REFERENCES "Passenger" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Contact_name_idx" ON "Contact"("name");

-- CreateIndex
CREATE INDEX "Passenger_lastName_firstName_idx" ON "Passenger"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");

-- CreateIndex
CREATE INDEX "Quotation_contactId_idx" ON "Quotation"("contactId");

-- CreateIndex
CREATE INDEX "Quotation_status_validUntil_idx" ON "Quotation"("status", "validUntil");

-- CreateIndex
CREATE INDEX "QuoteOption_quotationId_idx" ON "QuoteOption"("quotationId");

-- CreateIndex
CREATE INDEX "Segment_optionId_idx" ON "Segment"("optionId");

-- CreateIndex
CREATE INDEX "FareLine_optionId_idx" ON "FareLine"("optionId");

-- CreateIndex
CREATE INDEX "FareLine_passengerId_idx" ON "FareLine"("passengerId");

-- CreateIndex
CREATE INDEX "ServiceLine_optionId_idx" ON "ServiceLine"("optionId");

-- CreateIndex
CREATE INDEX "TaxLine_optionId_idx" ON "TaxLine"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "Itinerary_number_key" ON "Itinerary"("number");

-- CreateIndex
CREATE INDEX "Itinerary_quotationId_idx" ON "Itinerary"("quotationId");

-- CreateIndex
CREATE UNIQUE INDEX "Proforma_number_key" ON "Proforma"("number");

-- CreateIndex
CREATE INDEX "Proforma_quotationId_idx" ON "Proforma"("quotationId");

-- CreateIndex
CREATE INDEX "Proforma_status_idx" ON "Proforma"("status");

-- CreateIndex
CREATE INDEX "ProformaLine_proformaId_idx" ON "ProformaLine"("proformaId");

-- CreateIndex
CREATE INDEX "Payment_proformaId_idx" ON "Payment"("proformaId");

-- CreateIndex
CREATE INDEX "Payment_paidOn_idx" ON "Payment"("paidOn");

-- CreateIndex
CREATE INDEX "ExchangeRate_fromCcy_toCcy_effectiveFrom_idx" ON "ExchangeRate"("fromCcy", "toCcy", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_currency_key" ON "BankAccount"("currency");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE UNIQUE INDEX "_ContactToPassenger_AB_unique" ON "_ContactToPassenger"("A", "B");

-- CreateIndex
CREATE INDEX "_ContactToPassenger_B_index" ON "_ContactToPassenger"("B");
