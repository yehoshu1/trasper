/*
  Warnings:

  - You are about to drop the column `active` on the `BankAccount` table. All the data in the column will be lost.
  - You are about to drop the column `branch` on the `BankAccount` table. All the data in the column will be lost.
  - You are about to drop the column `instructions` on the `BankAccount` table. All the data in the column will be lost.
  - You are about to drop the column `swift` on the `BankAccount` table. All the data in the column will be lost.
  - Added the required column `label` to the `BankAccount` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "TwoFactor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    CONSTRAINT "TwoFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "nextFollowUpAt" DATETIME,
    "quotationId" TEXT,
    "contactId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SavedTableView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "listKey" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SavedTableView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HelpDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feature" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "input" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "accepted" BOOLEAN,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quotationId" TEXT,
    "proformaId" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedPath" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Attachment_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "Proforma" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Attachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Instalment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proformaId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Instalment_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "Proforma" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailboxAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "label" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "secretCipher" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailboxAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mailboxId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "uid" INTEGER NOT NULL,
    "messageId" TEXT,
    "direction" TEXT NOT NULL,
    "quotationId" TEXT,
    "proformaId" TEXT,
    "contactId" TEXT,
    "customerId" TEXT,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLink_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "MailboxAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailLink_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailLink_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "Proforma" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "EmailLink_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "swiftCode" TEXT,
    "sortCode" TEXT,
    "currency" TEXT NOT NULL,
    "paymentInstructions" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BankAccount" ("accountName", "accountNumber", "bankName", "branchName", "currency", "id", "label", "paymentInstructions", "swiftCode", "isArchived", "isDefault", "updatedAt")
SELECT "accountName", "accountNumber", "bankName", "branch", "currency", "id",
       COALESCE(NULLIF("bankName", ''), "currency") || ' ' || "currency",
       "instructions", "swift", CASE WHEN "active" = 1 THEN 0 ELSE 1 END,
       CASE WHEN "id" = (SELECT "id" FROM "BankAccount" ORDER BY "currency" LIMIT 1) THEN 1 ELSE 0 END,
       "updatedAt"
FROM "BankAccount";
DROP TABLE "BankAccount";
ALTER TABLE "new_BankAccount" RENAME TO "BankAccount";
CREATE INDEX "BankAccount_isArchived_sortOrder_idx" ON "BankAccount"("isArchived", "sortOrder");
CREATE TABLE "new_Contact" (
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
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Contact" ("archivedAt", "attention", "city", "country", "createdAt", "email", "id", "name", "notes", "phone", "physicalAddress", "poBox", "type", "updatedAt") SELECT "archivedAt", "attention", "city", "country", "createdAt", "email", "id", "name", "notes", "phone", "physicalAddress", "poBox", "type", "updatedAt" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE INDEX "Contact_name_idx" ON "Contact"("name");
CREATE TABLE "new_Passenger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "archivedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Passenger" ("archivedAt", "createdAt", "firstName", "id", "lastName", "title", "type", "updatedAt") SELECT "archivedAt", "createdAt", "firstName", "id", "lastName", "title", "type", "updatedAt" FROM "Passenger";
DROP TABLE "Passenger";
ALTER TABLE "new_Passenger" RENAME TO "Passenger";
CREATE INDEX "Passenger_lastName_firstName_idx" ON "Passenger"("lastName", "firstName");
CREATE TABLE "new_Proforma" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "bankAccountId" TEXT,
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
    CONSTRAINT "Proforma_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Proforma_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Proforma" ("cancelledAt", "cancelledReason", "createdAt", "createdById", "currency", "dueDate", "id", "issueDate", "number", "optionId", "quotationId", "referenceNo", "showVat", "snapshot", "status", "terms", "totalMinor") SELECT "cancelledAt", "cancelledReason", "createdAt", "createdById", "currency", "dueDate", "id", "issueDate", "number", "optionId", "quotationId", "referenceNo", "showVat", "snapshot", "status", "terms", "totalMinor" FROM "Proforma";
DROP TABLE "Proforma";
ALTER TABLE "new_Proforma" RENAME TO "Proforma";
CREATE UNIQUE INDEX "Proforma_number_key" ON "Proforma"("number");
CREATE INDEX "Proforma_quotationId_idx" ON "Proforma"("quotationId");
CREATE INDEX "Proforma_status_idx" ON "Proforma"("status");
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
    "bankAccountId" TEXT,
    "heading" TEXT,
    "notes" TEXT,
    "cancelledReason" TEXT,
    "cancelledAt" DATETIME,
    "snapshot" TEXT,
    "sentAt" DATETIME,
    "lockedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Quotation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Quotation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Quotation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Quotation" ("acceptedOptionId", "branch", "cancelledAt", "cancelledReason", "contactId", "createdAt", "createdById", "currency", "heading", "id", "issueDate", "lockedAt", "notes", "number", "referenceNo", "revision", "sentAt", "snapshot", "status", "supersedesId", "updatedAt", "validUntil", "vatOverride") SELECT "acceptedOptionId", "branch", "cancelledAt", "cancelledReason", "contactId", "createdAt", "createdById", "currency", "heading", "id", "issueDate", "lockedAt", "notes", "number", "referenceNo", "revision", "sentAt", "snapshot", "status", "supersedesId", "updatedAt", "validUntil", "vatOverride" FROM "Quotation";
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
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("active", "branch", "createdAt", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "role", "updatedAt") SELECT "active", "branch", "createdAt", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TwoFactor_userId_idx" ON "TwoFactor"("userId");

-- CreateIndex
CREATE INDEX "TwoFactor_secret_idx" ON "TwoFactor"("secret");

-- CreateIndex
CREATE INDEX "Activity_quotationId_occurredAt_idx" ON "Activity"("quotationId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_contactId_occurredAt_idx" ON "Activity"("contactId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_nextFollowUpAt_idx" ON "Activity"("nextFollowUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "SavedTableView_userId_listKey_key" ON "SavedTableView"("userId", "listKey");

-- CreateIndex
CREATE UNIQUE INDEX "HelpDocument_slug_key" ON "HelpDocument"("slug");

-- CreateIndex
CREATE INDEX "AiSuggestion_feature_createdAt_idx" ON "AiSuggestion"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestion_entity_entityId_idx" ON "AiSuggestion"("entity", "entityId");

-- CreateIndex
CREATE INDEX "Attachment_quotationId_idx" ON "Attachment"("quotationId");

-- CreateIndex
CREATE INDEX "Attachment_proformaId_idx" ON "Attachment"("proformaId");

-- CreateIndex
CREATE INDEX "Instalment_proformaId_idx" ON "Instalment"("proformaId");

-- CreateIndex
CREATE INDEX "MailboxAccount_userId_idx" ON "MailboxAccount"("userId");

-- CreateIndex
CREATE INDEX "EmailLink_quotationId_idx" ON "EmailLink"("quotationId");

-- CreateIndex
CREATE INDEX "EmailLink_proformaId_idx" ON "EmailLink"("proformaId");

-- CreateIndex
CREATE INDEX "EmailLink_contactId_idx" ON "EmailLink"("contactId");

-- CreateIndex
CREATE INDEX "EmailLink_customerId_idx" ON "EmailLink"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLink_mailboxId_folder_uid_key" ON "EmailLink"("mailboxId", "folder", "uid");

-- SQL full-text search index for the help assistant (plan §5, §1: no embeddings).
-- The application keeps this table in sync with HelpDocument.
CREATE VIRTUAL TABLE "HelpDocumentFts" USING fts5(
    docId UNINDEXED,
    title,
    body,
    tokenize = 'porter unicode61'
);
