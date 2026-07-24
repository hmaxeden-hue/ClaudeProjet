"""Stufe 4: LLM-Analyse pro Video.

NOCH NICHT IMPLEMENTIERT — dies ist der Qualitätskern (Checkpoint 4). Wird nach
Review des Fundaments (Etappen 1-3) gebaut und der Analyse-Prompt an echten
Videos getestet.
"""

from __future__ import annotations

import sqlite3

from .config import Config


def run_analyze(conn: sqlite3.Connection, cfg: Config, *, dry_run: bool = False) -> dict:
    raise NotImplementedError(
        "Stufe 'analyze' folgt in Checkpoint 4 (Analyse-Prompt). "
        "Fundament (discover/fetch) ist einsatzbereit."
    )
