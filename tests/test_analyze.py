"""Offline-Tests der Analyse-Stufe mit gemocktem LLM-Client.

Verifiziert Scoring/Schwellwert, Idempotenz, Budget-/Mengen-Guardrails und
Verwerfen — ohne echte API-Calls.
"""

from pathlib import Path

import pytest

from radar import analyze as analyze_mod
from radar.analyze import kuerze_transkript, run_analyze
from radar.anthropic_client import LLMAntwort
from radar.config import lade_config
from radar.db import jetzt_iso, migriere, verbinde

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"


def _db(tmp_path):
    conn = verbinde(tmp_path / "t.db")
    migriere(conn, MIGRATIONS)
    return conn


def _video(conn, vid, titel="Wie ich einen SaaS mit AI-Agenten baute"):
    conn.execute(
        "INSERT INTO videos (video_id, kanal_name, titel, url, veroeffentlicht_am, "
        "dauer_s, status, entdeckt_am) VALUES (?,?,?,?,?,?, 'transkribiert', ?)",
        (vid, "Testkanal", titel, f"u/{vid}", "2026-07-24T08:00:00+00:00", 900, jetzt_iso()),
    )
    conn.execute(
        "INSERT INTO transcripts (video_id, sprache, text, quelle, zeichen, abgerufen_am) "
        "VALUES (?,?,?,?,?,?)",
        (vid, "en", "Ein langes Transkript mit Zahlen und Code.", "yt-dlp", 40, jetzt_iso()),
    )
    conn.commit()


class FakeClient:
    """Gibt vordefinierte Analysen zurück, in Reihenfolge der Aufrufe."""

    def __init__(self, antworten):
        self._antworten = list(antworten)
        self.aufrufe = 0

    def strukturiert(self, **kw):
        daten = self._antworten[self.aufrufe]
        self.aufrufe += 1
        return LLMAntwort(daten=daten, input_tokens=1000, output_tokens=300,
                          modell="claude-opus-4-8", kosten_usd=0.05)


def _analyse(substanz, neuheit, umsetz, verwerfen=False, grund=""):
    return {
        "kernaussage": "Test.",
        "konkrete_erkenntnisse": ["x"] if not verwerfen else [],
        "genannte_tools": [],
        "geschaeftsmodell_relevanz": "",
        "substanz_score": substanz,
        "neuheits_score": neuheit,
        "umsetzbarkeit_score": umsetz,
        "hype_flags": [],
        "verwerfen": verwerfen,
        "verwerfen_grund": grund,
    }


@pytest.fixture
def cfg():
    return lade_config()


def _patch(monkeypatch, client):
    monkeypatch.setattr(analyze_mod, "secret", lambda name: "dummy-key")
    monkeypatch.setattr(analyze_mod, "AnthropicClient", lambda *a, **k: client)


def test_behalten_ueber_schwellwert(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "v1")
    _patch(monkeypatch, FakeClient([_analyse(9, 8, 8)]))
    stats = run_analyze(conn, cfg)
    assert stats["behalten"] == 1 and stats["verworfen"] == 0
    assert conn.execute("SELECT status FROM videos WHERE video_id='v1'").fetchone()["status"] == "analysiert"


def test_verworfen_unter_schwellwert(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "v1")
    _patch(monkeypatch, FakeClient([_analyse(3, 2, 2)]))  # gewichtet ~2.3 < 6.0
    stats = run_analyze(conn, cfg)
    assert stats["behalten"] == 0 and stats["verworfen"] == 1
    assert conn.execute("SELECT status FROM videos WHERE video_id='v1'").fetchone()["status"] == "verworfen"


def test_verwerfen_flag_schlaegt_score(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "v1")
    # Hohe Scores, aber Modell setzt verwerfen=true → muss verworfen werden
    _patch(monkeypatch, FakeClient([_analyse(9, 9, 9, verwerfen=True, grund="reine Tool-Liste")]))
    stats = run_analyze(conn, cfg)
    assert stats["behalten"] == 0 and stats["verworfen"] == 1


def test_idempotenz(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "v1")
    client = FakeClient([_analyse(9, 8, 8)])
    _patch(monkeypatch, client)
    run_analyze(conn, cfg)
    # zweiter Lauf: nichts neu analysieren (Video ist jetzt 'analysiert', nicht 'transkribiert')
    stats2 = run_analyze(conn, cfg)
    assert stats2["analysiert"] == 0
    assert client.aufrufe == 1  # nur ein echter Aufruf insgesamt


def test_budgetdeckel_stoppt(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    for i in range(3):
        _video(conn, f"v{i}")
    cfg.budget.max_llm_kosten_pro_tag_usd = 0.05  # nach dem 1. Aufruf ($0.05) ist 0.05<0.05 falsch → Stopp
    _patch(monkeypatch, FakeClient([_analyse(9, 8, 8)] * 3))
    stats = run_analyze(conn, cfg)
    assert stats["analysiert"] == 1
    assert stats["budget_gestoppt"] is True


def test_max_videos_pro_tag(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    for i in range(3):
        _video(conn, f"v{i}")
    cfg.budget.max_videos_pro_tag = 2
    _patch(monkeypatch, FakeClient([_analyse(9, 8, 8)] * 3))
    stats = run_analyze(conn, cfg)
    assert stats["analysiert"] == 2 and stats["budget_gestoppt"] is True


def test_kuerze_transkript():
    kurz = "abc def"
    assert kuerze_transkript(kurz, 100) == kurz
    lang = " ".join(["wort"] * 5000)
    gek = kuerze_transkript(lang, 1000)
    assert len(gek) < len(lang)
    assert "gekürzt" in gek
