-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Itinerary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "quotationId" TEXT,
    "optionId" TEXT,
    "contactId" TEXT,
    "branch" TEXT NOT NULL DEFAULT '01',
    "referenceNo" TEXT,
    "snapshot" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "supersededAt" DATETIME,
    "supersededBy" TEXT,
    CONSTRAINT "Itinerary_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Itinerary_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Itinerary_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Itinerary" ("createdById", "id", "issuedAt", "number", "optionId", "quotationId", "referenceNo", "snapshot", "supersededAt", "supersededBy") SELECT "createdById", "id", "issuedAt", "number", "optionId", "quotationId", "referenceNo", "snapshot", "supersededAt", "supersededBy" FROM "Itinerary";
UPDATE "new_Itinerary"
SET "contactId" = (
  SELECT "contactId" FROM "Quotation" WHERE "Quotation"."id" = "new_Itinerary"."quotationId"
)
WHERE "contactId" IS NULL AND "quotationId" IS NOT NULL;
UPDATE "new_Itinerary"
SET "branch" = (
  SELECT "branch" FROM "Quotation" WHERE "Quotation"."id" = "new_Itinerary"."quotationId"
)
WHERE "quotationId" IS NOT NULL;
DROP TABLE "Itinerary";
ALTER TABLE "new_Itinerary" RENAME TO "Itinerary";
CREATE UNIQUE INDEX "Itinerary_number_key" ON "Itinerary"("number");
CREATE INDEX "Itinerary_quotationId_idx" ON "Itinerary"("quotationId");
CREATE INDEX "Itinerary_contactId_idx" ON "Itinerary"("contactId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
