"""Dünner Wrapper um die YouTube Data API v3.

Kapselt nur die vier Endpunkte, die wir brauchen. Der Quota-Verbrauch wird vom
Aufrufer (discovery) über ``quota.buche_yt`` gebucht — dieser Wrapper macht die
reinen Requests und parst das Nötige heraus.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from googleapiclient.discovery import build


# ISO-8601-Dauer (PT#H#M#S) → Sekunden
_DAUER_RE = re.compile(
    r"P(?:(?P<d>\d+)D)?T(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?"
)


def iso_dauer_zu_sekunden(iso: str) -> int:
    m = _DAUER_RE.fullmatch(iso or "")
    if not m:
        return 0
    d = int(m.group("d") or 0)
    h = int(m.group("h") or 0)
    mi = int(m.group("m") or 0)
    s = int(m.group("s") or 0)
    return d * 86400 + h * 3600 + mi * 60 + s


@dataclass
class VideoMeta:
    video_id: str
    titel: str
    channel_id: str
    kanal_name: str
    veroeffentlicht_am: str  # ISO
    dauer_s: int = 0
    views: int | None = None
    sprache: str | None = None
    beschreibung: str = ""


class YouTubeClient:
    def __init__(self, api_key: str):
        # static_discovery=True nutzt das mit der Bibliothek gelieferte
        # API-Beschreibungsdokument, statt es aus dem Netz zu laden. Das
        # vermeidet den Fehler "UnknownApiNameOrVersion: name: youtube version: v3",
        # der auftritt, wenn der Netz-Abruf des Discovery-Dokuments scheitert.
        self._svc = build(
            "youtube", "v3",
            developerKey=api_key,
            cache_discovery=False,
            static_discovery=True,
        )

    # --- Kanal-Auflösung -------------------------------------------------
    def resolve_channel(
        self, *, handle: str | None = None, channel_id: str | None = None
    ) -> tuple[str, str, str] | None:
        """Löst einen Kanal auf → (channel_id, name, uploads_playlist_id).

        Verbraucht 1 channels.list-Einheit. Gibt None zurück, wenn nichts gefunden.
        """
        params: dict = {"part": "snippet,contentDetails"}
        if channel_id:
            params["id"] = channel_id
        elif handle:
            params["forHandle"] = handle.lstrip("@")
        else:
            return None

        resp = self._svc.channels().list(**params).execute()
        items = resp.get("items", [])
        if not items:
            return None
        item = items[0]
        cid = item["id"]
        name = item["snippet"]["title"]
        uploads = item["contentDetails"]["relatedPlaylists"]["uploads"]
        return cid, name, uploads

    # --- Neue Videos einer Uploads-Playlist ------------------------------
    def neueste_playlist_videos(
        self, uploads_playlist_id: str, *, max_results: int = 15
    ) -> list[tuple[str, str]]:
        """Gibt [(video_id, veroeffentlicht_am_iso)] der neuesten Uploads zurück.

        Verbraucht 1 playlistItems.list-Einheit. Titel/Dauer holen wir separat
        via ``videos_details`` (batched), das ist quota-effizienter und liefert
        die tatsächliche Videodauer.
        """
        resp = (
            self._svc.playlistItems()
            .list(
                part="contentDetails",
                playlistId=uploads_playlist_id,
                maxResults=min(max_results, 50),
            )
            .execute()
        )
        out: list[tuple[str, str]] = []
        for it in resp.get("items", []):
            cd = it.get("contentDetails", {})
            vid = cd.get("videoId")
            veroeff = cd.get("videoPublishedAt", "")
            if vid:
                out.append((vid, veroeff))
        return out

    # --- Batch-Details zu Videos -----------------------------------------
    def videos_details(self, video_ids: list[str]) -> list[VideoMeta]:
        """Holt Snippet+Dauer+Views für bis zu 50 Video-IDs (1 Einheit pro Batch)."""
        out: list[VideoMeta] = []
        for i in range(0, len(video_ids), 50):
            batch = video_ids[i : i + 50]
            resp = (
                self._svc.videos()
                .list(part="snippet,contentDetails,statistics", id=",".join(batch))
                .execute()
            )
            for it in resp.get("items", []):
                sn = it.get("snippet", {})
                cd = it.get("contentDetails", {})
                st = it.get("statistics", {})
                out.append(
                    VideoMeta(
                        video_id=it["id"],
                        titel=sn.get("title", ""),
                        channel_id=sn.get("channelId", ""),
                        kanal_name=sn.get("channelTitle", ""),
                        veroeffentlicht_am=sn.get("publishedAt", ""),
                        dauer_s=iso_dauer_zu_sekunden(cd.get("duration", "")),
                        views=int(st["viewCount"]) if "viewCount" in st else None,
                        sprache=sn.get("defaultAudioLanguage")
                        or sn.get("defaultLanguage"),
                        # Beschreibung für die Vorsortierung, gekürzt (Token/Speicher sparen)
                        beschreibung=(sn.get("description") or "")[:800],
                    )
                )
        return out

    # --- Keyword-Suche ---------------------------------------------------
    def suche(
        self, query: str, *, published_after_iso: str, max_results: int = 10
    ) -> list[str]:
        """Suche nach Videos → Liste von video_ids (1 search.list = 100 Einheiten!)."""
        resp = (
            self._svc.search()
            .list(
                part="id",
                q=query,
                type="video",
                order="date",
                publishedAfter=published_after_iso,
                maxResults=min(max_results, 50),
            )
            .execute()
        )
        return [
            it["id"]["videoId"]
            for it in resp.get("items", [])
            if it.get("id", {}).get("videoId")
        ]
