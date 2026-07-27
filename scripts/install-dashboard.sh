#!/usr/bin/env bash
#
# install-dashboard.sh — richtet das AI-Business-Radar-Dashboard als
# Hintergrunddienst ein (macOS launchd). Der Dienst
#   - startet beim Login automatisch und läuft dauerhaft (KeepAlive),
#   - stellt die private Seite unter http://127.0.0.1:<port> bereit,
#   - startet die Analyse einmal pro Tag von selbst (auto_run in config.yaml).
#
# Damit musst du nichts mehr tippen: Lesezeichen öffnen, Bericht lesen.
#
# Nutzung:
#   ./scripts/install-dashboard.sh
#   ./scripts/install-dashboard.sh --uninstall
#
set -euo pipefail

LABEL="com.aibusinessradar.dashboard"
PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
PORT="8756"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

uninstall() {
  if [[ -f "${PLIST}" ]]; then
    launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || launchctl unload "${PLIST}" 2>/dev/null || true
    rm -f "${PLIST}"
    echo "Dashboard-Dienst entfernt."
  else
    echo "Kein installierter Dashboard-Dienst gefunden."
  fi
}

if [[ "${1:-}" == "--uninstall" ]]; then
  uninstall
  exit 0
fi

if [[ ! -x "${PROJECT_DIR}/.venv/bin/python" ]]; then
  echo "Fehler: ${PROJECT_DIR}/.venv nicht gefunden." >&2
  echo "Erst einrichten:  uv venv --python 3.11 && uv pip install -e \".[dev]\"" >&2
  exit 1
fi

mkdir -p "${HOME}/Library/LaunchAgents" "${PROJECT_DIR}/logs"
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
    <string>${PROJECT_DIR}/.venv/bin/python</string>
    <string>-m</string>
    <string>radar</string>
    <string>serve</string>
    <string>--no-browser</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${JOB_PATH}</string>
  </dict>

  <!-- Beim Login starten und dauerhaft laufen lassen (bei Absturz neu starten) -->
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>${PROJECT_DIR}/logs/dashboard.out.log</string>
  <key>StandardErrorPath</key>
  <string>${PROJECT_DIR}/logs/dashboard.err.log</string>

  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
PLIST_EOF

echo "Plist geschrieben: ${PLIST}"

launchctl bootout "gui/$(id -u)/${LABEL}" 2>/dev/null || true
if launchctl bootstrap "gui/$(id -u)" "${PLIST}" 2>/dev/null; then
  echo "Dienst geladen (bootstrap)."
else
  launchctl load "${PLIST}"
  echo "Dienst geladen (load)."
fi

echo ""
echo "Fertig! Das Dashboard läuft jetzt dauerhaft im Hintergrund."
echo "  Öffne (und setze ein Lesezeichen):  http://127.0.0.1:${PORT}"
echo "  Die Analyse startet werktags/täglich automatisch (siehe config.yaml: dashboard.auto_run_stunde)."
echo ""
echo "  Entfernen:  ./scripts/install-dashboard.sh --uninstall"
echo "  Logs:       ${PROJECT_DIR}/logs/dashboard.{out,err}.log"
