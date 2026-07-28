"""Stufe 1: Discovery.

Zwei Quellen:
  a) Kanal-Monitoring (Hauptquelle, quota-günstig: playlistItems.list = 1 Einheit)
  b) Keyword-Suche (Ergänzung, streng budgetiert: search.list = 100 Einheiten)

Gefundene Videos werden vorgefiltert und mit Status in die DB geschrieben.
Ein Fehler an einem Kanal/einer Suche bricht den Lauf nie ab.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from . import quota
from .config import Config
from .db import jetzt_iso, log_fehler
from .filters import vorfilter
from .logging_setup import get_logger
from .youtube_api import VideoMeta, YouTubeClient

log = get_logger()


def _sync_kanaele_config_in_db(conn: sqlite3.Connection, cfg: Config) -> None:
    """Legt in der Config gelistete Kanäle in der DB an (idempotent)."""
    for k in cfg.kanaele:
        # Existiert schon (per handle oder channel_id)?
        row = conn.execute(
            "SELECT id FROM channels WHERE (handle IS NOT NULL AND handle = ?) "
            "OR (channel_id IS NOT NULL AND channel_id = ?)",
            (k.handle, k.channel_id),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE channels SET name = ?, aktiv = ?, vertrauens_score = ? WHERE id = ?",
                (k.name, int(k.aktiv), k.vertrauens_score, row["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO channels (channel_id, handle, name, aktiv, vertrauens_score) "
                "VALUES (?, ?, ?, ?, ?)",
                (k.channel_id, k.handle, k.name, int(k.aktiv), k.vertrauens_score),
            )
    conn.commit()


def _resolve_uploads(conn: sqlite3.Connection, yt: YouTubeClient) -> None:
    """Löst channel_id + uploads_playlist_id für Kanäle auf, die es noch brauchen."""
    offen = conn.execute(
        "SELECT id, channel_id, handle, name FROM channels "
        "WHERE aktiv = 1 AND (uploads_playlist_id IS NULL OR channel_id IS NULL)"
    ).fetchall()
    for r in offen:
        try:
            res = yt.resolve_channel(handle=r["handle"], channel_id=r["channel_id"])
            quota.buche_yt(conn, "channels.list")
            if not res:
                log.warning("Kanal nicht auflösbar: %s (%s)", r["name"], r["handle"])
                continue
            cid, name, uploads = res
            conn.execute(
                "UPDATE channels SET channel_id = ?, name = ?, uploads_playlist_id = ? WHERE id = ?",
                (cid, name, uploads, r["id"]),
            )
            conn.commit()
            log.info("Kanal aufgelöst: %s → %s", name, uploads)
        except Exception as e:  # noqa: BLE001 — Einzelfehler darf Lauf nicht killen
            log_fehler(conn, "discover", f"resolve {r['name']}: {e}")
            log.warning("Fehler beim Auflösen von %s: %s", r["name"], e)


def _video_bekannt(conn: sqlite3.Connection, video_id: str) -> bool:
    return (
        conn.execute("SELECT 1 FROM videos WHERE video_id = ?", (video_id,)).fetchone()
        is not None
    )


def _speichere_video(
    conn: sqlite3.Connection, meta: VideoMeta, quelle: str, cfg: Config
) -> str:
    """Wendet Vorfilter an und speichert das Video. Gibt den finalen Status zurück."""
    erg = vorfilter(meta, cfg.filter)
    status = "vorgefiltert" if not erg.behalten else "entdeckt"
    url = f"https://www.youtube.com/watch?v={meta.video_id}"
    conn.execute(
        "INSERT OR IGNORE INTO videos "
        "(video_id, channel_id, kanal_name, titel, url, veroeffentlicht_am, dauer_s, "
        " views, sprache, beschreibung, status, filter_grund, quelle, entdeckt_am) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            meta.video_id,
            meta.channel_id,
            meta.kanal_name,
            meta.titel,
            url,
            meta.veroeffentlicht_am,
            meta.dauer_s,
            meta.views,
            meta.sprache,
            meta.beschreibung,
            status,
            erg.grund or None,
            quelle,
            jetzt_iso(),
        ),
    )
    conn.commit()
    return status


def _monitor_kanaele(conn: sqlite3.Connection, yt: YouTubeClient, cfg: Config) -> dict:
    stats = {"kanaele": 0, "neu": 0, "vorgefiltert": 0}
    kanaele = conn.execute(
        "SELECT channel_id, name, uploads_playlist_id FROM channels "
        "WHERE aktiv = 1 AND uploads_playlist_id IS NOT NULL"
    ).fetchall()

    for k in kanaele:
        stats["kanaele"] += 1
        try:
            paare = yt.neueste_playlist_videos(k["uploads_playlist_id"], max_results=15)
            quota.buche_yt(conn, "playlistItems.list")
            # nur unbekannte Videos weiterverarbeiten (Dedup vor Detail-Call)
            neue_ids = [vid for vid, _ in paare if not _video_bekannt(conn, vid)]
            if not neue_ids:
                conn.execute(
                    "UPDATE channels SET letzter_check_am = ? WHERE channel_id = ?",
                    (jetzt_iso(), k["channel_id"]),
                )
                conn.commit()
                continue
            metas = yt.videos_details(neue_ids)
            for _ in range(0, len(neue_ids), 50):
                quota.buche_yt(conn, "videos.list")
            for meta in metas:
                status = _speichere_video(conn, meta, "kanal", cfg)
                if status == "entdeckt":
                    stats["neu"] += 1
                else:
                    stats["vorgefiltert"] += 1
            conn.execute(
                "UPDATE channels SET letzter_check_am = ? WHERE channel_id = ?",
                (jetzt_iso(), k["channel_id"]),
            )
            conn.commit()
            log.info("Kanal %s: %d neue Videos geprüft", k["name"], len(neue_ids))
        except Exception as e:  # noqa: BLE001
            log_fehler(conn, "discover", f"monitor {k['name']}: {e}")
            log.warning("Fehler bei Kanal %s: %s", k["name"], e)
    return stats


def _keyword_suche(conn: sqlite3.Connection, yt: YouTubeClient, cfg: Config) -> dict:
    stats = {"suchen": 0, "neu": 0, "vorgefiltert": 0, "abgeschaltet": False}
    published_after = (
        datetime.now(timezone.utc) - timedelta(hours=48)
    ).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    for query in cfg.keywords:
        erlaubt, grund = quota.yt_darf_suchen(
            conn,
            cfg.budget.youtube_quota_limit,
            cfg.budget.quota_warn_schwelle,
            cfg.budget.suchen_pro_tag,
        )
        if not erlaubt:
            log.warning("Keyword-Suche gestoppt: %s", grund)
            stats["abgeschaltet"] = True
            break
        try:
            ids = yt.suche(query, published_after_iso=published_after, max_results=10)
            quota.buche_yt(conn, "search.list")
            stats["suchen"] += 1
            neue_ids = [v for v in ids if not _video_bekannt(conn, v)]
            if not neue_ids:
                continue
            metas = yt.videos_details(neue_ids)
            for _ in range(0, len(neue_ids), 50):
                quota.buche_yt(conn, "videos.list")
            for meta in metas:
                status = _speichere_video(conn, meta, "suche", cfg)
                if status == "entdeckt":
                    stats["neu"] += 1
                else:
                    stats["vorgefiltert"] += 1
            log.info("Suche '%s': %d neue Videos", query, len(neue_ids))
        except Exception as e:  # noqa: BLE001
            log_fehler(conn, "discover", f"suche '{query}': {e}")
            log.warning("Fehler bei Suche '%s': %s", query, e)
    return stats


def run_discover(conn: sqlite3.Connection, cfg: Config, api_key: str) -> dict:
    """Führt die Discovery-Stufe aus und gibt eine Statistik zurück."""
    yt = YouTubeClient(api_key)
    _sync_kanaele_config_in_db(conn, cfg)
    _resolve_uploads(conn, yt)

    kanal_stats = _monitor_kanaele(conn, yt, cfg)
    such_stats = _keyword_suche(conn, yt, cfg)

    verbraucht = quota.yt_verbrauch_heute(conn)
    gesamt = {
        "kanaele_geprueft": kanal_stats["kanaele"],
        "neu_kanal": kanal_stats["neu"],
        "neu_suche": such_stats["neu"],
        "vorgefiltert": kanal_stats["vorgefiltert"] + such_stats["vorgefiltert"],
        "suchen": such_stats["suchen"],
        "suche_abgeschaltet": such_stats["abgeschaltet"],
        "yt_quota_verbraucht": verbraucht,
        "yt_quota_limit": cfg.budget.youtube_quota_limit,
    }
    log.info(
        "Discovery fertig: %d neu (Kanal %d / Suche %d), %d vorgefiltert, Quota %d/%d",
        gesamt["neu_kanal"] + gesamt["neu_suche"],
        gesamt["neu_kanal"],
        gesamt["neu_suche"],
        gesamt["vorgefiltert"],
        verbraucht,
        cfg.budget.youtube_quota_limit,
    )
    return gesamt
