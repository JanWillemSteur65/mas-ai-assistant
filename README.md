# MAS AI Assistant

A local IBM Maximo AI assistant with a Carbon React UI and an agentic AI chat panel — powered by IBM Bob.

![IBM MAS](https://img.shields.io/badge/IBM-Maximo%20Application%20Suite-blue)
![Node](https://img.shields.io/badge/Node.js-18%2B-green)
![React](https://img.shields.io/badge/React-18-61dafb)

---

## Features

- **8 data views** — Dashboard, Assets, Work Orders, Health Insights, Meter Readings, Locations, Preventive Maintenance, Bad Actors
- **AI Chat panel** — keyword NLU (always works) + optional IBM watsonx.ai / Granite
- **Historical meter trends** — SVG charts with date X-axis, value Y-axis, and grid
- **Job Plans** — query and browse job plans from the chat panel
- **Org / Site selectors** — auto-loaded from your Maximo instance
- **Data Explorer** — browse any Maximo Object Structure directly
- **⚙ Settings modal** — connection, auth, and watsonx credentials

---

## Prerequisites

- [Node.js 18+](https://nodejs.org)
- [IBM Bob](https://www.ibm.com/products/bob) (IDE or Shell edition)
- Access to an IBM Maximo Application Suite (MAS) instance with a valid API key or username/password

---

## Installation

### 1. Clone into the Bob global skills directory

```bash
git clone https://github.com/janwillemsteur/mas-ai-assistant ~/.bob/skills/mas-ai-assistant
```

### 2. Run the bootstrap script

```bash
bash ~/.bob/skills/mas-ai-assistant/setup.sh
```

This will:
- Install server Node.js dependencies
- Install UI dependencies and build the React app
- Create a `.env` template (edit it with your credentials)
- Write a macOS LaunchAgent and start the server

### 3. Edit `.env` with your Maximo credentials

```bash
nano ~/.bob/skills/mas-ai-assistant/.env
```

```env
MAXIMO_URL=https://your-maximo-host/maximo/api
MAXIMO_AUTH_TYPE=apikey
MAXIMO_API_KEY=your-api-key-here
MAXIMO_ORG=EAGLENA
MAXIMO_SITE=BEDFORD
PORT=3737
```

### 4. Restart the server

```bash
launchctl unload ~/Library/LaunchAgents/com.maximo.assistant.plist
launchctl load ~/Library/LaunchAgents/com.maximo.assistant.plist
```

### 5. Open the UI

```
http://localhost:3737
```

---

## Using with Bob

Once installed, trigger the skill in Bob by saying:

> *"start my MAS assistant"*  
> *"open maximo assistant"*  
> *"show work orders"*  
> *"meter readings"*

Bob will check the server status, build if needed, and open the UI.

---

## AI Chat (optional — IBM watsonx.ai)

The chat panel works out of the box with keyword NLU. To enable full Granite AI, add watsonx credentials in the Settings modal (⚙) or in `.env`:

```env
WX_URL=https://us-south.ml.cloud.ibm.com
WX_API_KEY=your-watsonx-api-key
WX_PROJECT_ID=your-project-id
WX_MODEL=ibm/granite-4-h-small
```

---

## Project structure

```
mas-ai-assistant/
├── SKILL.md          # Bob skill instructions (the brain)
├── server.js         # Node.js Express proxy + NLU chat server
├── package.json      # Server dependencies
├── setup.sh          # One-shot bootstrap script
├── .env              # Credentials (not committed)
└── ui/
    ├── src/
    │   ├── App.jsx   # React UI (Carbon Design System)
    │   ├── api.js    # API client
    │   └── ...
    ├── package.json
    └── vite.config.js
```

---

## License

MIT
