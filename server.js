'use strict';
require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = parseInt(process.env.PORT || '3737', 10);

const MAXIMO_URL   = (process.env.MAXIMO_URL  || '').replace(/\/$/, '');
const API_KEY      = process.env.MAXIMO_API_KEY || '';
const MAXIMO_USER  = process.env.MAXIMO_USER   || '';
const MAXIMO_PASS  = process.env.MAXIMO_PASSWORD || '';
const AUTH_TYPE    = (process.env.MAXIMO_AUTH_TYPE || 'apikey').toLowerCase();
const DEFAULT_SITE = process.env.MAXIMO_SITE || '';
const DEFAULT_ORG  = process.env.MAXIMO_ORG  || '';

// Map / location defaults (persisted in .env)
let MAP_ADDRESS = process.env.MAP_ADDRESS || '';
let MAP_LAT     = process.env.MAP_LAT     || '';
let MAP_LNG     = process.env.MAP_LNG     || '';

// Helper: rewrite a single key=value line in .env file
function updateEnv(key, value) {
  const envPath = __dirname + '/.env';
  let src = '';
  try { src = fs.readFileSync(envPath, 'utf8'); } catch (_) { src = ''; }
  const escaped = value.replace(/\n/g, '\\n');
  const line = `${key}=${escaped}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(src)) {
    src = src.replace(re, line);
  } else {
    src = src.trimEnd() + '\n' + line + '\n';
  }
  fs.writeFileSync(envPath, src, 'utf8');
}

function authHeaders() {
  if (AUTH_TYPE === 'basic') {
    const b64 = Buffer.from(`${MAXIMO_USER}:${MAXIMO_PASS}`).toString('base64');
    return { 'Authorization': `Basic ${b64}`, 'Accept': 'application/json' };
  }
  return { 'apikey': API_KEY, 'Accept': 'application/json' };
}

async function maxFetch(path, params = {}) {
  const url = new URL(`${MAXIMO_URL}/os/${path}`);
  url.searchParams.set('lean', '1');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: authHeaders(), timeout: 30000 });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Maximo ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'ui', 'dist')));

// ── Settings ──────────────────────────────────────────────────────────────────
app.get('/api/settings', (_req, res) => {
  res.json({
    url: MAXIMO_URL,
    authType: AUTH_TYPE,
    site: DEFAULT_SITE,
    org: DEFAULT_ORG,
    mapAddress: MAP_ADDRESS,
    mapLat: MAP_LAT ? parseFloat(MAP_LAT) : null,
    mapLng: MAP_LNG ? parseFloat(MAP_LNG) : null,
  });
});

// ── Save map location settings ────────────────────────────────────────────────
app.post('/api/settings/location', (req, res) => {
  const { address, lat, lng } = req.body || {};
  if (!address || lat == null || lng == null) {
    return res.status(400).json({ error: 'address, lat and lng are required' });
  }
  MAP_ADDRESS = String(address);
  MAP_LAT     = String(lat);
  MAP_LNG     = String(lng);
  updateEnv('MAP_ADDRESS', MAP_ADDRESS);
  updateEnv('MAP_LAT',     MAP_LAT);
  updateEnv('MAP_LNG',     MAP_LNG);
  res.json({ ok: true, address: MAP_ADDRESS, lat: parseFloat(MAP_LAT), lng: parseFloat(MAP_LNG) });
});

// ── Geocode address via Nominatim ─────────────────────────────────────────────
app.get('/api/geocode', async (req, res) => {
  const { address } = req.query;
  if (!address) return res.status(400).json({ error: 'address is required' });
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&addressdetails=1`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'MAS-AI-Assistant/1.0 (maximo-assistant)' },
      timeout: 10000,
    });
    if (!r.ok) throw new Error(`Nominatim ${r.status}`);
    const data = await r.json();
    if (!data.length) return res.status(404).json({ error: 'Address not found' });
    const { lat, lon, display_name } = data[0];
    res.json({ lat: parseFloat(lat), lng: parseFloat(lon), displayName: display_name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Orgs ──────────────────────────────────────────────────────────────────────
app.get('/api/orgs', async (_req, res) => {
  try {
    const data = await maxFetch('mxapisite', {
      'oslc.select': 'siteid,orgid,description',
      'oslc.pageSize': '100',
    });
    const orgs = [...new Set((data.member || []).map(a => a.orgid).filter(Boolean))].sort();
    res.json(orgs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Sites ─────────────────────────────────────────────────────────────────────
app.get('/api/sites', async (req, res) => {
  const org = req.query.org || '';
  try {
    const params = {
      'oslc.select': 'siteid,description,orgid',
      'oslc.pageSize': '100',
    };
    if (org) params['oslc.where'] = `orgid="${org}"`;
    const data = await maxFetch('mxapisite', params);
    const sites = (data.member || []).map(s => ({ id: s.siteid, description: s.description }));
    res.json(sites);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Assets ────────────────────────────────────────────────────────────────────
app.get('/api/assets', async (req, res) => {
  const { site, org, search, page = 1, pageSize = 50 } = req.query;
  try {
    const whereParts = [];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    if (search) whereParts.push(`description="${search}%"`);
    const params = {
      'oslc.select': 'assetnum,description,siteid,orgid,status,location,assettype,serialnum,priority',
      'oslc.pageSize': String(pageSize),
      'pageno': String(page),
    };
    if (whereParts.length) params['oslc.where'] = whereParts.join(' and ');
    const data = await maxFetch('mxapiasset', params);
    res.json({ members: data.member || [], total: data.totalCount || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Work Orders ───────────────────────────────────────────────────────────────
app.get('/api/workorders', async (req, res) => {
  const { site, org, status, search, page = 1, pageSize = 50 } = req.query;
  try {
    const whereParts = [];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    if (status) whereParts.push(`status="${status}"`);
    if (search) whereParts.push(`description="${search}%"`);
    const params = {
      'oslc.select': 'wonum,description,siteid,orgid,status,worktype,location,assetnum,reportdate,priority,wopriority',
      'oslc.pageSize': String(pageSize),
      'oslc.orderBy': '-reportdate',
      'pageno': String(page),
    };
    if (whereParts.length) params['oslc.where'] = whereParts.join(' and ');
    const data = await maxFetch('mxapiwo', params);
    res.json({ members: data.member || [], total: data.totalCount || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Locations ─────────────────────────────────────────────────────────────────
app.get('/api/locations', async (req, res) => {
  const { site, org, search, page = 1, pageSize = 50 } = req.query;
  try {
    const whereParts = [];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    if (search) whereParts.push(`description="${search}%"`);
    const params = {
      'oslc.select': 'location,description,siteid,orgid,type,status',
      'oslc.pageSize': String(pageSize),
      'oslc.orderBy': '+location',
      'pageno': String(page),
    };
    if (whereParts.length) params['oslc.where'] = whereParts.join(' and ');
    const data = await maxFetch('mxapilocation', params);
    res.json({ members: data.member || [], total: data.totalCount || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Meter Readings ────────────────────────────────────────────────────────────
app.get('/api/meters', async (req, res) => {
  const { site, org, assetnum, pageSize = 50 } = req.query;
  try {
    const whereParts = [];
    if (assetnum) whereParts.push(`assetnum="${assetnum}"`);
    else if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    const params = {
      'oslc.select': 'assetnum,siteid,assetmeter{metername,lastreading,lastreadingdate,readingtype,measureunitid}',
      'oslc.pageSize': String(pageSize),
    };
    if (whereParts.length) params['oslc.where'] = whereParts.join(' and ');
    const data = await maxFetch('mxapiasset', params);
    // flatten
    const rows = [];
    for (const a of (data.member || [])) {
      for (const m of (a.assetmeter || [])) {
        rows.push({
          assetnum: a.assetnum,
          siteid: a.siteid,
          metername: m.metername,
          lastreading: m.lastreading,
          lastreadingdate: m.lastreadingdate,
          readingtype: m.readingtype,
          unit: m.measureunitid,
        });
      }
    }
    res.json({ members: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Condition Health (CM work orders) ─────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const { site, org, search, page = 1, pageSize = 50 } = req.query;
  try {
    const whereParts = ['worktype="CM"'];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    if (search) whereParts.push(`description="${search}%"`);
    const params = {
      'oslc.select': 'wonum,description,siteid,orgid,status,worktype,assetnum,location,reportdate,priority',
      'oslc.where': whereParts.join(' and '),
      'oslc.pageSize': String(pageSize),
      'oslc.orderBy': '-reportdate',
      'pageno': String(page),
    };
    const data = await maxFetch('mxapiwo', params);
    res.json({ members: data.member || [], total: data.totalCount || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Bad Actors ────────────────────────────────────────────────────────────────
app.get('/api/badactors', async (req, res) => {
  const { site, org } = req.query;
  try {
    const whereParts = [];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);

    const params = {
      'oslc.select': 'wonum,assetnum,siteid,status',
      'oslc.pageSize': '500',
    };
    if (whereParts.length) params['oslc.where'] = whereParts.join(' and ');
    const woData = await maxFetch('mxapiwo', params);

    // Count WOs per asset
    const counts = {};
    for (const wo of (woData.member || [])) {
      if (!wo.assetnum) continue;
      counts[wo.assetnum] = (counts[wo.assetnum] || 0) + 1;
    }

    // Top 20 assets
    const top20 = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([assetnum, woCount]) => ({ assetnum, woCount }));

    if (top20.length === 0) return res.json([]);

    // Enrich with asset details - fetch individually to avoid long OR clauses
    const assetData = { member: [] };
    for (const { assetnum } of top20) {
      try {
        const siteFilter = whereParts.length ? ` and ${whereParts.join(' and ')}` : '';
        const d = await maxFetch('mxapiasset', {
          'oslc.select': 'assetnum,description,siteid,status,assettype,location,assetmeter{metername,lastreading,lastreadingdate,readingtype}',
          'oslc.where': `assetnum="${assetnum}"${siteFilter}`,
          'oslc.pageSize': '1',
        });
        if (d.member && d.member[0]) assetData.member.push(d.member[0]);
      } catch (_) { /* skip unenrichable assets */ }
    }
    const assetMap = {};
    for (const a of (assetData.member || [])) {
      assetMap[a.assetnum] = a;
    }

    const result = top20.map(({ assetnum, woCount }, idx) => {
      const a = assetMap[assetnum] || {};
      return {
        rank: idx + 1,
        assetnum,
        woCount,
        description: a.description || '',
        siteid: a.siteid || '',
        status: a.status || '',
        assettype: a.assettype || '',
        location: a.location || '',
        meters: (a.assetmeter || []).map(m => ({
          name: m.metername,
          value: m.lastreading,
          date: m.lastreadingdate,
          type: m.readingtype,
        })),
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PMs ───────────────────────────────────────────────────────────────────────
app.get('/api/pms', async (req, res) => {
  const { site, org, search, page = 1, pageSize = 50 } = req.query;
  try {
    const whereParts = [];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    if (search) whereParts.push(`description="${search}%"`);
    const params = {
      'oslc.select': 'pmnum,description,siteid,status,assetnum,location,frequency,frequnit',
      'oslc.pageSize': String(pageSize),
      'pageno': String(page),
    };
    if (whereParts.length) params['oslc.where'] = whereParts.join(' and ');
    const data = await maxFetch('mxapipm', params);
    res.json({ members: data.member || [], total: data.totalCount || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Stats (aggregated chart data) ────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  const { site, org } = req.query;
  try {
    const whereParts = [];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    const whereStr = whereParts.length ? whereParts.join(' and ') : undefined;

    // Use collectioncount=1 so Maximo returns responseInfo.totalCount.
    // Fetch enough records to build accurate pie charts (up to 1000 per category).
    const woParams = { 'oslc.select': 'worktype,status', 'oslc.pageSize': '1000', 'collectioncount': '1' };
    if (whereStr) woParams['oslc.where'] = whereStr;

    const assetParams = { 'oslc.select': 'assettype,status', 'oslc.pageSize': '1000', 'collectioncount': '1' };
    if (whereStr) assetParams['oslc.where'] = whereStr;

    const pmParams = { 'oslc.select': 'status', 'oslc.pageSize': '1000', 'collectioncount': '1' };
    if (whereStr) pmParams['oslc.where'] = whereStr;

    const [woData, assetData, pmData] = await Promise.all([
      maxFetch('mxapiwo', woParams),
      maxFetch('mxapiasset', assetParams),
      maxFetch('mxapipm', pmParams),
    ]);

    const count = (arr, key) => {
      const map = {};
      for (const item of arr) {
        const v = item[key] || '(blank)';
        map[v] = (map[v] || 0) + 1;
      }
      return Object.entries(map).sort((a,b) => b[1]-a[1]).map(([k,v]) => ({ label:k, value:v }));
    };

    const wos    = woData.member    || [];
    const assets = assetData.member || [];
    const pms    = pmData.member    || [];

    res.json({
      woByType:     count(wos,    'worktype'),
      woByStatus:   count(wos,    'status'),
      assetByType:  count(assets, 'assettype'),
      assetByStatus:count(assets, 'status'),
      pmByStatus:   count(pms,    'status'),
      // True totals from Maximo's collectioncount
      totalWOs:    woData.responseInfo?.totalCount    || wos.length,
      totalAssets: assetData.responseInfo?.totalCount || assets.length,
      totalPMs:    pmData.responseInfo?.totalCount    || pms.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Map Data (assets with GPS coords) ────────────────────────────────────────
app.get('/api/mapdata', async (req, res) => {
  const { site, org } = req.query;
  try {
    const whereParts = [];
    if (site) whereParts.push(`siteid="${site}"`);
    else if (org) whereParts.push(`orgid="${org}"`);
    const params = {
      'oslc.select': 'assetnum,description,siteid,status,assettype,location,serviceaddress{latitudey,longitudex,streetaddress,city,stateprovince,formattedaddress}',
      'oslc.pageSize': '200',
    };
    if (whereParts.length) params['oslc.where'] = whereParts.join(' and ');
    const data = await maxFetch('mxapiasset', params);
    const result = [];
    for (const a of (data.member || [])) {
      const addrs = a.serviceaddress || [];
      const addr = addrs.find(x => x.latitudey != null && x.longitudex != null);
      if (!addr) continue;
      result.push({
        assetnum:    a.assetnum,
        description: a.description || '',
        siteid:      a.siteid || '',
        status:      a.status || '',
        assettype:   a.assettype || '',
        location:    a.location || '',
        lat:         addr.latitudey,
        lng:         addr.longitudex,
        address:     addr.formattedaddress || addr.streetaddress || '',
      });
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Map Layers (multi-layer: assets, locations, workorders, sr) ───────────────
app.get('/api/maplayers', async (req, res) => {
  const { site, org, layers = 'assets,locations,workorders,sr' } = req.query;
  const requested = layers.split(',').map(s => s.trim());

  const whereParts = [];
  if (site) whereParts.push(`siteid="${site}"`);
  else if (org) whereParts.push(`orgid="${org}"`);
  const whereStr = whereParts.join(' and ');

  const addrSelect = 'serviceaddress{latitudey,longitudex,streetaddress,city,formattedaddress}';

  // Fetch service address coords for a batch of { assetnum, siteid } pairs.
  // The serviceaddress{} sub-select only works when siteid is included in the
  // oslc.where filter — without it Maximo returns a different site's records
  // that may have no service addresses.
  // Returns { [assetnum]: { lat, lng, address } }
  async function fetchAssetCoords(assetSitePairs) {
    if (!assetSitePairs || assetSitePairs.length === 0) return {};
    const results = {};
    try {
      // Group by siteid so each chunk only contains assets from the same site
      const bySite = {};
      for (const { assetnum, siteid } of assetSitePairs) {
        const key = siteid || '';
        if (!bySite[key]) bySite[key] = [];
        bySite[key].push(assetnum);
      }

      await Promise.all(Object.entries(bySite).map(async ([siteid, assetnums]) => {
        // chunk at 50 to stay within URL length limits
        for (let i = 0; i < assetnums.length; i += 50) {
          const chunk = assetnums.slice(i, i + 50);
          // Use OSLC "in" syntax: assetnum in ["A","B"] — parenthesised OR chains
          // are not supported by this Maximo instance's OSLC parser.
          const inList    = chunk.map(a => `"${a}"`).join(',');
          const siteFilter = siteid ? `siteid="${siteid}" and ` : '';
          const params = {
            'oslc.where':    `${siteFilter}assetnum in [${inList}]`,
            'oslc.select':   `assetnum,${addrSelect}`,
            'oslc.pageSize': String(chunk.length),
            'lean': '1',
          };
          const data = await maxFetch('mxapiasset', params);
          for (const a of (data.member || [])) {
            const addr = (a.serviceaddress || []).find(x => x.latitudey != null && x.longitudex != null);
            if (addr) results[a.assetnum] = {
              lat:     addr.latitudey,
              lng:     addr.longitudex,
              address: addr.formattedaddress || addr.streetaddress || '',
            };
          }
        }
      }));
    } catch (e) {
      console.error('[maplayers] fetchAssetCoords failed:', e.message);
    }
    return results;
  }

  async function fetchLayer(name) {
    try {
      if (name === 'assets') {
        const params = {
          'oslc.select': `assetnum,description,siteid,status,assettype,location,${addrSelect}`,
          'oslc.pageSize': '200',
        };
        if (whereStr) params['oslc.where'] = whereStr;
        const data = await maxFetch('mxapiasset', params);
        return (data.member || []).flatMap(a => {
          const addr = (a.serviceaddress || []).find(x => x.latitudey != null && x.longitudex != null);
          if (!addr) return [];
          return [{ _layer:'asset', assetnum:a.assetnum, description:a.description||'', siteid:a.siteid||'',
            status:a.status||'', assettype:a.assettype||'', location:a.location||'',
            lat:addr.latitudey, lng:addr.longitudex, address:addr.formattedaddress||addr.streetaddress||'' }];
        });
      }
      if (name === 'locations') {
        const params = {
          'oslc.select': `location,description,siteid,status,type,${addrSelect}`,
          'oslc.pageSize': '200',
        };
        if (whereStr) params['oslc.where'] = whereStr;
        const data = await maxFetch('mxapilocation', params);
        return (data.member || []).flatMap(l => {
          const addr = (l.serviceaddress || []).find(x => x.latitudey != null && x.longitudex != null);
          if (!addr) return [];
          return [{ _layer:'location', location:l.location, description:l.description||'', siteid:l.siteid||'',
            status:l.status||'', type:l.type||'',
            lat:addr.latitudey, lng:addr.longitudex, address:addr.formattedaddress||addr.streetaddress||'' }];
        });
      }
      if (name === 'workorders') {
        const params = {
          'oslc.select': `wonum,description,siteid,status,worktype,assetnum,location,reportdate,${addrSelect}`,
          'oslc.pageSize': '200',
        };
        if (whereStr) params['oslc.where'] = whereStr;
        const data = await maxFetch('mxapiwo', params);
        const wos = data.member || [];

        // Collect { assetnum, siteid } pairs for WOs that have no own service address coords.
        // siteid MUST be included so the asset lookup uses the right site filter.
        const seen = new Set();
        const missingAssets = wos.filter(w => {
          const addr = (w.serviceaddress || []).find(x => x.latitudey != null && x.longitudex != null);
          const key = `${w.assetnum}|${w.siteid}`;
          if (!addr && w.assetnum && !seen.has(key)) { seen.add(key); return true; }
          return false;
        }).map(w => ({ assetnum: w.assetnum, siteid: w.siteid || '' }));
        const assetCoords = await fetchAssetCoords(missingAssets);

        return wos.flatMap(w => {
          const addr = (w.serviceaddress || []).find(x => x.latitudey != null && x.longitudex != null);
          const coords = addr
            ? { lat:addr.latitudey, lng:addr.longitudex, address:addr.formattedaddress||addr.streetaddress||'' }
            : (w.assetnum && assetCoords[w.assetnum]) || null;
          if (!coords) return [];
          return [{ _layer:'workorder', wonum:w.wonum, description:w.description||'', siteid:w.siteid||'',
            status:w.status||'', worktype:w.worktype||'', assetnum:w.assetnum||'', location:w.location||'',
            reportdate:w.reportdate||'',
            lat:coords.lat, lng:coords.lng, address:coords.address }];
        });
      }
      if (name === 'sr') {
        const params = {
          'oslc.select': `ticketid,description,siteid,status,assetnum,reportdate,${addrSelect}`,
          'oslc.pageSize': '200',
        };
        if (whereStr) params['oslc.where'] = whereStr;
        const data = await maxFetch('mxapisr', params);
        const srs = data.member || [];

        // Collect { assetnum, siteid } pairs for SRs that have no own service address coords.
        const seen = new Set();
        const missingAssets = srs.filter(s => {
          const addr = (s.serviceaddress || []).find(x => x.latitudey != null && x.longitudex != null);
          const key = `${s.assetnum}|${s.siteid}`;
          if (!addr && s.assetnum && !seen.has(key)) { seen.add(key); return true; }
          return false;
        }).map(s => ({ assetnum: s.assetnum, siteid: s.siteid || '' }));
        const assetCoords = await fetchAssetCoords(missingAssets);

        return srs.flatMap(s => {
          const addr = (s.serviceaddress || []).find(x => x.latitudey != null && x.longitudex != null);
          const coords = addr
            ? { lat:addr.latitudey, lng:addr.longitudex, address:addr.formattedaddress||addr.streetaddress||'' }
            : (s.assetnum && assetCoords[s.assetnum]) || null;
          if (!coords) return [];
          return [{ _layer:'sr', ticketid:s.ticketid, description:s.description||'', siteid:s.siteid||'',
            status:s.status||'', assetnum:s.assetnum||'', reportdate:s.reportdate||'',
            lat:coords.lat, lng:coords.lng, address:coords.address }];
        });
      }
      return [];
    } catch (e) {
      console.error(`[maplayers] layer "${name}" failed:`, e.message);
      return [];
    }
  }

  try {
    const [assets, locations, workorders, sr] = await Promise.all([
      requested.includes('assets')     ? fetchLayer('assets')     : [],
      requested.includes('locations')  ? fetchLayer('locations')  : [],
      requested.includes('workorders') ? fetchLayer('workorders') : [],
      requested.includes('sr')         ? fetchLayer('sr')         : [],
    ]);
    res.json({ assets, locations, workorders, sr });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Change Status ─────────────────────────────────────────────────────────────
app.post('/api/changestatus', async (req, res) => {
  const { objectType, id, siteid, status: newStatus, memo } = req.body || {};
  if (!objectType || !id || !newStatus) {
    return res.status(400).json({ error: 'objectType, id and status are required' });
  }
  const os      = objectType === 'wo' ? 'mxapiwo' : 'mxapisr';
  const idField = objectType === 'wo' ? 'wonum'   : 'ticketid';
  try {
    // Step 1: GET the resource WITHOUT lean=1 so Maximo returns the real internal href
    // (lean=1 hrefs lack the encoded MBO key that wsmethod:changeStatus requires).
    // Query by ID only — do NOT include siteid in the filter because the calling UI
    // may pass the default site while the record lives in a different site.
    // Non-lean OSLC responses use 'rdfs:member' (not 'oslc:member' or 'member').
    const getUrl = `${MAXIMO_URL}/os/${os}?oslc.where=${encodeURIComponent(`${idField}="${id}"`)}&oslc.select=${idField},siteid&oslc.pageSize=1`;
    const getR = await fetch(getUrl, { headers: authHeaders() });
    if (!getR.ok) {
      const txt = await getR.text();
      throw new Error(`Maximo GET ${getR.status}: ${txt.slice(0, 300)}`);
    }
    const getData = await getR.json();
    const members = getData['rdfs:member'] || getData['oslc:member'] || getData.member || [];
    const record  = members[0];
    if (!record) throw new Error(`${objectType.toUpperCase()} ${id} not found`);

    // Step 2: PATCH the resource to change its status.
    // Maximo MAS REST API: POST with x-method-override:PATCH to the resource URI.
    // The rdf:about href contains the encoded MBO key and may use a different
    // internal hostname — rebuild it using our configured MAXIMO_URL base so
    // our API key is accepted.
    const rawHref = record['rdf:about'] || record.href || '';
    if (!rawHref) throw new Error('Could not determine resource href from Maximo response');

    let resourcePath;
    try {
      const osPathMatch = new URL(rawHref).pathname.match(/\/os\/.+/);
      resourcePath = osPathMatch ? osPathMatch[0] : new URL(rawHref).pathname;
    } catch (_) {
      resourcePath = rawHref.replace(/^https?:\/\/[^/]+/, '');
    }

    // Non-lean PATCH: Maximo requires field names with the 'spi:' namespace prefix.
    // Plain field names (e.g. "status") are ignored and the PATCH silently does nothing.
    // No lean=1 on the PATCH URL — lean mode returns 400 for PATCH requests.
    const actionUrl = `${MAXIMO_URL}${resourcePath}`;
    const body = { 'spi:status': newStatus };
    if (memo) body['spi:memo'] = memo;
    const actionR = await fetch(actionUrl, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'x-method-override': 'PATCH' },
      body: JSON.stringify(body),
    });
    if (!actionR.ok) {
      const txt = await actionR.text();
      throw new Error(`Maximo ${actionR.status}: ${txt.slice(0, 400)}`);
    }
    // Verify the status actually changed by re-fetching the record
    const verifyUrl = `${MAXIMO_URL}/os/${os}?oslc.where=${encodeURIComponent(`${idField}="${id}"`)}&oslc.select=${idField},status&lean=1&oslc.pageSize=1`;
    const verifyR = await fetch(verifyUrl, { headers: authHeaders() });
    let actualStatus = newStatus;
    if (verifyR.ok) {
      const vData = await verifyR.json();
      const vMembers = vData['rdfs:member'] || vData['oslc:member'] || vData.member || [];
      if (vMembers[0]) actualStatus = vMembers[0].status || newStatus;
    }
    if (actualStatus !== newStatus) {
      throw new Error(`Status update failed — Maximo still shows ${actualStatus}. The transition from current status to ${newStatus} may not be allowed.`);
    }
    res.json({ success: true, status: actualStatus });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create Work Order ─────────────────────────────────────────────────────────
app.post('/api/createwo', async (req, res) => {
  const { description, assetnum, location, siteid, worktype, priority } = req.body || {};
  try {
    const body = { description, siteid: siteid || DEFAULT_SITE, worktype: worktype || 'CM' };
    if (assetnum) body.assetnum = assetnum;
    if (location) body.location = location;
    if (priority) body.wopriority = Number(priority);
    // POST without x-method-override:SYNC — Maximo returns 201 with the created record
    // (SYNC can return empty body on some MAS versions, causing JSON parse errors)
    const url = `${MAXIMO_URL}/os/mxapiwo?lean=1`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Maximo ${r.status}: ${txt.slice(0, 300)}`);
    // 201 response may have a body or may be empty; handle both
    let created = {};
    if (txt && txt.trim().startsWith('{')) {
      try { created = JSON.parse(txt); } catch (_) { /* ignore parse errors — record was created */ }
    }
    // Extract WO number from Location header if body was empty
    const location_header = r.headers.get('Location') || r.headers.get('location') || '';
    const wonumFromHeader = location_header.match(/\/([^/]+)$/)?.[1] || '';
    res.json({ wonum: created.wonum || wonumFromHeader || '(created)', href: created.href || location_header });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create Service Request ────────────────────────────────────────────────────
app.post('/api/createsr', async (req, res) => {
  const { description, assetnum, location, siteid, reportedpriority } = req.body || {};
  try {
    const body = { description, siteid: siteid || DEFAULT_SITE };
    if (assetnum) body.assetnum = assetnum;
    if (location) body.location = location;
    if (reportedpriority) body.reportedpriority = Number(reportedpriority);
    const url = `${MAXIMO_URL}/os/mxapisr?lean=1`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(`Maximo ${r.status}: ${txt.slice(0, 300)}`);
    let created = {};
    if (txt && txt.trim().startsWith('{')) {
      try { created = JSON.parse(txt); } catch (_) { /* ignore */ }
    }
    const location_header = r.headers.get('Location') || r.headers.get('location') || '';
    res.json({ ticketid: created.ticketid || '(created)', href: created.href || location_header });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Chat / AI ─────────────────────────────────────────────────────────────────
const WX_URL        = process.env.WX_URL        || '';
const WX_API_KEY    = process.env.WX_API_KEY    || '';
const WX_PROJECT_ID = process.env.WX_PROJECT_ID || '';
const WX_MODEL      = process.env.WX_MODEL      || 'ibm/granite-4-h-small';

async function keywordReply(message, context) {
  const msg = message.toLowerCase();
  const site = context.site || DEFAULT_SITE;
  const org  = context.org  || '';
  const scopeLabel = site || org || 'all sites';
  // Use the page size set by the user in Settings (passed from the UI via context)
  const pgSize = String(Math.min(parseInt(context.pageSize) || 50, 2000));

  // Helper to build a structured response with table data
  function tableResp(reply, rows, columns, idField) {
    return { reply, rows, columns, idField };
  }

  if (msg.includes('work order') || msg.includes('wo ')) {
    const status = msg.includes('open') || msg.includes('active') ? 'WAPPR'
                 : msg.includes('appr') ? 'APPR'
                 : msg.includes('progress') || msg.includes('inprg') ? 'INPRG'
                 : msg.includes('comp') ? 'COMP' : '';
    const where = site
      ? `siteid="${site}"` + (status ? ` and status="${status}"` : '')
      : status ? `status="${status}"` : undefined;
    const data = await maxFetch('mxapiwo', {
      'oslc.select': 'wonum,description,status,worktype,assetnum,location,reportdate,wopriority',
      'oslc.pageSize': pgSize,
      'oslc.orderBy': '-reportdate',
      ...(where ? { 'oslc.where': where } : {}),
    });
    const rows = data.member || [];
    if (!rows.length) return { reply: `No work orders found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** work orders for **${scopeLabel}**${status ? ` (status: ${status})` : ''}. Click any row for details.`,
      rows,
      [
        { key:'wonum', label:'WO #', type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'status', label:'Status', type:'status' },
        { key:'worktype', label:'Type', type:'text' },
        { key:'assetnum', label:'Asset', type:'text' },
        { key:'location', label:'Location', type:'text' },
        { key:'reportdate', label:'Reported', type:'date' },
      ],
      'wonum'
    );
  }

  if (msg.includes('asset')) {
    const data = await maxFetch('mxapiasset', {
      'oslc.select': 'assetnum,description,status,assettype,location,siteid',
      'oslc.pageSize': pgSize,
      ...(site ? { 'oslc.where': `siteid="${site}"` } : {}),
    });
    const rows = data.member || [];
    if (!rows.length) return { reply: `No assets found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** assets for **${scopeLabel}**. Click any row for details.`,
      rows,
      [
        { key:'assetnum', label:'Asset #', type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'status', label:'Status', type:'status' },
        { key:'assettype', label:'Type', type:'text' },
        { key:'location', label:'Location', type:'text' },
        { key:'siteid', label:'Site', type:'text' },
      ],
      'assetnum'
    );
  }

  if (msg.includes('meter') || msg.includes('reading')) {
    const data = await maxFetch('mxapiasset', {
      'oslc.select': 'assetnum,siteid,assetmeter{metername,lastreading,lastreadingdate,readingtype}',
      'oslc.pageSize': pgSize,
      ...(site ? { 'oslc.where': `siteid="${site}"` } : {}),
    });
    const rows = [];
    for (const a of (data.member || [])) {
      for (const m of (a.assetmeter || [])) {
        rows.push({ assetnum: a.assetnum, siteid: a.siteid, metername: m.metername,
          lastreading: m.lastreading, lastreadingdate: m.lastreadingdate, readingtype: m.readingtype });
      }
    }
    if (!rows.length) return { reply: `No meter readings found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** meter readings for **${scopeLabel}**. Click any row for details.`,
      rows,
      [
        { key:'assetnum', label:'Asset #', type:'id' },
        { key:'metername', label:'Meter', type:'text' },
        { key:'lastreading', label:'Reading', type:'number' },
        { key:'readingtype', label:'Type', type:'text' },
        { key:'lastreadingdate', label:'Date', type:'date' },
        { key:'siteid', label:'Site', type:'text' },
      ],
      'assetnum'
    );
  }

  if (msg.includes('pm') || msg.includes('preventive') || msg.includes('maintenance')) {
    const data = await maxFetch('mxapipm', {
      'oslc.select': 'pmnum,description,status,assetnum,location,frequency,frequnit,nextdate',
      'oslc.pageSize': pgSize,
      ...(site ? { 'oslc.where': `siteid="${site}"` } : {}),
    });
    const rows = data.member || [];
    if (!rows.length) return { reply: `No PMs found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** PMs for **${scopeLabel}**. Click any row for details.`,
      rows,
      [
        { key:'pmnum', label:'PM #', type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'status', label:'Status', type:'status' },
        { key:'assetnum', label:'Asset', type:'text' },
        { key:'frequency', label:'Freq', type:'number' },
        { key:'frequnit', label:'Unit', type:'text' },
        { key:'nextdate', label:'Next Date', type:'date' },
      ],
      'pmnum'
    );
  }

  if (msg.includes('health') || msg.includes('condition') || msg.includes('cm ')) {
    const data = await maxFetch('mxapiwo', {
      'oslc.select': 'wonum,description,status,assetnum,location,reportdate',
      'oslc.where': `worktype="CM"` + (site ? ` and siteid="${site}"` : ''),
      'oslc.pageSize': pgSize,
    });
    const rows = data.member || [];
    if (!rows.length) return { reply: `No condition monitoring work orders found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** condition health insights for **${scopeLabel}**. Click any row for details.`,
      rows,
      [
        { key:'wonum', label:'WO #', type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'status', label:'Status', type:'status' },
        { key:'assetnum', label:'Asset', type:'text' },
        { key:'location', label:'Location', type:'text' },
        { key:'reportdate', label:'Reported', type:'date' },
      ],
      'wonum'
    );
  }

  if (msg.includes('bad actor') || msg.includes('worst asset') || msg.includes('most work order')) {
    return { reply: `To see bad actors, click **Bad Actors** in the sidebar — it shows the top 20 assets ranked by work order count, enriched with meter readings.` };
  }

  if (msg.includes('location')) {
    const data = await maxFetch('mxapilocation', {
      'oslc.select': 'location,description,type,status,siteid',
      'oslc.pageSize': pgSize,
      ...(site ? { 'oslc.where': `siteid="${site}"` } : {}),
    });
    const rows = data.member || [];
    if (!rows.length) return { reply: `No locations found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** locations for **${scopeLabel}**. Click any row for details.`,
      rows,
      [
        { key:'location', label:'Location', type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'type', label:'Type', type:'text' },
        { key:'status', label:'Status', type:'status' },
        { key:'siteid', label:'Site', type:'text' },
      ],
      'location'
    );
  }

  if (msg.includes('service request') || msg.includes(' sr ') || msg.includes('ticket')) {
    const data = await maxFetch('mxapisr', {
      'oslc.select': 'ticketid,description,status,assetnum,location,reportdate,priority',
      'oslc.pageSize': pgSize,
      ...(site ? { 'oslc.where': `siteid="${site}"` } : {}),
    });
    const rows = data.member || [];
    if (!rows.length) return { reply: `No service requests found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** service requests for **${scopeLabel}**. Click any row for details.`,
      rows,
      [
        { key:'ticketid', label:'Ticket ID', type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'status', label:'Status', type:'status' },
        { key:'assetnum', label:'Asset', type:'text' },
        { key:'priority', label:'Priority', type:'number' },
        { key:'reportdate', label:'Reported', type:'date' },
      ],
      'ticketid'
    );
  }

  if (msg.includes('job plan') || msg.includes('jobplan') || msg.includes('jp ') || msg.startsWith('jp') || msg.includes(' jp')) {
    const whereClause = site ? `siteid="${site}"` : (org ? `orgid="${org}"` : '');
    const data = await maxFetch('mxapijobplan', {
      'oslc.select': 'jpnum,description,status,siteid,orgid,pluscrevnum,changedate',
      'oslc.pageSize': pgSize,
      ...(whereClause ? { 'oslc.where': whereClause } : {}),
    });
    const rows = data.member || [];
    if (!rows.length) return { reply: `No job plans found for ${scopeLabel}.` };
    return tableResp(
      `Found **${rows.length}** job plans for **${scopeLabel}**. Click any row for details.`,
      rows,
      [
        { key:'jpnum',       label:'JP #',        type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'status',      label:'Status',      type:'status' },
        { key:'siteid',      label:'Site',        type:'text' },
        { key:'orgid',       label:'Org',         type:'text' },
        { key:'pluscrevnum', label:'Rev #',       type:'text' },
        { key:'changedate',  label:'Changed',     type:'date' },
      ],
      'jpnum'
    );
  }

  if (msg.includes('site')) {
    const data = await maxFetch('mxapisite', { 'oslc.select': 'siteid,description,orgid', 'oslc.pageSize': pgSize });
    const rows = data.member || [];
    return tableResp(
      `Available sites (${rows.length}). Click any row for details.`,
      rows,
      [
        { key:'siteid', label:'Site ID', type:'id' },
        { key:'description', label:'Description', type:'text' },
        { key:'orgid', label:'Org', type:'text' },
      ],
      'siteid'
    );
  }

  return { reply: `I can help you with:\n• Work orders — "show active work orders"\n• Assets — "list assets"\n• Meter readings — "latest meter readings"\n• PMs — "show preventive maintenance"\n• Job plans — "show job plans"\n• Health insights — "condition monitoring"\n• Locations — "list locations"\n• Service requests — "show service requests"\n\nCurrently scoped to: **${scopeLabel}**` };
}

app.post('/api/chat', async (req, res) => {
  const { message, context = {} } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  // Try watsonx if configured
  if (WX_URL && WX_API_KEY && WX_PROJECT_ID) {
    try {
      const tokenRes = await fetch('https://iam.cloud.ibm.com/identity/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${WX_API_KEY}`,
      });
      const { access_token } = await tokenRes.json();
      const prompt = `You are an IBM Maximo asset management assistant. The user is working with site ${context.site || DEFAULT_SITE}. Answer helpfully and concisely.\n\nUser: ${message}\nAssistant:`;
      const wxRes = await fetch(`${WX_URL}/ml/v1/text/generation?version=2024-05-01`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: WX_MODEL,
          input: prompt,
          project_id: WX_PROJECT_ID,
          parameters: { max_new_tokens: 400, temperature: 0.3 },
        }),
      });
      const wxData = await wxRes.json();
      const reply = wxData.results?.[0]?.generated_text?.trim();
      if (reply) return res.json({ reply });
    } catch (_) { /* fall through to keyword */ }
  }

  // Keyword NLU fallback
  try {
    const result = await keywordReply(message, context);
    // keywordReply now returns { reply, rows?, columns?, idField? }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Best-practice column definitions ─────────────────────────────────────────
const BEST_PRACTICE_OS = {
  mxapiasset: {
    label: 'Assets',
    idField: 'assetnum',
    columns: [
      { key: 'assetnum',     label: 'Asset #',      type: 'id' },
      { key: 'description',  label: 'Description',  type: 'text' },
      { key: 'siteid',       label: 'Site',         type: 'text' },
      { key: 'orgid',        label: 'Org',          type: 'text' },
      { key: 'status',       label: 'Status',       type: 'status' },
      { key: 'assettype',    label: 'Type',         type: 'text' },
      { key: 'location',     label: 'Location',     type: 'text' },
      { key: 'serialnum',    label: 'Serial #',     type: 'text' },
      { key: 'manufacturer', label: 'Manufacturer', type: 'text' },
      { key: 'model',        label: 'Model',        type: 'text' },
      { key: 'priority',     label: 'Priority',     type: 'number' },
      { key: 'changedate',   label: 'Changed',      type: 'date' },
    ],
  },
  mxapilocation: {
    label: 'Locations',
    idField: 'location',
    columns: [
      { key: 'location',    label: 'Location',    type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'type',        label: 'Type',        type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'parent',      label: 'Parent',      type: 'text' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapipm: {
    label: 'Preventive Maintenance',
    idField: 'pmnum',
    columns: [
      { key: 'pmnum',       label: 'PM #',        type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'assetnum',    label: 'Asset',       type: 'text' },
      { key: 'location',    label: 'Location',    type: 'text' },
      { key: 'frequency',   label: 'Frequency',   type: 'number' },
      { key: 'frequnit',    label: 'Freq Unit',   type: 'text' },
      { key: 'leadtime',    label: 'Lead Time',   type: 'number' },
      { key: 'nextdate',    label: 'Next Date',   type: 'date' },
    ],
  },
  mxapijobplan: {
    label: 'Job Plans',
    idField: 'jpnum',
    columns: [
      { key: 'jpnum',       label: 'JP #',        type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'pluscrevnum', label: 'Rev #',       type: 'text' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapiwo: {
    label: 'Work Orders',
    idField: 'wonum',
    columns: [
      { key: 'wonum',       label: 'WO #',        type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'worktype',    label: 'Type',        type: 'text' },
      { key: 'assetnum',    label: 'Asset',       type: 'text' },
      { key: 'location',    label: 'Location',    type: 'text' },
      { key: 'wopriority',  label: 'Priority',    type: 'number' },
      { key: 'reportdate',  label: 'Reported',    type: 'date' },
      { key: 'schedstart',  label: 'Sched Start', type: 'date' },
      { key: 'actstart',    label: 'Act Start',   type: 'date' },
      { key: 'actfinish',   label: 'Act Finish',  type: 'date' },
      { key: 'assignedownergroup', label: 'Owner Group', type: 'text' },
    ],
  },
  mxapisr: {
    label: 'Service Requests',
    idField: 'ticketid',
    columns: [
      { key: 'ticketid',    label: 'Ticket ID',   type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'classstructureid', label: 'Class',  type: 'text' },
      { key: 'assetnum',    label: 'Asset',       type: 'text' },
      { key: 'location',    label: 'Location',    type: 'text' },
      { key: 'priority',    label: 'Priority',    type: 'number' },
      { key: 'reportedby',  label: 'Reported By', type: 'text' },
      { key: 'reportdate',  label: 'Reported',    type: 'date' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapialert: {
    label: 'Alerts',
    idField: 'alertnum',
    columns: [
      { key: 'alertnum',    label: 'Alert #',     type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'assetnum',    label: 'Asset',       type: 'text' },
      { key: 'location',    label: 'Location',    type: 'text' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapipo: {
    label: 'Purchase Orders',
    idField: 'ponum',
    columns: [
      { key: 'ponum',       label: 'PO #',        type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'vendor',      label: 'Vendor',      type: 'text' },
      { key: 'totalcost',   label: 'Total Cost',  type: 'number' },
      { key: 'orderdate',   label: 'Order Date',  type: 'date' },
      { key: 'requireddate',label: 'Required',    type: 'date' },
      { key: 'currency',    label: 'Currency',    type: 'text' },
    ],
  },
  mxapipr: {
    label: 'Purchase Requisitions',
    idField: 'prnum',
    columns: [
      { key: 'prnum',       label: 'PR #',        type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'requireddate',label: 'Required',    type: 'date' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapijobplan: {
    label: 'Job Plans',
    idField: 'jpnum',
    columns: [
      { key: 'jpnum',       label: 'JP #',        type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'pluscrevnum', label: 'Rev #',       type: 'text' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapiinventory: {
    label: 'Inventory',
    idField: 'itemnum',
    columns: [
      { key: 'itemnum',     label: 'Item #',      type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'storeloc',    label: 'Storeroom',   type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'binnum',      label: 'Bin',         type: 'text' },
      { key: 'curbal',      label: 'Current Bal', type: 'number' },
      { key: 'avgcost',     label: 'Avg Cost',    type: 'number' },
    ],
  },
  mxapiinvuse: {
    label: 'Inventory Usage',
    idField: 'invuseid',
    columns: [
      { key: 'invuseid',    label: 'Usage ID',    type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapiinvbal: {
    label: 'Inventory Balances',
    idField: 'itemnum',
    columns: [
      { key: 'itemnum',     label: 'Item #',      type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'storeloc',    label: 'Storeroom',   type: 'text' },
      { key: 'binnum',      label: 'Bin',         type: 'text' },
      { key: 'curbal',      label: 'Qty on Hand', type: 'number' },
      { key: 'physcnt',     label: 'Phys Count',  type: 'number' },
    ],
  },
  mxapiitem: {
    label: 'Items / Catalog',
    idField: 'itemnum',
    columns: [
      { key: 'itemnum',     label: 'Item #',      type: 'id' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'itemtype',    label: 'Type',        type: 'text' },
      { key: 'issueunit',   label: 'Unit',        type: 'text' },
      { key: 'lottype',     label: 'Lot Type',    type: 'text' },
      { key: 'changedate',  label: 'Changed',     type: 'date' },
    ],
  },
  mxapireceipt: {
    label: 'Receipts',
    idField: 'receivingid',
    columns: [
      { key: 'receivingid', label: 'Receipt ID',  type: 'id' },
      { key: 'ponum',       label: 'PO #',        type: 'text' },
      { key: 'siteid',      label: 'Site',        type: 'text' },
      { key: 'orgid',       label: 'Org',         type: 'text' },
      { key: 'status',      label: 'Status',      type: 'status' },
      { key: 'receiptdate', label: 'Receipt Date',type: 'date' },
      { key: 'vendor',      label: 'Vendor',      type: 'text' },
    ],
  },
};

app.get('/api/bestpractice', (_req, res) => {
  const result = Object.entries(BEST_PRACTICE_OS).map(([os, cfg]) => ({
    os,
    label: cfg.label,
    idField: cfg.idField,
    columns: cfg.columns,
  }));
  res.json(result);
});

// ── Generic query endpoint ────────────────────────────────────────────────────
app.get('/api/explore', async (req, res) => {
  const { os, select, where, page = 1, pageSize = 50, orderBy } = req.query;
  if (!os) return res.status(400).json({ error: 'os parameter required' });

  // Build params — allow up to 2000 records per page
  const buildParams = (whereStr) => {
    const p = {
      'oslc.pageSize':  String(Math.min(parseInt(pageSize) || 50, 2000)),
      'pageno':         String(page),
      'oslc.select':    select || '*',
      'collectioncount':'1',
    };
    if (whereStr)   p['oslc.where']   = whereStr;
    if (orderBy)    p['oslc.orderBy'] = orderBy;
    return p;
  };

  try {
    let data;
    try {
      data = await maxFetch(os, buildParams(where));
    } catch (e) {
      // BMXAA8781E = field not found — the OS likely doesn't support siteid/orgid.
      // Retry without the caller-supplied where clause (site scope removed).
      if (e.message.includes('400') && where && (where.includes('siteid=') || where.includes('orgid='))) {
        // Strip site/org parts and retry with any remaining user-defined filter
        const stripped = where.split(' and ')
          .filter(p => !p.startsWith('siteid=') && !p.startsWith('orgid='))
          .join(' and ');
        data = await maxFetch(os, buildParams(stripped || undefined));
      } else {
        throw e;
      }
    }
    res.json({ members: data.member || [], total: data.responseInfo?.totalCount || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Discover columns for an OS by fetching one record ────────────────────────
app.get('/api/os-schema', async (req, res) => {
  const { os } = req.query;
  if (!os) return res.status(400).json({ error: 'os parameter required' });
  try {
    // oslc.select=* is required — without it many OS return only href
    const data = await maxFetch(os, { 'oslc.pageSize': '1', 'oslc.select': '*' });
    const members = data.member || [];
    if (!members.length) return res.json({ columns: [] });
    const record = members[0];
    // Build column list from real fields — skip Maximo internals and collection refs
    const skip = new Set(['href', '_rowstamp', '_imagelibref']);
    const columns = Object.keys(record)
      .filter(k => !skip.has(k) && !k.endsWith('_collectionref') && !k.endsWith('_imagelibref'))
      .map(k => ({
        key: k,
        label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        type: k === 'status' ? 'status'
            : (k.endsWith('date') || k.endsWith('Date') || k.startsWith('date')) ? 'date'
            : (k.endsWith('num') || k === 'wonum' || k === 'ticketid' || k.endsWith('id') && k.length < 20) ? 'id'
            : 'text',
      }));
    res.json({ columns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── Asset meter trend history (last 14 days) ──────────────────────────────────
// Fetches asset meter sub-data with measurement_collectionref URLs, then
// retrieves time-series readings for each meter (up to 50 points per meter).
app.get('/api/asset-meter-trend', async (req, res) => {
  const { assetnum, siteid } = req.query;
  if (!assetnum || !siteid) return res.status(400).json({ error: 'assetnum and siteid required' });
  try {
    // Step 1: Fetch the asset with its assetmeter sub-collection
    const data = await maxFetch('mxapiasset', {
      'oslc.where':   `assetnum="${assetnum}" and siteid="${siteid}"`,
      'oslc.select':  'assetnum,assetmeter{metername,lastreading,lastreadingdate,readingtype,measureunitid,measurement_collectionref}',
      'oslc.pageSize': '1',
    });
    const asset = (data.member || [])[0];
    if (!asset) return res.json({ meters: [] });

    const assetmeters = asset.assetmeter || [];
    if (!assetmeters.length) return res.json({ meters: [] });

    // Step 2: Determine 14-day window
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    // Step 3: For each meter fetch up to 50 measurement points
    const trendData = await Promise.all(
      assetmeters.map(async (m) => {
        const baseEntry = {
          metername:       m.metername,
          lastreading:     m.lastreading,
          lastreadingdate: m.lastreadingdate,
          unit:            m.measureunitid || '',
          readings:        [],
        };
        const rawRef = m.measurement_collectionref;
        if (!rawRef) return baseEntry;

        try {
          // Rewrite internal Maximo hostname to our configured MAXIMO_URL base so our API key works
          const internalUrl  = new URL(rawRef);
          const configBase   = new URL(MAXIMO_URL);
          internalUrl.hostname = configBase.hostname;
          internalUrl.port     = configBase.port || '';
          internalUrl.protocol = configBase.protocol;
          internalUrl.searchParams.set('lean', '1');
          internalUrl.searchParams.set('oslc.pageSize', '50');
          internalUrl.searchParams.set('oslc.select', 'measurementvalue,measuredate');
          internalUrl.searchParams.set('oslc.orderBy', '+measuredate');
          // Filter to last 14 days (Maximo date format: YYYY-MM-DDThh:mm:ss+tz)
          internalUrl.searchParams.set('oslc.where', `measuredate>="${since}"`);

          const r = await fetch(internalUrl.toString(), { headers: authHeaders(), timeout: 15000 });
          if (!r.ok) return baseEntry;
          const d = await r.json();
          if (d.Error || d['oslc:Error']) return baseEntry;
          baseEntry.readings = (d.member || []).map(pt => ({
            date:  pt.measuredate,
            value: pt.measurementvalue,
          }));
        } catch (_) { /* ignore per-meter failures */ }
        return baseEntry;
      })
    );

    // Only return meters that actually have readings (or at least a lastreading)
    const result = trendData.filter(m => m.readings.length > 0 || m.lastreading != null);
    res.json({ meters: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ── List available object structures (probe live instance) ───────────────────
// Comprehensive list of known MAS Manage OSLC Object Structure names.
// We probe each in parallel and return only the ones that respond HTTP 200.
// Results are cached for the lifetime of the process.
const ALL_KNOWN_OS = [
  // Core asset & work management
  'mxapiasset','mxapiwo','mxapipm','mxapimasterpm','mxapilocation','mxapisr','mxapiticket',
  'mxapiincident','mxapiproblem','mxapichange',
  // People & craft
  'mxapilabor','mxapilabtrans','mxapicraft','mxapipergroup','mxapiperson',
  // Job plans & safety
  'mxapijobplan','mxapijobcard','mxapisafety','mxapifailurelist',
  // Inventory & purchasing
  'mxapiinventory','mxapiinvuse','mxapiinvbal','mxapiitem','mxapipo','mxapireceipt',
  // Classification & domains
  'mxapiclassification','mxapidomain','mxapialndomain','mxapimeasureunit',
  // Finance & contracts
  'mxapicontract','mxapifincntrl','mxapicostgl','mxapiactlabtrans','mxapicalcostgl',
  // Organisation
  'mxapisite','mxapiorg',
  // Misc / other
  'mxapiaction','mxapiitemorginfo','mxapirotateasset','mxapishiftgroup',
  'mxapicalendar','mxapiserviceaddress','mxapilabtrans',
];

let _osCache = null;

app.get('/api/objectstructures', async (_req, res) => {
  // Serve from cache if available (populated on first request)
  if (_osCache) return res.json(_osCache);

  const bpSet = new Set(Object.keys(BEST_PRACTICE_OS));

  // Probe OS names in batches of 8 to avoid overwhelming the connection pool.
  // node-fetch v2 timeout is 15s per request; batching keeps total time reasonable.
  const probeOne = async (osName) => {
    try {
      const url = new URL(`${MAXIMO_URL}/os/${osName}`);
      url.searchParams.set('lean', '1');
      url.searchParams.set('oslc.pageSize', '1');
      const r = await fetch(url.toString(), { headers: authHeaders(), timeout: 15000 });
      if (!r.ok) return null;
      const data = await r.json();
      if (data['oslc:Error'] || data['Error']) return null;
      return { os: osName, label: osName, bestPractice: bpSet.has(osName) };
    } catch (_) { return null; }
  };

  // Run in batches of 8 concurrently
  const allResults = [];
  const BATCH = 8;
  for (let i = 0; i < ALL_KNOWN_OS.length; i += BATCH) {
    const batch = ALL_KNOWN_OS.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(probeOne));
    allResults.push(...batchResults);
  }
  const results = allResults;
  const valid = results.filter(Boolean);

  // Merge in best-practice metadata (labels, columns, idField)
  const bpMeta = Object.entries(BEST_PRACTICE_OS).reduce((m, [os, cfg]) => {
    m[os] = cfg; return m;
  }, {});
  const merged = valid.map(v => {
    const bp = bpMeta[v.os];
    return bp
      ? { os: v.os, label: bp.label, idField: bp.idField, columns: bp.columns, bestPractice: true }
      : { os: v.os, label: v.os, idField: '', columns: [], bestPractice: false };
  });

  // Sort: best-practice first, then alpha
  merged.sort((a, b) => {
    if (a.bestPractice && !b.bestPractice) return -1;
    if (!a.bestPractice && b.bestPractice) return  1;
    return a.os.localeCompare(b.os);
  });

  _osCache = merged;
  res.json(merged);
});

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  const idx = path.join(__dirname, 'ui', 'dist', 'index.html');
  if (fs.existsSync(idx)) {
    res.sendFile(idx);
  } else {
    // Serve built-in minimal UI when dist/ doesn't exist
    res.sendFile(path.join(__dirname, 'ui', 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MAS Assistant running on http://0.0.0.0:${PORT}`);
});
