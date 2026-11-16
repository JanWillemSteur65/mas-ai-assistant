const BASE = '';

async function apiFetch(path) {
  const r = await fetch(BASE + path);
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return r.json();
}

export const getSettings         = () => apiFetch('/api/settings');
export const geocodeAddress      = (address) => apiFetch(`/api/geocode?address=${encodeURIComponent(address)}`);
export async function saveLocationSettings(data) {
  const r = await fetch(`${BASE}/api/settings/location`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
  return r.json();
}
export const getOrgs             = () => apiFetch('/api/orgs');
export const getSites            = (org) => apiFetch(`/api/sites?org=${encodeURIComponent(org || '')}`);
export const getAssets           = (p) => apiFetch(`/api/assets?${qs(p)}`);
export const getWorkOrders       = (p) => apiFetch(`/api/workorders?${qs(p)}`);
export const getLocations        = (p) => apiFetch(`/api/locations?${qs(p)}`);
export const getMeters           = (p) => apiFetch(`/api/meters?${qs(p)}`);
export const getHealth           = (p) => apiFetch(`/api/health?${qs(p)}`);
export const getPMs              = (p) => apiFetch(`/api/pms?${qs(p)}`);
export const getBadActors        = (p) => apiFetch(`/api/badactors?${qs(p)}`);
export const getBestPractice     = () => apiFetch('/api/bestpractice');
export const getObjectStructures   = () => apiFetch('/api/objectstructures');
export const getOsSchema           = (os) => apiFetch(`/api/os-schema?os=${encodeURIComponent(os)}`);
export const exploreOS             = (p) => apiFetch(`/api/explore?${qs(p)}`);
export const getStats              = (p) => apiFetch(`/api/stats?${qs(p)}`);
export const getAssetMeterTrend    = (assetnum, siteid) => apiFetch(`/api/asset-meter-trend?assetnum=${encodeURIComponent(assetnum)}&siteid=${encodeURIComponent(siteid)}`);
export const getMapData          = (p) => apiFetch(`/api/mapdata?${qs(p)}`);
export const getMapLayers        = (p) => apiFetch(`/api/maplayers?${qs(p)}`);

export async function changeStatus(data) {
  const r = await fetch(`${BASE}/api/changestatus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `HTTP ${r.status}`); }
  return r.json();
}

export async function createWO(data) {
  const r = await fetch(`${BASE}/api/createwo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function createSR(data) {
  const r = await fetch(`${BASE}/api/createsr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return r.json();
}

export async function sendChat(message, context) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || `HTTP ${r.status}`);
  }
  return r.json();
}

function qs(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}
