-- A payment may be reversed at most once. SQLite unique indexes permit
-- multiple NULL values, so ordinary payment rows are unaffected.
CREATE UNIQUE INDEX "Payment_reversesId_key" ON "Payment"("reversesId");
