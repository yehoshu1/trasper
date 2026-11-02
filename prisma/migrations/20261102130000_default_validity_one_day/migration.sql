-- Quotation validity now defaults to one day. Move installations that still
-- carry the previous seeded default (7) to the new default; an agency that
-- chose any other value is left untouched.
UPDATE "Setting"
SET "value" = '1'
WHERE "key" = 'pricing.defaultValidityDays'
  AND "value" = '7';
