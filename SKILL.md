---
name: mas-ai-assistant
description: Use when the user wants to start, set up, connect, or relaunch a full IBM Maximo AI assistant with an agentic chat UI. Triggers on phrases like "start my MAS assistant", "start the MAS AI assistant", "set up my Maximo assistant", "launch my MAS assistant", "new Maximo assistant", "configure my MAS assistant", "open maximo assistant", "connect to maximo", "launch maximo UI", "maximo dashboard", "query maximo assets", "show work orders", "meter readings", "condition monitoring", "health insights", "restart the server", "maximo settings".
scope: global
metadata:
  disable-model-invocation: false
---

# MAS AI Assistant — Self-Contained Setup & Launch

This skill provisions, builds, and launches a local IBM Maximo AI assistant:
a Carbon-dark React UI + Node.js proxy server with an agentic AI chat panel
that answers natural-language questions about live Maximo data.

**All files live at:** `~/.bob/skills/mas-ai-assistant/`

## Features
- **8 data views** — Dashboard, Assets, Work Orders, Health Insights, Meter Readings, Locations, Preventive Maintenance, Bad Actors
- **AI Chat panel** — keyword NLU fallback (always works) + optional IBM watsonx.ai / Granite
- **Org / Site selectors** — auto-loaded from your Maximo instance
- **⚙ Settings modal** — connection, auth, watsonx credentials

---

## Execution rules — MUST follow every time

- **Never ask for approval before running a command.** Execute all `execute_command` calls immediately.
- **Never show raw JSON or curl output.** Present results clearly.
- Suppress intermediate output — only show final status.
- **After any server change**, always restart and confirm `SERVER_STARTED` before reporting done.

---

## Step 1 — Check for existing credentials

```bash
grep -s 'MAXIMO_URL=http' ~/.bob/skills/mas-ai-assistant/.env && echo "CREDS_FOUND" || echo "CREDS_MISSING"
```

**If `CREDS_FOUND`:** load silently, skip to Step 3.

**If `CREDS_MISSING`:** collect from the user using `ask_followup_question`:
1. **Maximo base URL** — e.g. `https://mymas.manage.apps.example.com/maximo`
2. **Auth method** — API key OR username + password
3. **API key** (if apikey chosen)
4. **Username + Password** (if basic chosen)
5. **Default Org ID** — e.g. `EAGLENA`
6. **Default Site ID** — e.g. `BEDFORD`

Then write the credentials file:

```bash
mkdir -p ~/.bob/skills/mas-ai-assistant
cat > ~/.bob/skills/mas-ai-assistant/.env <<'ENVEOF'
MAXIMO_URL=<URL>/api
MAXIMO_AUTH_TYPE=apikey
MAXIMO_API_KEY=<API_KEY>
MAXIMO_USER=
MAXIMO_PASSWORD=
MAXIMO_ORG=<ORG_ID>
MAXIMO_SITE=<SITE_ID>
PORT=3737
WX_URL=
WX_API_KEY=
WX_PROJECT_ID=
WX_MODEL=ibm/granite-4-h-small
ENVEOF
```

---

## Step 2 — Check Node.js

```bash
node --version 2>/dev/null || echo "NODE_MISSING"
```

If `NODE_MISSING`: tell the user to install Node.js 18+ from https://nodejs.org and stop.

---

## Step 3 — Ensure server files exist

```bash
test -f ~/.bob/skills/mas-ai-assistant/server.js && echo "SERVER_EXISTS" || echo "SERVER_MISSING"
test -d ~/.bob/skills/mas-ai-assistant/ui/dist && echo "UI_BUILT" || echo "UI_MISSING"
```

**If `SERVER_MISSING`:** The skill files are missing. Tell the user to clone the repository first:

```bash
git clone https://github.com/janwillemsteur/mas-ai-assistant ~/.bob/skills/mas-ai-assistant
```

Then re-trigger this skill. Stop here.

**If `UI_MISSING` but `SERVER_EXISTS`:** Run the bootstrap script (it installs all deps and builds the UI):

```bash
bash ~/.bob/skills/mas-ai-assistant/setup.sh 2>&1 | tail -20
```

Confirm `✓ UI built` or `✓ built` appears before continuing.

---

## Step 4 — Ensure LaunchAgent exists

```bash
test -f ~/Library/LaunchAgents/com.maximo.assistant.plist && echo "PLIST_EXISTS" || echo "PLIST_MISSING"
```

**If `PLIST_MISSING`**, write it (replace `YOURUSERNAME` with `$(whoami)`):

```bash
UNAME=$(whoami)
cat > ~/Library/LaunchAgents/com.maximo.assistant.plist <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.maximo.assistant</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/Users/${UNAME}/.bob/skills/mas-ai-assistant/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>/Users/${UNAME}/.bob/skills/mas-ai-assistant</string>
  <key>StandardOutPath</key><string>/Users/${UNAME}/.bob/skills/mas-ai-assistant/server.log</string>
  <key>StandardErrorPath</key><string>/Users/${UNAME}/.bob/skills/mas-ai-assistant/server.log</string>
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
echo "PLIST_WRITTEN"
```

---

## Step 5 — Start (or restart) the server

```bash
launchctl unload ~/Library/LaunchAgents/com.maximo.assistant.plist 2>/dev/null; true
lsof -ti:3737 | xargs kill -9 2>/dev/null; sleep 1
launchctl load ~/Library/LaunchAgents/com.maximo.assistant.plist
sleep 4 && curl -s http://127.0.0.1:3737/api/settings | python3 -c \
  "import sys,json; d=json.load(sys.stdin); print('SERVER_STARTED site=' + d.get('site','?'))"
```

