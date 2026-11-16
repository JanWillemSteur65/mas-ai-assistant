# Test Plan — MAS AI Assistant

**Version:** 1.0  
**Date:** November 2026  
**Repository:** https://github.com/JanWillemSteur65/mas-ai-assistant

---

## 1. Scope

This test plan covers functional verification of all major features of the MAS AI Assistant. Tests are designed to be executed manually against a live MAS Manage instance (no automated test harness is included in v1.0).

**In scope:**
- Bootstrap / setup (`setup.sh`, LaunchAgent, server start)
- All 10 navigation views
- AI Chat (keyword NLU)
- Record actions (create WO, create SR, change status)
- Settings modal
- Meter trend charts
- Geo Map

**Out of scope (v1.0):**
- watsonx.ai / Granite integration (requires cloud credentials)
- Multi-user or concurrent session behaviour
- Performance testing beyond interactive responsiveness
- Security penetration testing

---

## 2. Test Environment

| Item | Requirement |
|---|---|
| OS | macOS 13+ (primary) or Linux |
| Node.js | 18.x or higher |
| Browser | Chrome 120+, Safari 17+, or Firefox 120+ |
| Maximo | MAS Manage 8.x or 9.x with OSLC API enabled |
| Auth | Valid API key **or** username + password with `mxapiasset`, `mxapiwo`, `mxapilocation`, `mxapipm`, `mxapijobplan`, `mxapisr`, `mxapisite` read access |
| Network | Local machine must be able to reach the Maximo host |

---

## 3. Test Cases

### TC-01 — Bootstrap: fresh clone

**Purpose:** Verify the assistant installs and starts from scratch.

| Step | Action | Expected result |
|---|---|---|
| 1 | `git clone https://github.com/JanWillemSteur65/mas-ai-assistant ~/.bob/skills/mas-ai-assistant` | Directory created with all source files, no `node_modules`, no `ui/dist` |
| 2 | `bash ~/.bob/skills/mas-ai-assistant/setup.sh` | Script prints node version, installs deps, builds UI (`✓ built in Xs`), writes `.env` template, writes LaunchAgent plist, starts server |
| 3 | Observe terminal output | `✓ Server started — site=<SITE>` printed (or `⚠ Server may not have started` if `.env` has no credentials yet) |
| 4 | Edit `.env` with real credentials | File contains correct `MAXIMO_URL`, `MAXIMO_API_KEY`, `MAXIMO_SITE`, `MAXIMO_ORG` |
| 5 | Restart server: `launchctl unload ~/Library/LaunchAgents/com.maximo.assistant.plist && launchctl load ~/Library/LaunchAgents/com.maximo.assistant.plist` | Server restarts cleanly |
| 6 | `curl -s http://127.0.0.1:3737/api/settings` | Returns JSON with `site` matching `.env` value |
| 7 | Open `http://localhost:3737` in browser | UI loads, shows IBM Carbon header with "IBM Maximo Assistant" |

**Pass criteria:** UI loads within 5 seconds with no console errors.

---

### TC-02 — Settings modal

**Purpose:** Verify settings can be read and written from the UI.

| Step | Action | Expected result |
|---|---|---|
| 1 | Click ⚙ in header | Settings modal opens showing current URL, auth type, site, org |
| 2 | Change Site to a different known site ID | Field updated |
| 3 | Click Save | Modal closes, toast/indicator appears |
| 4 | Reload page | Org and site dropdowns default to the newly saved values |
| 5 | Reopen ⚙ | Site field shows the new value |

---

### TC-03 — Org and Site selectors

**Purpose:** Verify org/site dropdowns auto-load from Maximo and filter data correctly.

| Step | Action | Expected result |
|---|---|---|
| 1 | On load | Org dropdown shows available orgs (fetched from `mxapisite`) |
| 2 | Select an org | Site dropdown updates to show only sites in that org |
| 3 | Select a site | All page views reload with data scoped to that site |
| 4 | Verify scoping | Dashboard KPI tiles and tables show counts matching that site only |

---

### TC-04 — Dashboard

