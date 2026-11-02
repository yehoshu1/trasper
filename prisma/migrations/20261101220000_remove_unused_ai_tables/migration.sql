-- AI scope is PNR conversion only (explicit user decision); remove the
-- unused help/suggestion tables from the earlier broader AI design.
DROP TABLE IF EXISTS "AiSuggestion";
DROP TABLE IF EXISTS "HelpDocument";