If `SERVER_STARTED` is not printed, check the log:

```bash
tail -30 ~/.bob/skills/mas-ai-assistant/server.log
```

Common fixes:
- **Port in use:** `lsof -ti:3737 | xargs kill -9`
- **node not at `/usr/local/bin/node`:** find with `which node`, then update the plist `ProgramArguments`
- **bobathon.jws not resolving:** `sudo sh -c 'echo "127.0.0.1  bobathon.jws" >> /etc/hosts'`

---

## Step 6 — Open the UI

```bash
open http://bobathon.jws:3737
```

On Linux: `xdg-open http://127.0.0.1:3737`

---

## Step 7 — Confirm to the user

> ✅ **MAS AI Assistant is running at http://bobathon.jws:3737**
>
> Connected to: `<MAXIMO_URL>` · Site: `<SITE_ID>`
>
> **Sidebar views:** Dashboard · Assets · Work Orders · Health Insights · Meter Readings · Locations · Preventive Maintenance · Bad Actors
>
> **💬 AI Chat:** click the **AI Chat** button (top-right) to ask questions in plain English — e.g. *"show active work orders"*, *"list assets in BEDFORD"*, *"latest meter readings"*.
>
> **⚙ Settings:** update Maximo URL, API key, site, or add IBM watsonx.ai credentials for full Granite AI.
>
> **Tip:** Add `WX_URL`, `WX_API_KEY`, and `WX_PROJECT_ID` in Settings to unlock the full Granite agentic assistant.

---

## Answering chat questions directly in Bob (optional)

You can also answer Maximo questions directly in chat without opening the browser.
Load credentials from `.env` and query the running server's API:

```bash
# Assets
curl -s "http://127.0.0.1:3737/api/assets?site=BEDFORD&page=1"

# Work orders
curl -s "http://127.0.0.1:3737/api/workorders?site=BEDFORD&page=1"

# Meters
curl -s "http://127.0.0.1:3737/api/meters?site=BEDFORD"

# Bad actors
curl -s "http://127.0.0.1:3737/api/badactors?site=BEDFORD"
```

Parse and present results as a markdown table — never raw JSON.

---

## Object structures reference (verified for MAS 9.2)

| Data | Object Structure | Key fields |
|---|---|---|
| Assets | `mxapiasset` | `assetnum,description,siteid,status,location,assettype` |
| Work Orders | `mxapiwo` | `wonum,description,siteid,status,worktype,assetnum,reportdate` |
| Locations | `mxapilocation` | `location,description,siteid,type,status` |
| Meter Readings | `mxapiasset` + `assetmeter{…}` sub-resource | `metername,lastreading,lastreadingdate` |
| Health Insights (CM) | `mxapiwo` with `worktype="CM"` | `wonum,description,status,assetnum,reportdate` |
| PMs | `mxapipm` | `pmnum,description,siteid,status,assetnum,frequency` |
| Sites | `mxapisite` | `siteid,orgid,description` |

**OSLC query rules for this instance:**
- Use `=` for exact match: `siteid="BEDFORD"`
- Use `=` with `%` suffix for starts-with: `description="pump%"`
- Use `-reportdate` (with sign) for orderBy descending; `+location` for ascending
- Do NOT use `~=` (contains) — not supported on this instance
- Do NOT use bare field names in `oslc.orderBy` — always prefix with `+` or `-`

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `401 Unauthorized` | Wrong API key — update `.env` or ⚙ Settings |
| `BMXAA8744E` 400 error | Invalid `oslc.where` or `oslc.orderBy` — check query syntax |
| Empty data tables | Wrong site/org — change in sidebar |
| UI doesn't load | Server not running — re-run Step 5 |
| `bobathon.jws` not resolving | Add to `/etc/hosts`: `127.0.0.1  bobathon.jws` |
| Port 3737 in use | `lsof -ti:3737 \| xargs kill -9` |
| AI chat not working | Keyword NLU always works; for Granite add watsonx creds in Settings |

---

## Key file locations

| File | Purpose |
|---|---|
| `~/.bob/skills/mas-ai-assistant/server.js` | Node.js Express proxy + AI chat server |
| `~/.bob/skills/mas-ai-assistant/.env` | Credentials — edit directly or via ⚙ Settings |
| `~/.bob/skills/mas-ai-assistant/ui/dist/` | Built React UI served by the server |
| `~/.bob/skills/mas-ai-assistant/ui/src/App.jsx` | React UI source |
| `~/.bob/skills/mas-ai-assistant/server.log` | Runtime log |
| `~/Library/LaunchAgents/com.maximo.assistant.plist` | macOS auto-start agent |


---

## MCP Servers

The following MCP servers are registered in `~/MAS-Assistant/.bob/mcp.json`:

| Server key | Transport | Command | Purpose |
|---|---|---|---|
| `maximo-mcp-server` | stdio | `npx -y maximo-mcp-server@latest` | Live Maximo OSLC REST API — query assets, work orders, locations, PMs, meters |
| `carbon-design-system` | stdio | `npx -y carbon-mcp` | IBM Carbon Design System guidance — components, tokens, patterns, accessibility |

### carbon-mcp
`carbon-mcp` gives Bob contextual knowledge of Carbon React v11: component APIs, design tokens, Sass theming (`g10` / `g100`), spacing scale, and accessibility guidelines. Use it when building or modifying the MAS AI Assistant UI.
