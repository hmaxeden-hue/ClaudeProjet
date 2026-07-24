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
| Analyse | `radar analyze` | LLM prüft jedes Transkript auf Substanz, strukturierter JSON-Output, Kosten-/Mengen-Guardrails |
| Report | `radar report` | Themen-Clustering + Wiederholungsabgleich + finale Synthese → `reports/YYYY-MM-DD.md`, optionaler Versand |
| Alles | `radar run` | Volle Kette |
| — | `radar status` | Zustand (Videos nach Status) & Tagesbudget |
| — | `radar review` | Gespeicherte Analysen lesbar ausgeben (`--nur-behalten`) |
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

### Täglicher Ablauf & Automatisierung

Manuell die volle Kette:

```bash
uv run radar run          # discover → fetch → analyze → report
uv run radar run --dry-run  # alles außer Versand
```

Automatisch werktags um 07:00 Uhr (macOS launchd):

```bash
./scripts/install-schedule.sh              # installieren/aktualisieren
launchctl kickstart -k gui/$(id -u)/com.aibusinessradar.daily  # sofort testen
./scripts/install-schedule.sh --uninstall  # entfernen
```

Verpasste Läufe (Rechner im Ruhezustand zur geplanten Zeit) holt launchd beim
Aufwachen automatisch nach.

### Zustellung (optional)

Der Bericht landet immer in `reports/`. Zusätzlicher Versand ist per
`config.yaml` aktivierbar (`zustellung.email.aktiv` / `zustellung.telegram.aktiv`);
die zugehörigen Zugangsdaten kommen aus `.env` (SMTP\_\* bzw. TELEGRAM\_\*).

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
- **Retention:** Transkripte werden nach **30 Tagen** (konfigurierbar) gelöscht.
  Das läuft automatisch als letzter Schritt von `radar run` (oder manuell via
  `radar retention`). Metadaten und die abgeleitete Analyse bleiben erhalten.
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
  analyze.py      # Stufe 4 (LLM-Substanzanalyse)
  prompts.py      # Analyse-Prompt (Qualitätskern)
  anthropic_client.py  # LLM-Wrapper (strukturierter Output via Tool-Use)
  models.py       # Pydantic-Schemata der LLM-Outputs
  vtt.py          # VTT-Parser
  filters.py      # Vorfilter (rein, testbar)
  youtube_api.py  # YouTube-Data-API-Wrapper
  quota.py        # Quota- & Kostentracking
  cluster.py      # Stufe 5 (Themen-Cluster, Wiederholungsabgleich)
  report.py       # Stufe 6 (Synthese + Markdown-Aufbau)
  delivery.py     # optionaler Versand (SMTP/Telegram)
migrations/       # SQL-Schema
scripts/          # install-schedule.sh (launchd)
tests/            # pytest
config.yaml       # Konfiguration
.env.example      # Secret-Vorlage
```

---

## Roadmap

- [x] **1. Setup** — Projektstruktur, Config-Schema, DB-Migrationen, `.env.example`, README
- [x] **2. Discovery** — Kanal-Monitoring + Quota-Tracking
- [x] **3. Transkripte** — yt-dlp-Integration, VTT-Parser, Rate-Limiting
- [x] **4. Analyse** — LLM, strukturierte Outputs, Kostentracking *(Qualitätskern)*
- [x] **5. Clustering & Report** — Themenerkennung, Wiederholungsabgleich, Report-Synthese
- [x] **6. Zustellung & Scheduling** — SMTP/Telegram, launchd-Job (werktags 07:00, Nachhol-Verhalten)
- [x] **7. Härtung** — Tests (Parser/Filter/Analyse/Report/Cluster), Retention-Job, README

> **Offen für dich:** Der inhaltliche Live-Test des Analyse-Prompts an echten
> Videos (`discover → fetch → analyze → review`) braucht API-Keys und ist
> bewusst dir überlassen — dort sitzt die eigentliche Qualitätskontrolle.

### Nicht-Ziele

Keine Web-UI, kein Dashboard, kein Multi-User, kein Docker/Cloud-Deployment,
keine Video-Downloads, keine Kommentar-Analyse. Ein einzelnes lokales
CLI-Tool für einen Nutzer.
