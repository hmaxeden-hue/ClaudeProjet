from datetime import datetime, timedelta, timezone

from radar.config import FilterConfig
from radar.youtube_api import VideoMeta, iso_dauer_zu_sekunden

from radar.filters import vorfilter

JETZT = datetime(2026, 7, 24, 12, 0, tzinfo=timezone.utc)


def _meta(**kw) -> VideoMeta:
    basis = dict(
        video_id="abc",
        titel="Wie ich mit AI-Agenten einen SaaS baute",
        channel_id="UC123",
        kanal_name="Test",
        veroeffentlicht_am=(JETZT - timedelta(hours=5)).isoformat(),
        dauer_s=900,
        views=1000,
        sprache="en",
    )
    basis.update(kw)
    return VideoMeta(**basis)


def _cfg(**kw) -> FilterConfig:
    return FilterConfig(**kw)


def test_behaelt_normales_video():
    assert vorfilter(_meta(), _cfg(), jetzt=JETZT).behalten


def test_zu_alt():
    m = _meta(veroeffentlicht_am=(JETZT - timedelta(days=5)).isoformat())
    erg = vorfilter(m, _cfg(max_alter_tage=3), jetzt=JETZT)
    assert not erg.behalten and "alt" in erg.grund


def test_zu_kurz():
    erg = vorfilter(_meta(dauer_s=100), _cfg(), jetzt=JETZT)
    assert not erg.behalten and "kurz" in erg.grund


def test_zu_lang():
    erg = vorfilter(_meta(dauer_s=20000), _cfg(), jetzt=JETZT)
    assert not erg.behalten and "lang" in erg.grund


def test_falsche_sprache():
    erg = vorfilter(_meta(sprache="fr"), _cfg(), jetzt=JETZT)
    assert not erg.behalten


def test_unbekannte_sprache_wird_durchgelassen():
    assert vorfilter(_meta(sprache=None), _cfg(), jetzt=JETZT).behalten


def test_titel_blocklist():
    m = _meta(titel="How I make $5k/month with passive income")
    cfg = _cfg(titel_blocklist=[r"\$\s*\d+k?\s*/?\s*(month|day)", r"(?i)passive income"])
    erg = vorfilter(m, cfg, jetzt=JETZT)
    assert not erg.behalten and "Blocklist" in erg.grund


def test_kanal_blocklist():
    erg = vorfilter(_meta(channel_id="UCbad"), _cfg(kanal_blocklist=["UCbad"]), jetzt=JETZT)
    assert not erg.behalten


def test_iso_dauer():
    assert iso_dauer_zu_sekunden("PT1H2M3S") == 3723
    assert iso_dauer_zu_sekunden("PT15M") == 900
    assert iso_dauer_zu_sekunden("PT45S") == 45
    assert iso_dauer_zu_sekunden("") == 0
