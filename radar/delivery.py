"""Zustellung: optionaler Versand des Berichts per E-Mail (SMTP) oder Telegram.

Die Datei wird immer geschrieben (das macht report.py). Hier nur der optionale
Versand, gated per config.yaml und mit Secrets aus der Umgebung. Ein
fehlgeschlagener Versand darf den Lauf nicht abbrechen — er wird geloggt.
"""

from __future__ import annotations

import os
import smtplib
import ssl
import urllib.parse
import urllib.request
from email.message import EmailMessage

from .config import Config
from .logging_setup import get_logger

log = get_logger()


def _sende_email(betreff: str, inhalt: str) -> None:
    host = os.environ.get("SMTP_HOST", "")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    passwort = os.environ.get("SMTP_PASSWORD", "")
    absender = os.environ.get("SMTP_FROM", user)
    empfaenger = os.environ.get("SMTP_TO", "")
    if not (host and empfaenger):
        raise RuntimeError("SMTP_HOST/SMTP_TO fehlen in .env")

    msg = EmailMessage()
    msg["Subject"] = betreff
    msg["From"] = absender
    msg["To"] = empfaenger
    msg.set_content(inhalt)

    ctx = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=30) as s:
        s.starttls(context=ctx)
        if user:
            s.login(user, passwort)
        s.send_message(msg)


def _sende_telegram(text: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "")
    if not (token and chat_id):
        raise RuntimeError("TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID fehlen in .env")

    # Telegram-Nachrichten sind auf 4096 Zeichen begrenzt.
    text = text[:4000]
    daten = urllib.parse.urlencode(
        {"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"}
    ).encode()
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    req = urllib.request.Request(url, data=daten)
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
        resp.read()


def zustellen(cfg: Config, *, datum: str, markdown: str) -> dict:
    """Versendet den Bericht über alle aktivierten Kanäle. Gibt Status je Kanal zurück."""
    status: dict[str, str] = {}

    if cfg.zustellung.email.aktiv:
        try:
            betreff = cfg.zustellung.email.betreff.format(datum=datum)
            _sende_email(betreff, markdown)
            status["email"] = "gesendet"
            log.info("E-Mail versendet.")
        except Exception as e:  # noqa: BLE001
            status["email"] = f"fehler: {e}"
            log.warning("E-Mail-Versand fehlgeschlagen: %s", e)

    if cfg.zustellung.telegram.aktiv:
        try:
            _sende_telegram(markdown)
            status["telegram"] = "gesendet"
            log.info("Telegram versendet.")
        except Exception as e:  # noqa: BLE001
            status["telegram"] = f"fehler: {e}"
            log.warning("Telegram-Versand fehlgeschlagen: %s", e)

    return status