**Purpose:** Verify all dashboard widgets render with real data.

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Dashboard | 4 KPI tiles visible: Total Assets, Work Orders, Health Insights, Preventive Maint |
| 2 | Inspect KPI values | Numbers are non-negative integers; Work Orders tile shows open WO sub-label |
| 3 | Inspect donut charts | 5 donuts visible (WO by Type, WO by Status, Asset by Type, Asset by Status, PM by Status); each shows colour segments with percentage labels |
| 4 | Inspect bar chart | "WO Work Types" bar chart visible with horizontal bars proportional to counts |
| 5 | Inspect Recent Work Orders table | Table shows ≤ 5 rows; columns: WO #, Description, Site, Status, Type, Asset, Location, Reported |
| 6 | Click a WO row | Row modal opens with full field details and status tag |

---

### TC-05 — Assets view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Assets | Table loads with asset rows; columns: Asset #, Description, Site, Org, Status, Type, Location |
| 2 | Type a description fragment in search box, press Enter | Table filters to matching assets |
| 3 | Click next page | Page 2 of results loads |
| 4 | Click an asset row | Modal opens with all asset fields visible |
| 5 | In modal: check meter panel | "Meter Readings — Last 14 Days" section shows ≥ 1 meter card (if asset has meters); each card shows meter name, last reading, and trend chart |
| 6 | Inspect trend chart | Light `#f4f6fb` background; horizontal grid lines with Y-axis labels; X-axis date labels; coloured line with dots |
| 7 | Click "Create WO" | Create WO modal opens with asset and site pre-filled |
| 8 | Fill description, click Create | Success notification; new WO appears in Work Orders view |

---

### TC-06 — Work Orders view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Work Orders | Table loads, ordered by report date descending |
| 2 | Select status filter "WAPPR" | Table shows only WAPPR work orders |
| 3 | Type description search | Further filters results |
| 4 | Click a WO row | Modal with full WO details, Status tag, Change Status button |
| 5 | Click Change Status → select APPR → enter memo → submit | WO status updates; re-query shows new status |

---

### TC-07 — Health Insights view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Health Insights | Table loads with CM (Condition Monitoring) work orders only |
| 2 | Verify work type | All rows have worktype = CM |
| 3 | Click a row | Modal opens with WO details |

---

### TC-08 — Meter Readings view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Meter Readings | Table of flattened asset meters loads |
| 2 | Type an asset number in search and click Search | Table filters to that asset's meters |
| 3 | Click a row | Modal opens — shows full meter details and meter panel with trend chart |
| 4 | Trend chart has data | Chart renders with light background, grid, date axis, value axis |

---

### TC-09 — Locations view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Locations | Table loads with location, description, type, status, site |
| 2 | Search description | Filters results |
| 3 | Click a location row | Modal opens with full location details; "Create WO" / "Create SR" buttons visible |

---

### TC-10 — Preventive Maintenance view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Preventive Maint. | Table loads with PM #, description, status, asset, freq, freq unit, next date |
| 2 | Paginate | Next page loads correctly |

---

### TC-11 — Bad Actors view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Bad Actors | View shows top 20 assets ranked by work order count |
| 2 | Inspect bar chart | Horizontal bars proportional to WO count |
| 3 | Inspect ranked table | Asset #, description, WO count, last reading, last reading date |

---

### TC-12 — Data Explorer

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Data Explorer | Object Structure dropdown populated with known OS names |
| 2 | Select `mxapijobplan` | Column list appears with pre-configured fields; Org and Site filters available |
| 3 | Click Run Query | Table loads with job plan data |
| 4 | Select a custom OS (e.g. `mxapifailurelist`) | Column list auto-fetched from `/api/os-schema`; query executes |
| 5 | Add a WHERE clause (e.g. `status="ACTIVE"`) | Query respects filter |

---

### TC-13 — Geo Map view

| Step | Action | Expected result |
|---|---|---|
| 1 | Navigate to Geo Map | Leaflet map loads centred on configured location; OSM tile layer visible |
| 2 | Toggle Assets layer on | Circle markers appear for assets with GPS coordinates |
| 3 | Toggle Work Orders layer on | Additional markers appear coloured by WO status |
| 4 | Switch tile layer to Dark | Map tiles change to Carto Dark |
| 5 | Click a marker | Popup appears with record key fields |
| 6 | If no GPS data | Guidance message: "Populate latitudey / longitudex via Service Addresses in Maximo" |

