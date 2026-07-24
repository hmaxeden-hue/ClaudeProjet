"""Stufe 3: Transkript-Beschaffung via yt-dlp.

Wir laden ausschließlich automatische/menschliche Untertitel (kein Video),
parsen VTT zu Fliesstext und speichern es. Kein Transkript → Status
``no_transcript`` (die Videobeschreibung wird NICHT als Ersatz verwendet, die
ist reines Marketing).

Rate-Limiting: 2–4 s Pause zwischen Requests, exponentielles Backoff bei Fehlern.
"""

from __future__ import annotations

import random
import sqlite3
import tempfile
import time
from pathlib import Path

from .config import Config
from .db import jetzt_iso, log_fehler
from .logging_setup import get_logger
from .vtt import parse_vtt

log = get_logger()


def _hole_untertitel(video_id: str, sprachen: list[str]) -> tuple[str, str] | None:
    """Lädt Untertitel via yt-dlp. Gibt (text, sprache) oder None zurück.

    Nutzt die yt-dlp-Python-API. Bevorzugt manuelle Untertitel, fällt auf
    Auto-Subs zurück. Es wird nichts heruntergeladen außer der VTT-Datei.
    """
    import yt_dlp  # lokal importiert, damit die CLI ohne yt-dlp startet

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        opts = {
            "skip_download": True,
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitlesformat": "vtt",
            "subtitleslangs": sprachen,
            "outtmpl": str(tmpdir / "%(id)s.%(ext)s"),
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
        }
        url = f"https://www.youtube.com/watch?v={video_id}"
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])

        # Bevorzugte Sprachreihenfolge respektieren
        for lang in sprachen:
            treffer = sorted(tmpdir.glob(f"{video_id}*.{lang}.vtt"))
            if treffer:
                text = parse_vtt(treffer[0].read_text(encoding="utf-8", errors="ignore"))
                if text.strip():
                    return text, lang
        # sonst irgendeine gefundene VTT
        alle = sorted(tmpdir.glob(f"{video_id}*.vtt"))
        for f in alle:
            text = parse_vtt(f.read_text(encoding="utf-8", errors="ignore"))
            if text.strip():
                # Sprache aus Dateinamen raten: id.<lang>.vtt
                teile = f.name.split(".")
                lang = teile[-2] if len(teile) >= 3 else "unbekannt"
                return text, lang
    return None


def _mit_backoff(fn, max_retries: int, video_id: str, conn: sqlite3.Connection):
    delay = 2.0
    for versuch in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            if versuch >= max_retries:
                raise
            log.warning(
                "Transkript-Versuch %d/%d für %s fehlgeschlagen: %s (retry in %.0fs)",
                versuch, max_retries, video_id, e, delay,
            )
            time.sleep(delay)
            delay *= 2
    return None


def run_fetch(conn: sqlite3.Connection, cfg: Config, *, limit: int | None = None) -> dict:
    """Holt Transkripte für alle Videos mit Status 'entdeckt'."""
    q = "SELECT video_id, titel FROM videos WHERE status = 'entdeckt' ORDER BY veroeffentlicht_am DESC"
    if limit:
        q += f" LIMIT {int(limit)}"
    offen = conn.execute(q).fetchall()

    stats = {"geprueft": 0, "transkribiert": 0, "kein_transkript": 0, "fehler": 0}
    log.info("Transkript-Beschaffung: %d Videos in Warteschlange", len(offen))

    for i, r in enumerate(offen):
        vid = r["video_id"]
        stats["geprueft"] += 1
        try:
            res = _mit_backoff(
                lambda: _hole_untertitel(vid, cfg.filter.sprachen),
                cfg.transkripte.max_retries,
                vid,
                conn,
            )
            if res is None:
                conn.execute(
                    "UPDATE videos SET status = 'no_transcript' WHERE video_id = ?",
                    (vid,),
                )
                conn.commit()
                stats["kein_transkript"] += 1
                log.info("Kein Transkript: %s", r["titel"][:70])
            else:
                text, lang = res
                conn.execute(
                    "INSERT OR REPLACE INTO transcripts "
                    "(video_id, sprache, text, quelle, zeichen, abgerufen_am) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (vid, lang, text, "yt-dlp", len(text), jetzt_iso()),
                )
                conn.execute(
                    "UPDATE videos SET status = 'transkribiert', sprache = COALESCE(sprache, ?) "
                    "WHERE video_id = ?",
                    (lang, vid),
                )
                conn.commit()
                stats["transkribiert"] += 1
                log.info("Transkript ok (%s, %d Zeichen): %s", lang, len(text), r["titel"][:60])
        except Exception as e:  # noqa: BLE001 — Einzelfehler darf Lauf nicht killen
            conn.execute(
                "UPDATE videos SET status = 'fehler', fehler = ? WHERE video_id = ?",
                (str(e)[:500], vid),
            )
            conn.commit()
            log_fehler(conn, "fetch", str(e), video_id=vid)
            stats["fehler"] += 1
            log.warning("Fehler bei Transkript %s: %s", vid, e)

        # Rate-Limiting: Pause zwischen Requests (nicht nach dem letzten)
        if i < len(offen) - 1:
            pause = random.uniform(cfg.transkripte.min_pause_s, cfg.transkripte.max_pause_s)
            time.sleep(pause)

    log.info(
        "Transkripte fertig: %d ok, %d ohne, %d Fehler",
        stats["transkribiert"], stats["kein_transkript"], stats["fehler"],
    )
    return stats
