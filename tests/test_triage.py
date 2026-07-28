"""Offline-Tests der Vorsortierung (Triage) mit gemocktem Haiku-Client."""

from pathlib import Path

import pytest

from radar import triage as triage_mod
from radar.anthropic_client import LLMAntwort
from radar.config import lade_config
from radar.db import jetzt_iso, migriere, verbinde
from radar.triage import run_triage

MIGRATIONS = Path(__file__).resolve().parent.parent / "migrations"


def _db(tmp_path):
    conn = verbinde(tmp_path / "t.db")
    migriere(conn, MIGRATIONS)
    return conn


def _video(conn, vid, titel="Titel", besch="Beschreibung"):
    conn.execute(
        "INSERT INTO videos (video_id, kanal_name, titel, beschreibung, url, "
        "veroeffentlicht_am, dauer_s, status, entdeckt_am) "
        "VALUES (?,?,?,?,?,?,?, 'entdeckt', ?)",
        (vid, "Kanal", titel, besch, f"u/{vid}", "2026-07-28T08:00:00+00:00", 900, jetzt_iso()),
    )
    conn.commit()


class FakeClient:
    def __init__(self, scores: dict[str, float]):
        self._scores = scores
        self.aufrufe = 0

    def strukturiert(self, **kw):
        self.aufrufe += 1
        daten = {"bewertungen": [{"video_id": v, "score": s} for v, s in self._scores.items()]}
        return LLMAntwort(daten=daten, input_tokens=300, output_tokens=80,
                          modell="claude-haiku-4-5", kosten_usd=0.001)


@pytest.fixture
def cfg():
    return lade_config()


def _patch(monkeypatch, client):
    monkeypatch.setattr(triage_mod, "secret", lambda n: "k")
    monkeypatch.setattr(triage_mod, "AnthropicClient", lambda *a, **k: client)


def _status(conn, vid):
    return conn.execute("SELECT status FROM videos WHERE video_id=?", (vid,)).fetchone()["status"]


def test_sortiert_muell_aus_behaelt_gute(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "gut"); _video(conn, "muell")
    _patch(monkeypatch, FakeClient({"gut": 8.0, "muell": 1.0}))
    stats = run_triage(conn, cfg)
    assert stats["behalten"] == 1 and stats["aussortiert"] == 1
    assert _status(conn, "gut") == "entdeckt"
    assert _status(conn, "muell") == "triage_out"


def test_fehlende_bewertung_wird_behalten(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "a")
    _patch(monkeypatch, FakeClient({}))  # Modell liefert keine Bewertung
    run_triage(conn, cfg)
    assert _status(conn, "a") == "entdeckt"  # im Zweifel behalten


def test_deaktiviert_ueberspringt(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "a")
    cfg.triage.aktiv = False
    client = FakeClient({"a": 0.0})
    _patch(monkeypatch, client)
    stats = run_triage(conn, cfg)
    assert stats["geprueft"] == 0 and client.aufrufe == 0
    assert _status(conn, "a") == "entdeckt"


def test_grenze_am_schwellwert(tmp_path, monkeypatch, cfg):
    conn = _db(tmp_path)
    _video(conn, "grenze")
    cfg.triage.min_score = 4.0
    _patch(monkeypatch, FakeClient({"grenze": 4.0}))  # == min_score → behalten
    run_triage(conn, cfg)
    assert _status(conn, "grenze") == "entdeckt"
