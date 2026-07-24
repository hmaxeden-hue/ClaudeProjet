"""Retention-Job: Transkripte nach N Tagen aus der DB löschen.

Rechtlich: keine dauerhafte Speicherung fremder Untertitel. Der Text wird
gelöscht; der Video-Datensatz (Metadaten) und die Analyse bleiben erhalten.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from .config import Config
from .logging_setup import get_logger

log = get_logger()


def run_retention(conn: sqlite3.Connection, cfg: Config) -> dict:
    grenze = (
        datetime.now(timezone.utc) - timedelta(days=cfg.retention.transkripte_tage)
    ).replace(microsecond=0).isoformat()

    cur = conn.execute(
        "DELETE FROM transcripts WHERE abgerufen_am < ?", (grenze,)
    )
    conn.commit()
    anzahl = cur.rowcount
    log.info(
        "Retention: %d Transkripte älter als %d Tage gelöscht",
        anzahl, cfg.retention.transkripte_tage,
    )
    return {"geloescht": anzahl, "grenze": grenze}
