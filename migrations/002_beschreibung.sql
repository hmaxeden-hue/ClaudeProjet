-- Beschreibung (Snippet) für die günstige Vorsortierung (Triage) speichern.
-- Wird bei Discovery gefüllt und von der Triage-Stufe gelesen.
ALTER TABLE videos ADD COLUMN beschreibung TEXT;
