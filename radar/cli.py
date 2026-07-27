"""CLI-Einstiegspunkt: python -m radar <stage>  bzw.  radar <stage>.

Stufen sind einzeln aufrufbar (discover / fetch / analyze / report), ``run``
führt die ganze Kette aus. Jede Stufe schreibt ihren Zustand in die DB, damit
ein Abbruch nicht die ganze Kette killt.
"""

from __future__ import annotations

import argparse
import logging
import sys

from . import __version__
from .config import Config, lade_config, secret
from .db import migriere, verbinde
from .logging_setup import get_logger, setup_logging


def _init(args: argparse.Namespace) -> tuple[Config, "sqlite3.Connection"]:  # noqa: F821
    cfg = lade_config(args.config)
    level = logging.DEBUG if args.verbose else logging.INFO
    setup_logging(cfg.logs_pfad, level=level)
    conn = verbinde(cfg.db_pfad)
    from pathlib import Path

    migrations_dir = cfg.projekt_root / "migrations"
    neu = migriere(conn, migrations_dir)
    if neu:
        get_logger().info("Migrationen angewandt: %s", ", ".join(neu))
    return cfg, conn


# --- Stage-Dispatch -------------------------------------------------------
def cmd_migrate(args: argparse.Namespace) -> int:
    _cfg, conn = _init(args)
    conn.close()
    print("DB migriert / aktuell.")
    return 0


def cmd_discover(args: argparse.Namespace) -> int:
    from .discovery import run_discover

    cfg, conn = _init(args)
    try:
        api_key = secret("YOUTUBE_API_KEY")
        stats = run_discover(conn, cfg, api_key)
        _print_stats("discover", stats)
        return 0
    finally:
        conn.close()


def cmd_fetch(args: argparse.Namespace) -> int:
    from .transcripts import run_fetch

    cfg, conn = _init(args)
    try:
        stats = run_fetch(conn, cfg, limit=args.limit, retry_failed=args.retry_failed)
        _print_stats("fetch", stats)
        return 0
    finally:
        conn.close()


def cmd_analyze(args: argparse.Namespace) -> int:
    from .analyze import run_analyze

    cfg, conn = _init(args)
    try:
        stats = run_analyze(conn, cfg, dry_run=args.dry_run)
        _print_stats("analyze", stats)
        return 0
    finally:
        conn.close()


def cmd_report(args: argparse.Namespace) -> int:
    from .cluster import run_cluster
    from .report import run_report

    cfg, conn = _init(args)
    try:
        _cluster_stats, ergebnis = run_cluster(conn, cfg)
        stats = run_report(conn, cfg, dry_run=args.dry_run, cluster_ergebnis=ergebnis)
        _print_stats("report", stats)
        return 0
    finally:
        conn.close()


def cmd_retention(args: argparse.Namespace) -> int:
    from .retention import run_retention

    cfg, conn = _init(args)
    try:
        stats = run_retention(conn, cfg)
        _print_stats("retention", stats)
        return 0
    finally:
        conn.close()


def cmd_status(args: argparse.Namespace) -> int:
    cfg, conn = _init(args)
    try:
        from .db import heute_iso

        zeilen = conn.execute(
            "SELECT status, COUNT(*) c FROM videos GROUP BY status ORDER BY c DESC"
        ).fetchall()
        print(f"AI-Business Radar v{__version__} — DB: {cfg.db_pfad}")
        print("\nVideos nach Status:")
        for z in zeilen:
            print(f"  {z['status']:15} {z['c']}")
        yt = conn.execute(
            "SELECT COALESCE(SUM(einheiten),0) s FROM api_usage WHERE datum=? AND dienst='youtube'",
            (heute_iso(),),
        ).fetchone()["s"]
        llm = conn.execute(
            "SELECT COALESCE(SUM(kosten_usd),0) s FROM api_usage WHERE datum=? AND dienst='anthropic'",
            (heute_iso(),),
        ).fetchone()["s"]
        print(f"\nHeute: YouTube-Quota {yt}/{cfg.budget.youtube_quota_limit}, "
              f"LLM-Kosten ${llm:.4f}/${cfg.budget.max_llm_kosten_pro_tag_usd:.2f}")
        return 0
    finally:
        conn.close()


def cmd_review(args: argparse.Namespace) -> int:
    """Gibt gespeicherte Analysen lesbar aus — zum Beurteilen der Prompt-Qualität."""
    import json as _json

    cfg, conn = _init(args)
    try:
        wo = "WHERE a.verwerfen = 0" if args.nur_behalten else ""
        rows = conn.execute(
            f"""
            SELECT v.titel, v.kanal_name, v.url, v.dauer_s, a.json_payload,
                   a.gesamtscore, a.verwerfen, a.kosten_usd
            FROM analyses a JOIN videos v ON v.video_id = a.video_id
            {wo}
            ORDER BY a.gesamtscore DESC
            """
        ).fetchall()
        if not rows:
            print("Noch keine Analysen in der DB. Erst: radar discover && radar fetch && radar analyze")
            return 0
        print(f"{len(rows)} Analysen (nach Gesamtscore sortiert):\n" + "=" * 72)
        for r in rows:
            a = _json.loads(r["json_payload"])
            marke = "✗ VERWORFEN" if r["verwerfen"] else "✓ BEHALTEN"
            print(f"\n{marke}  Gesamt {r['gesamtscore']:.1f}  "
                  f"(S{a['substanz_score']:.0f}/N{a['neuheits_score']:.0f}/U{a['umsetzbarkeit_score']:.0f})  "
                  f"${r['kosten_usd']:.4f}")
            print(f"  {r['titel']}")
            print(f"  {r['kanal_name']} · {round((r['dauer_s'] or 0)/60)} Min · {r['url']}")
            print(f"  Kernaussage: {a['kernaussage']}")
            if a.get("konkrete_erkenntnisse"):
                print("  Erkenntnisse:")
                for e in a["konkrete_erkenntnisse"]:
                    print(f"    • {e}")
            if a.get("genannte_tools"):
                tools = ", ".join(t["name"] for t in a["genannte_tools"])
                print(f"  Tools: {tools}")
            if a.get("geschaeftsmodell_relevanz"):
                print(f"  Business-Relevanz: {a['geschaeftsmodell_relevanz']}")
            if a.get("hype_flags"):
                print(f"  Hype-Flags: {', '.join(a['hype_flags'])}")
            if r["verwerfen"] and a.get("verwerfen_grund"):
                print(f"  Verwerfen-Grund: {a['verwerfen_grund']}")
        return 0
    finally:
        conn.close()


