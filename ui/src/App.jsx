import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import * as api from './api.js';
import { fmt, fmtDate, statusColor } from './utils.js';

// Carbon React components
import {
  // Layout
  Header, HeaderName, HeaderGlobalBar, HeaderGlobalAction,
  SideNav, SideNavItems, SideNavLink,
  // Data table
  DataTable, TableContainer, Table, TableHead, TableRow,
  TableHeader, TableBody, TableCell, TableToolbar,
  TableToolbarContent, TableToolbarSearch,
  Pagination,
  // Modals & overlays
  Modal,
  // Form controls
  Button, TextInput, Select, SelectItem, Toggle, Dropdown,
  // Feedback
  InlineLoading, InlineNotification,
  // Content
  Tile, Tag as CarbonTag,
  // Tabs
  Tabs, TabList, Tab, TabPanels, TabPanel,
  // Content switcher
  ContentSwitcher, Switch as ContentSwitch,
} from '@carbon/react';

// ── Carbon status color tokens (CSS custom properties) ────────────────────────
const STATUS_TAG_TYPE = (status) => {
  const map = {
    OPERATING: 'green', ACTIVE: 'green', COMP: 'green', RESOLVED: 'green',
    'NOT READY': 'warm-gray', DECOMMISSIONED: 'cool-gray',
    WAPPR: 'yellow', INPRG: 'teal', WSCH: 'teal', WMATL: 'purple',
    APPR: 'blue', NEW: 'blue', QUEUED: 'purple',
    CAN: 'cool-gray', CLOSE: 'cool-gray', CLOSED: 'cool-gray',
  };
  return map[status?.toUpperCase?.()] || 'blue';
};

const CHART_COLORS = ['#78a9ff','#42be65','#f1c21b','#fa4d56','#be95ff','#3ddbd9','#ff832b','#ee5396','#a7f0ba','#d2a106'];

// ── Page size context ─────────────────────────────────────────────────────────
const PageSizeCtx = createContext(50);
const usePgSize = () => useContext(PageSizeCtx);

// ── Status color map (Leaflet map, inline, legacy) ────────────────────────────
const STATUS_COLORS = {
  OPERATING: '#42be65', 'NOT READY': '#f1c21b', DECOMMISSIONED: '#8d8d8d',
  WAPPR: '#f1c21b', APPR: '#78a9ff', INPRG: '#ff832b', COMP: '#42be65',
  CLOSE: '#8d8d8d', CAN: '#8d8d8d', WMATL: '#be95ff', WSCH: '#3ddbd9',
  NEW: '#78a9ff', QUEUED: '#be95ff', RESOLVED: '#42be65', _default: '#78a9ff',
};
function getStatusColor(status) { return STATUS_COLORS[status] || STATUS_COLORS._default; }

// ── Nav definition ────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id:'dashboard',  label:'Dashboard' },
  { id:'assets',     label:'Assets' },
  { id:'workorders', label:'Work Orders' },
  { id:'health',     label:'Health Insights' },
  { id:'meters',     label:'Meter Readings' },
  { id:'locations',  label:'Locations' },
  { id:'pms',        label:'Preventive Maint.' },
  { id:'badactors',  label:'Bad Actors' },
  { id:'explorer',   label:'Data Explorer' },
  { id:'map',        label:'Geo Map' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function StatusTag({ value }) {
  if (!value) return <span style={{ color:'var(--cds-text-disabled)' }}>—</span>;
  return <CarbonTag type={STATUS_TAG_TYPE(value)} size="sm">{value}</CarbonTag>;
}

function LoadingView({ description = 'Loading…' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'3rem' }}>
      <InlineLoading description={description} status="active" />
    </div>
  );
}

function ErrBanner({ error }) {
  if (!error) return null;
  return (
    <InlineNotification
      kind="error"
      title="Error"
      subtitle={String(error)}
      style={{ marginBottom:'1rem', maxWidth:'100%' }}
      lowContrast
    />
  );
}

