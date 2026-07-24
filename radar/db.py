"""SQLite-Zugriff: Verbindung, Migrationen, kleine Helfer.

Kein ORM. Ein dünner Wrapper um ``sqlite3`` mit Row-Factory, aktivierten
Foreign Keys und WAL-Modus (robuster bei parallelen Lese-/Schreibzugriffen).
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def jetzt_iso() -> str:
    """Aktuelle Zeit als ISO-8601 in UTC (Sekundengenauigkeit)."""
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def heute_iso() -> str:
    """Heutiges Datum (UTC) als YYYY-MM-DD."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def verbinde(db_pfad: Path) -> sqlite3.Connection:
    db_pfad.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_pfad), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def migriere(conn: sqlite3.Connection, migrations_dir: Path) -> list[str]:
    """Wendet alle noch nicht angewandten *.sql-Migrationen in Reihenfolge an.

    Gibt die Liste der neu angewandten Versionen zurück.
    """
    # schema_migrations muss existieren, bevor wir Versionen prüfen können.
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version      TEXT PRIMARY KEY,
            angewandt_am TEXT NOT NULL
        );
        """
    )
    conn.commit()

    angewandt = {
        r["version"] for r in conn.execute("SELECT version FROM schema_migrations")
    }
    neu: list[str] = []
    for sql_datei in sorted(migrations_dir.glob("*.sql")):
        version = sql_datei.stem
        if version in angewandt:
            continue
        sql = sql_datei.read_text(encoding="utf-8")
        conn.executescript(sql)
        conn.execute(
            "INSERT OR REPLACE INTO schema_migrations (version, angewandt_am) VALUES (?, ?)",
            (version, jetzt_iso()),
        )
        conn.commit()
        neu.append(version)
    return neu


def log_fehler(
    conn: sqlite3.Connection,
    stage: str,
    nachricht: str,
    *,
    video_id: str | None = None,
) -> None:
    """Persistiert einen Fehler, damit ein Lauf nie ganz abbricht."""
    conn.execute(
        "INSERT INTO run_errors (datum, stage, video_id, nachricht, erstellt_am) "
        "VALUES (?, ?, ?, ?, ?)",
        (heute_iso(), stage, video_id, nachricht[:2000], jetzt_iso()),
    )
    conn.commit()
