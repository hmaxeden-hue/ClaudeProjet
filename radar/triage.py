"""Vorsortierung (Triage): billiger Titel-/Beschreibungs-Check VOR der teuren
Transkript-Analyse.

Der breite Themen-Suchansatz spült viel offensichtlichen Müll rein (Guru-Funnel,
Kurs-Werbung, Hype-Titel). Diesen früh und billig auszusortieren spart die
teuren Transkript-Abrufe und LLM-Analysen. Ein günstiges Modell (Haiku) bewertet
je Video grob 0-10 nur anhand von Titel + Beschreibung; alles unter dem
Schwellwert wird auf ``triage_out`` gesetzt und nicht weiter verarbeitet.
"""

from __future__ import annotations

import sqlite3

from . import quota
from .anthropic_client import AnthropicClient
from .config import Config, secret
from .db import jetzt_iso, log_fehler
from .logging_setup import get_logger
from .models import TriageErgebnis
from .prompts import TRIAGE_SYSTEM, TRIAGE_USER

log = get_logger()


def _format_videos(rows: list[sqlite3.Row]) -> str:
    teile = []
    for r in rows:
        besch = (r["beschreibung"] or "").replace("\n", " ").strip()[:300]
        teile.append(
            f"- video_id={r['video_id']}\n"
            f"    Titel: {r['titel']}\n"
            f"    Kanal: {r['kanal_name']}\n"
            f"    Beschreibung: {besch or '(keine)'}"
        )
    return "\n".join(teile)


def run_triage(conn: sqlite3.Connection, cfg: Config) -> dict:
    stats = {"geprueft": 0, "behalten": 0, "aussortiert": 0, "kosten_usd": 0.0}
    if not cfg.triage.aktiv:
        log.info("Triage deaktiviert — übersprungen.")
        return stats

    kandidaten = conn.execute(
        "SELECT video_id, titel, kanal_name, beschreibung FROM videos "
        "WHERE status = 'entdeckt' ORDER BY veroeffentlicht_am DESC"
    ).fetchall()
    if not kandidaten:
        return stats
    stats["geprueft"] = len(kandidaten)
    log.info("Vorsortierung: %d Videos (Modell %s)", len(kandidaten), cfg.triage.modell)

    try:
        client = AnthropicClient(secret("ANTHROPIC_API_KEY"), cfg.modelle)
    except Exception as e:  # noqa: BLE001 — ohne Key lieber alle durchlassen als blockieren
        log_fehler(conn, "triage", str(e))
        log.warning("Triage übersprungen (kein Client): %s", e)
        return stats

    schema = TriageErgebnis.model_json_schema()
    batch = max(1, cfg.triage.batch_groesse)

    for i in range(0, len(kandidaten), batch):
        teil = kandidaten[i : i + batch]
        # Budget-Guardrail auch hier respektieren
        if not quota.llm_budget_frei(conn, cfg.budget.max_llm_kosten_pro_tag_usd):
            log.warning("LLM-Budget erreicht — restliche Videos ohne Vorsortierung durchgelassen.")
            break
        try:
            antwort = client.strukturiert(
                modell=cfg.triage.modell,
                system=TRIAGE_SYSTEM,
                user=TRIAGE_USER.format(anzahl=len(teil), videos=_format_videos(teil)),
                tool_name="erfasse_triage",
                tool_beschreibung="Erfasse je Video eine grobe Vielversprechend-Bewertung.",
                schema=schema,
                max_tokens=1500,
            )
            ergebnis = TriageErgebnis.model_validate(antwort.daten)
            quota.buche_llm(conn, "triage", antwort.kosten_usd)
            stats["kosten_usd"] += antwort.kosten_usd

            scores = {b.video_id: b.score for b in ergebnis.bewertungen}
            for r in teil:
                # Fehlt eine Bewertung, im Zweifel behalten (nicht fälschlich wegwerfen)
                score = scores.get(r["video_id"], 5.0)
                if score < cfg.triage.min_score:
                    conn.execute(
                        "UPDATE videos SET status = 'triage_out', "
                        "filter_grund = ? WHERE video_id = ?",
                        (f"Vorsortierung: wenig vielversprechend (Score {score:.0f})", r["video_id"]),
                    )
                    stats["aussortiert"] += 1
                else:
                    stats["behalten"] += 1
            conn.commit()
        except Exception as e:  # noqa: BLE001 — Batch-Fehler darf Lauf nicht killen
            log_fehler(conn, "triage", str(e))
            log.warning("Triage-Batch fehlgeschlagen (durchgelassen): %s", e)
            stats["behalten"] += len(teil)

    stats["kosten_usd"] = round(stats["kosten_usd"], 4)
    log.info(
        "Vorsortierung fertig: %d behalten, %d aussortiert, $%.4f",
        stats["behalten"], stats["aussortiert"], stats["kosten_usd"],
    )
    return stats