---

### TC-14 — AI Chat (keyword NLU)

| Step | Action | Expected result |
|---|---|---|
| 1 | Click 💬 button in header | Chat panel slides in from right |
| 2 | Type: `show active work orders` | Returns table of WAPPR work orders for active site |
| 3 | Type: `list assets` | Returns asset table |
| 4 | Type: `latest meter readings` | Returns flattened meter table |
| 5 | Type: `show preventive maintenance` | Returns PM table |
| 6 | Type: `show job plans` | Returns job plan table from `mxapijobplan` |
| 7 | Type: `condition monitoring` | Returns CM work orders |
| 8 | Type: `list locations` | Returns locations table |
| 9 | Type: `show service requests` | Returns SR table |
| 10 | Type: `what can you do` | Returns help text listing all supported queries and current scope |
| 11 | Click a row in a chat result table | Row modal opens (same as sidebar views) |
| 12 | Drag resize handle | Chat panel width adjusts |
| 13 | Click X to close | Panel closes; chat history preserved until "New Chat" or page reload |

---

### TC-15 — Create Work Order

| Step | Action | Expected result |
|---|---|---|
| 1 | Open any asset row modal → click "Create WO" | Create WO modal appears; asset and site pre-filled |
| 2 | Enter description; select work type; optionally set location | Fields accepted |
| 3 | Submit | `POST /api/createwo` called; success notification shown; modal closes |
| 4 | Go to Work Orders view | New WO appears with status WAPPR |

---

### TC-16 — Create Service Request

| Step | Action | Expected result |
|---|---|---|
| 1 | Open any asset or location row modal → click "Create SR" | Create SR modal appears with asset/location pre-filled |
| 2 | Enter description; submit | SR created; success notification |
| 3 | Verify in Maximo | SR exists in Maximo with correct asset/location |

---

### TC-17 — Change Status

| Step | Action | Expected result |
|---|---|---|
| 1 | Open a WO row modal → click "Change Status" | Dropdown of valid statuses (WAPPR, APPR, INPRG, COMP, CAN, WMATL, WSCH, CLOSE) |
| 2 | Select new status; enter memo; submit | `POST /api/changestatus` called; modal closes |
| 3 | Re-open the WO | Status tag reflects new value |

---

### TC-18 — Error handling

| Step | Action | Expected result |
|---|---|---|
| 1 | Set wrong API key in `.env`, restart server, reload | Error banner appears in affected views: "Maximo 401: …" |
| 2 | Set correct key, restart | Data loads normally |
| 3 | Filter by asset number with no results | Table shows "No data to display" (empty state) |
| 4 | Use Data Explorer with invalid WHERE clause | Error banner shows Maximo 400 error message |
| 5 | AI chat with unknown phrase | Help text with supported queries returned (no crash) |

---

## 4. Regression Checklist (after any code change)

After modifying `server.js` or `App.jsx`, verify the following:

- [ ] Server starts without errors (`curl http://127.0.0.1:3737/api/settings`)
- [ ] Dashboard loads with KPI tiles and at least one chart
- [ ] Work Orders table loads and status filter works
- [ ] Asset row modal opens; meter panel renders for an asset with meters
- [ ] AI chat: `show work orders` returns a table
- [ ] AI chat: `show job plans` returns a table
- [ ] Data Explorer: select `mxapiasset`, run query, see results
- [ ] Settings modal: open, change site, save, reload — site persists

---

## 5. Known Limitations (v1.0)

| Limitation | Notes |
|---|---|
| GPS map pins require Service Address data | Assets/locations without `latitudey`/`longitudex` will not appear as pins |
| Meter trend endpoint depends on `measurement_collectionref` | If Maximo's measurement collection sub-resource is unavailable, trend charts will not render (falls back to "Not enough readings") |
| watsonx NLU not tested here | Requires a valid IBM Cloud account with watsonx.ai; falls back to keyword NLU if unavailable |
| `oslc.where` contains-match not supported | Maximo OSLC on this instance does not support `~=`; only exact and starts-with (`%`) patterns are used |
| Page size limited to 2000 by server | To prevent timeout; Maximo hard limit may be lower |
