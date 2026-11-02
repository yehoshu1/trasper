-- Move the stock quotation-number template to the branch-coded format.
-- Custom formats set by an administrator are left untouched.
UPDATE "Setting"
SET "value" = 'QT-{BRANCH}-{YYYY}-{MM}-{DD}-{SEQ:4}'
WHERE "key" = 'numbering.quotation'
  AND "value" = 'QT-{YYYY}-{SEQ:4}';