// ── DataTable wrapper using Carbon DataTable ──────────────────────────────────
function CdsDataTable({ columns, rows, onRowClick, keyFn, toolbarSearch, onSearch, searchPlaceholder, extraToolbar }) {
  if (!rows || rows.length === 0) {
    return (
      <Tile style={{ textAlign:'center', color:'var(--cds-text-secondary)', padding:'2.5rem 1rem' }}>
        No records found.
      </Tile>
    );
  }

  const headers = columns.map(c => ({ key: c.key, header: c.label }));
  // Carbon DataTable strips unknown keys from rows — keep a stable id→original map
  // so we can look up the original row on click using only the row id.
  const originalsById = {};
  const tableRows = rows.map((row, i) => {
    const id = keyFn ? String(keyFn(row, i)) : String(i);
    originalsById[id] = row;
    return {
      id,
      ...Object.fromEntries(columns.map(c => {
        let display;
        if (c.type === 'status') display = <StatusTag value={fmt(row[c.key])} />;
        else if (c.type === 'date') display = fmtDate(row[c.key]);
        else if (c.type === 'id') display = <span style={{ fontWeight:600, color:'var(--cds-link-primary)' }}>{fmt(row[c.key])}</span>;
        else display = fmt(row[c.key]);
        return [c.key, display];
      })),
    };
  });

  return (
    <DataTable rows={tableRows} headers={headers} isSortable={false}>
      {({ rows: dtRows, headers: dtHeaders, getTableProps, getHeaderProps, getRowProps, getToolbarProps, getTableContainerProps }) => (
        <TableContainer {...getTableContainerProps()}>
          {(toolbarSearch || extraToolbar) && (
            <TableToolbar {...getToolbarProps()}>
              <TableToolbarContent>
                {toolbarSearch && (
                  <TableToolbarSearch
                    placeholder={searchPlaceholder || 'Search…'}
                    onChange={e => onSearch && onSearch(e.target.value)}
                    persistent
                  />
                )}
                {extraToolbar}
              </TableToolbarContent>
            </TableToolbar>
          )}
          <Table {...getTableProps()} size="lg">
            <TableHead>
              <TableRow>
                {dtHeaders.map(h => (
                  <TableHeader key={h.key} {...getHeaderProps({ header: h })}>
                    {h.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {dtRows.map(row => (
                <TableRow
                  key={row.id}
                  {...getRowProps({ row })}
                  onClick={() => onRowClick && onRowClick(originalsById[row.id])}
                  style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {row.cells.map(cell => (
                    <TableCell key={cell.id}>{cell.value}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </DataTable>
  );
}

// ── Detail fields list inside modals ─────────────────────────────────────────
function FieldGrid({ row, columns }) {
  const columnKeys = new Set(columns.map(c => c.key));
  const extraKeys = Object.keys(row).filter(k =>
    !columnKeys.has(k) && !k.startsWith('_') && !k.endsWith('_collectionref') &&
    k !== 'href' && typeof row[k] !== 'object'
  );
  const allFields = [
    ...columns.filter(c => c.key !== 'description'),
    ...extraKeys.map(k => ({ key: k, label: k, type: 'text' })),
  ];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem 1.5rem', marginTop:'1rem' }}>
      {allFields.map(c => (
        <div key={c.key} style={{ borderBottom:'1px solid var(--cds-border-subtle)', paddingBottom:'0.5rem' }}>
          <div style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.2rem' }}>{c.label}</div>
          <div style={{ fontSize:'0.875rem' }}>
            {c.type === 'status' ? <StatusTag value={fmt(row[c.key])} />
             : c.type === 'date' ? fmtDate(row[c.key])
             : c.type === 'id' ? <span style={{ fontWeight:600, color:'var(--cds-link-primary)' }}>{fmt(row[c.key])}</span>
             : fmt(row[c.key])}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Row Detail Modal ──────────────────────────────────────────────────────────
// onAction({ type:'createWO'|'createSR'|'changeStatus', prefill, id, siteid, objectType })
// is called instead of opening a second nested Modal — the parent closes this modal first.
function MeterTrendChart({ readings, color = '#78a9ff', unit = '' }) {
  if (!readings || readings.length < 2) return null;
  const parsed = readings
    .map(r => ({ ts: new Date(r.date || r.readingdate || r.readingDate || '').getTime(), val: Number(r.value) }))
    .filter(r => !isNaN(r.ts) && !isNaN(r.val))
    .sort((a, b) => a.ts - b.ts);
  if (parsed.length < 2) return null;

  const W = 560, H = 110;
  const PAD = { top: 10, right: 12, bottom: 32, left: 44 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const minVal = Math.min(...parsed.map(r => r.val));
  const maxVal = Math.max(...parsed.map(r => r.val));
  const valRange = maxVal - minVal || 1;
  const minTs  = parsed[0].ts;
  const maxTs  = parsed[parsed.length - 1].ts;
  const tsRange = maxTs - minTs || 1;

  const toX = ts => PAD.left + ((ts - minTs) / tsRange) * cw;
  const toY = v  => PAD.top  + ch - ((v - minVal) / valRange) * ch;

  // Y grid lines (4 horizontal)
  const yTicks = 4;
  const yLines = Array.from({ length: yTicks + 1 }, (_, i) => {
    const v = minVal + (valRange / yTicks) * i;
    const y = toY(v);
    const label = valRange < 10 ? v.toFixed(1) : Math.round(v).toString();
    return { y, label };
  });

  // X tick labels (up to 5)
  const xCount = Math.min(parsed.length, 5);
  const xIndices = Array.from({ length: xCount }, (_, i) =>
    Math.round(i * (parsed.length - 1) / (xCount - 1))
  );
  const xTicks = xIndices.map(idx => {
    const r = parsed[idx];
    const d = new Date(r.ts);
    const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { x: toX(r.ts), label };
  });

  // Line path
  const linePts = parsed.map(r => `${toX(r.ts).toFixed(1)},${toY(r.val).toFixed(1)}`).join(' ');

  // Filled area under line
  const areaD = `M${toX(parsed[0].ts).toFixed(1)},${(PAD.top + ch).toFixed(1)} ` +
    parsed.map(r => `L${toX(r.ts).toFixed(1)},${toY(r.val).toFixed(1)}`).join(' ') +
    ` L${toX(parsed[parsed.length-1].ts).toFixed(1)},${(PAD.top + ch).toFixed(1)} Z`;

  const areaFill = color + '28'; // 16% opacity fill

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
      style={{ display:'block', background:'#f4f6fb', borderRadius:'0.25rem', overflow:'visible' }}>
      {/* horizontal grid lines */}
      {yLines.map(({ y, label }, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y} x2={PAD.left + cw} y2={y}
            stroke="#d1d5db" strokeWidth="0.75" strokeDasharray={i === 0 ? 'none' : '3,3'} />
          <text x={PAD.left - 5} y={y + 3.5} textAnchor="end"
            fontSize="8.5" fill="#6b7280" fontFamily="-apple-system,sans-serif">
            {label}
          </text>
        </g>
      ))}
      {/* area fill */}
      <path d={areaD} fill={areaFill} />
      {/* line */}
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* data points */}
      {parsed.map((r, i) => (
        <circle key={i} cx={toX(r.ts)} cy={toY(r.val)} r="2.5" fill={color} />
      ))}
      {/* X axis ticks */}
      {xTicks.map(({ x, label }, i) => (
        <g key={i}>
          <line x1={x} y1={PAD.top + ch} x2={x} y2={PAD.top + ch + 4} stroke="#9ca3af" strokeWidth="0.75" />
          <text x={x} y={PAD.top + ch + 14} textAnchor="middle"
            fontSize="8.5" fill="#6b7280" fontFamily="-apple-system,sans-serif">
            {label}
          </text>
        </g>
      ))}
      {/* X axis baseline */}
      <line x1={PAD.left} y1={PAD.top + ch} x2={PAD.left + cw} y2={PAD.top + ch}
        stroke="#9ca3af" strokeWidth="1" />
    </svg>
  );
}

function AssetMeterPanel({ assetnum, siteid }) {
  const [trendData, setTrendData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!assetnum || !siteid) { setLoading(false); return; }
    api.getAssetMeterTrend(assetnum, siteid)
      .then(d => setTrendData(d.meters || []))
      .catch(() => setTrendData([]))
      .finally(() => setLoading(false));
  }, [assetnum, siteid]);

  if (loading) return <InlineLoading description="Loading meter trends…" status="active" style={{ marginTop:'0.75rem' }} />;
  if (!trendData || trendData.length === 0) return null;

  const COLORS = ['#78a9ff','#42be65','#f1c21b','#fa4d56','#be95ff','#3ddbd9','#ff832b','#ee5396'];

  return (
    <div style={{ marginTop:'1rem', borderTop:'1px solid var(--cds-border-subtle)', paddingTop:'0.75rem' }}>
      <div style={{ fontSize:'0.75rem', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em',
        color:'var(--cds-text-secondary)', marginBottom:'0.75rem' }}>
        Meter Readings — Last 14 Days
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
        {trendData.map((m, i) => (
          <div key={m.metername} style={{ background:'var(--cds-layer-02)', borderRadius:'0.375rem',
            padding:'0.75rem 1rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {/* header row */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
              <span style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', fontWeight:600,
                textTransform:'uppercase', letterSpacing:'0.04em' }}>
                {m.metername}{m.unit ? ` (${m.unit})` : ''}
              </span>
              <span style={{ fontSize:'0.875rem', fontWeight:700, color: COLORS[i % COLORS.length] }}>
                {m.lastreading != null ? m.lastreading : '—'}
                {m.lastreadingdate && (
                  <span style={{ fontSize:'0.625rem', fontWeight:400, color:'var(--cds-text-secondary)', marginLeft:'0.375rem' }}>
                    {new Date(m.lastreadingdate).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </span>
                )}
              </span>
            </div>
            {/* full trend chart */}
            {m.readings.length >= 2 ? (
              <MeterTrendChart readings={m.readings} color={COLORS[i % COLORS.length]} unit={m.unit || ''} />
            ) : (
              <div style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)' }}>Not enough readings for trend.</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RowModal({ row, columns, label, idField, onClose, onAction }) {
  if (!row) return null;
  const id = row[idField] || '';
  const showCreateBtns = idField === 'assetnum' || idField === 'location';
  const showStatusBtn  = idField === 'wonum' || idField === 'ticketid';
  const hasActions     = showCreateBtns || showStatusBtn;
  const objectType     = idField === 'wonum' ? 'wo' : 'sr';
  const prefill = { assetnum: row.assetnum || '', location: row.location || '', siteid: row.siteid || '' };

  if (!hasActions) {
    // Passive modal — just view the record
    return (
      <Modal
        open
        passiveModal
        modalHeading={`${label}: ${id}`}
        onRequestClose={onClose}
        size="lg"
      >
        {row.description && (
          <p style={{ marginBottom:'0.75rem', fontWeight:500 }}>{row.description}</p>
        )}
        {row.status && <StatusTag value={row.status} />}
        <FieldGrid row={row} columns={columns} />
      </Modal>
    );
  }

  return (
    <Modal
      open
      passiveModal={false}
      modalHeading={`${label}: ${id}`}
      primaryButtonText={showCreateBtns ? 'Create WO' : 'Change Status'}
      secondaryButtonText={showCreateBtns ? 'Create SR' : 'Close'}
      onRequestClose={onClose}
      onRequestSubmit={() => {
        if (showCreateBtns) onAction && onAction({ type:'createWO', prefill });
        else if (showStatusBtn) onAction && onAction({ type:'changeStatus', id, siteid: row.siteid||'', objectType });
      }}
      onSecondarySubmit={() => {
        if (showCreateBtns) onAction && onAction({ type:'createSR', prefill });
        else onClose();
      }}
      size="lg"
    >
      {row.description && (
        <p style={{ marginBottom:'0.75rem', fontWeight:500 }}>{row.description}</p>
      )}
      {row.status && <StatusTag value={row.status} />}
      <FieldGrid row={row} columns={columns} />
      {showCreateBtns && idField === 'assetnum' && row.assetnum && row.siteid && (
        <AssetMeterPanel assetnum={row.assetnum} siteid={row.siteid} />
      )}
    </Modal>
  );
}

// ── CreateRecordModal ─────────────────────────────────────────────────────────
function CreateRecordModal({ mode, prefill, onClose, onCreated }) {
  const [desc, setDesc]       = useState('');
  const [wtype, setWtype]     = useState('CM');
  const [priority, setPriority] = useState('');
  const [assetnum, setAsset]  = useState(prefill?.assetnum || '');
  const [location, setLoc]    = useState(prefill?.location || '');
  const [submitting, setSub]  = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState('');
  const siteid = prefill?.siteid || '';

  async function submit() {
    if (!desc.trim()) { setErr('Description is required'); return; }
    setSub(true); setErr('');
    try {
      if (mode === 'WO') {
        const r = await api.createWO({ description:desc, assetnum, location, siteid, worktype:wtype, priority });
        setResult(`✓ WO ${r.wonum} created`);
        onCreated && onCreated(r);
      } else {
        const r = await api.createSR({ description:desc, assetnum, location, siteid, reportedpriority:priority });
        setResult(`✓ SR ${r.ticketid} created`);
        onCreated && onCreated(r);
      }
    } catch (ex) { setErr(ex.message); }
    finally { setSub(false); }
  }

  return (
    <Modal
      open
      modalHeading={`Create ${mode === 'WO' ? 'Work Order' : 'Service Request'}`}
      primaryButtonText={submitting ? 'Creating…' : `Create ${mode}`}
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={submit}
      primaryButtonDisabled={submitting}
    >
      {result ? (
        <p style={{ color:'var(--cds-support-success)', fontWeight:600 }}>{result}</p>
      ) : (
        <>
          <ErrBanner error={err} />
          <TextInput id="cr-desc" labelText="Description *" value={desc}
            onChange={e => setDesc(e.target.value)} placeholder="Enter description…"
            style={{ marginBottom:'1rem' }} />
          {mode === 'WO' && (
            <Select id="cr-wtype" labelText="Work Type" value={wtype}
              onChange={e => setWtype(e.target.value)} style={{ marginBottom:'1rem' }}>
              {['CM','EM','PM','CP','EV','MINOR'].map(v => <SelectItem key={v} value={v} text={v} />)}
            </Select>
          )}
          <Select id="cr-priority" labelText="Priority" value={priority}
            onChange={e => setPriority(e.target.value)} style={{ marginBottom:'1rem' }}>
            <SelectItem value="" text="— blank —" />
            {[1,2,3,4,5].map(v => <SelectItem key={v} value={String(v)} text={String(v)} />)}
          </Select>
          <TextInput id="cr-asset" labelText="Asset #" value={assetnum}
            onChange={e => setAsset(e.target.value)} placeholder="optional"
            style={{ marginBottom:'1rem' }} />
          <TextInput id="cr-loc" labelText="Location" value={location}
            onChange={e => setLoc(e.target.value)} placeholder="optional"
            style={{ marginBottom:'1rem' }} />
          <TextInput id="cr-site" labelText="Site ID" value={siteid} readOnly
            style={{ marginBottom:'1rem' }} />
        </>
      )}
    </Modal>
  );
}

// ── ChangeStatusModal ─────────────────────────────────────────────────────────
function ChangeStatusModal({ objectType, id, siteid, onClose }) {
  const woStatuses = ['WAPPR','APPR','INPRG','WSCH','WMATL','COMP','CAN','CLOSE'];
  const srStatuses = ['NEW','QUEUED','INPROG','RESOLVED','CLOSED'];
  const statuses = objectType === 'wo' ? woStatuses : srStatuses;
  const [status, setStatus] = useState('');
  const [memo, setMemo]     = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState('');

  async function submit() {
    if (!status) return;
    setSaving(true); setErr('');
    try { await api.changeStatus({ objectType, id, siteid, status, memo }); setSaved(true); }
    catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  }

  // Dropdown items — Dropdown uses objects with {id, label}
  const dropItems = statuses.map(s => ({ id: s, label: s }));
  const selectedItem = status ? dropItems.find(d => d.id === status) || null : null;

  return (
    <Modal
      open
      modalHeading={`Change Status — ${objectType === 'wo' ? 'Work Order' : 'Service Request'}: ${id}`}
      primaryButtonText={saving ? 'Saving…' : saved ? 'Close' : 'Change Status'}
      secondaryButtonText={saved ? '' : 'Cancel'}
      primaryButtonDisabled={saving || (!saved && !status)}
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={() => { if (saved) onClose(); else submit(); }}
    >
      {saved ? (
        <p style={{ color:'var(--cds-support-success)', fontWeight:600 }}>
          ✓ Status changed to <strong>{status}</strong> successfully.
        </p>
      ) : (
        <>
          <ErrBanner error={err} />
          {/* Use Dropdown instead of Select — Dropdown renders a floating list
              that is NOT clipped by the Modal's overflow:hidden body */}
          <Dropdown
            id="cs-status"
            titleText="New Status"
            label="— select —"
            items={dropItems}
            itemToString={item => item ? item.label : ''}
            selectedItem={selectedItem}
            onChange={({ selectedItem: sel }) => setStatus(sel ? sel.id : '')}
            style={{ marginBottom:'1rem' }}
          />
          <TextInput id="cs-memo" labelText="Memo (optional)" value={memo}
            onChange={e => setMemo(e.target.value)} placeholder="Reason for status change…" />
        </>
      )}
    </Modal>
  );
}

// ── SettingsModal ─────────────────────────────────────────────────────────────
function SettingsModal({ onClose, pageSize, onPageSizeChange }) {
  const [s, setS]           = useState({ url:'', authType:'apikey', apiKey:'', user:'', pass:'', site:'', wxUrl:'', wxKey:'', wxProject:'' });
  const [saved, setSaved]   = useState(false);
  // Map location state
  const [address, setAddress]       = useState('');
  const [lat, setLat]               = useState('');
  const [lng, setLng]               = useState('');
  const [displayName, setDisplayName] = useState('');
  const [geoLooking, setGeoLooking] = useState(false);
  const [geoErr, setGeoErr]         = useState('');
  const [locSaved, setLocSaved]     = useState(false);

  useEffect(() => {
    api.getSettings().then(d => {
      setS(x => ({ ...x, url:d.url||'', authType:d.authType||'apikey', site:d.site||'' }));
      if (d.mapAddress) setAddress(d.mapAddress);
      if (d.mapLat)     setLat(String(d.mapLat));
      if (d.mapLng)     setLng(String(d.mapLng));
    });
  }, []);

  async function lookupAddress() {
    if (!address.trim()) return;
    setGeoLooking(true); setGeoErr(''); setDisplayName('');
    try {
      const r = await api.geocodeAddress(address.trim());
      setLat(String(r.lat));
      setLng(String(r.lng));
      setDisplayName(r.displayName || '');
    } catch (e) {
      setGeoErr(e.message);
    } finally {
      setGeoLooking(false);
    }
  }

  async function saveLocation() {
    if (!lat || !lng) return;
    setGeoErr('');
    try {
      await api.saveLocationSettings({ address: address.trim(), lat: parseFloat(lat), lng: parseFloat(lng) });
      setLocSaved(true);
      setTimeout(() => setLocSaved(false), 3000);
    } catch (e) {
      setGeoErr(e.message);
    }
  }

  return (
    <Modal
      open
      modalHeading="⚙ Settings"
      primaryButtonText="Save & Note"
      secondaryButtonText="Cancel"
      onRequestClose={onClose}
      onSecondarySubmit={onClose}
      onRequestSubmit={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }}
      size="sm"
    >
      {saved && (
        <InlineNotification kind="success" title="Settings noted"
          subtitle="Restart server to apply." lowContrast style={{ marginBottom:'1rem' }} />
      )}
      <TextInput id="s-url" labelText="Maximo URL (/maximo/api)" value={s.url}
        onChange={e => setS(x => ({ ...x, url:e.target.value }))} style={{ marginBottom:'1rem' }} />
      <Select id="s-auth" labelText="Auth Type" value={s.authType}
        onChange={e => setS(x => ({ ...x, authType:e.target.value }))} style={{ marginBottom:'1rem' }}>
        <SelectItem value="apikey" text="API Key" />
        <SelectItem value="basic" text="Username + Password" />
      </Select>
      {s.authType === 'apikey' ? (
        <TextInput id="s-apikey" labelText="API Key" type="password" value={s.apiKey}
          onChange={e => setS(x => ({ ...x, apiKey:e.target.value }))} style={{ marginBottom:'1rem' }} />
      ) : (
        <>
          <TextInput id="s-user" labelText="Username" value={s.user}
            onChange={e => setS(x => ({ ...x, user:e.target.value }))} style={{ marginBottom:'1rem' }} />
          <TextInput id="s-pass" labelText="Password" type="password" value={s.pass}
            onChange={e => setS(x => ({ ...x, pass:e.target.value }))} style={{ marginBottom:'1rem' }} />
        </>
      )}
      <TextInput id="s-site" labelText="Default Site ID" value={s.site}
        onChange={e => setS(x => ({ ...x, site:e.target.value }))} style={{ marginBottom:'1rem' }} />

      {/* ── Map Default Location ──────────────────────────────────────────── */}
      <hr style={{ border:'none', borderTop:'1px solid var(--cds-border-subtle)', margin:'1rem 0' }} />
      <p style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', marginBottom:'0.75rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Map Default Location</p>
      <div style={{ display:'flex', gap:'0.5rem', alignItems:'flex-end', marginBottom:'0.5rem' }}>
        <div style={{ flex:1 }}>
          <TextInput id="s-address" labelText="Address" value={address}
            placeholder="e.g. Agaatvlindersingel 34, Utrecht, NL"
            onChange={e => { setAddress(e.target.value); setLat(''); setLng(''); setDisplayName(''); }}
            onKeyDown={e => e.key === 'Enter' && lookupAddress()} />
        </div>
        <Button kind="secondary" size="md" onClick={lookupAddress} disabled={geoLooking || !address.trim()}>
          {geoLooking ? 'Looking up…' : 'Lookup GPS'}
        </Button>
      </div>
      {geoErr && <p style={{ color:'var(--cds-support-error)', fontSize:'0.75rem', marginBottom:'0.5rem' }}>{geoErr}</p>}
      {lat && lng && (
        <div style={{ marginBottom:'0.75rem' }}>
          <div style={{ display:'flex', gap:'1rem', marginBottom:'0.25rem' }}>
            <TextInput id="s-lat" labelText="Latitude"  value={lat} onChange={e => setLat(e.target.value)}  style={{ flex:1 }} />
            <TextInput id="s-lng" labelText="Longitude" value={lng} onChange={e => setLng(e.target.value)} style={{ flex:1 }} />
          </div>
          {displayName && <p style={{ fontSize:'0.6875rem', color:'var(--cds-text-secondary)', marginTop:'0.25rem' }}>{displayName}</p>}
          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginTop:'0.5rem' }}>
            <Button kind="primary" size="sm" onClick={saveLocation}>Save GPS as Map Default</Button>
            {locSaved && <span style={{ fontSize:'0.75rem', color:'var(--cds-support-success)' }}>✓ Saved</span>}
          </div>
        </div>
      )}

      {/* ── watsonx.ai ───────────────────────────────────────────────────── */}
      <hr style={{ border:'none', borderTop:'1px solid var(--cds-border-subtle)', margin:'1rem 0' }} />
      <p style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', marginBottom:'0.75rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>watsonx.ai (optional)</p>
      <TextInput id="s-wxurl" labelText="watsonx.ai URL" value={s.wxUrl}
        onChange={e => setS(x => ({ ...x, wxUrl:e.target.value }))} style={{ marginBottom:'1rem' }} />
      <TextInput id="s-wxkey" labelText="watsonx.ai API Key" type="password" value={s.wxKey}
        onChange={e => setS(x => ({ ...x, wxKey:e.target.value }))} style={{ marginBottom:'1rem' }} />
      <TextInput id="s-wxpid" labelText="watsonx.ai Project ID" value={s.wxProject}
        onChange={e => setS(x => ({ ...x, wxProject:e.target.value }))} style={{ marginBottom:'1rem' }} />

      {/* ── Display ──────────────────────────────────────────────────────── */}
      <hr style={{ border:'none', borderTop:'1px solid var(--cds-border-subtle)', margin:'1rem 0' }} />
      <p style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', marginBottom:'0.75rem', textTransform:'uppercase', letterSpacing:'0.05em' }}>Display Settings</p>
      <Select id="s-pgsize" labelText="Rows per Page (all views except Explorer)" value={String(pageSize)}
        onChange={e => onPageSizeChange(Number(e.target.value))}>
        {[10,25,50,100,200,500].map(n => <SelectItem key={n} value={String(n)} text={`${n} rows`} />)}
      </Select>
    </Modal>
  );
}

// ── SVG Charts (custom — preserved as-is) ────────────────────────────────────
function DonutChart({ data, size = 160 }) {
  if (!data || data.length === 0) return <p style={{ color:'var(--cds-text-secondary)', fontSize:'0.75rem' }}>No data</p>;
  const total = data.reduce((s,d) => s + d.value, 0);
  if (total === 0) return <p style={{ color:'var(--cds-text-secondary)', fontSize:'0.75rem' }}>No data</p>;
  const cx = size / 2, cy = size / 2, R = size * 0.38, r = size * 0.22;
  let angle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const frac = d.value / total;
    const startA = angle;
    angle += frac * 2 * Math.PI;
    const endA = angle;
    const x1 = cx + R * Math.cos(startA), y1 = cy + R * Math.sin(startA);
    const x2 = cx + R * Math.cos(endA),   y2 = cy + R * Math.sin(endA);
    const ix1 = cx + r * Math.cos(startA), iy1 = cy + r * Math.sin(startA);
    const ix2 = cx + r * Math.cos(endA),   iy2 = cy + r * Math.sin(endA);
    const large = frac > 0.5 ? 1 : 0;
    const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${r} ${r} 0 ${large} 0 ${ix1} ${iy1} Z`;
    return { path, color: CHART_COLORS[i % CHART_COLORS.length], label: d.label, value: d.value, frac };
  });
  return (
    <div>
      <svg width={size} height={size} style={{ display:'block', margin:'0 auto' }}>
        {slices.map((s, i) => (
          <path key={i} d={s.path} fill={s.color} stroke="none">
            <title>{s.label}: {s.value} ({(s.frac*100).toFixed(1)}%)</title>
          </path>
        ))}
        <text x={cx} y={cy+5} textAnchor="middle" fontSize={size*0.14} fontWeight={700}
          fill="var(--cds-text-primary)">{total}</text>
      </svg>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:6, justifyContent:'center' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:'var(--cds-text-secondary)' }}>
            <span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:s.color, flexShrink:0 }}/>
            <span style={{ maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.label}>{s.label}</span>
            <span style={{ color:'var(--cds-text-primary)', fontWeight:600 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SvgBarChart({ data, width = 280 }) {
  if (!data || data.length === 0) return <p style={{ color:'var(--cds-text-secondary)', fontSize:'0.75rem' }}>No data</p>;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barH = 20, gap = 6, labelW = 70, numW = 30;
  const barAreaW = width - labelW - numW - 10;
  const svgH = data.length * (barH + gap) + 4;
  return (
    <svg width={width} height={svgH} style={{ display:'block', overflow:'visible' }}>
      {data.map((d, i) => {
        const y = i * (barH + gap);
        const bw = Math.max(2, (d.value / maxVal) * barAreaW);
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return (
          <g key={i}>
            <text x={labelW - 4} y={y + barH * 0.72} textAnchor="end" fontSize={11} fill="var(--cds-text-secondary)">
              {d.label.length > 9 ? d.label.slice(0,8)+'…' : d.label}
            </text>
            <rect x={labelW} y={y + 1} width={bw} height={barH - 2} fill={color} rx={2}>
              <title>{d.label}: {d.value}</title>
            </rect>
            <text x={labelW + bw + 4} y={y + barH * 0.72} fontSize={11} fontWeight={600} fill="var(--cds-text-primary)">{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Map helpers (unchanged) ───────────────────────────────────────────────────
function makeIcon(color, layer) {
  const size = (layer === 'workorder' || layer === 'sr') ? 28 : 24;
  return window.L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;background:${color};border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize: [size, size], iconAnchor: [size / 2, size], popupAnchor: [0, -size],
  });
}

function popupHtml(item) {
  const sc = getStatusColor(item.status);
  const btnBase = 'margin-top:4px;padding:4px 9px;border:none;border-radius:3px;cursor:pointer;font-weight:600;font-size:12px;';
  if (item._layer === 'asset') {
    return `<div style="font-size:13px;line-height:1.6;min-width:180px">
      <b>Asset: ${item.assetnum}</b> · <span style="color:${sc}">${item.status || '—'}</span><br/>
      ${item.description ? item.description + '<br/>' : ''}
      Type: ${item.assettype || '—'} | Location: ${item.location || '—'}<br/>
      ${item.address ? 'Address: ' + item.address + '<br/>' : ''}
      <button onclick="window.__mapAction('createWO','${item.assetnum}','${item.location}','${item.siteid}')" style="${btnBase}background:#78a9ff;color:#161616">+ Create WO</button>
      <button onclick="window.__mapAction('createSR','${item.assetnum}','${item.location}','${item.siteid}')" style="${btnBase}background:#42be65;color:#161616;margin-left:4px">+ Create SR</button>
    </div>`;
  }
  if (item._layer === 'workorder') {
    return `<div style="font-size:13px;line-height:1.6;min-width:180px">
      <b>WO: ${item.wonum}</b> · <span style="color:${sc}">${item.status || '—'}</span><br/>
      ${item.description ? item.description + '<br/>' : ''}
      Type: ${item.worktype || '—'} | Asset: ${item.assetnum || '—'}<br/>
      ${item.reportdate ? 'Reported: ' + item.reportdate.slice(0,10) + '<br/>' : ''}
      <button onclick="window.__mapAction('changeStatus','${item.wonum}','wo','${item.siteid}')" style="${btnBase}background:#f1c21b;color:#161616">⇄ Change Status</button>
    </div>`;
  }
  if (item._layer === 'sr') {
    return `<div style="font-size:13px;line-height:1.6;min-width:180px">
      <b>SR: ${item.ticketid}</b> · <span style="color:${sc}">${item.status || '—'}</span><br/>
      ${item.description ? item.description + '<br/>' : ''}
      Asset: ${item.assetnum || '—'}<br/>
      ${item.reportdate ? 'Reported: ' + item.reportdate.slice(0,10) + '<br/>' : ''}
      <button onclick="window.__mapAction('changeStatus','${item.ticketid}','sr','${item.siteid}')" style="${btnBase}background:#f1c21b;color:#161616">⇄ Change Status</button>
    </div>`;
  }
  if (item._layer === 'location') {
    return `<div style="font-size:13px;line-height:1.6;min-width:180px">
      <b>Location: ${item.location}</b><br/>
      ${item.description ? item.description + '<br/>' : ''}
      Type: ${item.type || '—'} | Status: <span style="color:${sc}">${item.status || '—'}</span><br/>
      ${item.address ? 'Address: ' + item.address + '<br/>' : ''}
      <button onclick="window.__mapAction('createWO','','${item.location}','${item.siteid}')" style="${btnBase}background:#78a9ff;color:#161616">+ Create WO</button>
    </div>`;
  }
  return '';
}

// ── MapView ───────────────────────────────────────────────────────────────────
function MapView({ scope, onMapModal }) {
  const instanceRef  = useRef(null);
  const containerRef = useRef(null);
  const markersRef   = useRef({ asset:[], location:[], workorder:[], sr:[] });
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading]           = useState(false);
  const [err, setErr]                   = useState('');
  const [totalPins, setTotalPins]       = useState(0);
  const [layers, setLayers]             = useState({ asset:true, location:true, workorder:true, sr:true });

  function loadLeaflet() {
    return new Promise((resolve, reject) => {
      if (window.L) { resolve(); return; }
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load Leaflet JS'));
      document.head.appendChild(script);
    });
  }

  function buildLayerMarkers(map, data) {
    Object.values(markersRef.current).forEach(arr => arr.forEach(m => m.remove()));
    markersRef.current = { asset:[], location:[], workorder:[], sr:[] };
    const layerMap = { assets:'asset', locations:'location', workorders:'workorder', sr:'sr' };
    let count = 0;
    for (const [key, layerKey] of Object.entries(layerMap)) {
      const items = data[key] || [];
      for (const item of items) {
        if (!item.lat || !item.lng) continue;
        const marker = window.L.marker([item.lat, item.lng], { icon: makeIcon(getStatusColor(item.status), layerKey) })
          .bindPopup(window.L.popup({ maxWidth: 280 }).setContent(popupHtml(item)));
        markersRef.current[layerKey].push(marker);
        count++;
      }
    }
    setTotalPins(count);
    Object.entries(layers).forEach(([lk, visible]) => {
      (markersRef.current[lk] || []).forEach(m => { if (visible) m.addTo(map); else m.remove(); });
    });
  }

  useEffect(() => {
    if (!instanceRef.current) return;
    Object.entries(layers).forEach(([lk, visible]) => {
      (markersRef.current[lk] || []).forEach(m => {
        if (visible) m.addTo(instanceRef.current); else m.remove();
      });
    });
  }, [layers]);

  useEffect(() => {
    window.__mapAction = (action, id, extra1, siteid) => {
      if (action === 'createWO')     onMapModal({ type:'createWO',    assetnum:id, location:extra1, siteid });
      if (action === 'createSR')     onMapModal({ type:'createSR',    assetnum:id, location:extra1, siteid });
      if (action === 'changeStatus') onMapModal({ type:'changeStatus', objectType:extra1, id, siteid });
    };
    let cancelled = false;
    setErr('');
    const getCenter = () => new Promise(resolve => {
      // First try browser geolocation; fall back to saved map GPS, then to UK/NL default
      api.getSettings().then(d => {
        const savedCenter = (d.mapLat && d.mapLng) ? [d.mapLat, d.mapLng] : [52.136, -0.465];
        if (!navigator.geolocation) { resolve(savedCenter); return; }
        navigator.geolocation.getCurrentPosition(
          pos => resolve([pos.coords.latitude, pos.coords.longitude]),
          () => resolve(savedCenter),
          { timeout: 5000, maximumAge: 60000 }
        );
      }).catch(() => {
        if (!navigator.geolocation) { resolve([52.136, -0.465]); return; }
        navigator.geolocation.getCurrentPosition(
          pos => resolve([pos.coords.latitude, pos.coords.longitude]),
          () => resolve([52.136, -0.465]),
          { timeout: 5000, maximumAge: 60000 }
        );
      });
    });
    loadLeaflet()
      .then(() => getCenter())
      .then(center => {
        if (cancelled) return;
        if (!instanceRef.current && containerRef.current) {
          const map = window.L.map(containerRef.current, {
            zoomControl:true, scrollWheelZoom:true, doubleClickZoom:true, touchZoom:true, boxZoom:true,
          }).setView(center, 13);
          const osmStandard = window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            { attribution:'© OpenStreetMap contributors', maxZoom:19 });
          const osmHumanitarian = window.L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
            { attribution:'© OpenStreetMap contributors, HOT', maxZoom:19 });
          const topoMap = window.L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
            { attribution:'© OpenTopoMap (CC-BY-SA)', maxZoom:17 });
          const satellite = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            { attribution:'Tiles © Esri', maxZoom:19 });
          const satelliteLabels = window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
            { attribution:'Labels © Esri', maxZoom:19, opacity:0.8 });
          const cartoDark = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            { attribution:'© OpenStreetMap contributors © CARTO', maxZoom:19, subdomains:'abcd' });
          const cartoLight = window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
            { attribution:'© OpenStreetMap contributors © CARTO', maxZoom:19, subdomains:'abcd' });
          osmStandard.addTo(map);
          const satelliteGroup = window.L.layerGroup([satellite, satelliteLabels]);
          window.L.control.layers({
            '🗺 Standard (OSM)': osmStandard, '🤝 Humanitarian': osmHumanitarian,
            '⛰ Topographic': topoMap, '🛰 Satellite': satelliteGroup,
            '☀ Light (Carto)': cartoLight, '🌑 Dark (Carto)': cartoDark,
          }, {}, { position:'topright', collapsed:true }).addTo(map);
          window.L.control.scale({ position:'bottomleft', imperial:false, maxWidth:150 }).addTo(map);
          window.L.circleMarker(center, { radius:9, color:'#fff', weight:2, fillColor:'#78a9ff', fillOpacity:1 })
            .addTo(map).bindPopup('📍 Your location');
          instanceRef.current = map;
          if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => map.invalidateSize());
            ro.observe(containerRef.current);
          }
        }
        setInitializing(false);
        requestAnimationFrame(() => requestAnimationFrame(() => instanceRef.current?.invalidateSize()));
        return api.getMapLayers(scope);
      })
      .then(data => { if (!cancelled && data) { buildLayerMarkers(instanceRef.current, data); setLoading(false); } })
      .catch(e => { if (!cancelled) { setErr(e.message); setInitializing(false); setLoading(false); } });
    return () => { cancelled = true; };
  }, [scope.site, scope.org]);

  useEffect(() => {
    return () => {
      window.__mapAction = undefined;
      if (instanceRef.current) { instanceRef.current.remove(); instanceRef.current = null; }
    };
  }, []);

  const LAYER_DEFS = [
    { key:'asset', label:'Assets' }, { key:'location', label:'Locations' },
    { key:'workorder', label:'Work Orders' }, { key:'sr', label:'Service Requests' },
  ];

  return (
    <div style={{ position:'relative', flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
      {/* Layer toolbar */}
      <div style={{ padding:'0.5rem 0.75rem', background:'var(--cds-layer)', borderBottom:'1px solid var(--cds-border-subtle)',
        display:'flex', gap:'0.5rem', flexWrap:'wrap', flexShrink:0 }}>
        {LAYER_DEFS.map(({ key, label }) => (
          <Button key={key} kind={layers[key] ? 'primary' : 'tertiary'} size="sm"
            onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}>
            {label}
          </Button>
        ))}
        {loading && <InlineLoading description="Loading layers…" status="active" style={{ marginLeft:'auto' }} />}
      </div>
      {/* Map area */}
      <div style={{ position:'relative', flex:1, minHeight:0 }}>
        <div ref={containerRef} style={{ height:'100%', width:'100%',
          visibility: initializing ? 'hidden' : 'visible' }} />
        {initializing && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center',
            justifyContent:'center', background:'var(--cds-background)', zIndex:500 }}>
            <LoadingView description="Loading map…" />
          </div>
        )}
        {err && <ErrBanner error={err} />}
        {!loading && !initializing && totalPins === 0 && !err && (
          <div style={{ position:'absolute', top:60, left:'50%', transform:'translateX(-50%)',
            background:'var(--cds-layer-02)', padding:'0.75rem 1rem', borderRadius:'0.25rem',
            fontSize:'0.8125rem', maxWidth:420, textAlign:'center', zIndex:1000, lineHeight:1.6,
            border:'1px solid var(--cds-border-subtle)' }}>
            🗺 Map ready — no GPS pins yet.<br/>
            Populate <strong>latitudey</strong> / <strong>longitudex</strong> via Service Addresses in Maximo to see pins.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
function Dashboard({ scope }) {
  const pgSize = usePgSize();
  const [data, setData]       = useState(null);
  const [err, setErr]         = useState('');
  const [summary, setSummary] = useState(null);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);

  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const WO_COLS = [
    { key:'wonum', label:'WO #', type:'id' }, { key:'description', label:'Description', type:'text' },
    { key:'siteid', label:'Site', type:'text' }, { key:'status', label:'Status', type:'status' },
    { key:'worktype', label:'Type', type:'text' }, { key:'assetnum', label:'Asset', type:'text' },
    { key:'location', label:'Location', type:'text' }, { key:'reportdate', label:'Reported', type:'date' },
  ];

  useEffect(() => {
    setData(null); setErr(''); setSummary(null);
    Promise.all([
      api.getStats(scope),
      api.getWorkOrders({ ...scope, page:1, pageSize:5 }),
    ]).then(([stats, wos]) => {
      setData(stats);
      // Use Maximo's true totalCount returned with collectioncount=1
      const openWOs = (stats.woByStatus||[]).filter(d => !['COMP','CAN','CLOSE'].includes(d.label)).reduce((s,d) => s+d.value, 0);
      setSummary({
        assets: stats.totalAssets || 0,
        wos:    stats.totalWOs    || 0,
        pms:    stats.totalPMs    || 0,
        openWOs,
        // Health = CM work orders: count from woByType
        health: (stats.woByType||[]).find(d => d.label === 'CM')?.value || 0,
        recentWOs: wos.members||[],
      });
    }).catch(e => setErr(e.message));
  }, [scope.site, scope.org]);

  if (err) return <ErrBanner error={err} />;
  if (!data || !summary) return <LoadingView description="Loading dashboard…" />;

  return (
    <div>
      {/* Summary Tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { label:'Total Assets',    value:summary.assets, sub:'in scope',                color:'var(--cds-link-primary)' },
          { label:'Work Orders',     value:summary.wos,    sub:`${summary.openWOs} open`, color:'var(--cds-support-success)' },
          { label:'Health Insights', value:summary.health, sub:'CM work orders',          color:'var(--cds-support-warning)' },
          { label:'Preventive Maint',value:summary.pms,    sub:'total PMs',               color:'var(--cds-support-info)' },
        ].map(({ label, value, sub, color }) => (
          <Tile key={label} style={{ display:'flex', flexDirection:'column', gap:'0.25rem' }}>
            <span style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
            <span style={{ fontSize:'2rem', fontWeight:700, color }}>{value}</span>
            <span style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)' }}>{sub}</span>
          </Tile>
        ))}
      </div>

      {/* Chart grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
        {[
          { title:'Work Orders by Type',   data:data.woByType },
          { title:'Work Orders by Status', data:data.woByStatus },
          { title:'Assets by Type',        data:data.assetByType },
          { title:'Assets by Status',      data:data.assetByStatus },
          { title:'PMs by Status',         data:data.pmByStatus },
        ].map(({ title, data: cd }) => (
          <Tile key={title} style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            <span style={{ fontSize:'0.875rem', fontWeight:600, borderBottom:'1px solid var(--cds-border-subtle)', paddingBottom:'0.5rem' }}>{title}</span>
            <DonutChart data={cd} />
          </Tile>
        ))}
        <Tile style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
          <span style={{ fontSize:'0.875rem', fontWeight:600, borderBottom:'1px solid var(--cds-border-subtle)', paddingBottom:'0.5rem' }}>WO Work Types (bar)</span>
          <SvgBarChart data={data.woByType} />
        </Tile>
      </div>

      {/* Recent WOs */}
      <h3 style={{ fontSize:'0.9375rem', fontWeight:600, marginBottom:'0.75rem' }}>Recent Work Orders</h3>
      <CdsDataTable columns={WO_COLS} rows={summary.recentWOs} onRowClick={setModalRow} keyFn={r => r.wonum} />
      {modalRow && <RowModal row={modalRow} columns={WO_COLS} label="Work Order" idField="wonum" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── AssetsView ────────────────────────────────────────────────────────────────
function AssetsView({ scope }) {
  const pgSize = usePgSize();
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const BP_COLS = [
    { key:'assetnum', label:'Asset #', type:'id' }, { key:'description', label:'Description', type:'text' },
    { key:'siteid', label:'Site', type:'text' }, { key:'orgid', label:'Org', type:'text' },
    { key:'status', label:'Status', type:'status' }, { key:'assettype', label:'Type', type:'text' },
    { key:'location', label:'Location', type:'text' }, { key:'serialnum', label:'Serial #', type:'text' },
    { key:'manufacturer', label:'Manufacturer', type:'text' }, { key:'model', label:'Model', type:'text' },
    { key:'priority', label:'Priority', type:'number' }, { key:'changedate', label:'Changed', type:'date' },
  ];
  const TABLE_COLS = BP_COLS.slice(0, 7);

  const load = useCallback((p, s) => {
    setLoading(true); setErr('');
    api.getAssets({ ...scope, search:s, page:p, pageSize:pgSize })
      .then(d => { setRows(d.members||[]); setTotal(d.total||0); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [scope.site, scope.org, pgSize]);

  useEffect(() => { setPage(1); setQ(''); load(1,''); }, [scope.site, scope.org]);

  return (
    <div>
      <ErrBanner error={err} />
      {loading ? <LoadingView /> : (
        <CdsDataTable columns={TABLE_COLS} rows={rows} onRowClick={setModalRow}
          keyFn={r => r.assetnum}
          toolbarSearch onSearch={v => { setQ(v); setPage(1); load(1, v); }}
          searchPlaceholder="Search description…"
          extraToolbar={
            <Button kind="primary" size="sm" onClick={() => { setPage(1); load(1, q); }}>Search</Button>
          }
        />
      )}
      <Pagination
        totalItems={total} pageSize={pgSize} page={page}
        pageSizes={[10,25,50,100]} backwardText="Previous" forwardText="Next"
        itemsPerPageText="Items per page:"
        onChange={({ page: p }) => { setPage(p); load(p, q); }}
        style={{ marginTop:'0.5rem' }}
      />
      {modalRow && <RowModal row={modalRow} columns={BP_COLS} label="Asset" idField="assetnum" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── WorkOrdersView ────────────────────────────────────────────────────────────
function WorkOrdersView({ scope }) {
  const pgSize = usePgSize();
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [q, setQ]           = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const statuses = ['','WAPPR','APPR','INPRG','COMP','CAN','WMATL','WSCH','CLOSE'];
  const BP_COLS = [
    { key:'wonum', label:'WO #', type:'id' }, { key:'description', label:'Description', type:'text' },
    { key:'siteid', label:'Site', type:'text' }, { key:'status', label:'Status', type:'status' },
    { key:'worktype', label:'Type', type:'text' }, { key:'assetnum', label:'Asset', type:'text' },
    { key:'location', label:'Location', type:'text' }, { key:'wopriority', label:'Priority', type:'number' },
    { key:'reportdate', label:'Reported', type:'date' }, { key:'schedstart', label:'Sched Start', type:'date' },
    { key:'actstart', label:'Act Start', type:'date' }, { key:'actfinish', label:'Act Finish', type:'date' },
    { key:'assignedownergroup', label:'Owner Group', type:'text' },
  ];

  const load = useCallback((p, s, st) => {
    setLoading(true); setErr('');
    api.getWorkOrders({ ...scope, search:s, status:st, page:p, pageSize:pgSize })
      .then(d => { setRows(d.members||[]); setTotal(d.total||0); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [scope.site, scope.org, pgSize]);

  useEffect(() => { setPage(1); setQ(''); setStatus(''); load(1,'',''); }, [scope.site, scope.org]);

  return (
    <div>
      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', flexWrap:'wrap', alignItems:'flex-end' }}>
        <div style={{ flex:1 }}>
          <TextInput id="wo-search" labelText="" hideLabel placeholder="Search description…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key==='Enter' && (setPage(1), setQ(search), load(1, search, status))} />
        </div>
        <Select id="wo-status" labelText="" hideLabel value={status}
          onChange={e => { setStatus(e.target.value); setPage(1); load(1, q, e.target.value); }}
          style={{ minWidth:160 }}>
          {statuses.map(s => <SelectItem key={s} value={s} text={s || 'All Statuses'} />)}
        </Select>
        <Button kind="primary" onClick={() => { setPage(1); setQ(search); load(1, search, status); }}>Search</Button>
      </div>
      <ErrBanner error={err} />
      {loading ? <LoadingView /> : (
        <CdsDataTable columns={BP_COLS.slice(0, 8)} rows={rows} onRowClick={setModalRow} keyFn={r => r.wonum} />
      )}
      <Pagination totalItems={total} pageSize={pgSize} page={page}
        pageSizes={[10,25,50,100]} backwardText="Previous" forwardText="Next"
        itemsPerPageText="Items per page:"
        onChange={({ page: p }) => { setPage(p); load(p, q, status); }}
        style={{ marginTop:'0.5rem' }}
      />
      {modalRow && <RowModal row={modalRow} columns={BP_COLS} label="Work Order" idField="wonum" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── HealthView ────────────────────────────────────────────────────────────────
function HealthView({ scope }) {
  const pgSize = usePgSize();
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const cols = [
    { key:'wonum', label:'WO #', type:'id' }, { key:'description', label:'Description', type:'text' },
    { key:'siteid', label:'Site', type:'text' }, { key:'status', label:'Status', type:'status' },
    { key:'assetnum', label:'Asset', type:'text' }, { key:'location', label:'Location', type:'text' },
    { key:'reportdate', label:'Reported', type:'date' },
  ];

  const load = useCallback((p) => {
    setLoading(true); setErr('');
    api.getHealth({ ...scope, page:p, pageSize:pgSize })
      .then(d => { setRows(d.members||[]); setTotal(d.total||0); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [scope.site, scope.org, pgSize]);

  useEffect(() => { setPage(1); load(1); }, [scope.site, scope.org]);

  return (
    <div>
      <ErrBanner error={err} />
      {loading ? <LoadingView /> : <CdsDataTable columns={cols} rows={rows} onRowClick={setModalRow} keyFn={r => r.wonum} />}
      <Pagination totalItems={total} pageSize={pgSize} page={page}
        pageSizes={[10,25,50,100]} backwardText="Previous" forwardText="Next"
        itemsPerPageText="Items per page:"
        onChange={({ page: p }) => { setPage(p); load(p); }}
        style={{ marginTop:'0.5rem' }}
      />
      {modalRow && <RowModal row={modalRow} columns={cols} label="Health Insight" idField="wonum" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── MetersView ────────────────────────────────────────────────────────────────
function MetersView({ scope }) {
  const pgSize = usePgSize();
  const [rows, setRows]     = useState([]);
  const [search, setSearch] = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const cols = [
    { key:'assetnum', label:'Asset #', type:'id' }, { key:'siteid', label:'Site', type:'text' },
    { key:'metername', label:'Meter', type:'text' }, { key:'lastreading', label:'Last Reading', type:'number' },
    { key:'unit', label:'Unit', type:'text' }, { key:'lastreadingdate', label:'Date', type:'date' },
    { key:'readingtype', label:'Type', type:'text' },
  ];

  const load = useCallback((assetnum) => {
    setLoading(true); setErr('');
    api.getMeters({ ...scope, assetnum, pageSize:pgSize })
      .then(d => setRows(d.members||[]))
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [scope.site, scope.org, pgSize]);

  useEffect(() => { load(''); }, [scope.site, scope.org]);

  return (
    <div>
      <div style={{ display:'flex', gap:'0.5rem', marginBottom:'1rem', alignItems:'flex-end' }}>
        <div style={{ flex:1 }}>
          <TextInput id="m-search" labelText="" hideLabel placeholder="Filter by asset number…"
            value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key==='Enter' && load(search)} />
        </div>
        <Button kind="primary" onClick={() => load(search)}>Search</Button>
      </div>
      <ErrBanner error={err} />
      {loading ? <LoadingView /> : (
        <CdsDataTable columns={cols} rows={rows} onRowClick={setModalRow}
          keyFn={(r, i) => `${r.assetnum}-${r.metername}-${i}`} />
      )}
      {modalRow && <RowModal row={modalRow} columns={cols} label="Meter Reading" idField="assetnum" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── LocationsView ─────────────────────────────────────────────────────────────
function LocationsView({ scope }) {
  const pgSize = usePgSize();
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const cols = [
    { key:'location', label:'Location', type:'id' }, { key:'description', label:'Description', type:'text' },
    { key:'siteid', label:'Site', type:'text' }, { key:'type', label:'Type', type:'text' },
    { key:'status', label:'Status', type:'status' }, { key:'parent', label:'Parent', type:'text' },
    { key:'changedate', label:'Changed', type:'date' },
  ];

  const load = useCallback((p, s) => {
    setLoading(true); setErr('');
    api.getLocations({ ...scope, search:s, page:p, pageSize:pgSize })
      .then(d => { setRows(d.members||[]); setTotal(d.total||0); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [scope.site, scope.org, pgSize]);

  useEffect(() => { setPage(1); setQ(''); load(1,''); }, [scope.site, scope.org]);

  return (
    <div>
      <ErrBanner error={err} />
      {loading ? <LoadingView /> : (
        <CdsDataTable columns={cols} rows={rows} onRowClick={setModalRow}
          keyFn={r => r.location}
          toolbarSearch onSearch={v => { setQ(v); setPage(1); load(1, v); }}
          searchPlaceholder="Search description…"
          extraToolbar={
            <Button kind="primary" size="sm" onClick={() => { setPage(1); load(1, q); }}>Search</Button>
          }
        />
      )}
      <Pagination totalItems={total} pageSize={pgSize} page={page}
        pageSizes={[10,25,50,100]} backwardText="Previous" forwardText="Next"
        itemsPerPageText="Items per page:"
        onChange={({ page: p }) => { setPage(p); load(p, q); }}
        style={{ marginTop:'0.5rem' }}
      />
      {modalRow && <RowModal row={modalRow} columns={cols} label="Location" idField="location" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── PMsView ───────────────────────────────────────────────────────────────────
function PMsView({ scope }) {
  const pgSize = usePgSize();
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState('');
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const cols = [
    { key:'pmnum', label:'PM #', type:'id' }, { key:'description', label:'Description', type:'text' },
    { key:'siteid', label:'Site', type:'text' }, { key:'status', label:'Status', type:'status' },
    { key:'assetnum', label:'Asset', type:'text' }, { key:'location', label:'Location', type:'text' },
    { key:'frequency', label:'Freq', type:'number' }, { key:'frequnit', label:'Unit', type:'text' },
    { key:'nextdate', label:'Next Date', type:'date' },
  ];

  const load = useCallback((p, s) => {
    setLoading(true); setErr('');
    api.getPMs({ ...scope, search:s, page:p, pageSize:pgSize })
      .then(d => { setRows(d.members||[]); setTotal(d.total||0); })
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [scope.site, scope.org, pgSize]);

  useEffect(() => { setPage(1); setQ(''); load(1,''); }, [scope.site, scope.org]);

  return (
    <div>
      <ErrBanner error={err} />
      {loading ? <LoadingView /> : (
        <CdsDataTable columns={cols} rows={rows} onRowClick={setModalRow}
          keyFn={r => r.pmnum}
          toolbarSearch onSearch={v => { setQ(v); setPage(1); load(1, v); }}
          searchPlaceholder="Search description…"
          extraToolbar={
            <Button kind="primary" size="sm" onClick={() => { setPage(1); load(1, q); }}>Search</Button>
          }
        />
      )}
      <Pagination totalItems={total} pageSize={pgSize} page={page}
        pageSizes={[10,25,50,100]} backwardText="Previous" forwardText="Next"
        itemsPerPageText="Items per page:"
        onChange={({ page: p }) => { setPage(p); load(p, q); }}
        style={{ marginTop:'0.5rem' }}
      />
      {modalRow && <RowModal row={modalRow} columns={cols} label="Preventive Maintenance" idField="pmnum" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── BadActorsView ─────────────────────────────────────────────────────────────
function BadActorsView({ scope }) {
  const [cards, setCards]   = useState([]);
  const [err, setErr]       = useState('');
  const [loading, setLoading] = useState(false);
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  const cols = [
    { key:'assetnum', label:'Asset #', type:'id' }, { key:'description', label:'Description', type:'text' },
    { key:'siteid', label:'Site', type:'text' }, { key:'status', label:'Status', type:'status' },
    { key:'assettype', label:'Type', type:'text' }, { key:'location', label:'Location', type:'text' },
  ];

  useEffect(() => {
    setLoading(true); setErr('');
    api.getBadActors(scope)
      .then(d => setCards(d||[]))
      .catch(e => setErr(e.message)).finally(() => setLoading(false));
  }, [scope.site, scope.org]);

  if (loading) return <LoadingView description="Analysing bad actors…" />;
  if (err) return <ErrBanner error={err} />;
  if (!cards.length) return (
    <Tile style={{ textAlign:'center', color:'var(--cds-text-secondary)', padding:'2.5rem' }}>
      No bad actor data found.
    </Tile>
  );

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))', gap:'1rem' }}>
        {cards.map(a => {
          const isTop3 = a.rank <= 3;
          return (
            <Tile key={a.assetnum} style={{ cursor:'pointer', padding:0, overflow:'hidden' }}
              onClick={() => setModalRow(a)}>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 1rem',
                borderBottom:'1px solid var(--cds-border-subtle)', background:'var(--cds-layer-02)', flexWrap:'wrap' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0,
                  background: isTop3 ? 'var(--cds-support-warning)' : 'var(--cds-support-error)',
                  color:'var(--cds-text-inverse)' }}>
                  #{a.rank}
                </div>
                <span style={{ fontWeight:700, color:'var(--cds-link-primary)', fontSize:'0.875rem' }}>{a.assetnum}</span>
                <StatusTag value={a.status} />
                <CarbonTag type="red" size="sm" style={{ marginLeft:'auto' }}>{a.woCount} WOs</CarbonTag>
              </div>
              <div style={{ padding:'0.75rem 1rem' }}>
                <div style={{ fontWeight:500, marginBottom:'0.25rem' }}>{a.description||'(no description)'}</div>
                <div style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', marginBottom:'0.75rem' }}>
                  {[a.assettype, a.location, a.siteid].filter(Boolean).join(' · ')}
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'0.375rem' }}>
                  {(a.meters||[]).length === 0
                    ? <span style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)' }}>No meters</span>
                    : a.meters.map((m, i) => {
                        const v = parseFloat(m.value);
                        const type = v > 80 ? 'red' : v > 50 ? 'yellow' : 'green';
                        return <CarbonTag key={i} type={type} size="sm">{m.name}: {m.value ?? '—'}</CarbonTag>;
                      })}
                </div>
              </div>
            </Tile>
          );
        })}
      </div>
      {modalRow && <RowModal row={modalRow} columns={cols} label="Bad Actor Asset" idField="assetnum" onClose={() => setModalRow(null)} onAction={handleAction} />}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── ExplorerView ──────────────────────────────────────────────────────────────
function ExplorerView({ scope }) {
  // Explorer has its own local page-size so users can go up to 2000 without
  // affecting the global setting used by all other views.
  const globalPgSize = usePgSize();
  const [pgSize, setLocalPgSize] = useState(globalPgSize);
  // Full OS list from live Maximo probe
  const [osList, setOsList]       = useState([]);
  const [osLoading, setOsLoading] = useState(true);
  const [osSearch, setOsSearch]   = useState('');
  // Selected OS and its discovered columns
  const [selOS, setSelOS]         = useState(null);
  const [enabledCols, setEnabledCols] = useState({});
  const [colsLoading, setColsLoading] = useState(false);
  // Query state
  const [rows, setRows]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [where, setWhere]         = useState('');
  const [whereInput, setWhereInput] = useState('');
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  // Modal state
  const [modalRow, setModalRow]   = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  // Load OS list from live Maximo on mount
  useEffect(() => {
    setOsLoading(true);
    api.getObjectStructures()
      .then(list => { setOsList(list); })
      .catch(() => { setOsList([]); })
      .finally(() => setOsLoading(false));
  }, []);

  // When an OS is selected, discover its columns from a live record if not already known
  async function pickOS(cfg) {
    setSelOS(cfg);
    setRows([]); setTotal(0); setPage(1); setErr(''); setWhere(''); setWhereInput('');

    if (cfg.columns && cfg.columns.length > 0) {
      // Best-practice OS: pre-defined columns
      const init = {};
      cfg.columns.forEach(c => { init[c.key] = true; });
      setEnabledCols(init);
    } else {
      // Unknown OS: discover columns from a live record
      setColsLoading(true);
      setEnabledCols({});
      try {
        const { columns } = await api.getOsSchema(cfg.os);
        const enriched = { ...cfg, columns: columns || [], idField: cfg.idField || (columns[0]?.key || 'id') };
        setSelOS(enriched);
        const init = {};
        (columns || []).forEach(c => { init[c.key] = true; });
        setEnabledCols(init);
        // Auto-run query now that we have columns
        doQuery(enriched, columns || [], 1, '');
      } catch (_) {
        setColsLoading(false);
      }
      setColsLoading(false);
      return; // doQuery already called above
    }
    // Auto-run for best-practice OS
    doQuery(cfg, cfg.columns, 1, '');
  }

  function toggleCol(key) { setEnabledCols(prev => ({ ...prev, [key]: !prev[key] })); }

  const activeCols = selOS ? (selOS.columns || []).filter(c => enabledCols[c.key] !== false) : [];

  async function doQuery(cfg, cols, p, w) {
    if (!cfg) return;
    const activeCols = (cols || []).filter(c => enabledCols[c.key] !== false);
    const select = activeCols.map(c => c.key).join(',') || undefined;
    const parts = [];
    if (scope.site) parts.push(`siteid="${scope.site}"`);
    else if (scope.org) parts.push(`orgid="${scope.org}"`);
    if (w && w.trim()) parts.push(w.trim());
    setLoading(true); setErr('');
    try {
      const data = await api.exploreOS({ os: cfg.os, select, where: parts.join(' and ') || undefined, page: p });
      setRows(data.members||[]); setTotal(data.total||0); setPage(p);
    } catch(e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  function runQuery(p = 1, w = where) {
    doQuery(selOS, selOS?.columns, p, w);
  }

  // Filtered OS list for the picker
  const filteredOS = osList.filter(o =>
    !osSearch || o.os.toLowerCase().includes(osSearch.toLowerCase()) ||
    (o.label && o.label.toLowerCase().includes(osSearch.toLowerCase()))
  );
  const bpOS = filteredOS.filter(o => o.bestPractice);
  const extraOS = filteredOS.filter(o => !o.bestPractice);

  return (
    <div style={{ display:'flex', gap:'1rem', height:'100%', overflow:'hidden' }}>

      {/* ── Left panel: OS picker ── */}
      <div style={{ width:220, flexShrink:0, display:'flex', flexDirection:'column',
        borderRight:'1px solid var(--cds-border-subtle)', paddingRight:'0.75rem', overflowY:'auto' }}>
        <div style={{ fontSize:'0.6875rem', textTransform:'uppercase', letterSpacing:'0.05em',
          color:'var(--cds-text-secondary)', marginBottom:'0.5rem', fontWeight:600 }}>
          Object Structures
        </div>
        <TextInput id="exp-os-search" labelText="" hideLabel
          placeholder="Search…" value={osSearch}
          onChange={e => setOsSearch(e.target.value)}
          style={{ marginBottom:'0.5rem' }} />
        {osLoading ? (
          <InlineLoading description="Discovering…" status="active" />
        ) : (
          <>
            {bpOS.length > 0 && (
              <>
                <div style={{ fontSize:'0.625rem', textTransform:'uppercase', color:'var(--cds-text-secondary)',
                  letterSpacing:'0.05em', marginBottom:'0.25rem', marginTop:'0.25rem' }}>Featured</div>
                {bpOS.map(o => (
                  <div key={o.os}
                    onClick={() => pickOS(o)}
                    style={{ padding:'0.375rem 0.5rem', borderRadius:'0.125rem', cursor:'pointer',
                      fontSize:'0.8125rem', marginBottom:'0.125rem',
                      background: selOS?.os === o.os ? 'var(--cds-button-primary)' : 'transparent',
                      color: selOS?.os === o.os ? 'var(--cds-text-on-color)' : 'var(--cds-text-primary)',
                    }}>
                    {o.label || o.os}
                    <div style={{ fontSize:'0.625rem', opacity:0.7 }}>{o.os}</div>
                  </div>
                ))}
              </>
            )}
            {extraOS.length > 0 && (
              <>
                <div style={{ fontSize:'0.625rem', textTransform:'uppercase', color:'var(--cds-text-secondary)',
                  letterSpacing:'0.05em', marginBottom:'0.25rem', marginTop:'0.5rem' }}>All Available ({extraOS.length})</div>
                {extraOS.map(o => (
                  <div key={o.os}
                    onClick={() => pickOS(o)}
                    style={{ padding:'0.375rem 0.5rem', borderRadius:'0.125rem', cursor:'pointer',
                      fontSize:'0.8125rem', marginBottom:'0.125rem',
                      background: selOS?.os === o.os ? 'var(--cds-button-primary)' : 'transparent',
                      color: selOS?.os === o.os ? 'var(--cds-text-on-color)' : 'var(--cds-text-primary)',
                    }}>
                    {o.os}
                  </div>
                ))}
              </>
            )}
            {filteredOS.length === 0 && (
              <div style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', padding:'0.5rem 0' }}>
                No matching OS found.
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Right panel: query + results ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {!selOS ? (
          <Tile style={{ textAlign:'center', color:'var(--cds-text-secondary)', padding:'3rem 1rem' }}>
            {osLoading
              ? 'Discovering available Object Structures from your Maximo instance…'
              : `Select an Object Structure from the left (${osList.length} available) to query it.`}
          </Tile>
        ) : (
          <>
            {/* Header */}
            <div style={{ marginBottom:'0.75rem' }}>
              <span style={{ fontWeight:600, fontSize:'0.9375rem' }}>{selOS.label || selOS.os}</span>
              <span style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', marginLeft:'0.5rem' }}>{selOS.os}</span>
            </div>

            {/* Column toggles */}
            {(colsLoading) ? (
              <InlineLoading description="Discovering columns…" status="active" style={{ marginBottom:'0.5rem' }} />
            ) : selOS.columns?.length > 0 && (
              <div style={{ marginBottom:'0.75rem', display:'flex', flexWrap:'wrap', gap:'0.25rem' }}>
                {selOS.columns.map(c => {
                  const on = enabledCols[c.key] !== false;
                  return (
                    <Button key={c.key} kind={on ? 'primary' : 'tertiary'} size="sm" onClick={() => toggleCol(c.key)}>
                      {c.label}
                    </Button>
                  );
                })}
              </div>
            )}

            {/* Where filter + run */}
            <div style={{ display:'flex', gap:'0.5rem', alignItems:'flex-end', marginBottom:'0.75rem' }}>
              <div style={{ flex:1 }}>
                <TextInput id="exp-where" labelText="" hideLabel
                  placeholder={`oslc.where filter — e.g. status="APPR"  (site filter applied automatically)`}
                  value={whereInput} onChange={e => setWhereInput(e.target.value)}
                  onKeyDown={e => { if (e.key==='Enter') { setWhere(whereInput); runQuery(1, whereInput); } }} />
              </div>
              <Button kind="primary" onClick={() => { setWhere(whereInput); runQuery(1, whereInput); }}>
                Run Query
              </Button>
            </div>

            <ErrBanner error={err} />

            {/* Results */}
            {loading ? <LoadingView description="Querying Maximo…" /> : (
              rows.length > 0 ? (
                <>
                  <div style={{ fontSize:'0.75rem', color:'var(--cds-text-secondary)', marginBottom:'0.25rem' }}>
                    {total} records total · showing page {page}
                  </div>
                  <div style={{ flex:1, overflowY:'auto' }}>
                    <CdsDataTable
                      columns={activeCols.length ? activeCols : (selOS?.columns || []).map(c => ({...c}))}
                      rows={rows}
                      onRowClick={setModalRow}
                      keyFn={(r, i) => r[selOS?.idField] || i}
                    />
                  </div>
                  <Pagination totalItems={total} pageSize={pgSize} page={page}
                    pageSizes={[10,25,50,100,200,500,1000,2000]} backwardText="Previous" forwardText="Next"
                    itemsPerPageText="Items per page:"
                    onChange={({ page: p, pageSize: ps }) => { if (ps !== pgSize) setLocalPgSize(ps); runQuery(p, where); }}
                    style={{ marginTop:'0.5rem', flexShrink:0 }}
                  />
                </>
              ) : !err ? (
                <Tile style={{ textAlign:'center', color:'var(--cds-text-secondary)', padding:'2.5rem' }}>
                  No records returned. Try adjusting the filter or selecting a different site.
                </Tile>
              ) : null
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {modalRow && selOS && (
        <RowModal
          row={modalRow}
          columns={selOS.columns?.length ? selOS.columns : Object.keys(modalRow).filter(k =>
            !k.endsWith('_collectionref') && k !== 'href' && k !== '_rowstamp'
          ).map(k => ({ key:k, label:k, type:'text' }))}
          label={selOS.label || selOS.os}
          idField={selOS.idField || (selOS.columns?.[0]?.key) || 'id'}
          onClose={() => setModalRow(null)}
          onAction={handleAction}
        />
      )}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

// ── Chat Panel ────────────────────────────────────────────────────────────────
const CHAT_SUGGESTIONS = [
  'Show me active work orders',
  'List assets',
  'Show preventive maintenance',
  'Latest meter readings',
  'List locations',
];

function ChatTable({ rows, columns, idField }) {
  const [modalRow, setModalRow] = useState(null);
  const [actionModal, setActionModal] = useState(null);
  function handleAction(act) { setModalRow(null); setActionModal(act); }

  if (!rows?.length || !columns?.length) return null;
  const visibleCols = columns.slice(0, 5);
  return (
    <div style={{ marginTop:'0.5rem', overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.75rem' }}>
        <thead>
          <tr>{visibleCols.map(c => (
            <th key={c.key} style={{ background:'var(--cds-layer-03)', color:'var(--cds-text-secondary)',
              fontWeight:600, textTransform:'uppercase', fontSize:'0.625rem', letterSpacing:'0.04em',
              padding:'6px 8px', textAlign:'left', borderBottom:'1px solid var(--cds-border-subtle)', whiteSpace:'nowrap' }}>
              {c.label}
            </th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} onClick={() => setModalRow(row)} style={{ cursor:'pointer', borderBottom:'1px solid var(--cds-border-subtle)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--cds-layer-02)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              {visibleCols.map(c => (
                <td key={c.key} style={{ padding:'6px 8px', verticalAlign:'middle',
                  color: c.type==='id' ? 'var(--cds-link-primary)' : 'var(--cds-text-primary)',
                  fontWeight: c.type==='id' ? 600 : 400 }}>
                  {c.type==='status' ? <StatusTag value={fmt(row[c.key])} />
                   : c.type==='date' ? fmtDate(row[c.key])
                   : fmt(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding:'4px 8px', fontSize:'0.6875rem', color:'var(--cds-text-secondary)', textAlign:'right' }}>
        {rows.length} rows — click a row to open details
      </div>
      {modalRow && (
        <RowModal row={modalRow} columns={columns}
          label={columns[0]?.label || 'Record'}
          idField={idField || columns[0]?.key || 'id'}
          onClose={() => setModalRow(null)}
          onAction={handleAction} />
      )}
      {actionModal?.type === 'changeStatus' && <ChangeStatusModal objectType={actionModal.objectType} id={actionModal.id} siteid={actionModal.siteid} onClose={() => setActionModal(null)} />}
      {(actionModal?.type === 'createWO' || actionModal?.type === 'createSR') && <CreateRecordModal mode={actionModal.type === 'createWO' ? 'WO' : 'SR'} prefill={actionModal.prefill} onClose={() => setActionModal(null)} />}
    </div>
  );
}

function ChatMessage({ m, chatTheme }) {
  const isUser = m.role === 'user';
  if (isUser) {
    return (
      <div style={{ background:'var(--cds-button-primary)', color:'var(--cds-text-on-color)',
        padding:'0.5rem 0.75rem', borderRadius:'0.75rem 0.75rem 0.125rem 0.75rem',
        fontSize:'0.8125rem', alignSelf:'flex-end', maxWidth:'85%', lineHeight:1.5 }}>
        {m.text}
      </div>
    );
  }
  return (
    <div style={{ alignSelf:'flex-start', maxWidth:'100%', width:'100%' }}>
      <div style={{ background:'var(--cds-layer-02)', color:'var(--cds-text-primary)',
        padding:'0.5rem 0.75rem', borderRadius:'0.75rem 0.75rem 0.75rem 0.125rem',
        fontSize:'0.8125rem', lineHeight:1.6, display:'inline-block', maxWidth:'100%' }}>
        {(m.text||'').split('\n').map((line, j) => {
          const bold = line.replace(/\*\*(.+?)\*\*/g, (_, x) => `<b>${x}</b>`);
          if (line.startsWith('•') || line.startsWith('-')) {
            return <div key={j} style={{ paddingLeft:12 }} dangerouslySetInnerHTML={{ __html: '• ' + bold.replace(/^[•\-]\s*/, '') }} />;
          }
          return <div key={j} dangerouslySetInnerHTML={{ __html: bold || '<br/>' }} />;
        })}
      </div>
      {m.rows && m.rows.length > 0 && (
        <div style={{ marginTop:'0.375rem', background:'var(--cds-layer)', border:'1px solid var(--cds-border-subtle)', borderRadius:'0.25rem', overflow:'hidden' }}>
          <ChatTable rows={m.rows} columns={m.columns} idField={m.idField} />
        </div>
      )}
    </div>
  );
}

function ChatPanel({ scope, onClose, chatDark, onToggleDark }) {
  const initText = `👋 Hi! Ask me anything about your Maximo data — work orders, assets, meters, PMs, locations, bad actors, or service requests.\n\nConnected to: **${scope.site||scope.org||'all sites'}**`;
  const [messages, setMessages] = useState([{ role:'assistant', text:initText }]);
  const [input, setInput]       = useState('');
  const [sending, setSending]   = useState(false);
  const [panelWidth, setPanelWidth] = useState(400);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }); }, [messages]);

  function clearChat() { setMessages([{ role:'assistant', text:initText }]); }

  function onDragStart(e) {
    e.preventDefault();
    const startX = e.clientX, startW = panelWidth;
    function onMove(ev) { setPanelWidth(Math.max(300, Math.min(900, startW + (startX - ev.clientX)))); }
    function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  async function send(text) {
    const msg = text || input.trim();
    if (!msg || sending) return;
    setInput('');
    setMessages(m => [...m, { role:'user', text:msg }]);
    setSending(true);
    try {
      const res = await api.sendChat(msg, scope);
      setMessages(m => [...m, {
        role:'assistant',
        text: res.reply || res.text || '(no response)',
        rows: res.rows || [],
        columns: res.columns || [],
        idField: res.idField || '',
      }]);
    } catch(e) {
      setMessages(m => [...m, { role:'assistant', text:`⚠️ ${e.message}` }]);
    } finally { setSending(false); }
  }

  // Chat panel always uses its own theme: g100 dark or g10 light
  const chatThemeAttr = chatDark ? 'g100' : 'g10';

  return (
    <div data-carbon-theme={chatThemeAttr}
      style={{ width:panelWidth, minWidth:300, maxWidth:'60vw',
        background:'var(--cds-background)', borderLeft:'1px solid var(--cds-border-subtle)',
        display:'flex', flexDirection:'column', overflow:'hidden', position:'relative', flexShrink:0 }}>
      {/* Drag handle */}
      <div onMouseDown={onDragStart}
        style={{ position:'absolute', left:0, top:0, bottom:0, width:5, cursor:'ew-resize',
          background:'transparent', zIndex:10 }}
        title="Drag to resize" />

      {/* Header */}
      <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid var(--cds-border-subtle)',
        display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
        <span style={{ fontWeight:600, color:'var(--cds-link-primary)' }}>💬 AI Assistant</span>
        <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
          <span style={{ fontSize:'0.6875rem', color:'var(--cds-text-secondary)' }}>↔ drag edge to resize</span>
          <Button kind="ghost" size="sm" onClick={clearChat} title="Clear chat history">🗑 Clear</Button>
          <Button kind="ghost" size="sm" onClick={onToggleDark}
            title={chatDark ? 'Switch chat to light' : 'Switch chat to dark'}>
            {chatDark ? '☀' : '🌙'}
          </Button>
          <Button kind="ghost" size="sm" hasIconOnly renderIcon={() => <span>✕</span>}
            iconDescription="Close" onClick={onClose} tooltipPosition="left" />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex:1, overflowY:'auto', padding:'0.75rem', display:'flex', flexDirection:'column', gap:'0.625rem' }}>
        {messages.map((m, i) => <ChatMessage key={i} m={m} chatTheme={chatThemeAttr} />)}
        {sending && <InlineLoading description="Thinking…" status="active" style={{ padding:'0.25rem 0' }} />}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <div style={{ padding:'0.5rem 0.75rem', borderTop:'1px solid var(--cds-border-subtle)',
        display:'flex', flexWrap:'wrap', gap:'0.25rem' }}>
        {CHAT_SUGGESTIONS.map(s => (
          <Button key={s} kind="ghost" size="sm" onClick={() => send(s)}
            style={{ fontSize:'0.6875rem', whiteSpace:'nowrap' }}>
            {s}
          </Button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding:'0.625rem 0.75rem', borderTop:'1px solid var(--cds-border-subtle)', display:'flex', gap:'0.5rem', flexShrink:0 }}>
        <TextInput id="chat-input" labelText="" hideLabel
          value={input} onChange={e => setInput(e.target.value)} disabled={sending}
          placeholder="Ask about your Maximo data…"
          onKeyDown={e => e.key==='Enter' && !e.shiftKey && send()}
          style={{ flex:1 }}
        />
        <Button kind="primary" onClick={() => send()} disabled={sending || !input.trim()}>➤</Button>
      </div>
    </div>
  );
}

// ── App Root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView]           = useState('dashboard');
  const [orgs, setOrgs]           = useState([]);
  const [sites, setSites]         = useState([]);
  const [org, setOrg]             = useState('');
  const [site, setSite]           = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat]   = useState(false);
  const [darkContent, setDarkContent] = useState(true);  // default dark (g100)
  const [mapModal, setMapModal]   = useState(null);
  const [pageSize, setPageSize]   = useState(1000);
  const [refreshKey, setRefreshKey] = useState(0);

  const contentTheme = darkContent ? 'g100' : 'g10';
  const scope = { site, org };

  // Apply content theme to <html> and <body> so Carbon CSS vars cascade everywhere,
  // including Modal portals which attach directly to <body>.
  // The Header and SideNav stay g100 (dark) always via their own wrapper div.
  useEffect(() => {
    document.documentElement.setAttribute('data-carbon-theme', contentTheme);
    document.body.setAttribute('data-carbon-theme', contentTheme);
  }, [contentTheme]);

  useEffect(() => {
    api.getSettings().then(s => {
      if (s.org)  setOrg(s.org);
      if (s.site) setSite(s.site);
    });
    api.getOrgs().then(setOrgs);
    api.getSites('').then(list => {
      setSites(list);
    });
  }, []);

  useEffect(() => {
    api.getSites(org).then(list => {
      setSites(list);
      if (site && !list.find(s => s.id===site)) setSite('');
    });
  }, [org]);

  const ViewComponent = {
    dashboard: Dashboard, assets: AssetsView, workorders: WorkOrdersView,
    health: HealthView, meters: MetersView, locations: LocationsView,
    pms: PMsView, badactors: BadActorsView, explorer: ExplorerView, map: MapView,
  }[view] || Dashboard;

  const viewLabel = NAV_ITEMS.find(n => n.id===view)?.label || 'Dashboard';

  return (
    <PageSizeCtx.Provider value={pageSize}>
      {/* Header and SideNav — always dark (g100), regardless of content theme toggle */}
      <div data-carbon-theme="g100">
        <Header aria-label="MAS AI Assistant">
          <HeaderName href="#" prefix="IBM">
            MAS AI Assistant
          </HeaderName>
          <HeaderGlobalBar>
            <Toggle
              id="theme-toggle"
              labelText=""
              labelA="Light"
              labelB="Dark"
              toggled={darkContent}
              onToggle={() => setDarkContent(d => !d)}
              size="sm"
              style={{ marginRight:'0.5rem', display:'flex', alignItems:'center' }}
            />
            <HeaderGlobalAction aria-label="Refresh" title="Refresh"
              onClick={() => setRefreshKey(k => k+1)}>
              <span style={{ fontSize:'1rem', padding:'0 0.25rem' }}>↺</span>
            </HeaderGlobalAction>
            <HeaderGlobalAction aria-label={showChat ? 'Close Chat' : 'AI Chat'} title={showChat ? 'Close Chat' : 'AI Chat'}
              isActive={showChat}
              onClick={() => setShowChat(c => !c)}>
              <span style={{ fontSize:'1rem', padding:'0 0.25rem' }}>💬</span>
            </HeaderGlobalAction>
          </HeaderGlobalBar>
        </Header>

        {/* SideNav */}
        <SideNav aria-label="Side navigation" expanded isFixedNav isPersistent>
          {/* Org/Site selectors — keep dark background from parent */}
          <div style={{ padding:'0.75rem', borderBottom:'1px solid var(--cds-border-subtle)' }}>
            <select
              value={org} onChange={e => setOrg(e.target.value)}
              style={{ width:'100%', padding:'0.375rem 0.5rem', background:'#393939',
                border:'1px solid #525252', color:'#f4f4f4',
                borderRadius:'0.125rem', fontSize:'0.875rem', marginBottom:'0.5rem', outline:'none' }}>
              <option value="">All Orgs</option>
              {orgs.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <select
              value={site} onChange={e => setSite(e.target.value)}
              style={{ width:'100%', padding:'0.375rem 0.5rem', background:'#393939',
                border:'1px solid #525252', color:'#f4f4f4',
                borderRadius:'0.125rem', fontSize:'0.875rem', outline:'none' }}>
              <option value="">All Sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.id}{s.description ? ` — ${s.description}` : ''}</option>)}
            </select>
          </div>

          <SideNavItems>
            {NAV_ITEMS.map(item => (
              <SideNavLink key={item.id}
                isActive={view === item.id}
                onClick={() => setView(item.id)}
                href="#">
                {item.label}
              </SideNavLink>
            ))}
          </SideNavItems>

          {/* Settings button at bottom */}
          <div style={{ padding:'0.75rem', borderTop:'1px solid var(--cds-border-subtle)', marginTop:'auto' }}>
            <Button kind="ghost" size="sm" style={{ width:'100%', justifyContent:'flex-start' }}
              onClick={() => setShowSettings(true)}>
              ⚙ Settings
            </Button>
          </div>
        </SideNav>
      </div>

      {/* Main content + chat */}
      <div style={{ display:'flex', paddingTop:'3rem', height:'100vh', overflow:'hidden' }}>
        {/* Content area with sidebar offset */}
        <main style={{ marginLeft:'16rem', flex:1, overflowY: view==='map' ? 'hidden' : 'auto',
          padding: view==='map' ? 0 : '1.5rem 2rem',
          background:'var(--cds-background)', display:'flex', flexDirection:'column' }}>
          {/* Page heading */}
          {view !== 'map' && (
            <h2 style={{ fontSize:'1.25rem', fontWeight:600, marginBottom:'1.25rem', color:'var(--cds-text-primary)' }}>
              {viewLabel}
            </h2>
          )}
          <ViewComponent key={`${view}-${refreshKey}`} scope={scope} onMapModal={setMapModal} />
        </main>

        {/* Chat Panel — inherits main theme (darkContent) */}
        {showChat && (
          <ChatPanel scope={{ ...scope, pageSize }} onClose={() => setShowChat(false)}
            chatDark={darkContent} onToggleDark={() => setDarkContent(d => !d)} />
        )}
      </div>

      {/* Modals (at root level — inherit theme from <html>) */}
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)}
          pageSize={pageSize} onPageSizeChange={setPageSize} />
      )}
      {mapModal?.type === 'createWO' && (
        <CreateRecordModal mode="WO"
          prefill={{ assetnum:mapModal.assetnum, location:mapModal.location, siteid:mapModal.siteid }}
          onClose={() => setMapModal(null)} />
      )}
      {mapModal?.type === 'createSR' && (
        <CreateRecordModal mode="SR"
          prefill={{ assetnum:mapModal.assetnum, location:mapModal.location, siteid:mapModal.siteid }}
          onClose={() => setMapModal(null)} />
      )}
      {mapModal?.type === 'changeStatus' && (
        <ChangeStatusModal objectType={mapModal.objectType} id={mapModal.id}
          siteid={mapModal.siteid} onClose={() => setMapModal(null)} />
      )}
    </PageSizeCtx.Provider>
  );
}
