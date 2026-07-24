"""Strukturierte Datenmodelle für LLM-Outputs.

Diese Schemata definieren exakt, was das Modell zurückgeben muss. Sie werden
sowohl zur Validierung als auch zur Erzeugung des JSON-Schemas im Prompt
genutzt (Stufe 4/5).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class GenanntesTool(BaseModel):
    name: str
    kontext: str = ""


class VideoAnalyse(BaseModel):
    """Ergebnis der Einzelvideo-Analyse (Stufe 4)."""

    kernaussage: str = Field(description="max. 2 Sätze")
    konkrete_erkenntnisse: list[str] = Field(
        default_factory=list,
        description="nur substanzielle Punkte, keine Allgemeinplätze",
    )
    genannte_tools: list[GenanntesTool] = Field(default_factory=list)
    geschaeftsmodell_relevanz: str = Field(
        default="",
        description="was daraus für ein eigenes Produkt/Business folgt",
    )
    substanz_score: float = Field(ge=0, le=10)
    neuheits_score: float = Field(ge=0, le=10)
    umsetzbarkeit_score: float = Field(ge=0, le=10)
    hype_flags: list[str] = Field(default_factory=list)
    verwerfen: bool
    verwerfen_grund: str = ""


class TopicZuordnung(BaseModel):
    """Ein Cluster aus der Themenerkennung (Stufe 5)."""

    label: str
    video_ids: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    ist_update: bool = False
    update_zu_topic_id: int | None = None
    neue_information: str = ""


class ClusterErgebnis(BaseModel):
    topics: list[TopicZuordnung] = Field(default_factory=list)
