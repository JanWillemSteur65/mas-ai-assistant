# Architecture — MAS AI Assistant

**Version:** 1.0  
**Date:** November 2026  
**Repository:** https://github.com/JanWillemSteur65/mas-ai-assistant

---

## 1. Overview

The MAS AI Assistant is a locally-hosted, single-user web application that acts as an intelligent interface to IBM Maximo Application Suite (MAS) Manage. It is delivered as a Bob skill: when triggered, the skill bootstraps the entire stack from source automatically.

The system has three distinct runtime layers:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React UI)                                         │
│  Carbon Design System · Leaflet.js · SVG charts             │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (localhost:3737)
┌──────────────────────────▼──────────────────────────────────┐
│  Node.js Proxy Server  (server.js)                          │
│  Express · node-fetch · dotenv                              │
│  Auth bridge · NLU engine · REST API proxy                  │
└──────────────────────────┬──────────────────────────────────┘
                           │ OSLC REST (HTTPS)
┌──────────────────────────▼──────────────────────────────────┐
│  IBM Maximo Application Suite (MAS Manage)                  │
│  OSLC/JSON Object Structures API                            │
└─────────────────────────────────────────────────────────────┘
```

An optional fourth layer is IBM watsonx.ai (cloud), used when configured to replace the keyword NLU with a Granite large language model.

---

## 2. Component Breakdown

### 2.1 Node.js Proxy Server (`server.js`)

| Concern | Detail |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4.x |
| Port | 3737 (configurable via `PORT` env var) |
| Start | macOS LaunchAgent (`com.maximo.assistant.plist`) or `node server.js` |
| Credential file | `.env` (never committed) |

**Responsibilities:**
- Serves the built React UI from `ui/dist/` as static files
- Acts as an authenticated reverse proxy to the Maximo OSLC REST API — the browser never touches Maximo directly, so the API key is never exposed client-side
- Hosts the AI Chat endpoint (`POST /api/chat`) which routes to either watsonx.ai or the keyword NLU engine
- Writes settings changes (map location) back to `.env` at runtime

**Authentication bridge:**
```
Auth type = "apikey"  →  header: { apikey: <value> }
Auth type = "basic"   →  header: { Authorization: "Basic <base64(user:pass)>" }
```

### 2.2 React UI (`ui/src/App.jsx`)

| Concern | Detail |
|---|---|
| Framework | React 18 (via Vite) |
| Design system | IBM Carbon Design System v11 (`@carbon/react`) |
| Build tool | Vite 5 |
| Output | `ui/dist/` (served by Express) |
| Mapping | Leaflet.js (CDN, loaded lazily) |

The UI is a single-page application with no client-side router. Navigation state is managed by a single `activePage` state variable in the root `App` component.

### 2.3 Bob Skill (`SKILL.md`)

The skill provides Bob with step-by-step instructions to:
1. Load or collect credentials
2. Verify Node.js is installed
3. Check if the server files and built UI exist — running `setup.sh` if not
4. Write the macOS LaunchAgent plist
5. Start/restart the server via `launchctl`
6. Open the browser

---

## 3. Data Flow

### 3.1 Standard page load

```
User selects page in sidebar
    → React component calls api.js function
        → fetch("http://localhost:3737/api/<endpoint>?site=X&org=Y")
            → server.js handler builds OSLC query
                → maxFetch("mxapiXXX", { oslc.select, oslc.where, ... })
                    → GET https://<MAXIMO_URL>/api/os/mxapiXXX?lean=1&...
                        ← JSON response (member array)
                    ← parsed JSON
                ← { members: [...], total: N }
            ← HTTP 200 JSON
        ← data
    → React renders Carbon DataTable
```

### 3.2 AI Chat flow

```
User types message
    → POST /api/chat { message, context: { site, org, pageSize } }
        → if WX_URL + WX_API_KEY + WX_PROJECT_ID are set:
            → POST https://iam.cloud.ibm.com/identity/token  (get Bearer token)
            → POST https://<WX_URL>/ml/v1/text/generation    (Granite inference)
            ← { results[0].generated_text }
            → return text reply
        → else: keywordReply(message, context)
            → pattern-match message against keyword list
            → maxFetch(objectStructure, params) if data needed
            ← { reply, rows?, columns?, idField? }
    ← HTTP 200 JSON
→ ChatPanel renders markdown text + optional ChatTable
```

### 3.3 Meter trend flow

```
User opens Asset row modal
    → GET /api/asset-meter-trend?assetnum=X&siteid=Y
        → GET mxapiasset (fetch meter list with measurement_collectionref links)
        → for each meter in parallel:
            → GET measurement_collectionref?oslc.where=measuredate>="<14 days ago>"
            ← [ { measuredate, measurementvalue }, ... ]
        ← { meters: [ { metername, readings: [...], lastreading, lastreadingdate, unit } ] }
→ React renders MeterTrendChart (SVG, responsive viewBox)
```

---

## 4. API Reference

All endpoints are hosted at `http://localhost:3737`.

