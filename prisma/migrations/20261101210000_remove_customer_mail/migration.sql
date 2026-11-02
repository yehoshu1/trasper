-- The in-app customer mailbox has been removed. Keep only transactional
-- system email through Resend; no mailbox or message metadata is stored.
DROP TABLE IF EXISTS "EmailLink";
DROP TABLE IF EXISTS "MailboxAccount";
DROP TABLE IF EXISTS "MailMessage";
DROP TABLE IF EXISTS "MailFolder";
