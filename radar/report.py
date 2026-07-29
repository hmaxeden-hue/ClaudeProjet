"""Stufe 6: Report-Synthese & Zustellung.

Ein finaler LLM-Aufruf synthetisiert aus allen behaltenen Analysen einen
kohärenten Bericht (kein bloßes Aneinanderreihen). Kopf-Statistik und
Quellen-Links werden deterministisch aus der DB ergänzt, damit nichts
halluziniert wird. Wenn nichts Relevantes dabei war, entsteht bewusst ein
kurzer, ehrlicher Bericht ohne LLM-Kosten.
"""

from __future__ import annotations

import json
import sqlite3
from collections import Counter

from . import quota
from .anthropic_client import AnthropicClient
from .config import Config, secret
from .db import heute_iso, jetzt_iso, log_fehler
from .delivery import zustellen
from .logging_setup import get_logger
from .models import ClusterErgebnis, ReportInhalt
from .prompts import REPORT_SYSTEM, REPORT_USER

log = get_logger()


def _dauer(sekunden: int | None) -> str:
    if not sekunden:
        return "?"
    return f"{round(sekunden / 60)} Min"


def _sammle_kennzahlen(conn: sqlite3.Connection) -> dict:
    heute = heute_iso()
    gescannt = conn.execute(
        "SELECT COUNT(*) c FROM videos WHERE substr(entdeckt_am,1,10) = ?", (heute,)
    ).fetchone()["c"]
    kanaele = conn.execute(
        "SELECT COUNT(DISTINCT kanal_name) c FROM videos WHERE substr(entdeckt_am,1,10) = ?",
        (heute,),
    ).fetchone()["c"]
    relevant = conn.execute(
        "SELECT COUNT(*) c FROM videos v JOIN analyses a ON a.video_id = v.video_id "
        "WHERE v.status = 'analysiert' AND substr(a.erstellt_am,1,10) = ?",
        (heute,),
    ).fetchone()["c"]

    # Aussortiert: LLM-verworfene (mit Grund) + vorgefilterte heute
    gruende: Counter = Counter()
    for r in conn.execute(
        "SELECT verwerfen_grund FROM analyses WHERE verwerfen = 1 AND substr(erstellt_am,1,10) = ?",
        (heute,),
    ):
        if r["verwerfen_grund"]:
            gruende[r["verwerfen_grund"]] += 1
    for r in conn.execute(
        "SELECT filter_grund FROM videos WHERE status IN ('vorgefiltert', 'triage_out') "
        "AND substr(entdeckt_am,1,10) = ?",
        (heute,),
    ):
        if r["filter_grund"]:
            # Vorfilter-Gründe generalisieren (z.B. 'zu kurz (100s)' -> 'zu kurz')
            grund = r["filter_grund"].split("(")[0].strip()
            gruende[grund] += 1

    aussortiert = sum(gruende.values())
    return {
        "gescannt": gescannt,
        "kanaele": kanaele,
        "relevant": relevant,
        "aussortiert": aussortiert,
        "top_gruende": gruende.most_common(4),
    }


def _behaltene_analysen(conn: sqlite3.Connection) -> dict[str, dict]:
    heute = heute_iso()
    rows = conn.execute(
        """
        SELECT v.video_id, v.titel, v.url, v.kanal_name, v.dauer_s,
               a.json_payload, a.gesamtscore
        FROM videos v JOIN analyses a ON a.video_id = v.video_id
        WHERE v.status = 'analysiert' AND substr(a.erstellt_am,1,10) = ?
        ORDER BY a.gesamtscore DESC
        """,
        (heute,),
    ).fetchall()
    out: dict[str, dict] = {}
    for r in rows:
        p = json.loads(r["json_payload"])
        out[r["video_id"]] = {
            "titel": r["titel"],
            "url": r["url"],
            "kanal": r["kanal_name"],
            "dauer_s": r["dauer_s"],
            "gesamtscore": r["gesamtscore"],
            "kernaussage": p.get("kernaussage", ""),
            "erkenntnisse": p.get("konkrete_erkenntnisse", []),
            "tools": p.get("genannte_tools", []),
            "relevanz": p.get("geschaeftsmodell_relevanz", ""),
        }
    return out


