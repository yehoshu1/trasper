-- Final reconciliation with §4.2: IMAP is the source of truth and the app
-- stores only EmailLink/audit metadata. Remove the unused local mail cache.
DROP TABLE IF EXISTS "MailMessage";
DROP TABLE IF EXISTS "MailFolder";
ALTER TABLE "MailboxAccount" DROP COLUMN "lastSyncedAt";
