-- Quotation validity is one day (24 hours) by default. Move every existing
-- installation to that default, including installations that had saved a
-- different value before this default was finalised.
UPDATE "Setting"
SET "value" = '1'
WHERE "key" = 'pricing.defaultValidityDays';
