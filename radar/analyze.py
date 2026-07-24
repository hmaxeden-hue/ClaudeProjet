"""Stufe 4: LLM-Analyse pro Video (der Qualitätskern).

Ein Aufruf pro Transkript mit erzwungenem strukturiertem Output. Guardrails:
- Kostendeckel: vor jedem Aufruf prüfen, ob das Tagesbudget erreicht ist.
- max_videos_pro_tag: harte Obergrenze analysierter Videos pro Tag.
- Idempotenz: bereits analysierte Videos werden übersprungen (nichts doppelt
  analysieren, nichts doppelt kosten).
- Fehlertoleranz: ein einzelnes fehlgeschlagenes Video bricht den Lauf nie ab.
"""

from __future__ import annotations

import json
import sqlite3

from . import quota
from .anthropic_client import AnthropicClient
from .config import Config, secret
from .db import heute_iso, jetzt_iso, log_fehler
from .logging_setup import get_logger
from .models import VideoAnalyse
from .prompts import ANALYSE_SYSTEM, ANALYSE_USER

log = get_logger()

# Transkripte werden bei Bedarf auf diese Zeichenzahl gekürzt (Mitte raus).
MAX_TRANSKRIPT_ZEICHEN = 24000


def kuerze_transkript(text: str, max_zeichen: int = MAX_TRANSKRIPT_ZEICHEN) -> str:
    """Kürzt sehr lange Transkripte: behält Anfang und Ende, schneidet die Mitte.

    Anfang (Setup/These) und Ende (Fazit/Zahlen) tragen erfahrungsgemäß das
    meiste Signal; die Mitte ist oft am redundantesten.
    """
    if len(text) <= max_zeichen:
        return text
    haelfte = max_zeichen // 2
    kopf = text[:haelfte].rsplit(" ", 1)[0]
    schwanz = text[-haelfte:].split(" ", 1)[-1]
    return f"{kopf}\n\n[… Mitte gekürzt …]\n\n{schwanz}"


def _gesamtscore(a: VideoAnalyse, cfg: Config) -> float:
    g = cfg.filter.score_gewichte
    summe = g.substanz + g.neuheit + g.umsetzbarkeit
    if summe <= 0:
        return 0.0
    return (
        a.substanz_score * g.substanz
        + a.neuheits_score * g.neuheit
        + a.umsetzbarkeit_score * g.umsetzbarkeit
    ) / summe


def _analyse_schema() -> dict:
    """JSON-Schema für den strukturierten Output (aus dem Pydantic-Modell)."""
    return VideoAnalyse.model_json_schema()


def _bereits_analysiert(conn: sqlite3.Connection, video_id: str) -> bool:
    return (
        conn.execute(
            "SELECT 1 FROM analyses WHERE video_id = ?", (video_id,)
        ).fetchone()
        is not None
    )


def _analysiert_heute(conn: sqlite3.Connection) -> int:
    return int(
        conn.execute(
            "SELECT COUNT(*) c FROM analyses WHERE substr(erstellt_am,1,10) = ?",
            (heute_iso(),),
        ).fetchone()["c"]
    )


