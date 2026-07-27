"""Config-Laden und -Validierung (Pydantic).

Die Konfiguration kommt aus ``config.yaml``; Secrets ausschließlich aus der
Umgebung (``.env`` via python-dotenv). Ein ungültiges Config-File soll früh und
mit klarer Meldung scheitern, nicht erst mitten im Lauf.
"""

from __future__ import annotations

import os
from pathlib import Path

import yaml
from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator, model_validator

# Tier → vertrauens_score. Kanäle können statt eines Scores ein Tier angeben.
TIER_SCORES: dict[str, float] = {"A": 9.0, "B": 6.0, "C": 3.0}


class Kanal(BaseModel):
    handle: str | None = None
    channel_id: str | None = None
    name: str | None = None
    tier: str | None = None
    vertrauens_score: float = 5.0
    aktiv: bool = True

    @field_validator("channel_id", "handle")
    @classmethod
    def _leer_zu_none(cls, v: str | None) -> str | None:
        return v or None

    @model_validator(mode="before")
    @classmethod
    def _tier_und_name(cls, data):
        if isinstance(data, dict):
            tier = data.get("tier")
            # Tier setzt den Score nur, wenn kein expliziter Score angegeben ist.
            if tier and "vertrauens_score" not in data:
                data["vertrauens_score"] = TIER_SCORES.get(str(tier).upper(), 5.0)
            # Name aus Handle ableiten, falls nicht gesetzt (wird beim Auflösen
            # durch den echten Kanaltitel ersetzt).
            if not data.get("name") and data.get("handle"):
                data["name"] = str(data["handle"]).lstrip("@")
        return data


class ScoreGewichte(BaseModel):
    substanz: float = 0.4
    neuheit: float = 0.3
    umsetzbarkeit: float = 0.3


class FilterConfig(BaseModel):
    max_alter_tage: int = 3
    min_dauer_s: int = 240
    max_dauer_s: int = 10800
    sprachen: list[str] = Field(default_factory=lambda: ["de", "en"])
    min_gesamtscore: float = 6.0
    score_gewichte: ScoreGewichte = Field(default_factory=ScoreGewichte)
    titel_blocklist: list[str] = Field(default_factory=list)
    kanal_blocklist: list[str] = Field(default_factory=list)


class BudgetConfig(BaseModel):
    youtube_quota_limit: int = 10000
    quota_warn_schwelle: float = 0.8
    suchen_pro_tag: int = 8
    max_llm_kosten_pro_tag_usd: float = 1.50
    max_videos_pro_tag: int = 40


class TranskripteConfig(BaseModel):
    min_pause_s: float = 2.0
    max_pause_s: float = 4.0
    max_retries: int = 4
    # Untertitel-Sprachen für yt-dlp — bewusst getrennt vom Vorfilter.
    # Nur wenige Sprachen anfragen: jede zusätzliche Sprache verdoppelt die
    # Abrufe und provoziert YouTube-Ratelimits (HTTP 429). Für überwiegend
    # englische Kanäle reicht das Original ["en"].
    sub_langs: list[str] = Field(default_factory=lambda: ["en"])


class ClusteringConfig(BaseModel):
    wiederholung_tage: int = 14


class Preis(BaseModel):
    input_pro_1m: float
    output_pro_1m: float


class ModelleConfig(BaseModel):
    analyse: str = "claude-opus-4-8"
    report: str = "claude-opus-4-8"
    clustering: str = "claude-opus-4-8"
    preise: dict[str, Preis] = Field(default_factory=dict)


class EmailConfig(BaseModel):
    aktiv: bool = False
    betreff: str = "AI-Business Radar — {datum}"


class TelegramConfig(BaseModel):
    aktiv: bool = False


class ZustellungConfig(BaseModel):
    email: EmailConfig = Field(default_factory=EmailConfig)
    telegram: TelegramConfig = Field(default_factory=TelegramConfig)


class RetentionConfig(BaseModel):
    transkripte_tage: int = 30


class PfadeConfig(BaseModel):
    db: str = "data/radar.db"
    reports: str = "reports"
    logs: str = "logs"


class ProfilConfig(BaseModel):
    beschreibung: str = ""


class Config(BaseModel):
    profil: ProfilConfig = Field(default_factory=ProfilConfig)
    modelle: ModelleConfig = Field(default_factory=ModelleConfig)
    kanaele: list[Kanal] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    filter: FilterConfig = Field(default_factory=FilterConfig)
    budget: BudgetConfig = Field(default_factory=BudgetConfig)
    transkripte: TranskripteConfig = Field(default_factory=TranskripteConfig)
    clustering: ClusteringConfig = Field(default_factory=ClusteringConfig)
    zustellung: ZustellungConfig = Field(default_factory=ZustellungConfig)
    retention: RetentionConfig = Field(default_factory=RetentionConfig)
    pfade: PfadeConfig = Field(default_factory=PfadeConfig)

    # Nicht aus YAML, sondern beim Laden aus der Umgebung ergänzt:
    projekt_root: Path = Field(default=Path("."), exclude=True)

    # --- abgeleitete, absolute Pfade -------------------------------------
    @property
    def db_pfad(self) -> Path:
        return self._resolve(self.pfade.db)

    @property
    def reports_pfad(self) -> Path:
        return self._resolve(self.pfade.reports)

    @property
    def logs_pfad(self) -> Path:
        return self._resolve(self.pfade.logs)

    def _resolve(self, p: str) -> Path:
        pfad = Path(p)
        return pfad if pfad.is_absolute() else self.projekt_root / pfad


def lade_config(pfad: str | os.PathLike[str] | None = None) -> Config:
    """Lädt und validiert config.yaml und lädt .env in die Umgebung."""
    root = _projekt_root()
    load_dotenv(root / ".env")

    cfg_pfad = Path(pfad) if pfad else root / "config.yaml"
    if not cfg_pfad.exists():
        raise FileNotFoundError(
            f"config.yaml nicht gefunden unter {cfg_pfad}. "
            "Lege sie an (Vorlage im Repo) oder gib --config an."
        )

    with cfg_pfad.open("r", encoding="utf-8") as fh:
        roh = yaml.safe_load(fh) or {}

    cfg = Config.model_validate(roh)
    cfg.projekt_root = root
    return cfg


def _projekt_root() -> Path:
    """Projekt-Wurzel = Verzeichnis, das dieses Paket enthält (eine Ebene über radar/)."""
    return Path(__file__).resolve().parent.parent


# --- Secret-Zugriff (nur aus der Umgebung) --------------------------------
def secret(name: str, *, pflicht: bool = True) -> str:
    val = os.environ.get(name, "")
    if pflicht and not val:
        raise RuntimeError(
            f"Umgebungsvariable {name} fehlt. Trage sie in .env ein "
            "(Vorlage: .env.example)."
        )
    return val
