-- ===========================================================================
-- AI-Business Radar — Initiales Schema
-- Wird idempotent angewandt (CREATE TABLE IF NOT EXISTS).
-- Alle Zeitstempel als ISO-8601-Text (UTC), sofern nicht anders vermerkt.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    angewandt_am TEXT NOT NULL
);

-- --- Kanäle (kuratierte Hauptquelle) -------------------------------------
CREATE TABLE IF NOT EXISTS channels (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id            TEXT UNIQUE,          -- UC... (nach Auflösung); NULL bis aufgelöst
    handle                TEXT,                 -- @name aus der Config (Auflösungs-Schlüssel)
    name                  TEXT NOT NULL,
    uploads_playlist_id   TEXT,                 -- UU... ; einmalig aufgelöst & gecacht
    aktiv                 INTEGER NOT NULL DEFAULT 1,
    vertrauens_score      REAL NOT NULL DEFAULT 5,
    letzter_check_am      TEXT
);

-- --- Videos ---------------------------------------------------------------
-- status: entdeckt | vorgefiltert | no_transcript | transkribiert
--         | analysiert | verworfen | fehler
CREATE TABLE IF NOT EXISTS videos (
    video_id          TEXT PRIMARY KEY,
    channel_id        TEXT,
    kanal_name        TEXT,
    titel             TEXT,
    url               TEXT,
    veroeffentlicht_am TEXT,
    dauer_s           INTEGER,
    views             INTEGER,
    sprache           TEXT,
    status            TEXT NOT NULL DEFAULT 'entdeckt',
    filter_grund      TEXT,                     -- gesetzt, wenn vorgefiltert aussortiert
    quelle            TEXT,                     -- 'kanal' | 'suche'
    fehler            TEXT,                     -- letzte Fehlermeldung, falls status='fehler'
    entdeckt_am       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
CREATE INDEX IF NOT EXISTS idx_videos_entdeckt ON videos(entdeckt_am);

-- --- Transkripte ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS transcripts (
    video_id     TEXT PRIMARY KEY REFERENCES videos(video_id) ON DELETE CASCADE,
    sprache      TEXT,
    text         TEXT NOT NULL,
    quelle       TEXT,                          -- z.B. 'yt-dlp:auto-sub'
    zeichen      INTEGER,
    abgerufen_am TEXT NOT NULL
);

-- --- Analysen -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analyses (
    video_id        TEXT PRIMARY KEY REFERENCES videos(video_id) ON DELETE CASCADE,
    json_payload    TEXT NOT NULL,              -- vollständiger strukturierter Output
    substanz_score  REAL,
    neuheits_score  REAL,
    umsetzbarkeit_score REAL,
    gesamtscore     REAL,
    verwerfen       INTEGER,                    -- 0/1
    verwerfen_grund TEXT,
    modell          TEXT,
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    kosten_usd      REAL,
    erstellt_am     TEXT NOT NULL
);

-- --- Themen / Cluster -----------------------------------------------------
CREATE TABLE IF NOT EXISTS topics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    label           TEXT NOT NULL,
    keywords        TEXT,                       -- JSON-Array normalisierter Stichworte
    erstmals_gesehen TEXT NOT NULL,
    zuletzt_gesehen  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS video_topics (
    video_id  TEXT NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    topic_id  INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    PRIMARY KEY (video_id, topic_id)
);

-- --- Reports --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
    datum            TEXT PRIMARY KEY,          -- YYYY-MM-DD
    pfad             TEXT NOT NULL,
    anzahl_gescannt  INTEGER NOT NULL DEFAULT 0,
    anzahl_relevant  INTEGER NOT NULL DEFAULT 0,
    erstellt_am      TEXT NOT NULL
);

-- --- API-Nutzung (Quota + LLM-Kosten) -------------------------------------
-- dienst: 'youtube' (einheiten = Quota) | 'anthropic' (kosten_usd)
CREATE TABLE IF NOT EXISTS api_usage (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    datum       TEXT NOT NULL,                  -- YYYY-MM-DD (UTC)
    dienst      TEXT NOT NULL,
    operation   TEXT,                           -- z.B. 'search.list', 'playlistItems.list', 'messages'
    einheiten   INTEGER NOT NULL DEFAULT 0,
    kosten_usd  REAL NOT NULL DEFAULT 0,
    erstellt_am TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_usage_datum ON api_usage(datum, dienst);

-- --- Fehler-/Ereignis-Log (persistiert, damit ein Lauf nie ganz abbricht) -
CREATE TABLE IF NOT EXISTS run_errors (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    datum       TEXT NOT NULL,
    stage       TEXT,
    video_id    TEXT,
    nachricht   TEXT,
    erstellt_am TEXT NOT NULL
);
