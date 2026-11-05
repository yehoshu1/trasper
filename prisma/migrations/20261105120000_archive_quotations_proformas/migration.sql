-- Archive flags for quotations and pro formas. Archiving hides a closed
-- document from the active work queue; it never cancels, deletes or unfreezes
-- anything, and the record stays available to reports, audit and direct links.
ALTER TABLE "Quotation" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Proforma" ADD COLUMN "archivedAt" DATETIME;

CREATE INDEX "Quotation_archivedAt_idx" ON "Quotation"("archivedAt");
CREATE INDEX "Proforma_archivedAt_idx" ON "Proforma"("archivedAt");