def run_analyze(conn: sqlite3.Connection, cfg: Config, *, dry_run: bool = False) -> dict:
    api_key = secret("ANTHROPIC_API_KEY")
    client = AnthropicClient(api_key, cfg.modelle)
    schema = _analyse_schema()

    kandidaten = conn.execute(
        """
        SELECT v.video_id, v.titel, v.kanal_name, v.dauer_s, v.veroeffentlicht_am,
               t.text AS transkript
        FROM videos v JOIN transcripts t ON t.video_id = v.video_id
        WHERE v.status = 'transkribiert'
        ORDER BY v.veroeffentlicht_am DESC
        """
    ).fetchall()

    stats = {
        "kandidaten": len(kandidaten),
        "analysiert": 0,
        "behalten": 0,
        "verworfen": 0,
        "uebersprungen": 0,
        "fehler": 0,
        "kosten_usd": 0.0,
        "budget_gestoppt": False,
    }
    log.info("Analyse: %d Kandidaten", len(kandidaten))

    schon_heute = _analysiert_heute(conn)

    for r in kandidaten:
        vid = r["video_id"]

        # Idempotenz
        if _bereits_analysiert(conn, vid):
            stats["uebersprungen"] += 1
            continue

        # Guardrail: max. Videos pro Tag
        if schon_heute + stats["analysiert"] >= cfg.budget.max_videos_pro_tag:
            log.warning("max_videos_pro_tag (%d) erreicht — Analyse gestoppt.",
                        cfg.budget.max_videos_pro_tag)
            stats["budget_gestoppt"] = True
            break

        # Guardrail: Kostendeckel VOR dem Aufruf prüfen
        if not quota.llm_budget_frei(conn, cfg.budget.max_llm_kosten_pro_tag_usd):
            log.warning(
                "LLM-Tagesbudget ($%.2f) erreicht — Analyse gestoppt, Report aus "
                "bereits Analysiertem.", cfg.budget.max_llm_kosten_pro_tag_usd,
            )
            stats["budget_gestoppt"] = True
            break

        try:
            user = ANALYSE_USER.format(
                titel=r["titel"],
                kanal=r["kanal_name"],
                dauer_min=round((r["dauer_s"] or 0) / 60),
                veroeffentlicht=r["veroeffentlicht_am"],
                transkript=kuerze_transkript(r["transkript"]),
            )
            system = ANALYSE_SYSTEM.format(profil=cfg.profil.beschreibung.strip())

            antwort = client.strukturiert(
                modell=cfg.modelle.analyse,
                system=system,
                user=user,
                tool_name="erfasse_analyse",
                tool_beschreibung="Erfasse die strukturierte Substanzanalyse des Videos.",
                schema=schema,
                max_tokens=2000,
            )
            analyse = VideoAnalyse.model_validate(antwort.daten)
            gesamt = _gesamtscore(analyse, cfg)
            behalten = (not analyse.verwerfen) and gesamt >= cfg.filter.min_gesamtscore

            conn.execute(
                """
                INSERT OR REPLACE INTO analyses
                (video_id, json_payload, substanz_score, neuheits_score,
                 umsetzbarkeit_score, gesamtscore, verwerfen, verwerfen_grund,
                 modell, input_tokens, output_tokens, kosten_usd, erstellt_am)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    vid,
                    analyse.model_dump_json(),
                    analyse.substanz_score,
                    analyse.neuheits_score,
                    analyse.umsetzbarkeit_score,
                    gesamt,
                    int(analyse.verwerfen),
                    analyse.verwerfen_grund or None,
                    antwort.modell,
                    antwort.input_tokens,
                    antwort.output_tokens,
                    antwort.kosten_usd,
                    jetzt_iso(),
                ),
            )
            conn.execute(
                "UPDATE videos SET status = ? WHERE video_id = ?",
                ("analysiert" if behalten else "verworfen", vid),
            )
            conn.commit()
            quota.buche_llm(conn, "analyze", antwort.kosten_usd)

            stats["analysiert"] += 1
            stats["kosten_usd"] += antwort.kosten_usd
            if behalten:
                stats["behalten"] += 1
            else:
                stats["verworfen"] += 1

            _log_ergebnis(r["titel"], analyse, gesamt, behalten)

        except Exception as e:  # noqa: BLE001 — Einzelfehler darf Lauf nicht killen
            conn.execute(
                "UPDATE videos SET status = 'fehler', fehler = ? WHERE video_id = ?",
                (str(e)[:500], vid),
            )
            conn.commit()
            log_fehler(conn, "analyze", str(e), video_id=vid)
            stats["fehler"] += 1
            log.warning("Fehler bei Analyse %s: %s", vid, e)

    stats["kosten_usd"] = round(stats["kosten_usd"], 4)
    log.info(
        "Analyse fertig: %d analysiert (%d behalten / %d verworfen), "
        "%d übersprungen, %d Fehler, $%.4f",
        stats["analysiert"], stats["behalten"], stats["verworfen"],
        stats["uebersprungen"], stats["fehler"], stats["kosten_usd"],
    )
    return stats


def _log_ergebnis(titel: str, a: VideoAnalyse, gesamt: float, behalten: bool) -> None:
    marke = "✓ BEHALTEN" if behalten else "✗ verworfen"
    log.info(
        "%s (S%.0f/N%.0f/U%.0f → %.1f) %s%s",
        marke,
        a.substanz_score, a.neuheits_score, a.umsetzbarkeit_score, gesamt,
        titel[:55],
        f" — {a.verwerfen_grund}" if (not behalten and a.verwerfen_grund) else "",
    )