def cmd_serve(args: argparse.Namespace) -> int:
    from .dashboard import run_dashboard

    cfg = lade_config(args.config)
    setup_logging(cfg.logs_pfad, level=logging.INFO)
    # DB einmal migrieren, damit die Seite sofort funktioniert
    conn = verbinde(cfg.db_pfad)
    migriere(conn, cfg.projekt_root / "migrations")
    conn.close()
    run_dashboard(cfg, port=args.port, open_browser=not args.no_browser)
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    """Volle Kette: discover → fetch → analyze → report. Fehler einer Stufe
    beenden die Kette kontrolliert, ohne bereits geleistete Arbeit zu verwerfen."""
    log = get_logger()
    for schritt, fn in [
        ("discover", cmd_discover),
        ("fetch", cmd_fetch),
        ("analyze", cmd_analyze),
        ("report", cmd_report),
    ]:
        try:
            rc = fn(args)
            if rc != 0:
                log.warning("Stufe %s meldete rc=%d — Kette gestoppt.", schritt, rc)
                return rc
        except NotImplementedError as e:
            log.warning("Stufe %s noch nicht implementiert: %s", schritt, e)
            print(f"[run] gestoppt bei '{schritt}': {e}")
            return 0
    # Retention als letzter Schritt der Tageskette (30-Tage-Löschung, automatisch).
    try:
        cmd_retention(args)
    except Exception as e:  # noqa: BLE001 — Retention darf den Lauf nicht killen
        log.warning("Retention übersprungen: %s", e)
    return 0


def _print_stats(stage: str, stats: dict) -> None:
    print(f"[{stage}] " + ", ".join(f"{k}={v}" for k, v in stats.items()))


# --- Argparse -------------------------------------------------------------
def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="radar",
        description="AI-Business Radar — findet, prüft und berichtet AI/Business-YouTube-Videos.",
    )
    p.add_argument("--config", help="Pfad zu config.yaml (Default: Projektwurzel)")
    p.add_argument("--verbose", "-v", action="store_true", help="Debug-Konsolenausgabe")
    p.add_argument("--dry-run", action="store_true",
                   help="Alles außer Zustellung/Versand ausführen")
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")

    sub = p.add_subparsers(dest="stage", required=True)

    sub.add_parser("migrate", help="DB-Schema anlegen/aktualisieren").set_defaults(fn=cmd_migrate)
    sub.add_parser("discover", help="Neue Videos finden (Kanäle + Suche)").set_defaults(fn=cmd_discover)

    pf = sub.add_parser("fetch", help="Transkripte beschaffen")
    pf.add_argument("--limit", type=int, help="Max. Videos pro Lauf")
    pf.add_argument("--retry-failed", action="store_true",
                    help="Zuvor fehlgeschlagene Videos zurücksetzen und erneut versuchen")
    pf.set_defaults(fn=cmd_fetch)

    sub.add_parser("analyze", help="Videos per LLM analysieren").set_defaults(fn=cmd_analyze)
    sub.add_parser("report", help="Clustern & Tagesbericht erzeugen").set_defaults(fn=cmd_report)
    sub.add_parser("run", help="Volle Kette ausführen").set_defaults(fn=cmd_run)
    sub.add_parser("retention", help="Alte Transkripte löschen").set_defaults(fn=cmd_retention)
    sub.add_parser("status", help="Zustand & Budget anzeigen").set_defaults(fn=cmd_status)

    pr = sub.add_parser("review", help="Gespeicherte Analysen lesbar ausgeben")
    pr.add_argument("--nur-behalten", action="store_true", help="Nur behaltene Videos zeigen")
    pr.set_defaults(fn=cmd_review)

    ps = sub.add_parser("serve", help="Lokales Dashboard im Browser starten")
    ps.add_argument("--port", type=int, default=None, help="Port (Default aus config.yaml)")
    ps.add_argument("--no-browser", action="store_true",
                    help="Browser nicht automatisch öffnen (für Hintergrunddienst)")
    ps.set_defaults(fn=cmd_serve)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        return args.fn(args)
    except NotImplementedError as e:
        print(f"Noch nicht verfügbar: {e}", file=sys.stderr)
        return 3
    except FileNotFoundError as e:
        print(f"Fehler: {e}", file=sys.stderr)
        return 2
    except RuntimeError as e:
        print(f"Fehler: {e}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("\nAbgebrochen.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
