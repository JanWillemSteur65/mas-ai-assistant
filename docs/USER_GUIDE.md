# User Guide — MAS AI Assistant

**Version:** 1.0  
**Date:** November 2026  
**Repository:** https://github.com/JanWillemSteur65/mas-ai-assistant

---

## Welcome

The MAS AI Assistant gives you a fast, friendly window into your IBM Maximo Application Suite data — without leaving your desk or waiting for Maximo to load. It runs entirely on your laptop and connects directly to your MAS instance using the same OSLC REST API that Maximo itself uses.

You can browse assets, work orders, meter readings, and more through a clean IBM Carbon interface, or just type a plain-language question in the AI Chat panel to get answers instantly.

---

## Getting started

### What you need

- A Mac or Linux laptop with **Node.js 18 or later** ([download here](https://nodejs.org))
- Access to an IBM Maximo Application Suite (MAS Manage) instance
- An **API key** (preferred) or username + password with read access to your site

### Installation (one time only)

Open a terminal and run:

```bash
git clone https://github.com/JanWillemSteur65/mas-ai-assistant ~/.bob/skills/mas-ai-assistant
bash ~/.bob/skills/mas-ai-assistant/setup.sh
```

The setup script will:
1. Install all required packages
2. Build the browser interface
3. Create a `.env` configuration file (a template — you fill it in next)
4. Register a background service so the assistant starts automatically on login

### Enter your credentials

Open the configuration file:

```bash
nano ~/.bob/skills/mas-ai-assistant/.env
```

Fill in at least these lines:

```
MAXIMO_URL=https://your-mas-host/maximo/api
MAXIMO_AUTH_TYPE=apikey
MAXIMO_API_KEY=your-api-key-here
MAXIMO_ORG=EAGLENA
MAXIMO_SITE=BEDFORD
```

Save (`Ctrl+O`, `Enter`, `Ctrl+X`), then restart the assistant:

```bash
launchctl unload ~/Library/LaunchAgents/com.maximo.assistant.plist
launchctl load ~/Library/LaunchAgents/com.maximo.assistant.plist
```

### Open the assistant

Go to **http://localhost:3737** in your browser. You should see the IBM Maximo Assistant dashboard.

---

## The interface at a glance

```
┌─────────────────────────────────────────────────────────────────┐
│ ① Header bar                                                    │
│   IBM Maximo Assistant  [Org ▾] [Site ▾]  [🔄] [💬 AI] [⚙]    │
├────────────┬────────────────────────────────────────────────────┤
│ ② Sidebar  │  ③ Main content area                              │
│            │                                                    │
│  Dashboard │                                                    │
│  Assets    │                                                    │
│  Work      │                                                    │
│  Orders    │                                                    │
│  ...       │                                                    │
└────────────┴────────────────────────────────────────────────────┘
```

| # | Area | What it does |
|---|---|---|
| ① | Header | Shows the active org and site. Use the dropdowns to switch scope. 🔄 refreshes data, 💬 opens AI Chat, ⚙ opens Settings |
| ② | Sidebar | Navigate between the 10 views |
| ③ | Content | The active view — tables, charts, or a map |

---

## Switching org and site

The **Org** and **Site** dropdowns in the header control which Maximo site's data you see across all views. When you change the site, every table and chart reloads automatically for the new scope.

The defaults come from your `.env` file. You can also change them permanently in the Settings modal (⚙).

---

## The 10 views

### Dashboard

Your at-a-glance overview. Shows:
- **4 KPI tiles** — total assets, work orders (with open WO count), health insights (CM work orders), and preventive maintenance records
- **5 donut charts** — work orders by type, work orders by status, assets by type, assets by status, PMs by status
- **Bar chart** — work order types
- **Recent work orders** table — the 5 most recently reported WOs

Click any work order row to see its full details.

---

### Assets

A paginated list of all assets in the active site.

**To search:** type a description fragment in the search box and press Enter (or click Search).

**To see full details:** click any row. The detail panel shows all fields, a colour-coded status tag, and — if the asset has meters — a **Meter Readings** section with a trend chart for each meter (last 14 days).

**To create a work order:** click **Create WO** in the asset detail panel.  
**To create a service request:** click **Create SR**.

---

### Work Orders

A paginated list of work orders, ordered by most recent first.

**To filter by status:** use the status dropdown (WAPPR, APPR, INPRG, COMP, CAN, etc.).  
**To search:** type a description fragment.

**To change a work order's status:** click the row → click **Change Status** → choose a status and add a memo → submit.

---

### Health Insights

Shows only **Condition Monitoring (CM)** work orders — the work orders created by Maximo's condition monitoring rules. Same layout and actions as Work Orders.

---

### Meter Readings

A flat table of all asset meters in the active site, showing the latest reading for each meter.

**To look up a specific asset's meters:** type the asset number in the search box and click Search.

**To see historical trends:** click any meter row. The detail panel shows a full trend chart for that meter's readings over the last 14 days:
- Light background with horizontal grid lines
- Y-axis: measurement values
- X-axis: dates
- Coloured line with individual data point dots

---

### Locations

A paginated list of functional locations. Search by description, click a row to see full details, and create work orders or service requests directly from the detail panel.

---

### Preventive Maintenance

Lists all PM records with their frequency, unit, and next scheduled date. Click a row for full details.

---

### Bad Actors

Shows the **top 20 assets ranked by work order count** in the active site. Useful for identifying which assets are consuming the most maintenance effort.

The view shows:
- A horizontal bar chart of WO counts
- A ranked table with asset number, description, WO count, and latest meter reading

---

### Data Explorer

A power-user tool that lets you query **any Maximo Object Structure** directly.

1. Select an Object Structure from the dropdown (e.g. `mxapijobplan`, `mxapifailurelist`)
2. The column list is auto-populated from Maximo's schema
3. Optionally tick/untick columns
4. Add a WHERE clause (OSLC syntax, e.g. `status="ACTIVE"`)
5. Click **Run Query**

Pre-configured structures with curated column sets include:
Assets, Work Orders, Locations, Preventive Maintenance, Job Plans, Service Requests, Job Cards, Safety Plans, Failure Lists, Sites, and more.

---

### Geo Map

An interactive map showing the physical locations of your Maximo records.

**Layer controls** (top of view): toggle Assets, Locations, Work Orders, and Service Requests on/off.

**Tile layers** (top-right corner of map): switch between Standard, Humanitarian, Topographic, Satellite, Light, and Dark map styles.

**Clicking a pin** opens a popup with key fields and a "Show details" link.

> **Note:** Pins only appear for records that have GPS coordinates (`latitudey` / `longitudex`) entered via Service Addresses in Maximo. If you see no pins, ask your Maximo administrator to populate location coordinates.

---

## AI Chat

Click the **💬 AI** button in the header to open the chat panel. You can ask questions in plain English:

| You type | What happens |
|---|---|
| `show active work orders` | Returns a table of WAPPR work orders |
| `list all assets` | Returns the full asset list |
| `latest meter readings` | Returns a flat meter table |
| `show preventive maintenance` | Returns all PMs |
| `show job plans` | Returns job plans from `mxapijobplan` |
| `condition monitoring` | Returns CM (health insight) work orders |
| `list locations` | Returns all locations |
| `show service requests` | Returns service requests |
| `what can you help with?` | Shows all supported queries |

Results appear as tables inside the chat — you can click any row to open the full record detail panel, just like in the sidebar views.

**Tips:**
- The chat always uses the site and org shown in the header
- You can drag the left edge of the chat panel to make it wider or narrower
- Click **New Chat** to clear the conversation
- Click **X** to close (the history is preserved while the page is open)

### Enabling full AI with IBM watsonx (optional)

By default the chat uses a keyword pattern-matching engine — it always works, even offline. To unlock a true conversational AI powered by IBM Granite, add your watsonx credentials in the Settings modal (⚙):

| Field | Where to find it |
|---|---|
| watsonx URL | IBM Cloud → watsonx.ai → instance details |
| watsonx API key | IBM Cloud → Manage → API keys |
| Project ID | watsonx.ai → Projects → your project → Manage |

The model defaults to `ibm/granite-4-h-small`. You can change it in Settings or directly in `.env`.

---

## Settings (⚙)

Click the ⚙ button in the header to open the Settings modal.

| Setting | Description |
|---|---|
| Maximo URL | The base API URL — e.g. `https://mymas.example.com/maximo/api` |
| Auth type | `apikey` or `basic` |
| API key | Your Maximo API key |
| Username / Password | For basic auth |
| Default site | The site loaded on startup |
| Map location | Enter an address and click **Lookup** to set the map centre |
| watsonx URL / API key / Project ID | Optional — enables Granite AI in the chat |
| Page size | How many rows to load per request (10 – 2000) |

Changes take effect immediately — no server restart needed (except auth changes, which require a restart).

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Enter` | Submit search / send chat message |
| `Escape` | Close modal or chat panel |

---

## Troubleshooting

### The page shows "Error" or no data

1. Check the site and org dropdowns — make sure you're scoped to a site that has data
2. Check your credentials: open ⚙ → verify the Maximo URL and API key
3. Check the server log: `tail -50 ~/.bob/skills/mas-ai-assistant/server.log`
4. Test the connection: `curl -s http://127.0.0.1:3737/api/settings`

### "Maximo 401: Unauthorized"

Your API key is wrong or expired. Update it in ⚙ Settings or directly in `.env`, then restart:

```bash
launchctl unload ~/Library/LaunchAgents/com.maximo.assistant.plist
launchctl load ~/Library/LaunchAgents/com.maximo.assistant.plist
```

### The UI doesn't load at all

The server may have stopped. Restart it:

```bash
launchctl unload ~/Library/LaunchAgents/com.maximo.assistant.plist
lsof -ti:3737 | xargs kill -9 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.maximo.assistant.plist
sleep 3 && curl -s http://127.0.0.1:3737/api/settings
```

### Meter trend charts show "Not enough readings"

The asset's meters either have only one reading in the last 14 days, or the measurement collection sub-resource is not accessible. Check in Maximo that the asset has meter readings recorded via the Meter Readings application.

### No pins on the Geo Map

Pins require GPS coordinates on the Service Address linked to each asset or location (`latitudey` / `longitudex` fields in Maximo). Without these, no markers appear. This is a Maximo data entry requirement, not an assistant limitation.

### AI Chat says "I can help you with…" for every message

The keyword engine is working but your phrase didn't match a known pattern. Use one of the example phrases in the [AI Chat](#ai-chat) section above. If you want free-form natural language, configure watsonx.ai in ⚙ Settings.

---

## Updating to the latest version

```bash
cd ~/.bob/skills/mas-ai-assistant
git pull
cd ui && npm install && npm run build && cd ..
launchctl unload ~/Library/LaunchAgents/com.maximo.assistant.plist
launchctl load ~/Library/LaunchAgents/com.maximo.assistant.plist
```

Your `.env` credentials are preserved — `git pull` will never overwrite them because `.env` is excluded from the repository.
