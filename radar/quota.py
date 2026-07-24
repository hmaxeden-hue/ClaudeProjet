"""Quota- und Kostentracking in der DB.

YouTube Data API v3 rechnet in Quota-Einheiten:
  - playlistItems.list / channels.list / videos.list: je 1 Einheit
  - search.list: 100 Einheiten (teuer!)
Wir schreiben jeden Verbrauch nach ``api_usage`` und können so das Tageslimit
und die 80%-Warnschwelle durchsetzen.
"""

from __future__ import annotations

import sqlite3

from .db import heute_iso, jetzt_iso

# YouTube-Quota-Kosten pro Operation (offizielle Werte).
YT_KOSTEN = {
    "playlistItems.list": 1,
    "channels.list": 1,
    "videos.list": 1,
    "search.list": 100,
}


def yt_verbrauch_heute(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT COALESCE(SUM(einheiten), 0) AS s FROM api_usage "
        "WHERE datum = ? AND dienst = 'youtube'",
        (heute_iso(),),
    ).fetchone()
    return int(row["s"])


def yt_suchen_heute(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM api_usage "
        "WHERE datum = ? AND dienst = 'youtube' AND operation = 'search.list'",
        (heute_iso(),),
    ).fetchone()
    return int(row["c"])


def buche_yt(conn: sqlite3.Connection, operation: str, anzahl: int = 1) -> int:
    """Bucht `anzahl` YouTube-Operationen und gibt die verbrauchten Einheiten zurück."""
    einheiten = YT_KOSTEN.get(operation, 1) * anzahl
    conn.execute(
        "INSERT INTO api_usage (datum, dienst, operation, einheiten, kosten_usd, erstellt_am) "
        "VALUES (?, 'youtube', ?, ?, 0, ?)",
        (heute_iso(), operation, einheiten, jetzt_iso()),
    )
    conn.commit()
    return einheiten


def yt_darf_suchen(conn: sqlite3.Connection, limit: int, warn_schwelle: float,
                   suchen_pro_tag: int) -> tuple[bool, str]:
    """Prüft, ob eine weitere Keyword-Suche erlaubt ist.

    Returns (erlaubt, grund). Kanal-Monitoring läuft davon unabhängig weiter.
    """
    verbrauch = yt_verbrauch_heute(conn)
    if verbrauch >= limit * warn_schwelle:
        return False, (
            f"Quota-Warnschwelle erreicht ({verbrauch}/{limit}, "
            f"≥{int(warn_schwelle * 100)}%) — Suche abgeschaltet."
        )
    if verbrauch + YT_KOSTEN["search.list"] > limit:
        return False, f"Quota-Limit würde überschritten ({verbrauch}/{limit})."
    if yt_suchen_heute(conn) >= suchen_pro_tag:
        return False, f"Tageslimit für Suchen erreicht ({suchen_pro_tag})."
    return True, ""


# --- LLM-Kosten -----------------------------------------------------------
def llm_kosten_heute(conn: sqlite3.Connection) -> float:
    row = conn.execute(
        "SELECT COALESCE(SUM(kosten_usd), 0) AS s FROM api_usage "
        "WHERE datum = ? AND dienst = 'anthropic'",
        (heute_iso(),),
    ).fetchone()
    return float(row["s"])


def buche_llm(conn: sqlite3.Connection, operation: str, kosten_usd: float) -> None:
    conn.execute(
        "INSERT INTO api_usage (datum, dienst, operation, einheiten, kosten_usd, erstellt_am) "
        "VALUES (?, 'anthropic', ?, 0, ?, ?)",
        (heute_iso(), operation, kosten_usd, jetzt_iso()),
    )
    conn.commit()


def llm_budget_frei(conn: sqlite3.Connection, tageslimit_usd: float) -> bool:
    return llm_kosten_heute(conn) < tageslimit_usd
