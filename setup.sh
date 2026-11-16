#!/usr/bin/env bash
# setup.sh — One-shot bootstrap for the MAS AI Assistant
# Run this after cloning: bash setup.sh
# The skill (SKILL.md) also runs these steps automatically when triggered in Bob.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   MAS AI Assistant — Bootstrap Setup         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "✗ Node.js not found. Install Node.js 18+ from https://nodejs.org and re-run."
  exit 1
fi
NODE_VER=$(node --version)
echo "✓ Node.js $NODE_VER"

# ── 2. Install server dependencies ───────────────────────────────────────────
echo "→ Installing server dependencies…"
npm install --omit=dev
echo "✓ Server dependencies installed"

# ── 3. Install UI dependencies and build ─────────────────────────────────────
echo "→ Installing UI dependencies…"
cd ui && npm install
echo "→ Building UI…"
npm run build
cd "$SCRIPT_DIR"
echo "✓ UI built"

# ── 4. Write .env template if missing ────────────────────────────────────────
if [ ! -f "$SCRIPT_DIR/.env" ]; then
  cat > "$SCRIPT_DIR/.env" <<'ENVEOF'
MAXIMO_URL=https://your-maximo-host/maximo/api
MAXIMO_AUTH_TYPE=apikey
MAXIMO_API_KEY=
MAXIMO_USER=
MAXIMO_PASSWORD=
MAXIMO_ORG=
MAXIMO_SITE=
PORT=3737
WX_URL=
WX_API_KEY=
WX_PROJECT_ID=
WX_MODEL=ibm/granite-4-h-small
ENVEOF
  echo "✓ .env template created — edit it with your Maximo credentials before starting"
else
  echo "✓ .env already exists (skipped)"
fi

# ── 5. Write LaunchAgent plist (macOS only) ───────────────────────────────────
if [[ "$OSTYPE" == "darwin"* ]]; then
  PLIST="$HOME/Library/LaunchAgents/com.maximo.assistant.plist"
  NODE_PATH=$(which node)
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.maximo.assistant</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${SCRIPT_DIR}/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>${SCRIPT_DIR}</string>
  <key>StandardOutPath</key><string>${SCRIPT_DIR}/server.log</string>
  <key>StandardErrorPath</key><string>${SCRIPT_DIR}/server.log</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLISTEOF
  echo "✓ LaunchAgent written: $PLIST"

  # ── 6. Start the server ───────────────────────────────────────────────────
  launchctl unload "$PLIST" 2>/dev/null || true
  lsof -ti:3737 | xargs kill -9 2>/dev/null || true
  sleep 1
  launchctl load "$PLIST"
  sleep 4

  if curl -s http://127.0.0.1:3737/api/settings | python3 -c \
      "import sys,json; d=json.load(sys.stdin); print('✓ Server started — site=' + d.get('site','?'))" 2>/dev/null; then
    echo ""
    echo "╔══════════════════════════════════════════════╗"
    echo "║  ✅ All done!                                ║"
    echo "║  Open: http://localhost:3737                 ║"
    echo "╚══════════════════════════════════════════════╝"
  else
    echo "⚠ Server may not have started — check server.log"
  fi
else
  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  ✅ Build complete (Linux/other detected)        ║"
  echo "║  Start server: node server.js                   ║"
  echo "║  Then open:    http://localhost:3737             ║"
  echo "╚══════════════════════════════════════════════════╝"
fi
