"""Stufe 5a: Themen-Clustering & Wiederholungserkennung (LLM-basiert).

NOCH NICHT IMPLEMENTIERT — folgt in Checkpoint 5.
"""

from __future__ import annotations

import sqlite3

from .config import Config


def run_cluster(conn: sqlite3.Connection, cfg: Config) -> dict:
    raise NotImplementedError("Stufe 'cluster' folgt in Checkpoint 5.")
