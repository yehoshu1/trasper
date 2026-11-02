-- Quotation numbers no longer include the date: QT-{BRANCH}-{SEQ:4}.
-- Only the stock templates are changed; custom formats are left untouched.
UPDATE "Setting"
SET "value" = 'QT-{BRANCH}-{SEQ:4}'
WHERE "key" = 'numbering.quotation'
  AND "value" IN (
    'QT-{BRANCH}-{YYYY}-{MM}-{DD}-{SEQ:4}',
    'QT-{YYYY}-{SEQ:4}'
  );
