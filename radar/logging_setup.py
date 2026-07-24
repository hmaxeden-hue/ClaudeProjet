"""Logging: strukturierte JSONL-Datei nach logs/ + knappe Konsolenausgabe."""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path


class _JsonlFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        eintrag = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            eintrag["exc"] = self.formatException(record.exc_info)
        # zusätzliche Felder aus extra={...}
        for k, v in record.__dict__.items():
            if k not in _STD_ATTRS and not k.startswith("_"):
                eintrag[k] = v
        return json.dumps(eintrag, ensure_ascii=False)


_STD_ATTRS = set(
    logging.LogRecord("", 0, "", 0, "", None, None).__dict__.keys()
) | {"message", "asctime"}


class _KonsolenFormatter(logging.Formatter):
    FARBEN = {
        "DEBUG": "\033[90m",
        "INFO": "\033[0m",
        "WARNING": "\033[33m",
        "ERROR": "\033[31m",
        "CRITICAL": "\033[41m",
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        zeit = datetime.now().strftime("%H:%M:%S")
        farbe = self.FARBEN.get(record.levelname, "") if sys.stderr.isatty() else ""
        reset = self.RESET if farbe else ""
        return f"{farbe}{zeit} {record.levelname:7} {record.getMessage()}{reset}"


def setup_logging(logs_dir: Path, *, level: int = logging.INFO) -> logging.Logger:
    logs_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("radar")
    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    datei = logging.FileHandler(logs_dir / "radar.jsonl", encoding="utf-8")
    datei.setLevel(logging.DEBUG)
    datei.setFormatter(_JsonlFormatter())
    logger.addHandler(datei)

    konsole = logging.StreamHandler(sys.stderr)
    konsole.setLevel(level)
    konsole.setFormatter(_KonsolenFormatter())
    logger.addHandler(konsole)

    logger.propagate = False
    return logger


def get_logger() -> logging.Logger:
    return logging.getLogger("radar")
