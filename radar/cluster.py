"""Stufe 5: Themen-Clustering & Wiederholungserkennung (LLM-basiert).

Gruppiert die heutigen behaltenen Videos zu Themen und gleicht gegen die
zuletzt berichteten Themen (Default 14 Tage) ab, damit nicht sieben Tage
hintereinander dasselbe gemeldet wird. Ergebnis wird in topics/video_topics
persistiert und für die Report-Synthese zurückgegeben.
"""

from __future__ import annotations

import json
import sqlite3

from . import quota
from .anthropic_client import AnthropicClient
from .config import Config, secret
from .db import heute_iso, jetzt_iso, log_fehler
from .logging_setup import get_logger
from .models import ClusterErgebnis
from .prompts import CLUSTER_SYSTEM, CLUSTER_USER

log = get_logger()


def _behaltene_videos_heute(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT v.video_id, v.titel, a.json_payload
        FROM videos v JOIN analyses a ON a.video_id = v.video_id
        WHERE v.status = 'analysiert'
          AND substr(a.erstellt_am,1,10) = ?
        ORDER BY a.gesamtscore DESC
        """,
        (heute_iso(),),
    ).fetchall()
    out = []
    for r in rows:
        payload = json.loads(r["json_payload"])
        out.append(
            {
                "video_id": r["video_id"],
                "titel": r["titel"],
                "kernaussage": payload.get("kernaussage", ""),
                "erkenntnisse": payload.get("konkrete_erkenntnisse", []),
            }
        )
    return out


def _recent_topics(conn: sqlite3.Connection, tage: int) -> list[dict]:
    grenze = conn.execute(
        "SELECT date('now', ?) d", (f"-{int(tage)} days",)
    ).fetchone()["d"]
    rows = conn.execute(
        "SELECT id, label, keywords FROM topics WHERE substr(zuletzt_gesehen,1,10) >= ? "
        "ORDER BY zuletzt_gesehen DESC",
        (grenze,),
    ).fetchall()
    return [
        {"id": r["id"], "label": r["label"], "keywords": r["keywords"] or "[]"}
        for r in rows
    ]


def _format_videos(videos: list[dict]) -> str:
    teile = []
    for v in videos:
        erk = "; ".join(v["erkenntnisse"][:4])
        teile.append(
            f"- video_id={v['video_id']} | {v['titel']}\n"
            f"    Kernaussage: {v['kernaussage']}\n"
            f"    Erkenntnisse: {erk or '—'}"
        )
    return "\n".join(teile)


def _format_topics(topics: list[dict]) -> str:
    if not topics:
        return "(keine)"
    return "\n".join(
        f"- topic_id={t['id']} | {t['label']} | keywords={t['keywords']}" for t in topics
    )


def _persistiere(conn: sqlite3.Connection, ergebnis: ClusterErgebnis,
                 gueltige_topic_ids: set[int]) -> None:
    jetzt = jetzt_iso()
    for topic in ergebnis.topics:
        keywords_json = json.dumps(topic.keywords, ensure_ascii=False)
        if topic.ist_update and topic.update_zu_topic_id in gueltige_topic_ids:
            topic_id = topic.update_zu_topic_id
            conn.execute(
                "UPDATE topics SET zuletzt_gesehen = ?, keywords = ? WHERE id = ?",
                (jetzt, keywords_json, topic_id),
            )
        else:
            cur = conn.execute(
                "INSERT INTO topics (label, keywords, erstmals_gesehen, zuletzt_gesehen) "
                "VALUES (?, ?, ?, ?)",
                (topic.label, keywords_json, jetzt, jetzt),
            )
            topic_id = int(cur.lastrowid)
        for vid in topic.video_ids:
            conn.execute(
                "INSERT OR IGNORE INTO video_topics (video_id, topic_id) VALUES (?, ?)",
                (vid, topic_id),
            )
    conn.commit()


def run_cluster(conn: sqlite3.Connection, cfg: Config) -> tuple[dict, ClusterErgebnis]:
    videos = _behaltene_videos_heute(conn)
    stats = {"behaltene_videos": len(videos), "cluster": 0, "updates": 0, "kosten_usd": 0.0}
    if not videos:
        log.info("Clustering: keine behaltenen Videos — übersprungen.")
        return stats, ClusterErgebnis()

    if not quota.llm_budget_frei(conn, cfg.budget.max_llm_kosten_pro_tag_usd):
        log.warning("LLM-Budget erreicht — Clustering übersprungen.")
        return stats, ClusterErgebnis()

    topics = _recent_topics(conn, cfg.clustering.wiederholung_tage)
    gueltige_ids = {t["id"] for t in topics}

    try:
        client = AnthropicClient(secret("ANTHROPIC_API_KEY"), cfg.modelle)
        antwort = client.strukturiert(
            modell=cfg.modelle.clustering,
            system=CLUSTER_SYSTEM,
            user=CLUSTER_USER.format(
                videos=_format_videos(videos),
                topics=_format_topics(topics),
                tage=cfg.clustering.wiederholung_tage,
            ),
            tool_name="erfasse_cluster",
            tool_beschreibung="Erfasse die Themen-Cluster und Wiederholungs-Abgleiche.",
            schema=ClusterErgebnis.model_json_schema(),
            max_tokens=2000,
        )
        ergebnis = ClusterErgebnis.model_validate(antwort.daten)
        _persistiere(conn, ergebnis, gueltige_ids)
        quota.buche_llm(conn, "cluster", antwort.kosten_usd)

        stats["cluster"] = len(ergebnis.topics)
        stats["updates"] = sum(1 for t in ergebnis.topics if t.ist_update)
        stats["kosten_usd"] = round(antwort.kosten_usd, 4)
        log.info("Clustering: %d Cluster (%d Updates), $%.4f",
                 stats["cluster"], stats["updates"], antwort.kosten_usd)
        return stats, ergebnis
    except Exception as e:  # noqa: BLE001 — darf den Lauf nicht killen
        log_fehler(conn, "cluster", str(e))
        log.warning("Clustering fehlgeschlagen: %s — Report ohne Cluster.", e)
        return stats, ClusterErgebnis()