### Settings

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings` | Returns current connection config (URL, auth type, site, org, map coords) |
| POST | `/api/settings/location` | Saves map centre coordinates to `.env` |
| GET | `/api/geocode?address=` | Geocodes an address via Nominatim (OpenStreetMap) |

### Reference Data

| Method | Path | Query params | Description |
|---|---|---|---|
| GET | `/api/orgs` | — | All organisations from `mxapisite` |
| GET | `/api/sites` | `org` | Sites filtered by org |
| GET | `/api/objectstructures` | — | All known Object Structures (cached 1 h) |

### Core Data

| Method | Path | Key query params | Maximo OS |
|---|---|---|---|
| GET | `/api/assets` | `site, org, search, page, pageSize` | `mxapiasset` |
| GET | `/api/workorders` | `site, org, status, search, page, pageSize` | `mxapiwo` |
| GET | `/api/locations` | `site, org, search, page, pageSize` | `mxapilocation` |
| GET | `/api/meters` | `site, org, assetnum, pageSize` | `mxapiasset` (sub-resource `assetmeter`) |
| GET | `/api/health` | `site, org, search, page, pageSize` | `mxapiwo` (filtered `worktype="CM"`) |
| GET | `/api/pms` | `site, org, page, pageSize` | `mxapipm` |
| GET | `/api/stats` | `site, org` | Aggregated counts from assets, WOs, PMs |
| GET | `/api/badactors` | `site, org` | Top 20 assets by WO count |
| GET | `/api/asset-meter-trend` | `assetnum, siteid` | 14-day meter time series |

### Map

| Method | Path | Description |
|---|---|---|
| GET | `/api/mapdata` | Assets + locations with GPS coords |
| GET | `/api/maplayers` | All layer data (assets, locations, WOs, SRs) |

### Actions

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/changestatus` | `{ objectType, id, siteid, status, memo }` | Change WO/SR status |
| POST | `/api/createwo` | `{ description, siteid, assetnum, location, worktype }` | Create work order |
| POST | `/api/createsr` | `{ description, siteid, assetnum, location }` | Create service request |

### AI

| Method | Path | Body | Description |
|---|---|---|---|
| POST | `/api/chat` | `{ message, context }` | NLU query — watsonx or keyword fallback |
| GET | `/api/bestpractice` | — | Column definitions for all known Object Structures |
| GET | `/api/explore` | `os, site, org, where, page, pageSize` | Generic OSLC query for Data Explorer |
| GET | `/api/os-schema` | `os` | Field list for a given Object Structure |

---

## 5. Object Structures

| Label | OSLC OS name | Key ID field |
|---|---|---|
| Assets | `mxapiasset` | `assetnum` |
| Work Orders | `mxapiwo` | `wonum` |
| Locations | `mxapilocation` | `location` |
| Preventive Maintenance | `mxapipm` | `pmnum` |
| Job Plans | `mxapijobplan` | `jpnum` |
| Service Requests | `mxapisr` | `ticketid` |
| Sites | `mxapisite` | `siteid` |
| Job Cards | `mxapijobcard` | — |
| Safety Plans | `mxapisafety` | — |
| Failure Lists | `mxapifailurelist` | — |

---

## 6. File Structure

```
mas-ai-assistant/
├── SKILL.md                  Bob skill instructions
├── server.js                 Express proxy + NLU engine
├── package.json              Server dependencies (express, node-fetch, dotenv)
├── package-lock.json
├── setup.sh                  One-shot bootstrap
├── _patch.mjs                Post-install patch helper
├── .gitignore
├── README.md
├── .env                      ← NOT in git; credentials
├── server.log                ← NOT in git; runtime log
├── docs/
│   ├── ARCHITECTURE.md       ← this file
│   ├── DESIGN.md
│   ├── TEST_PLAN.md
│   └── USER_GUIDE.md
└── ui/
    ├── index.html
    ├── vite.config.js
    ├── package.json
    ├── src/
    │   ├── App.jsx           Main React SPA (all views and components)
    │   ├── api.js            API client (fetch wrappers)
    │   ├── utils.js          Formatting helpers
    │   ├── main.jsx          React entry point
    │   ├── index.css         Global CSS resets
    │   └── carbon.scss       Carbon theme overrides
    └── dist/                 ← NOT in git; built by setup.sh
```

---

## 7. Security Considerations

| Risk | Mitigation |
|---|---|
| API key exposure | Key lives in `.env` on disk; never sent to the browser; proxy pattern keeps it server-side |
| `.env` in git | `.gitignore` excludes `.env` |
| CORS | No CORS headers needed; browser and server are same origin (localhost:3737) |
| Maximo write operations | Only `changeStatus`, `createwo`, `createsr` — all require explicit user action in the UI |
| External geocoding | Nominatim is called with a neutral `User-Agent`; no credentials are sent |
| watsonx credentials | Also in `.env`; not exposed to the browser |

---

## 8. Deployment Model

The server is a **local single-user process**. It is not designed for multi-user or production deployment without additional hardening (TLS, auth middleware, rate limiting).

On macOS, it runs as a persistent LaunchAgent:

```
~/Library/LaunchAgents/com.maximo.assistant.plist
  ProgramArguments: [node, ~/.bob/skills/mas-ai-assistant/server.js]
  RunAtLoad: true
  KeepAlive: true
  StandardOutPath: server.log
  StandardErrorPath: server.log
```

The agent starts on login and is restarted automatically if it crashes.
