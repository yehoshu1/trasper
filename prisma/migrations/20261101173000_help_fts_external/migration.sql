-- The help assistant keeps its FTS5 index in data/help-fts.db so Prisma's
-- schema diff never sees the virtual/shadow tables. Remove the in-database
-- copy created by the post_launch_features migration; the next search rebuilds
-- the external index from HelpDocument.
DROP TABLE IF EXISTS "HelpDocumentFts";
