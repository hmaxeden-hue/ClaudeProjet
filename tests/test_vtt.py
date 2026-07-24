from radar.vtt import parse_vtt

ROLLENDE_SUBS = """WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000
hello and welcome

00:00:02.000 --> 00:00:04.000
hello and welcome to this

00:00:04.000 --> 00:00:06.000
hello and welcome to this video

00:00:06.000 --> 00:00:08.000
<c>today</c> we build <00:00:07.000>something
"""


def test_entfernt_timestamps_und_header():
    text = parse_vtt(ROLLENDE_SUBS)
    assert "-->" not in text
    assert "WEBVTT" not in text
    assert "Kind:" not in text


def test_entfernt_inline_tags():
    text = parse_vtt(ROLLENDE_SUBS)
    assert "<c>" not in text
    assert "<00:00:07.000>" not in text
    assert "today" in text


def test_rollende_subs_werden_dedupliziert():
    text = parse_vtt(ROLLENDE_SUBS)
    # "hello and welcome" darf nicht dreimal stehen
    assert text.count("hello and welcome to this video") == 1
    assert text.count("hello and welcome to this ") == 0 or "video" in text


def test_leerer_input():
    assert parse_vtt("") == ""
    assert parse_vtt("WEBVTT\n\n") == ""
