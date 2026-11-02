-- AlterTable
ALTER TABLE "MailboxAccount" ADD COLUMN "lastSyncedAt" DATETIME;

-- CreateTable
CREATE TABLE "MailFolder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mailboxId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialUse" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailFolder_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "MailboxAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mailboxId" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "uid" INTEGER,
    "direction" TEXT NOT NULL,
    "messageId" TEXT,
    "inReplyTo" TEXT,
    "referencesJson" TEXT,
    "subject" TEXT NOT NULL,
    "fromName" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT NOT NULL,
    "ccAddresses" TEXT,
    "bccAddresses" TEXT,
    "textBody" TEXT NOT NULL,
    "htmlBody" TEXT,
    "snippet" TEXT NOT NULL,
    "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
    "attachmentsJson" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "receivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "MailboxAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MailFolder_mailboxId_sortOrder_idx" ON "MailFolder"("mailboxId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MailFolder_mailboxId_path_key" ON "MailFolder"("mailboxId", "path");

-- CreateIndex
CREATE INDEX "MailMessage_mailboxId_folder_receivedAt_idx" ON "MailMessage"("mailboxId", "folder", "receivedAt");

-- CreateIndex
CREATE INDEX "MailMessage_mailboxId_isRead_idx" ON "MailMessage"("mailboxId", "isRead");

-- CreateIndex
CREATE INDEX "MailMessage_mailboxId_messageId_idx" ON "MailMessage"("mailboxId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MailMessage_mailboxId_folder_uid_key" ON "MailMessage"("mailboxId", "folder", "uid");
