"""Offline-Tests für Clustering und Report-Synthese (gemockter LLM-Client)."""

import json
from pathlib import Path

import pytest

from radar import cluster as cluster_mod
from radar import report as report_mod
from radar.anthropic_client import LLMAntwort
from radar.cluster import run_cluster
from radar.config import lade_config
from radar.db import jetzt_iso, migriere, verbinde
from radar.models import ClusterErgebnis
from radar.report import _baue_markdown, _sammle_kennzahlen, run_report

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"


def _db(tmp_path):
    conn = verbinde(tmp_path / "t.db")
    migriere(conn, MIGRATIONS)
    return conn


def _kept_video(conn, vid, titel, kernaussage, erkenntnisse, score=7.5):
    conn.execute(
        "INSERT INTO videos (video_id, kanal_name, titel, url, veroeffentlicht_am, "
        "dauer_s, status, entdeckt_am) VALUES (?,?,?,?,?,?, 'analysiert', ?)",
        (vid, "TestKanal", titel, f"https://youtu.be/{vid}",
         "2026-07-24T08:00:00+00:00", 900, jetzt_iso()),
    )
    payload = json.dumps({
        "kernaussage": kernaussage,
        "konkrete_erkenntnisse": erkenntnisse,
        "genannte_tools": [{"name": "n8n", "kontext": "Orchestrierung"}],
        "geschaeftsmodell_relevanz": "Passt zum DACH-Solo-Ansatz.",
        "substanz_score": 8, "neuheits_score": 7, "umsetzbarkeit_score": 8,
        "hype_flags": [], "verwerfen": False, "verwerfen_grund": "",
    })
    conn.execute(
        "INSERT INTO analyses (video_id, json_payload, substanz_score, neuheits_score, "
        "umsetzbarkeit_score, gesamtscore, verwerfen, modell, input_tokens, output_tokens, "
        "kosten_usd, erstellt_am) VALUES (?,?,8,7,8,?,0,'m',100,50,0.01,?)",
        (vid, payload, score, jetzt_iso()),
    )
    conn.commit()


def _discarded_video(conn, vid, grund, prefilter=False):
    if prefilter:
        conn.execute(
            "INSERT INTO videos (video_id, kanal_name, titel, url, status, filter_grund, entdeckt_am) "
            "VALUES (?,?,?,?, 'vorgefiltert', ?, ?)",
            (vid, "Hype", "T", "u", grund, jetzt_iso()),
        )
    else:
        conn.execute(
            "INSERT INTO videos (video_id, kanal_name, titel, url, status, entdeckt_am) "
            "VALUES (?,?,?,?, 'verworfen', ?)",
            (vid, "Hype", "T", "u", jetzt_iso()),
        )
        conn.execute(
            "INSERT INTO analyses (video_id, json_payload, verwerfen, verwerfen_grund, "
            "modell, kosten_usd, erstellt_am) VALUES (?, '{}', 1, ?, 'm', 0.005, ?)",
            (vid, grund, jetzt_iso()),
        )
    conn.commit()


class FakeClient:
    def __init__(self, daten):
        self._daten = daten
        self.aufrufe = 0

    def strukturiert(self, **kw):
        self.aufrufe += 1
        return LLMAntwort(daten=self._daten, input_tokens=500, output_tokens=200,
                          modell="claude-opus-4-8", kosten_usd=0.03)


@pytest.fixture
def cfg(tmp_path):
    c = lade_config()
    c.pfade.reports = str(tmp_path / "reports")
    return c


# --- Kennzahlen -----------------------------------------------------------
def test_kennzahlen(tmp_path, cfg):
    conn = _db(tmp_path)
    _kept_video(conn, "v1", "T1", "K1", ["e1"])
    _discarded_video(conn, "d1", "Reine Tool-Liste")
    _discarded_video(conn, "d2", "zu kurz (100s)", prefilter=True)
    k = _sammle_kennzahlen(conn)
    assert k["relevant"] == 1
    assert k["aussortiert"] == 2
    assert k["gescannt"] == 3


