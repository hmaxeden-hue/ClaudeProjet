"""Dünner Wrapper um das Anthropic SDK für strukturierte Outputs.

Wir erzwingen strukturierten JSON-Output über Tool-Use: ein einziges Tool mit
dem Pydantic-JSON-Schema, ``tool_choice`` fest auf dieses Tool. Damit kommt
garantiert valides, schema-konformes JSON zurück statt frei formatiertem Text.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic

from .config import ModelleConfig


@dataclass
class LLMAntwort:
    daten: dict[str, Any]
    input_tokens: int
    output_tokens: int
    modell: str
    kosten_usd: float


def _kosten(modelle: ModelleConfig, modell: str, in_tok: int, out_tok: int) -> float:
    preis = modelle.preise.get(modell)
    if not preis:
        return 0.0
    return in_tok / 1_000_000 * preis.input_pro_1m + out_tok / 1_000_000 * preis.output_pro_1m


class AnthropicClient:
    def __init__(self, api_key: str, modelle: ModelleConfig):
        self._client = Anthropic(api_key=api_key)
        self._modelle = modelle

    def strukturiert(
        self,
        *,
        modell: str,
        system: str,
        user: str,
        tool_name: str,
        tool_beschreibung: str,
        schema: dict[str, Any],
        max_tokens: int = 2000,
    ) -> LLMAntwort:
        """Ein Aufruf mit erzwungenem strukturiertem Output.

        Gibt die geparsten Tool-Eingaben (dict) plus Token-/Kostenmetadaten zurück.
        """
        resp = self._client.messages.create(
            model=modell,
            max_tokens=max_tokens,
            system=system,
            tools=[
                {
                    "name": tool_name,
                    "description": tool_beschreibung,
                    "input_schema": schema,
                }
            ],
            tool_choice={"type": "tool", "name": tool_name},
            messages=[{"role": "user", "content": user}],
        )

        daten: dict[str, Any] = {}
        for block in resp.content:
            if getattr(block, "type", None) == "tool_use":
                daten = dict(block.input)
                break

        in_tok = resp.usage.input_tokens
        out_tok = resp.usage.output_tokens
        return LLMAntwort(
            daten=daten,
            input_tokens=in_tok,
            output_tokens=out_tok,
            modell=modell,
            kosten_usd=_kosten(self._modelle, modell, in_tok, out_tok),
        )
