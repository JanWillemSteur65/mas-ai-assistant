export function fmt(v) {
  return v != null && v !== '' ? v : '—';
}

export function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return d;
  }
}

export function statusColor(val) {
  if (!val) return 'muted';
  const v = val.toUpperCase();
  if (['ACTIVE', 'APPR', 'COMP', 'OPERATING'].includes(v)) return 'green';
  if (['DEACT', 'WAPPR', 'CAN', 'WCAN', 'CLOSE'].includes(v)) return 'red';
  if (['WMATL', 'WSCH', 'INPRG', 'WPCOND'].includes(v)) return 'yellow';
  return 'blue';
}

export function buildQS(params = {}) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}
