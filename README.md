# AI-Business Radar

Lokale Pipeline, die täglich neue YouTube-Videos zum Thema **AI im Business /
AI-Geschäftsmodelle / AI-Tooling für Unternehmen** findet, deren Inhalt auf
**Substanz** prüft und einen kurzen, dichten Tagesbericht als Markdown schreibt.

Ziel: nicht mehr stundenlang YouTube durchforsten, um am Ende festzustellen,
dass 90 % recycelter Hype ohne Substanz sind. Der Bot filtert vor und liefert
nur das Signal — konkrete, neue, umsetzbare Erkenntnisse. **Lieber drei echte
Erkenntnisse als zwanzig Clickbait-Zusammenfassungen.**

> **Status:** In Entwicklung. Fundament (Setup, Discovery, Transkripte) steht und
> ist lauffähig. Analyse, Clustering, Report, Zustellung und Scheduling folgen —
> siehe [Roadmap](#roadmap).

---

## Architektur

Klar getrennte Stufen, einzeln aufrufbar. Jede Stufe schreibt ihren Zustand in
die SQLite-DB, damit ein Abbruch nicht die ganze Kette killt und einzelne
Schritte debuggbar sind.

| Stufe | Befehl | Was passiert |
|-------|--------|--------------|
| Discovery | `radar discover` | Kanal-Monitoring (quota-günstig) + budgetierte Keyword-Suche → Videos in DB, Vorfilter angewandt |
| Transkripte | `radar fetch` | `yt-dlp` lädt Untertitel, VTT → Fliesstext, Rate-Limiting/Backoff |
| Analyse | `radar analyze` | *(folgt)* LLM prüft jedes Transkript auf Substanz, strukturierter JSON-Output |
| Report | `radar report` | *(folgt)* Themen-Clustering + finale Synthese → `reports/YYYY-MM-DD.md` |
| Alles | `radar run` | Volle Kette |
| — | `radar status` | Zustand (Videos nach Status) & Tagesbudget |
| — | `radar retention` | Transkripte älter als N Tage löschen |
| — | `radar migrate` | DB-Schema anlegen/aktualisieren |

Nützliche Flags: `--config PFAD`, `--verbose`, `--dry-run`, `fetch --limit N`.

### Discovery-Strategie & Quota

- **Kanal-Monitoring** ist die Hauptquelle: `playlistItems.list` kostet nur
  **1** Quota-Einheit (statt **100** für eine Suche). Die uploads-Playlist jedes
  Kanals wird einmalig aufgelöst und gecacht.
- **Keyword-Suche** ergänzt, ist aber streng budgetiert (Default max. 8/Tag).
- Ein Quota-Zähler in der DB (`api_usage`) schreibt den Verbrauch mit. Bei
  **80 %** des Tageslimits wird die Suche abgeschaltet, Kanal-Monitoring läuft
  weiter.

---

## Setup

Voraussetzungen: Python 3.11+, [`uv`](https://docs.astral.sh/uv/).

```bash
# 1. Abhängigkeiten + virtuelle Umgebung
uv venv --python 3.11
uv pip install -e ".[dev]"

# 2. Secrets anlegen
cp .env.example .env
#   → YOUTUBE_API_KEY und ANTHROPIC_API_KEY eintragen

# 3. Konfiguration anpassen
#   → config.yaml: Kanäle, Keywords, Schwellwerte, Profil

# 4. DB initialisieren
uv run radar migrate

# 5. Erste Discovery
uv run radar discover
uv run radar status
```

### API-Keys

- **YouTube Data API v3:** Projekt in der
  [Google Cloud Console](https://console.cloud.google.com/) anlegen, API
  aktivieren, API-Key erzeugen. Default-Quota: 10 000 Einheiten/Tag.
- **Anthropic:** Key aus der [Console](https://console.anthropic.com/).

### Konfiguration

Alles Nicht-Geheime steht in `config.yaml`. Zentral ist das **`profil`-Feld**:
es wird in die Analyse- und Report-Prompts injiziert, damit Relevanz an *dir*
ausgerichtet wird statt an „Business“ im Allgemeinen. Ohne es liefert das
Modell generische Ratschläge für Geschäftsmodelle, die du nie umsetzen wirst.

Die mitgelieferte Kanalliste ist eine **Starter-Liste** — bitte an deine
Interessen anpassen (Kanäle per `@handle`, `channel_id` oder URL).

---

## Datenmodell (SQLite)

`channels`, `videos`, `transcripts`, `analyses`, `topics`, `video_topics`,
`reports`, `api_usage`, `run_errors`. Schema als Migrations-SQL unter
[`migrations/`](migrations/). Migrationen werden idempotent angewandt.

---

## Rechtliches & Datenschutz

- Es werden **ausschließlich öffentlich verfügbare Metadaten und Untertitel**
  verarbeitet. **Keine Video-Downloads.**
- Transkripte werden **nicht weiterverbreitet** und dienen nur der lokalen
  Analyse.
- **Retention:** Transkripte werden nach **30 Tagen** (konfigurierbar) via
  `radar retention` automatisch aus der DB gelöscht. Metadaten und die
  abgeleitete Analyse bleiben erhalten.
- `reports/` und die DB sind per `.gitignore` vom Repo ausgeschlossen, da sie
  ausgewertete Inhalte enthalten.

---

## Entwicklung

```bash
uv run pytest          # Tests (VTT-Parser, Filterlogik)
```

Struktur:

```
radar/            # Paket
  cli.py          # CLI-Dispatch
  config.py       # Pydantic-Config + Loader
  db.py           # SQLite: Verbindung, Migrationen
  discovery.py    # Stufe 1
  transcripts.py  # Stufe 3
  vtt.py          # VTT-Parser
  filters.py      # Vorfilter (rein, testbar)
  youtube_api.py  # YouTube-Data-API-Wrapper
  quota.py        # Quota- & Kostentracking
  analyze.py / cluster.py / report.py  # folgen
migrations/       # SQL-Schema
tests/            # pytest
config.yaml       # Konfiguration
.env.example      # Secret-Vorlage
```

---

## Roadmap

- [x] **1. Setup** — Projektstruktur, Config-Schema, DB-Migrationen, `.env.example`, README
- [x] **2. Discovery** — Kanal-Monitoring + Quota-Tracking
- [x] **3. Transkripte** — yt-dlp-Integration, VTT-Parser, Rate-Limiting
- [ ] **4. Analyse** — LLM, strukturierte Outputs, Kostentracking *(Qualitätskern)*
- [ ] **5. Clustering & Report** — Themenerkennung, Report-Synthese
- [ ] **6. Zustellung & Scheduling** — SMTP/Telegram, launchd-Job
- [ ] **7. Härtung** — mehr Tests, Retention-Job im Zeitplan, README final

### Nicht-Ziele

Keine Web-UI, kein Dashboard, kein Multi-User, kein Docker/Cloud-Deployment,
keine Video-Downloads, keine Kommentar-Analyse. Ein einzelnes lokales
CLI-Tool für einen Nutzer.
