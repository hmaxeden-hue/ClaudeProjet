"""Lokales Dashboard: eine private Seite auf 127.0.0.1 zum Ansehen der Berichte
und zum Starten eines Laufs per Knopfdruck.

Bewusst nur an localhost gebunden — die Seite ist ausschließlich auf dem eigenen
Rechner erreichbar, nicht im Netzwerk. Kein Framework, nur die Python-Standard-
bibliothek plus ``markdown`` für die Berichtsdarstellung.
"""

from __future__ import annotations

import json
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import markdown as md

from .config import Config, lade_config, secret
from .db import heute_iso, migriere, verbinde
from .logging_setup import get_logger

log = get_logger()

# --- geteilter Lauf-Zustand -----------------------------------------------
_LOCK = threading.Lock()
_STATE: dict = {
    "status": "idle",          # idle | running | done | error
    "schritt": "",
    "log": [],
    "gestartet": None,
    "beendet": None,
    "letzter_bericht": None,
    "fehler": None,
}


def _set(**felder) -> None:
    with _LOCK:
        _STATE.update(felder)


def _log(zeile: str) -> None:
    with _LOCK:
        _STATE["log"].append(f"{datetime.now().strftime('%H:%M:%S')}  {zeile}")
        _STATE["log"] = _STATE["log"][-40:]


def _snapshot() -> dict:
    with _LOCK:
        return json.loads(json.dumps(_STATE))


# --- Pipeline im Hintergrund ----------------------------------------------
def _lauf(cfg: Config) -> None:
    from .analyze import run_analyze
    from .cluster import run_cluster
    from .discovery import run_discover
    from .report import run_report
    from .retention import run_retention
    from .transcripts import run_fetch

    conn = verbinde(cfg.db_pfad)
    migriere(conn, cfg.projekt_root / "migrations")
    try:
        _set(status="running", schritt="Suche neue Videos …", fehler=None, beendet=None)
        _log("Suche neue Videos in deinen Kanälen …")
        s = run_discover(conn, cfg, secret("YOUTUBE_API_KEY"))
        _log(f"{s['neu_kanal'] + s['neu_suche']} neue Videos, {s['vorgefiltert']} direkt aussortiert.")

        _set(schritt="Hole Transkripte …")
        _log("Hole Untertitel (mit Pausen, das dauert etwas) …")
        s = run_fetch(conn, cfg)
        _log(f"{s['transkribiert']} Transkripte geladen, {s['kein_transkript']} ohne, {s['fehler']} Fehler.")

        _set(schritt="Analysiere Videos …")
        _log("KI-Substanzanalyse pro Video …")
        s = run_analyze(conn, cfg)
        _log(f"{s['behalten']} behalten, {s['verworfen']} verworfen, ${s['kosten_usd']:.4f} Kosten.")

        _set(schritt="Erstelle Bericht …")
        _log("Themen clustern und Tagesbericht schreiben …")
        _stats, erg = run_cluster(conn, cfg)
        s = run_report(conn, cfg, dry_run=True, cluster_ergebnis=erg)
        _log(f"Bericht fertig: {s['relevant']} relevant von {s['gescannt']} gescannt.")

        try:
            run_retention(conn, cfg)
        except Exception:  # noqa: BLE001
            pass

        _set(status="done", schritt="Fertig!", letzter_bericht=heute_iso(),
             beendet=datetime.now().isoformat())
        _log("✓ Alles fertig.")
    except Exception as e:  # noqa: BLE001 — Fehler im Dashboard sichtbar machen
        log.exception("Dashboard-Lauf fehlgeschlagen")
        _set(status="error", schritt="Fehler", fehler=str(e),
             beendet=datetime.now().isoformat())
        _log(f"✗ Fehler: {e}")
    finally:
        conn.close()


def _starte_lauf(cfg: Config) -> bool:
    with _LOCK:
        if _STATE["status"] == "running":
            return False
        _STATE["log"] = []
        _STATE["gestartet"] = datetime.now().isoformat()
        _STATE["status"] = "running"
    threading.Thread(target=_lauf, args=(cfg,), daemon=True).start()
    return True


def _heutiger_bericht_existiert(cfg: Config) -> bool:
    return (cfg.reports_pfad / f"{heute_iso()}.md").exists()


# merkt sich, an welchem Datum der Auto-Lauf zuletzt ausgelöst wurde
_LETZTER_AUTO_TAG: str | None = None


def _auto_scheduler(cfg: Config) -> None:
    """Startet höchstens einmal pro Tag automatisch einen Lauf, sobald die
    eingestellte Stunde erreicht ist und noch kein heutiger Bericht existiert.
    Holt einen verpassten Lauf nach (z. B. wenn der Mac morgens noch schlief);
    ein fehlgeschlagener Lauf wird am selben Tag nicht endlos wiederholt."""
    global _LETZTER_AUTO_TAG
    while True:
        try:
            heute = heute_iso()
            if (
                cfg.dashboard.auto_run
                and datetime.now().hour >= cfg.dashboard.auto_run_stunde
                and _LETZTER_AUTO_TAG != heute
                and not _heutiger_bericht_existiert(cfg)
                and _snapshot()["status"] != "running"
            ):
                _LETZTER_AUTO_TAG = heute
                _log("Automatischer Tageslauf gestartet.")
                _starte_lauf(cfg)
        except Exception:  # noqa: BLE001 — Scheduler darf nie sterben
            log.exception("Auto-Scheduler-Fehler")
        time.sleep(300)  # alle 5 Minuten prüfen


