-- §4.2: IMAP is the source of truth. Remove the local message cache tables;
-- links and audit entries are the only mail metadata stored by the app.
DROP TABLE IF EXISTS "MailMessage";
DROP TABLE IF EXISTS "MailFolder";
ALTER TABLE "MailboxAccount" DROP COLUMN "lastSyncedAt";
