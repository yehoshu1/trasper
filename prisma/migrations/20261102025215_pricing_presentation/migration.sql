-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN "pricingDisplay" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "taxDisplay" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_QuoteOption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT NOT NULL,
    "optionType" TEXT NOT NULL DEFAULT 'flight',
    "pnr" TEXT,
    "ticketingDeadline" DATETIME,
    "costCurrency" TEXT NOT NULL,
    "rateMicro" BIGINT NOT NULL,
    "marginKind" TEXT NOT NULL,
    "marginValue" BIGINT NOT NULL,
    "frozenTotals" TEXT,
    CONSTRAINT "QuoteOption_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_QuoteOption" ("costCurrency", "frozenTotals", "id", "label", "marginKind", "marginValue", "pnr", "position", "quotationId", "rateMicro", "ticketingDeadline") SELECT "costCurrency", "frozenTotals", "id", "label", "marginKind", "marginValue", "pnr", "position", "quotationId", "rateMicro", "ticketingDeadline" FROM "QuoteOption";
DROP TABLE "QuoteOption";
ALTER TABLE "new_QuoteOption" RENAME TO "QuoteOption";
CREATE INDEX "QuoteOption_quotationId_idx" ON "QuoteOption"("quotationId");
CREATE TABLE "new_ServiceLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "costMinor" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "unitCostMinor" BIGINT,
    "details" TEXT,
    CONSTRAINT "ServiceLine_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServiceLine" ("category", "costMinor", "description", "id", "optionId") SELECT "category", "costMinor", "description", "id", "optionId" FROM "ServiceLine";
DROP TABLE "ServiceLine";
ALTER TABLE "new_ServiceLine" RENAME TO "ServiceLine";
CREATE INDEX "ServiceLine_optionId_idx" ON "ServiceLine"("optionId");
CREATE TABLE "new_TaxLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "optionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "base" TEXT NOT NULL DEFAULT 'cost',
    CONSTRAINT "TaxLine_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "QuoteOption" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TaxLine" ("enabled", "id", "kind", "name", "optionId", "value") SELECT "enabled", "id", "kind", "name", "optionId", "value" FROM "TaxLine";
DROP TABLE "TaxLine";
ALTER TABLE "new_TaxLine" RENAME TO "TaxLine";
CREATE INDEX "TaxLine_optionId_idx" ON "TaxLine"("optionId");
CREATE TABLE "new_TaxPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" BIGINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "base" TEXT NOT NULL DEFAULT 'cost'
);
INSERT INTO "new_TaxPreset" ("enabled", "id", "kind", "name", "value") SELECT "enabled", "id", "kind", "name", "value" FROM "TaxPreset";
DROP TABLE "TaxPreset";
ALTER TABLE "new_TaxPreset" RENAME TO "TaxPreset";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