# --- Leerbericht ohne LLM -------------------------------------------------
def test_leerbericht_ohne_llm(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _discarded_video(conn, "d1", "Reine Tool-Liste")
    # Kein Client nötig; falls doch aufgerufen, würde secret fehlen → wir patchen safe
    monkeypatch.setattr(report_mod, "secret", lambda n: "k")
    fake = FakeClient({})
    monkeypatch.setattr(report_mod, "AnthropicClient", lambda *a, **k: fake)
    stats = run_report(conn, cfg, dry_run=True)
    assert stats["relevant"] == 0
    assert fake.aufrufe == 0  # kein LLM-Aufruf bei Leerbericht
    md = Path(stats["pfad"]).read_text(encoding="utf-8")
    assert "wirklich relevant" in md.lower()
    assert "## Aussortiert" in md


# --- Volle Synthese mit gemocktem Client ----------------------------------
def test_report_synthese(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _kept_video(conn, "v1", "AI-Agent für 12$/Monat", "Selbstbau schlägt SaaS.",
                ["Caching spart 70%", "Vektor-DB war Overkill"])
    inhalt = {
        "nichts_relevant": False,
        "das_wichtigste": ["Selbstbau-Agenten sind günstiger als SaaS."],
        "erkenntnisse": [{
            "thema": "Kosten von AI-Agenten",
            "was": "Ein Eigenbau kostet ~12$/Monat.",
            "warum_relevant": "Direkt auf Nischenprodukte übertragbar.",
            "quelle_video_ids": ["v1"],
        }],
        "umsetzungsideen": [{
            "idee": "Recherche-Agent als Micro-SaaS",
            "aufwand": "1-2 Wochen", "dagegen": "Support-Last unklar",
        }],
        "beobachtungsliste": ["Prompt-Caching-Preise beobachten"],
    }
    monkeypatch.setattr(report_mod, "secret", lambda n: "k")
    fake = FakeClient(inhalt)
    monkeypatch.setattr(report_mod, "AnthropicClient", lambda *a, **k: fake)

    stats = run_report(conn, cfg, dry_run=True)
    assert fake.aufrufe == 1
    assert stats["relevant"] == 1
    md = Path(stats["pfad"]).read_text(encoding="utf-8")
    assert "# AI-Business Radar — " in md
    assert "## Das Wichtigste" in md
    assert "### Kosten von AI-Agenten" in md
    assert "https://youtu.be/v1" in md          # echter Quellen-Link aus der DB
    assert "## Umsetzungsideen" in md
    assert "## Beobachtungsliste" in md
    # reports-Tabelle befüllt
    row = conn.execute("SELECT anzahl_relevant FROM reports").fetchone()
    assert row["anzahl_relevant"] == 1


# --- Clustering: neues Topic + Update ------------------------------------
def test_cluster_neu_und_update(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _kept_video(conn, "v1", "Neues Modell X", "Modell X ist da.", ["schneller"])
    # bestehendes Topic der letzten Tage
    conn.execute(
        "INSERT INTO topics (id, label, keywords, erstmals_gesehen, zuletzt_gesehen) "
        "VALUES (5, 'Modell-Releases', '[\"modell\"]', ?, ?)",
        (jetzt_iso(), jetzt_iso()),
    )
    conn.commit()

    cluster_out = {
        "topics": [{
            "label": "Modell-Releases",
            "video_ids": ["v1"],
            "keywords": ["modell", "release"],
            "ist_update": True,
            "update_zu_topic_id": 5,
            "neue_information": "Modell X mit größerem Kontextfenster.",
        }]
    }
    monkeypatch.setattr(cluster_mod, "secret", lambda n: "k")
    monkeypatch.setattr(cluster_mod, "AnthropicClient",
                        lambda *a, **k: FakeClient(cluster_out))

    stats, ergebnis = run_cluster(conn, cfg)
    assert stats["cluster"] == 1 and stats["updates"] == 1
    # kein neues Topic angelegt (Update auf bestehendes 5)
    anzahl = conn.execute("SELECT COUNT(*) c FROM topics").fetchone()["c"]
    assert anzahl == 1
    # Verknüpfung gesetzt
    link = conn.execute(
        "SELECT topic_id FROM video_topics WHERE video_id='v1'"
    ).fetchone()
    assert link["topic_id"] == 5
    assert ergebnis.topics[0].neue_information


def test_cluster_leer_ohne_videos(tmp_path, cfg):
    conn = _db(tmp_path)
    stats, ergebnis = run_cluster(conn, cfg)
    assert stats["behaltene_videos"] == 0
    assert ergebnis.topics == []


def test_baue_markdown_ohne_erkenntnisse():
    from radar.models import ReportInhalt
    k = {"gescannt": 5, "kanaele": 3, "relevant": 0, "aussortiert": 5,
         "top_gruende": [("zu kurz", 3), ("Reine Tool-Liste", 2)]}
    inhalt = ReportInhalt(nichts_relevant=True, das_wichtigste=[])
    md = _baue_markdown("2026-07-24", k, inhalt, {})
    assert "Heute nichts wirklich Relevantes" in md
    assert "zu kurz (3)" in md
