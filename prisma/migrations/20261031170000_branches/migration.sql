-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Quotation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "referenceNo" TEXT,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "branch" TEXT NOT NULL DEFAULT '01',
    "currency" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "validUntil" DATETIME NOT NULL,
    "vatOverride" BOOLEAN,
    "acceptedOptionId" TEXT,
    "heading" TEXT,
    "notes" TEXT,
    "snapshot" TEXT,
    "sentAt" DATETIME,
    "lockedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Quotation" ("acceptedOptionId", "contactId", "createdAt", "createdById", "currency", "heading", "id", "issueDate", "lockedAt", "notes", "number", "referenceNo", "revision", "sentAt", "snapshot", "status", "supersedesId", "updatedAt", "validUntil", "vatOverride") SELECT "acceptedOptionId", "contactId", "createdAt", "createdById", "currency", "heading", "id", "issueDate", "lockedAt", "notes", "number", "referenceNo", "revision", "sentAt", "snapshot", "status", "supersedesId", "updatedAt", "validUntil", "vatOverride" FROM "Quotation";
DROP TABLE "Quotation";
ALTER TABLE "new_Quotation" RENAME TO "Quotation";
CREATE UNIQUE INDEX "Quotation_number_key" ON "Quotation"("number");
CREATE INDEX "Quotation_contactId_idx" ON "Quotation"("contactId");
CREATE INDEX "Quotation_status_validUntil_idx" ON "Quotation"("status", "validUntil");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '01',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("active", "createdAt", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "role", "updatedAt") SELECT "active", "createdAt", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