def _grenzfaelle(conn: sqlite3.Connection, cfg: Config, limit: int = 3) -> list[dict]:
    """Beste 'Beinahe-Treffer' des Tages: analysiert, aber knapp unter dem
    Schwellwert. Damit auch an mageren Tagen etwas Sichtbares im Bericht steht
    und man erkennt, ob der Filter zu streng ist."""
    heute = heute_iso()
    boden = max(0.0, cfg.filter.min_gesamtscore - 2.0)
    rows = conn.execute(
        """
        SELECT v.titel, v.url, v.kanal_name, v.dauer_s, a.gesamtscore,
               a.verwerfen_grund, a.json_payload
        FROM videos v JOIN analyses a ON a.video_id = v.video_id
        WHERE v.status = 'verworfen' AND substr(a.erstellt_am,1,10) = ?
          AND a.gesamtscore >= ? AND a.gesamtscore < ?
        ORDER BY a.gesamtscore DESC LIMIT ?
        """,
        (heute, boden, cfg.filter.min_gesamtscore, limit),
    ).fetchall()
    out = []
    for r in rows:
        p = json.loads(r["json_payload"]) if r["json_payload"] else {}
        out.append({
            "titel": r["titel"], "url": r["url"], "kanal": r["kanal_name"],
            "dauer_s": r["dauer_s"], "gesamtscore": r["gesamtscore"],
            "warum": r["verwerfen_grund"] or p.get("kernaussage", ""),
        })
    return out


def _format_analysen(analysen: dict[str, dict], cluster: ClusterErgebnis) -> str:
    # Update-Marker je Video aus dem Cluster-Ergebnis ableiten
    update_info: dict[str, str] = {}
    for t in cluster.topics:
        if t.ist_update and t.neue_information:
            for vid in t.video_ids:
                update_info[vid] = t.neue_information

    teile = []
    for vid, a in analysen.items():
        erk = "; ".join(a["erkenntnisse"]) or "—"
        tools = ", ".join(t.get("name", "") for t in a["tools"]) or "—"
        block = (
            f"- video_id={vid} | {a['titel']} ({a['kanal']}, {_dauer(a['dauer_s'])})\n"
            f"    Kernaussage: {a['kernaussage']}\n"
            f"    Erkenntnisse: {erk}\n"
            f"    Tools: {tools}\n"
            f"    Business-Relevanz: {a['relevanz'] or '—'}"
        )
        if vid in update_info:
            block += f"\n    HINWEIS Update zu bekanntem Thema — neu ist: {update_info[vid]}"
        teile.append(block)
    return "\n".join(teile)


def _quelle_link(a: dict) -> str:
    return f"[{a['titel']}]({a['url']}) — {a['kanal']}, {_dauer(a['dauer_s'])}"


def _baue_markdown(datum: str, kennzahlen: dict, inhalt: ReportInhalt,
                   analysen: dict[str, dict], grenzfaelle: list[dict] | None = None) -> str:
    z = []
    z.append(f"# AI-Business Radar — {datum}\n")
    z.append(
        f"**Gescannt:** {kennzahlen['gescannt']} Videos aus {kennzahlen['kanaele']} "
        f"Kanälen · **Relevant:** {kennzahlen['relevant']}\n"
    )

    z.append("## Das Wichtigste\n")
    if inhalt.das_wichtigste:
        for b in inhalt.das_wichtigste:
            z.append(f"- {b}")
    else:
        z.append("- Heute nichts wirklich Relevantes.")
    z.append("")

    if inhalt.erkenntnisse:
        z.append("## Erkenntnisse im Detail\n")
        for e in inhalt.erkenntnisse:
            z.append(f"### {e.thema}")
            z.append(f"- **Was:** {e.was}")
            z.append(f"- **Warum relevant:** {e.warum_relevant}")
            if getattr(e, "umsetzung", ""):
                z.append(f"- **💡 So machst du was draus:** {e.umsetzung}")
            for vid in e.quelle_video_ids:
                if vid in analysen:
                    z.append(f"- **Quelle:** {_quelle_link(analysen[vid])}")
            z.append("")

    if inhalt.umsetzungsideen:
        z.append("## Umsetzungsideen\n")
        for i in inhalt.umsetzungsideen:
            z.append(f"- **{i.idee}**")
            z.append(f"  - Aufwand: {i.aufwand}")
            z.append(f"  - Dagegen: {i.dagegen}")
        z.append("")

    if inhalt.beobachtungsliste:
        z.append("## Beobachtungsliste\n")
        for b in inhalt.beobachtungsliste:
            z.append(f"- {b}")
        z.append("")

    if grenzfaelle:
        z.append("## Grenzfälle (knapp nicht relevant)\n")
        z.append("*Diese kamen dem Schwellwert am nächsten — falls dir hier etwas "
                 "fehlt, ist der Filter evtl. zu streng.*\n")
        for g in grenzfaelle:
            z.append(f"- **{g['titel']}** ({g['gesamtscore']:.1f}) — {g['warum']}")
            z.append(f"  {_quelle_link(g)}")
        z.append("")

    z.append("## Aussortiert\n")
    if kennzahlen["aussortiert"]:
        gruende = " · ".join(f"{g} ({n})" for g, n in kennzahlen["top_gruende"])
        z.append(f"{kennzahlen['aussortiert']} Videos verworfen — Top-Gründe: {gruende}")
    else:
        z.append("Heute nichts aussortiert.")
    z.append("")

    return "\n".join(z)


