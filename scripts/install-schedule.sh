#!/usr/bin/env bash
#
# install-schedule.sh — richtet einen macOS-launchd-Job ein, der
# `radar run` werktags (Mo-Fr) um 07:00 Uhr ausführt.
#
# launchd-Verhalten: Ist der Rechner zur geplanten Zeit im Ruhezustand, holt
# launchd den Lauf beim Aufwachen nach (StartCalendarInterval). Genau das,
# was wir wollen.
#
# Nutzung:
#   ./scripts/install-schedule.sh            # installieren/aktualisieren
#   ./scripts/install-schedule.sh --uninstall
#
set -euo pipefail

LABEL="com.aibusinessradar.daily"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

# Projektwurzel = eine Ebene über diesem Skript.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

uninstall() {
  if [[ -f "${PLIST}" ]]; then
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl unload "${PLIST}" 2>/dev/null || true
    rm -f "${PLIST}"
    echo "Entfernt: ${PLIST}"
  else
    echo "Kein installierter Job gefunden."
  fi
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

# --- Ausführungsbefehl bestimmen ------------------------------------------
# Bevorzugt 'uv run' (nutzt die projektlokale Umgebung); Fallback auf .venv.
if command -v uv >/dev/null 2>&1; then
  UV_BIN="$(command -v uv)"
  PROG_ARGS="<string>${UV_BIN}</string>
    <string>run</string>
    <string>radar</string>
    <string>run</string>"
elif [[ -x "${PROJECT_DIR}/.venv/bin/python" ]]; then
  PROG_ARGS="<string>${PROJECT_DIR}/.venv/bin/python</string>
    <string>-m</string>
    <string>radar</string>
    <string>run</string>"
else
  echo "Fehler: Weder 'uv' im PATH noch ${PROJECT_DIR}/.venv gefunden." >&2
  echo "Erst einrichten: uv venv && uv pip install -e ." >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "${PROJECT_DIR}/logs"

# PATH für den Job: Homebrew-Pfade ergänzen, damit uv/yt-dlp gefunden werden.
JOB_PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

cat > "${PLIST}" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    ${PROG_ARGS}
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${JOB_PATH}</string>
  </dict>

  <!-- Werktags (Mo=1 .. Fr=5) um 07:00 Uhr. Verpasste Läufe (Ruhezustand)
       holt launchd beim Aufwachen nach. -->
  <key>StartCalendarInterval</key>
  <array>
    <dict><key>Weekday</key><integer>1</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>2</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>3</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>4</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
    <dict><key>Weekday</key><integer>5</integer><key>Hour</key><integer>7</integer><key>Minute</key><integer>0</integer></dict>
  </array>

  <key>StandardOutPath</key>
  <string>${PROJECT_DIR}/logs/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>${PROJECT_DIR}/logs/launchd.err.log</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST_EOF

echo "Plist geschrieben: ${PLIST}"

# --- Laden/Neuladen (modernes bootstrap, Fallback auf load) ---------------
launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
if launchctl bootstrap "gui/$(id -u)" "${PLIST}" 2>/dev/null; then
  echo "Job geladen (bootstrap)."
else
  launchctl load "${PLIST}"
  echo "Job geladen (load)."
fi

echo ""
echo "Fertig. Der Radar läuft werktags um 07:00 Uhr."
echo "  Status:      launchctl print gui/$(id -u)/${LABEL} | grep state"
echo "  Sofort testen: launchctl kickstart -k gui/$(id -u)/${LABEL}"
echo "  Entfernen:   ./scripts/install-schedule.sh --uninstall"
echo "  Logs:        ${PROJECT_DIR}/logs/launchd.{out,err}.log"
