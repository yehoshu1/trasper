-- Add Dodoma International Airport for existing databases. The seed file
-- also contains it, but this migration makes the reference row deterministic
-- even when the seed is not run on startup.
INSERT OR IGNORE INTO "Airport" ("iata", "name", "city", "country", "tz")
VALUES ('DOD', 'Dodoma International Airport', 'Dodoma', 'Tanzania', 'Africa/Dar_es_Salaam');
