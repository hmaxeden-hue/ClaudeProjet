"""Vorfilter — billig, laufen VOR jedem LLM-Aufruf.

Reine Funktionen ohne DB-Zugriff, damit sie isoliert testbar sind. Die
Dedup-Prüfung (bereits verarbeitet) macht discovery selbst gegen die DB.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone

from .config import FilterConfig
from .youtube_api import VideoMeta


@dataclass
class FilterErgebnis:
    behalten: bool
    grund: str = ""


def _parse_iso(ts: str) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def _titel_blockiert(titel: str, patterns: list[str]) -> str | None:
    for p in patterns:
        try:
            if re.search(p, titel):
                return p
        except re.error:
            # Ungültiges Pattern nicht den Lauf killen lassen
            continue
    return None


def _sprache_ok(meta: VideoMeta, erlaubte: list[str]) -> bool:
    if not meta.sprache:
        return True  # unbekannt → nicht hier aussortieren (Transkript entscheidet)
    kurz = meta.sprache.split("-")[0].lower()
    return kurz in {s.lower() for s in erlaubte}


def vorfilter(
    meta: VideoMeta,
    cfg: FilterConfig,
    *,
    jetzt: datetime | None = None,
) -> FilterErgebnis:
    """Wendet alle billigen Ausschlusskriterien an. Dedup + Kanal-Blocklist
    prüft der Aufrufer (braucht DB bzw. channel_id-Kontext)."""
    jetzt = jetzt or datetime.now(timezone.utc)

    # Alter
    veroeff = _parse_iso(meta.veroeffentlicht_am)
    if veroeff is not None:
        alter_tage = (jetzt - veroeff).total_seconds() / 86400
        if alter_tage > cfg.max_alter_tage:
            return FilterErgebnis(False, f"zu alt ({alter_tage:.1f} Tage)")

    # Dauer
    if meta.dauer_s and meta.dauer_s < cfg.min_dauer_s:
        return FilterErgebnis(False, f"zu kurz ({meta.dauer_s}s)")
    if meta.dauer_s and meta.dauer_s > cfg.max_dauer_s:
        return FilterErgebnis(False, f"zu lang ({meta.dauer_s}s)")

    # Sprache
    if not _sprache_ok(meta, cfg.sprachen):
        return FilterErgebnis(False, f"Sprache {meta.sprache} nicht in {cfg.sprachen}")

    # Titel-Blocklist
    treffer = _titel_blockiert(meta.titel, cfg.titel_blocklist)
    if treffer:
        return FilterErgebnis(False, f"Titel-Blocklist: /{treffer}/")

    # Kanal-Blocklist
    if meta.channel_id and meta.channel_id in set(cfg.kanal_blocklist):
        return FilterErgebnis(False, "Kanal auf Blocklist")

    return FilterErgebnis(True)
