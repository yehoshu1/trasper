-- Fare groups store a unit cost; existing group totals are divided by their
-- quantity so their computed total stays the same. Named fares keep their
-- existing line total because their quantity is 1.
UPDATE "FareLine"
SET "costMinor" = "costMinor" / "quantity"
WHERE "passengerId" IS NULL AND "quantity" > 1;

ALTER TABLE "FareLine" ADD COLUMN "travellerNames" TEXT;

-- Pro forma drafts: editable until sent, then locked and paid/unpaid derived
-- from the payment ledger as before.
ALTER TABLE "Proforma" ADD COLUMN "sentAt" DATETIME;
ALTER TABLE "Proforma" ADD COLUMN "lockedAt" DATETIME;
