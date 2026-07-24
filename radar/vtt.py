"""VTT-Parser: WebVTT-Untertitel → sauberer Fliesstext.

YouTube-Auto-Subs sind besonders redundant: jede Cue wiederholt oft die
vorherige Zeile plus ein neues Wort (rollende Untertitel), und sie enthalten
Inline-Timing-Tags (``<00:00:01.000>``) sowie Positions-/Style-Attribute.
Dieser Parser entfernt Timestamps, Tags und Duplikate und erzeugt lesbaren
Fliesstext.
"""

from __future__ import annotations

import re

_ZEIT_RE = re.compile(
    r"^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}"
)
_INLINE_TAG_RE = re.compile(r"<[^>]+>")          # <00:00:01.000>, <c>, </c>
_HTML_ENTITY = {
    "&nbsp;": " ",
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&#39;": "'",
    "&quot;": '"',
}


def _entferne_entities(s: str) -> str:
    for k, v in _HTML_ENTITY.items():
        s = s.replace(k, v)
    return s


def parse_vtt(vtt: str) -> str:
    """Parst WebVTT-Text zu bereinigtem Fliesstext."""
    zeilen = vtt.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    text_zeilen: list[str] = []

    # Alles vor der ersten Cue-Zeitmarke ist Header (WEBVTT, Kind:, Language: …)
    # und wird verworfen. Inhalt steht in WebVTT immer nur innerhalb von Cues.
    im_body = False

    for roh in zeilen:
        zeile = roh.strip()
        if not zeile:
            continue
        if _ZEIT_RE.match(zeile):
            im_body = True
            continue
        if not im_body:
            continue
        if zeile.startswith(("NOTE", "STYLE", "REGION")):
            continue
        # reine Cue-Nummern (nur Ziffern)
        if zeile.isdigit():
            continue
        # Inline-Timing-Tags und Style-Tags entfernen
        zeile = _INLINE_TAG_RE.sub("", zeile)
        zeile = _entferne_entities(zeile).strip()
        if zeile:
            text_zeilen.append(zeile)

    return _dedupe_zu_fliesstext(text_zeilen)


def _dedupe_zu_fliesstext(zeilen: list[str]) -> str:
    """Entfernt aufeinanderfolgende Duplikate und rollende Teilwiederholungen."""
    ergebnis: list[str] = []
    vorherige = ""
    for z in zeilen:
        if z == vorherige:
            continue
        # Rollende Untertitel: neue Zeile ist Präfix-Erweiterung der vorherigen
        # oder die vorherige ist Präfix der neuen → nur die längere behalten.
        if vorherige and z.startswith(vorherige):
            # neue Zeile enthält die alte komplett → alte durch neue ersetzen
            if ergebnis:
                ergebnis[-1] = z
            else:
                ergebnis.append(z)
            vorherige = z
            continue
        if vorherige and vorherige.startswith(z):
            # neue Zeile ist Teilmenge der alten → überspringen
            continue
        ergebnis.append(z)
        vorherige = z

    text = " ".join(ergebnis)
    # Mehrfach-Whitespace glätten
    text = re.sub(r"\s+", " ", text).strip()
    return text