# --- Berichte lesen -------------------------------------------------------
def _bericht_daten(cfg: Config) -> list[str]:
    d = cfg.reports_pfad
    if not d.exists():
        return []
    return sorted((p.stem for p in d.glob("*.md")), reverse=True)


def _bericht_html(cfg: Config, datum: str) -> str | None:
    # Datum validieren (nur YYYY-MM-DD), um Pfad-Tricks auszuschließen
    try:
        datetime.strptime(datum, "%Y-%m-%d")
    except ValueError:
        return None
    pfad = cfg.reports_pfad / f"{datum}.md"
    if not pfad.exists():
        return None
    text = pfad.read_text(encoding="utf-8")
    return md.markdown(text, extensions=["extra", "sane_lists"])


# --- HTTP-Handler ---------------------------------------------------------
class _Handler(BaseHTTPRequestHandler):
    cfg: Config  # per Klassenattribut gesetzt

    def log_message(self, *args) -> None:  # Konsole ruhig halten
        pass

    def _send(self, code: int, body: bytes, content_type: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, obj: dict, code: int = 200) -> None:
        self._send(code, json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802
        pfad = urlparse(self.path)
        route = pfad.path
        if route == "/":
            self._send(200, SEITE.encode("utf-8"), "text/html; charset=utf-8")
        elif route == "/api/status":
            self._json(_snapshot())
        elif route == "/api/reports":
            self._json({"daten": _bericht_daten(self.cfg)})
        elif route == "/api/report":
            q = parse_qs(pfad.query)
            datum = (q.get("datum") or [""])[0]
            html = _bericht_html(self.cfg, datum)
            if html is None:
                self._json({"fehler": "Kein Bericht für dieses Datum."}, 404)
            else:
                self._json({"datum": datum, "html": html})
        else:
            self._send(404, b"not found", "text/plain")

    def do_POST(self) -> None:  # noqa: N802
        if urlparse(self.path).path == "/api/run":
            gestartet = _starte_lauf(self.cfg)
            self._json({"gestartet": gestartet, "status": _snapshot()["status"]})
        else:
            self._send(404, b"not found", "text/plain")


def run_dashboard(
    cfg: Config,
    *,
    host: str = "127.0.0.1",
    port: int | None = None,
    open_browser: bool = True,
) -> None:
    port = port or cfg.dashboard.port
    _Handler.cfg = cfg
    server = ThreadingHTTPServer((host, port), _Handler)
    url = f"http://{host}:{port}"
    print("\n  AI-Business Radar — Dashboard läuft.")
    print(f"  Öffne im Browser:  {url}")
    if cfg.dashboard.auto_run:
        print(f"  Automatischer Tageslauf ab {cfg.dashboard.auto_run_stunde:02d}:00 Uhr.")
    print("  Beenden mit  Strg+C\n")

    # Automatischen Tageslauf im Hintergrund starten
    threading.Thread(target=_auto_scheduler, args=(cfg,), daemon=True).start()

    # Browser automatisch öffnen (nur interaktiv, nicht als Hintergrunddienst)
    if open_browser:
        try:
            import webbrowser

            webbrowser.open(url)
        except Exception:  # noqa: BLE001
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Dashboard beendet.")
    finally:
        server.server_close()


# --- Die Seite (eine Datei, Inline-CSS/JS) --------------------------------
SEITE = """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI-Business Radar</title>
<style>
  :root {
    --bg:#f6f7f9; --panel:#fff; --ink:#1a1d24; --muted:#6b7280;
    --line:#e5e7eb; --accent:#2563eb; --accent-ink:#fff;
    --good:#059669; --bad:#dc2626;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1115; --panel:#171a21; --ink:#e7e9ee; --muted:#9aa3b2;
      --line:#262b35; --accent:#3b82f6; }
  }
  * { box-sizing:border-box; }
  body { margin:0; font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
    background:var(--bg); color:var(--ink); }
  header { padding:20px 24px; border-bottom:1px solid var(--line);
    display:flex; align-items:center; gap:14px; background:var(--panel); position:sticky; top:0; z-index:5; }
  header h1 { font-size:19px; margin:0; font-weight:650; }
  header .tag { color:var(--muted); font-size:13px; }
  .wrap { display:flex; gap:24px; max-width:1100px; margin:24px auto; padding:0 24px; }
  aside { width:210px; flex:none; }
  main { flex:1; min-width:0; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; }
  .runbox { padding:20px; margin-bottom:20px; }
  button#run { width:100%; padding:15px 18px; font-size:17px; font-weight:600;
    color:var(--accent-ink); background:var(--accent); border:none; border-radius:10px;
    cursor:pointer; transition:filter .15s; }
  button#run:hover { filter:brightness(1.07); }
  button#run:disabled { opacity:.55; cursor:default; }
  .status { margin-top:14px; font-size:14px; color:var(--muted); min-height:20px; }
  .spinner { display:inline-block; width:13px; height:13px; margin-right:7px; vertical-align:-2px;
    border:2px solid var(--line); border-top-color:var(--accent); border-radius:50%;
    animation:spin .7s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .log { margin-top:12px; font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:var(--muted); max-height:170px; overflow:auto; white-space:pre-wrap; }
  aside h2 { font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:var(--muted);
    margin:0 0 10px 4px; }
  .datelist { list-style:none; margin:0; padding:0; }
  .datelist li { margin-bottom:4px; }
  .datelist a { display:block; padding:9px 12px; border-radius:9px; text-decoration:none;
    color:var(--ink); font-size:14px; }
  .datelist a:hover { background:var(--bg); }
  .datelist a.active { background:var(--accent); color:var(--accent-ink); }
  .report { padding:8px 30px 30px; }
  .report h1 { font-size:26px; margin:22px 0 6px; }
  .report h2 { font-size:19px; margin:26px 0 8px; padding-top:14px; border-top:1px solid var(--line); }
  .report h3 { font-size:16px; margin:18px 0 4px; }
  .report a { color:var(--accent); }
  .report ul { padding-left:22px; }
  .report li { margin:4px 0; }
  .empty { padding:60px 24px; text-align:center; color:var(--muted); }
  @media (max-width:720px){ .wrap{flex-direction:column;} aside{width:auto;} }
</style>
</head>
<body>
<header>
  <span style="font-size:22px">📡</span>
  <h1>AI-Business Radar</h1>
  <span class="tag">dein privates Dashboard</span>
</header>
<div class="wrap">
  <aside>
    <div class="card runbox">
      <button id="run">Heute analysieren</button>
      <div class="status" id="status"></div>
      <div class="log" id="log"></div>
    </div>
    <h2>Berichte</h2>
    <ul class="datelist" id="dates"></ul>
  </aside>
  <main>
    <div class="card report" id="report">
      <div class="empty">Wähle links einen Bericht — oder starte oben eine neue Analyse.</div>
    </div>
  </main>
</div>
<script>
let aktuellesDatum = null;
let pollTimer = null;

async function ladeDaten() {
  const r = await fetch('/api/reports'); const d = await r.json();
  const ul = document.getElementById('dates'); ul.innerHTML = '';
  if (!d.daten.length) { ul.innerHTML = '<li style="color:var(--muted);padding:6px 12px;font-size:13px">Noch keine Berichte.</li>'; return; }
  for (const datum of d.daten) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.textContent = datum; a.href = '#'; a.dataset.datum = datum;
    if (datum === aktuellesDatum) a.className = 'active';
    a.onclick = (e) => { e.preventDefault(); zeigeBericht(datum); };
    li.appendChild(a); ul.appendChild(li);
  }
}

async function zeigeBericht(datum) {
  aktuellesDatum = datum;
  document.querySelectorAll('.datelist a').forEach(a =>
    a.classList.toggle('active', a.dataset.datum === datum));
  const r = await fetch('/api/report?datum=' + encodeURIComponent(datum));
  const box = document.getElementById('report');
  if (!r.ok) { box.innerHTML = '<div class="empty">Bericht nicht gefunden.</div>'; return; }
  const d = await r.json();
  box.innerHTML = d.html;
}

function renderStatus(s) {
  const el = document.getElementById('status');
  const btn = document.getElementById('run');
  const laufend = s.status === 'running';
  btn.disabled = laufend;
  btn.textContent = laufend ? 'läuft …' : 'Heute analysieren';
  if (laufend) el.innerHTML = '<span class="spinner"></span>' + (s.schritt || 'läuft …');
  else if (s.status === 'error') el.innerHTML = '<span style="color:var(--bad)">✗ ' + (s.fehler || 'Fehler') + '</span>';
  else if (s.status === 'done') el.innerHTML = '<span style="color:var(--good)">✓ Fertig</span>';
  else el.textContent = '';
  document.getElementById('log').textContent = (s.log || []).join('\\n');
}

async function pollStatus() {
  const r = await fetch('/api/status'); const s = await r.json();
  renderStatus(s);
  if (s.status === 'running') {
    if (!pollTimer) pollTimer = setInterval(pollStatus, 1500);
  } else {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (s.status === 'done' && s.letzter_bericht) {
      await ladeDaten(); await zeigeBericht(s.letzter_bericht);
    }
  }
}

document.getElementById('run').onclick = async () => {
  await fetch('/api/run', { method: 'POST' });
  renderStatus({ status: 'running', schritt: 'Starte …', log: [] });
  pollStatus();
};

// Initial: neuesten Bericht anzeigen, Status prüfen
(async () => {
  const r = await fetch('/api/reports'); const d = await r.json();
  await ladeDaten();
  if (d.daten.length) await zeigeBericht(d.daten[0]);
  pollStatus();
})();
</script>
</body>
</html>
"""