def _ehrlicher_leerbericht(datum: str, kennzahlen: dict) -> ReportInhalt:
    return ReportInhalt(
        nichts_relevant=True,
        das_wichtigste=[
            "Heute kam nichts durch, das für dein Profil wirklich relevant war."
        ],
    )


def run_report(
    conn: sqlite3.Connection,
    cfg: Config,
    *,
    dry_run: bool = False,
    cluster_ergebnis: ClusterErgebnis | None = None,
) -> dict:
    datum = heute_iso()
    kennzahlen = _sammle_kennzahlen(conn)
    analysen = _behaltene_analysen(conn)
    cluster = cluster_ergebnis or ClusterErgebnis()

    kosten = 0.0
    if not analysen:
        # Kein LLM-Aufruf: kurzer, ehrlicher Bericht.
        inhalt = _ehrlicher_leerbericht(datum, kennzahlen)
        log.info("Report: keine relevanten Videos — ehrlicher Kurzbericht.")
    elif not quota.llm_budget_frei(conn, cfg.budget.max_llm_kosten_pro_tag_usd):
        # Budget aufgebraucht: Bericht aus dem, was da ist, ohne Synthese.
        inhalt = ReportInhalt(
            nichts_relevant=False,
            das_wichtigste=[a["kernaussage"] for a in list(analysen.values())[:5]],
            erkenntnisse=[],
        )
        log.warning("Report: LLM-Budget erreicht — Bericht ohne Synthese aus Rohdaten.")
    else:
        try:
            client = AnthropicClient(secret("ANTHROPIC_API_KEY"), cfg.modelle)
            antwort = client.strukturiert(
                modell=cfg.modelle.report,
                system=REPORT_SYSTEM.format(profil=cfg.profil.beschreibung.strip()),
                user=REPORT_USER.format(
                    datum=datum,
                    anzahl=len(analysen),
                    analysen=_format_analysen(analysen, cluster),
                ),
                tool_name="erfasse_report",
                tool_beschreibung="Erfasse den synthetisierten Tagesbericht.",
                schema=ReportInhalt.model_json_schema(),
                max_tokens=3000,
            )
            inhalt = ReportInhalt.model_validate(antwort.daten)
            quota.buche_llm(conn, "report", antwort.kosten_usd)
            kosten = antwort.kosten_usd
            log.info("Report synthetisiert ($%.4f).", kosten)
        except Exception as e:  # noqa: BLE001
            log_fehler(conn, "report", str(e))
            log.warning("Report-Synthese fehlgeschlagen: %s — Rohbericht.", e)
            inhalt = ReportInhalt(
                nichts_relevant=False,
                das_wichtigste=[a["kernaussage"] for a in list(analysen.values())[:5]],
            )

    grenzfaelle = _grenzfaelle(conn, cfg)
    markdown = _baue_markdown(datum, kennzahlen, inhalt, analysen, grenzfaelle)

    # Datei immer schreiben
    cfg.reports_pfad.mkdir(parents=True, exist_ok=True)
    pfad = cfg.reports_pfad / f"{datum}.md"
    pfad.write_text(markdown, encoding="utf-8")
    conn.execute(
        "INSERT OR REPLACE INTO reports (datum, pfad, anzahl_gescannt, anzahl_relevant, erstellt_am) "
        "VALUES (?, ?, ?, ?, ?)",
        (datum, str(pfad), kennzahlen["gescannt"], kennzahlen["relevant"], jetzt_iso()),
    )
    conn.commit()
    log.info("Report geschrieben: %s", pfad)

    versand: dict = {}
    if dry_run:
        log.info("--dry-run: Versand übersprungen.")
    else:
        versand = zustellen(cfg, datum=datum, markdown=markdown)

    return {
        "pfad": str(pfad),
        "relevant": kennzahlen["relevant"],
        "gescannt": kennzahlen["gescannt"],
        "aussortiert": kennzahlen["aussortiert"],
        "kosten_usd": round(kosten, 4),
        "versand": versand or "keiner",
    }
