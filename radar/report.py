"""Stufe 5b/6: Report-Synthese & Zustellung.

NOCH NICHT IMPLEMENTIERT — folgt in Checkpoint 5/6.
"""

from __future__ import annotations

import sqlite3

from .config import Config


def run_report(conn: sqlite3.Connection, cfg: Config, *, dry_run: bool = False) -> dict:
    raise NotImplementedError("Stufe 'report' folgt in Checkpoint 5/6.")
