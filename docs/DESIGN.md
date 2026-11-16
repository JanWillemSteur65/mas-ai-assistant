# Design Document — MAS AI Assistant

**Version:** 1.0  
**Date:** November 2026  
**Repository:** https://github.com/JanWillemSteur65/mas-ai-assistant

---

## 1. Design Goals

| Goal | Description |
|---|---|
| **Zero backend changes** | Works against a standard MAS Manage OSLC REST API — no custom scripts, no Maximo automation scripts required |
| **Instant install** | One `git clone` + `bash setup.sh` and the assistant is running |
| **IBM Carbon look & feel** | Identical visual language to MAS Manage itself — users need zero retraining |
| **Always-on AI chat** | Keyword NLU works without any cloud credentials; watsonx Granite upgrades it when available |
| **Transparent proxy** | The API key is never sent to the browser; all Maximo calls go through the Node.js proxy |
| **No database** | All state is live from Maximo; no local cache or sync required |

---

## 2. Visual Design

### 2.1 Design System

The UI is built entirely on [IBM Carbon Design System v11](https://carbondesignsystem.com/) via `@carbon/react`. This ensures:

- Consistent spacing (8px grid), typography, and colour tokens
- Native accessibility (WCAG 2.1 AA)  
- Support for both light (`g10`) and dark (`g100`) themes via CSS custom properties

### 2.2 Theming

| Variable | Light theme | Dark theme |
|---|---|---|
| Background | `--cds-background: #f4f4f4` | `--cds-background: #161616` |
| Layer 01 | `--cds-layer: #ffffff` | `--cds-layer: #262626` |
| Layer 02 | `--cds-layer-02: #f4f4f4` | `--cds-layer-02: #393939` |
| Border | `--cds-border-subtle: #e0e0e0` | `--cds-border-subtle: #393939` |
| Text primary | `--cds-text-primary: #161616` | `--cds-text-primary: #f4f4f4` |
| Text secondary | `--cds-text-secondary: #525252` | `--cds-text-secondary: #c6c6c6` |
| Accent | `--cds-link-primary: #0f62fe` | `--cds-link-primary: #78a9ff` |

The main content area and the AI Chat panel have **independent** theme toggles — the sidebar can be dark while content is light, which is the default.

### 2.3 Colour Palette (charts and status)

Chart series colours are drawn from the IBM Data Visualisation palette:

```
#78a9ff  Blue 40      (default series 0)
#42be65  Green 40     (success / OPERATING)
#f1c21b  Yellow 30    (warning / WAPPR)
#fa4d56  Red 40       (error / alert)
#be95ff  Purple 40    (series 4)
#3ddbd9  Teal 30      (series 5 / INPRG)
#ff832b  Orange 40    (series 6)
#ee5396  Magenta 40   (series 7)
```

Status tags use Carbon's `<Tag>` component with semantic type mapping:

| Status | Carbon type |
|---|---|
| OPERATING, ACTIVE, COMP, RESOLVED | `green` |
| WAPPR | `yellow` |
| INPRG, WSCH | `teal` |
| WMATL, QUEUED | `purple` |
| APPR, NEW | `blue` |
| CAN, CLOSE, DECOMMISSIONED | `cool-gray` |
| NOT READY | `warm-gray` |

---

## 3. Layout

### 3.1 Shell structure

```
┌─────────────────────────────────────────────────────────────┐
│ Header (Carbon UIShell)                                     │
│  IBM Maximo Assistant  [Org ▾] [Site ▾]  [🔄] [💬] [⚙]    │
├────────────┬────────────────────────────────────────────────┤
│ SideNav    │  Content area (scrollable)                     │
│            │                                                │
│ Dashboard  │  ┌─ Page heading ─────────────────────────┐   │
│ Assets     │  │  Toolbar / filters                     │   │
│ Work Orders│  │  Carbon DataTable (paginated)          │   │
│ Health     │  │  or Dashboard tiles                    │   │
│ Meters     │  │  or Map (Leaflet)                      │   │
│ Locations  │  └────────────────────────────────────────┘   │
│ Prev. Maint│                                                │
│ Bad Actors │                                                │
│ Explorer   │                                                │
│ Geo Map    │                                                │
└────────────┴────────────────────────────────────────────────┘
                                           [AI Chat panel →]
```

The AI Chat panel slides in from the right as an overlay, with a draggable resize handle on its left edge (300–900px wide).

### 3.2 Responsive behaviour

- SideNav collapses to icons on narrow viewports (Carbon default behaviour)
- DataTable columns are scrollable horizontally
- Dashboard tiles use CSS `auto-fill` with `minmax(160px, 1fr)` — reflow from 1 to 4 columns
- Meter trend charts use `width="100%"` with `viewBox` — scale to container width

---

## 4. Component Catalogue

### 4.1 Shared / utility components

| Component | Purpose |
|---|---|
| `StatusTag` | Wraps Carbon `<Tag>` with semantic status colour mapping |
| `LoadingView` | Centred `<InlineLoading>` spinner with description |
| `ErrBanner` | `<InlineNotification kind="error">` — only renders when `error` is non-empty |
| `CdsDataTable` | Thin wrapper around Carbon `<DataTable>` with optional toolbar search, click handler, and column-type aware cell rendering |
| `FieldGrid` | Two-column CSS grid showing all field key/value pairs in a record detail view |

### 4.2 Chart components

| Component | Input | Output |
|---|---|---|
| `DonutChart` | `data: [{label, value}]` | SVG donut with percentage labels — used on Dashboard |
| `SvgBarChart` | `data: [{label, value}]` | SVG horizontal bar chart — used on Dashboard (WO types) |
| `MeterTrendChart` | `readings: [{date, value}]`, `color`, `unit` | Full SVG line chart: Y-axis grid + labels, X-axis date labels, filled area under line, data point dots |

### 4.3 Modal components

| Component | Trigger | Actions |
|---|---|---|
| `RowModal` | Click any DataTable row | View full record fields; for Assets: Create WO / Create SR; for WOs/SRs: Change Status |
| `AssetMeterPanel` | Embedded in `RowModal` for asset rows | Fetches and renders `MeterTrendChart` for each meter (last 14 days) |
| `CreateRecordModal` | "Create WO" / "Create SR" button in `RowModal` | Form to create a new work order or service request |
| `ChangeStatusModal` | "Change Status" button in `RowModal` | Dropdown of valid statuses + memo field |
| `SettingsModal` | ⚙ button in header | Edit Maximo URL, auth, site, map location, watsonx credentials |

### 4.4 Page views

| View | Route (activePage) | Key features |
|---|---|---|
| `Dashboard` | `dashboard` | 4 KPI tiles, 5 donut charts + 1 bar chart, recent WOs table |
| `AssetsView` | `assets` | Paginated table, description search, row modal with meter panel |
| `WorkOrdersView` | `workorders` | Paginated table, description search, status filter dropdown |
| `HealthView` | `health` | CM work orders only, paginated, same layout as WOs |
| `MetersView` | `meters` | Flat table of asset meters, asset number search |
| `LocationsView` | `locations` | Paginated table, description search |
| `PMsView` | `pms` | Paginated table, next-date visible |
| `BadActorsView` | `badactors` | Top 20 assets by WO count — bar chart + ranked table |
| `ExplorerView` | `explorer` | Select any OS, pick columns, run OSLC where-clause query |
| `MapView` | `map` | Leaflet interactive map, 6 tile layers, 4 toggleable data layers |

---

## 5. AI Chat Design

### 5.1 Two-tier NLU

```
User message
    │
    ├─► watsonx.ai configured? ──YES──► IBM Granite LLM inference
    │                                   (free-form natural language)
    └─► NO
        │
        └─► keywordReply() — pattern matching
            ├── "work order" / "wo "   → live WO query
            ├── "asset"                → live asset query
            ├── "meter" / "reading"    → live meter query
            ├── "pm" / "preventive"    → live PM query
            ├── "job plan" / "jp"      → live job plan query
            ├── "health" / "condition" → live CM WO query
            ├── "location"             → live location query
            ├── "service request" / "sr" / "ticket" → live SR query
            ├── "site"                 → list all sites
            └── (no match)            → help text with suggestions
```

### 5.2 Chat context

Each chat message carries a `context` object:
```json
{
  "site": "BEDFORD",
  "org": "EAGLENA",
  "pageSize": 50
}
```

The NLU engine scopes all Maximo queries to the active site/org and respects the user's configured page size.

### 5.3 Structured responses

When the keyword engine returns tabular data, the response includes:
```json
{
  "reply": "Found 42 work orders for BEDFORD. Click any row for details.",
  "rows": [...],
  "columns": [{ "key": "wonum", "label": "WO #", "type": "id" }, ...],
  "idField": "wonum"
}
```

The `ChatTable` component renders a fully interactive Carbon DataTable inside the chat message bubble, including row click → `RowModal` behaviour.

---

## 6. Geo Map Design

The map is rendered by **Leaflet.js** (loaded lazily from CDN on first visit). Six tile layer options are available:

| Label | Provider |
|---|---|
| 🗺 Standard (OSM) | OpenStreetMap |
| 🤝 Humanitarian | OSM Humanitarian |
| ⛰ Topographic | OpenTopoMap |
| 🛰 Satellite | ESRI World Imagery + labels |
| ☀ Light | Carto Light |
| 🌑 Dark | Carto Dark |

Four data layers (Assets, Locations, Work Orders, Service Requests) are toggled independently. Each layer populates circle markers coloured by status. Clicking a marker opens an HTML popup with key record fields and a "Show details" link.

GPS coordinates must exist on the Maximo record as `latitudey` / `longitudex` on the Service Address. If no coordinates are present, no pins are shown and a guidance message is displayed.

---

## 7. Settings & Configuration

All runtime configuration is stored in `.env`:

| Variable | Purpose | Required |
|---|---|---|
| `MAXIMO_URL` | Base URL of MAS Manage API (without trailing slash) | ✅ |
| `MAXIMO_AUTH_TYPE` | `apikey` or `basic` | ✅ |
| `MAXIMO_API_KEY` | API key for `apikey` auth | if apikey |
| `MAXIMO_USER` | Username for `basic` auth | if basic |
| `MAXIMO_PASSWORD` | Password for `basic` auth | if basic |
| `MAXIMO_ORG` | Default organisation ID | ✅ |
| `MAXIMO_SITE` | Default site ID | ✅ |
| `PORT` | Local HTTP port (default: 3737) | optional |
| `MAP_ADDRESS` | Human-readable map centre address | optional |
| `MAP_LAT` | Map centre latitude | optional |
| `MAP_LNG` | Map centre longitude | optional |
| `WX_URL` | IBM watsonx.ai instance URL | optional |
| `WX_API_KEY` | IBM Cloud API key for watsonx | optional |
| `WX_PROJECT_ID` | watsonx project ID | optional |
| `WX_MODEL` | Granite model ID (default: `ibm/granite-4-h-small`) | optional |

The Settings modal (⚙) in the UI writes all changes to `.env` via the server, so the user never needs to edit the file by hand after initial setup.
