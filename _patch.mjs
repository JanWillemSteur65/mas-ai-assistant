import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appPath = join(__dirname, 'ui/src/App.jsx');

let src = readFileSync(appPath, 'utf8');

// ─── 1. Insert DonutChart + BarChart + CreateRecordModal + MapView before Dashboard ───
const CHART_AND_MODAL_CODE = `
// ── Chart color palette ───────────────────────────────────────────────────────
const CHART_COLORS = ['#78a9ff','#42be65','#f1c21b','#fa4d56','#be95ff','#3ddbd9','#ff832b','#ee5396','#a7f0ba','#d2a106'];

// ── DonutChart (pure SVG) ─────────────────────────────────────────────────────
function DonutChart({ data, size = 160, t }) {
  if (!data || data.length === 0) return <div style={{ color:t.muted, fontSize:12, padding:8 }}>No data</div>;
  const total = data.reduce((s,d) => s + d.value, 0);
  if (total === 0) return <div style={{ color:t.muted, fontSize:12, padding:8 }}>No data</div>;
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
    const path = \`M \${ix1} \${iy1} L \${x1} \${y1} A \${R} \${R} 0 \${large} 1 \${x2} \${y2} L \${ix2} \${iy2} A \${r} \${r} 0 \${large} 0 \${ix1} \${iy1} Z\`;
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
          fill={t.text}>{total}</text>
      </svg>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:6, justifyContent:'center' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:t.muted }}>
            <span style={{ display:'inline-block', width:8, height:8, borderRadius:2, background:s.color, flexShrink:0 }}/>
            <span style={{ maxWidth:80, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
              title={s.label}>{s.label}</span>
            <span style={{ color:t.text, fontWeight:600 }}>{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BarChart (horizontal, pure SVG) ──────────────────────────────────────────
function BarChart({ data, t, width = 280 }) {
  if (!data || data.length === 0) return <div style={{ color:t.muted, fontSize:12, padding:8 }}>No data</div>;
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
            <text x={labelW - 4} y={y + barH * 0.72} textAnchor="end" fontSize={11} fill={t.muted}
              style={{ overflow:'hidden', textOverflow:'ellipsis' }}>
              {d.label.length > 9 ? d.label.slice(0,8)+'…' : d.label}
            </text>
            <rect x={labelW} y={y + 1} width={bw} height={barH - 2} fill={color} rx={2}>
              <title>{d.label}: {d.value}</title>
            </rect>
            <text x={labelW + bw + 4} y={y + barH * 0.72} fontSize={11} fontWeight={600} fill={t.text}>{d.value}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── ChartCard ─────────────────────────────────────────────────────────────────
function ChartCard({ title, children, t }) {
  return (
    <div style={{ background:t.surface, border:\`1px solid \${t.border}\`, borderRadius:6,
      padding:'16px 18px', display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ fontSize:13, fontWeight:600, color:t.text, borderBottom:\`1px solid \${t.border}\`,
        paddingBottom:8 }}>{title}</div>
      {children}
    </div>
  );
}

// ── CreateRecordModal ─────────────────────────────────────────────────────────
function CreateRecordModal({ mode, prefill, onClose, onCreated, t }) {
  const [desc, setDesc]       = useState('');
  const [wtype, setWtype]     = useState('CM');
  const [priority, setPriority] = useState('');
  const [assetnum, setAsset]  = useState(prefill.assetnum || '');
  const [location, setLoc]    = useState(prefill.location || '');
  const [submitting, setSub]  = useState(false);
  const [result, setResult]   = useState(null);
  const [err, setErr]         = useState('');
  const siteid = prefill.siteid || '';

  const inpS = (extra={}) => ({
    width:'100%', padding:'6px 8px', background:t.surface2 || t.surface,
    border:\`1px solid \${t.border}\`, borderRadius:4, color:t.text, fontSize:13,
    boxSizing:'border-box', ...extra
  });
  const labelS = { fontSize:11, color:t.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:3, display:'block' };
  const fieldS = { marginBottom:12 };

  async function submit(e) {
    e.preventDefault();
    if (!desc.trim()) { setErr('Description is required'); return; }
    setSub(true); setErr('');
    try {
      if (mode === 'WO') {
        const r = await api.createWO({ description:desc, assetnum, location, siteid, worktype:wtype, priority });
        setResult(\`✓ WO \${r.wonum} created\`);
        onCreated && onCreated(r);
      } else {
        const r = await api.createSR({ description:desc, assetnum, location, siteid, reportedpriority:priority });
        setResult(\`✓ SR \${r.ticketid} created\`);
        onCreated && onCreated(r);
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setSub(false);
    }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.7)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:300 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:t.bg || t.surface, border:\`1px solid \${t.border}\`, borderRadius:6,
        width:480, maxWidth:'95vw', padding:0 }}>
        <div style={{ background: NAV_DARK.surface, padding:'12px 18px', borderBottom:\`1px solid \${NAV_DARK.border}\`,
          borderRadius:'6px 6px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:16, fontWeight:700, color:NAV_DARK.blue }}>
            Create {mode === 'WO' ? 'Work Order' : 'Service Request'}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:NAV_DARK.muted,
            cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ padding:20 }}>
          {result ? (
            <div>
              <div style={{ color:'#42be65', fontWeight:600, fontSize:15, marginBottom:16 }}>{result}</div>
              <button onClick={onClose} style={{ padding:'8px 20px', background:t.blue || '#78a9ff',
                border:'none', borderRadius:4, color:'#161616', cursor:'pointer', fontWeight:600 }}>Close</button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div style={fieldS}>
                <label style={labelS}>Description *</label>
                <input style={inpS()} value={desc} onChange={e=>setDesc(e.target.value)} placeholder="Enter description…" />
              </div>
              {mode === 'WO' && (
                <div style={fieldS}>
                  <label style={labelS}>Work Type</label>
                  <select style={inpS()} value={wtype} onChange={e=>setWtype(e.target.value)}>
                    {['CM','EM','PM','CP','EV','MINOR'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
              <div style={fieldS}>
                <label style={labelS}>Priority</label>
                <select style={inpS()} value={priority} onChange={e=>setPriority(e.target.value)}>
                  <option value="">— blank —</option>
                  {[1,2,3,4,5].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div style={fieldS}>
                <label style={labelS}>Asset #</label>
                <input style={inpS()} value={assetnum} onChange={e=>setAsset(e.target.value)} placeholder="optional" />
              </div>
              <div style={fieldS}>
                <label style={labelS}>Location</label>
                <input style={inpS()} value={location} onChange={e=>setLoc(e.target.value)} placeholder="optional" />
              </div>
              <div style={fieldS}>
                <label style={labelS}>Site ID</label>
                <input style={inpS({ opacity:.7 })} value={siteid} readOnly />
              </div>
              {err && <div style={{ color:'#fa4d56', fontSize:13, marginBottom:10 }}>{err}</div>}
              <button type="submit" disabled={submitting}
                style={{ padding:'8px 20px', background:'#78a9ff', border:'none', borderRadius:4,
                  color:'#161616', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight:600, opacity: submitting ? .6 : 1 }}>
                {submitting ? 'Creating…' : \`Create \${mode}\`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── MapView ───────────────────────────────────────────────────────────────────
function MapView({ scope, t }) {
  const mapRef      = useRef(null);
  const instanceRef = useRef(null);
  const markersRef  = useRef([]);
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState('');
  const [pins, setPins]       = useState([]);
  const [createWO, setCreateWO] = useState(null); // { assetnum, location, siteid }

  // Inject Leaflet CSS + JS once
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

  function addMarkers(map, assets) {
    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    for (const a of assets) {
      const popup = window.L.popup().setContent(
        \`<div style="font-size:13px;line-height:1.6">
          <b>Asset: \${a.assetnum}</b><br/>
          \${a.description ? a.description + '<br/>' : ''}
          Type: \${a.assettype || '—'}<br/>
          Status: \${a.status || '—'}<br/>
          Location: \${a.location || '—'}<br/>
          \${a.address ? 'Address: ' + a.address + '<br/>' : ''}
          <button onclick="window.__openMapCreateWO(\\'\${a.assetnum}\\',\\'\${a.location}\\',\\'\${a.siteid}\\')"
            style="margin-top:6px;padding:4px 10px;background:#78a9ff;border:none;border-radius:3px;cursor:pointer;font-weight:600;font-size:12px">
            + Create WO
          </button>
        </div>\`
      );
      const marker = window.L.marker([a.lat, a.lng]).addTo(map).bindPopup(popup);
      markersRef.current.push(marker);
    }
  }

  useEffect(() => {
    // Global callback for popup button
    window.__openMapCreateWO = (assetnum, location, siteid) => {
      setCreateWO({ assetnum, location, siteid });
    };

    let cancelled = false;
    setLoading(true); setErr('');

    loadLeaflet()
      .then(() => api.getMapData(scope))
      .then(assets => {
        if (cancelled) return;
        setPins(assets);
        if (!containerRef.current) return;

        if (!instanceRef.current) {
          const map = window.L.map(containerRef.current).setView([52.136, -0.465], 10);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).addTo(map);
          instanceRef.current = map;
          mapRef.current = map;
        }
        addMarkers(instanceRef.current, assets);
        setLoading(false);
      })
      .catch(e => {
        if (!cancelled) { setErr(e.message); setLoading(false); }
      });

    return () => {
      cancelled = true;
    };
  }, [scope.site, scope.org]);

  useEffect(() => {
    return () => {
      window.__openMapCreateWO = undefined;
      if (instanceRef.current) {
        instanceRef.current.remove();
        instanceRef.current = null;
      }
    };
  }, []);

  return (
    <div style={{ position:'relative' }}>
      {loading && <Loading text="Loading map…" t={t} />}
      {err && <ErrMsg error={err} t={t} />}
      <div ref={containerRef} style={{ height:'calc(100vh - 160px)', borderRadius:4,
        border:\`1px solid \${t.border}\`, display: loading || err ? 'none' : 'block' }} />
      {!loading && !err && pins.length === 0 && (
        <div style={{ position:'absolute', top:60, left:'50%', transform:'translateX(-50%)',
          background:'rgba(0,0,0,.75)', color:'#f4f4f4', padding:'10px 18px', borderRadius:4,
          fontSize:13, maxWidth:400, textAlign:'center', zIndex:1000, lineHeight:1.6 }}>
          No assets have GPS coordinates. Populate latitudey/longitudex via Service Addresses
          in Maximo to see pins.
        </div>
      )}
      {createWO && (
        <CreateRecordModal mode="WO" prefill={createWO}
          onClose={() => setCreateWO(null)} t={t} />
      )}
    </div>
  );
}

`;

// ─── 2. New Dashboard replacement code ───────────────────────────────────────
const NEW_DASHBOARD = `function Dashboard({ scope, t }) {
  const [data, setData]     = useState(null);
  const [err, setErr]       = useState('');
  const [summary, setSummary] = useState(null);
  const [modalRow, setModalRow] = useState(null);

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
      api.getAssets({ ...scope, page:1, pageSize:1 }),
      api.getWorkOrders({ ...scope, page:1, pageSize:5 }),
      api.getHealth({ ...scope, page:1, pageSize:1 }),
      api.getPMs({ ...scope, page:1, pageSize:1 }),
    ]).then(([stats, assets, wos, health, pms]) => {
      setData(stats);
      setSummary({ assets: assets.total || 0, wos: wos.total || 0, health: health.total || 0, pms: pms.total || 0, recentWOs: wos.members || [] });
    }).catch(e => setErr(e.message));
  }, [scope.site, scope.org]);

  if (err) return <ErrMsg error={err} t={t} />;
  if (!data || !summary) return <Loading text="Loading dashboard…" t={t} />;

  const openWOs = (data.woByStatus || []).filter(d => !['COMP','CAN','CLOSE'].includes(d.label)).reduce((s,d) => s+d.value, 0);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px,1fr))', gap:12, marginBottom:24 }}>
        <SummaryCard label="Total Assets"     value={summary.assets} sub="in scope"                 color="#78a9ff" t={t} />
        <SummaryCard label="Work Orders"      value={summary.wos}    sub={\`~\${openWOs} open\`}        color="#42be65" t={t} />
        <SummaryCard label="Health Insights"  value={summary.health} sub="condition monitoring WOs"  color="#f1c21b" t={t} />
        <SummaryCard label="Preventive Maint" value={summary.pms}    sub="total PMs"                 color="#be95ff" t={t} />
      </div>

      {/* Chart grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:16, marginBottom:24 }}>
        <ChartCard title="Work Orders by Type" t={t}>
          <DonutChart data={data.woByType} t={t} />
        </ChartCard>
        <ChartCard title="Work Orders by Status" t={t}>
          <DonutChart data={data.woByStatus} t={t} />
        </ChartCard>
        <ChartCard title="Assets by Type" t={t}>
          <DonutChart data={data.assetByType} t={t} />
        </ChartCard>
        <ChartCard title="Assets by Status" t={t}>
          <DonutChart data={data.assetByStatus} t={t} />
        </ChartCard>
        <ChartCard title="PMs by Status" t={t}>
          <DonutChart data={data.pmByStatus} t={t} />
        </ChartCard>
        <ChartCard title="WO Work Types (bar)" t={t}>
          <BarChart data={data.woByType} t={t} />
        </ChartCard>
      </div>

      {/* Recent WOs */}
      <h3 style={{ marginBottom:12, fontSize:15, color:t.text }}>Recent Work Orders</h3>
      <WOTable rows={summary.recentWOs} onRowClick={setModalRow} t={t} />
      {modalRow && (
        <RowModal row={modalRow} columns={WO_COLS} label="Work Order" idField="wonum"
          onClose={() => setModalRow(null)} t={t} />
      )}
    </div>
  );
}
`;

// ─── 3. New RowModal with Create WO/SR buttons ───────────────────────────────
const NEW_ROW_MODAL = `function RowModal({ row, columns, label, idField, onClose, t }) {
  const [showCreate, setShowCreate] = useState(null); // 'WO' | 'SR' | null
  if (!row) return null;
  const id = row[idField] || '';
  const identCols = columns.filter(c => ['id','text'].includes(c.type));
  const metaCols  = columns.filter(c => ['status','number'].includes(c.type));
  const dateCols  = columns.filter(c => c.type === 'date');
  const columnKeys = new Set(columns.map(c => c.key));
  const extraKeys = Object.keys(row).filter(k =>
    !columnKeys.has(k) && !k.startsWith('_') && !k.endsWith('_collectionref') &&
    k !== 'href' && typeof row[k] !== 'object'
  );
  const showCreateBtns = idField === 'assetnum' || idField === 'location';
  const prefill = { assetnum: row.assetnum || '', location: row.location || '', siteid: row.siteid || '' };

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)',
        display:'flex', alignItems:'center', justifyContent:'center', zIndex:200 }}
        onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background:t.modalBg, border:\`1px solid \${t.border}\`, borderRadius:6,
          width:680, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', padding:0 }}>
          {/* Modal header */}
          <div style={{ background: NAV_DARK.surface, padding:'14px 20px',
            borderBottom:\`1px solid \${NAV_DARK.border}\`, display:'flex', alignItems:'center', gap:12,
            borderRadius:'6px 6px 0 0' }}>
            <div>
              <div style={{ fontSize:12, color:NAV_DARK.muted, textTransform:'uppercase', letterSpacing:'.06em' }}>{label}</div>
              <div style={{ fontSize:20, fontWeight:700, color:NAV_DARK.blue }}>{id}</div>
            </div>
            {row.status && <Tag value={row.status} t={NAV_DARK} />}
            <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none',
              color:NAV_DARK.muted, cursor:'pointer', fontSize:20, lineHeight:1 }}>✕</button>
          </div>
          {/* Body */}
          <div style={{ padding:20 }}>
            {row.description && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, color:t.muted, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:4 }}>Description</div>
                <div style={{ fontSize:15, fontWeight:500, color:t.text }}>{row.description}</div>
              </div>
            )}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px' }}>
              {columns.filter(c => c.key !== 'description').map(c => (
                <FieldRow key={c.key} label={c.label} value={row[c.key]} type={c.type} t={t} />
              ))}
              {extraKeys.map(k => (
                <FieldRow key={k} label={k} value={row[k]} type="text" t={t} />
              ))}
            </div>
          </div>
          {/* Footer with Create buttons */}
          {showCreateBtns && (
            <div style={{ padding:'12px 20px', borderTop:\`1px solid \${t.border}\`,
              display:'flex', gap:8, background:t.surface }}>
              <button onClick={() => setShowCreate('WO')}
                style={{ padding:'7px 14px', background:'#78a9ff', border:'none', borderRadius:4,
                  color:'#161616', cursor:'pointer', fontWeight:600, fontSize:13 }}>
                + Create WO
              </button>
              <button onClick={() => setShowCreate('SR')}
                style={{ padding:'7px 14px', background:'#42be65', border:'none', borderRadius:4,
                  color:'#161616', cursor:'pointer', fontWeight:600, fontSize:13 }}>
                + Create SR
              </button>
            </div>
          )}
        </div>
      </div>
      {showCreate && (
        <CreateRecordModal mode={showCreate} prefill={prefill}
          onClose={() => setShowCreate(null)} t={t} />
      )}
    </>
  );
}
`;

// ─── Apply all patches ────────────────────────────────────────────────────────

// 1. Insert chart components + CreateRecordModal + MapView before Dashboard
const BEFORE_DASHBOARD = 'function Dashboard({ scope, t }) {';
if (!src.includes(BEFORE_DASHBOARD)) {
  console.error('ERROR: Could not find Dashboard function anchor'); process.exit(1);
}
src = src.replace(BEFORE_DASHBOARD, CHART_AND_MODAL_CODE + BEFORE_DASHBOARD);

// 2. Replace Dashboard function (the original one)
const dashStart = src.indexOf('function Dashboard({ scope, t }) {');
if (dashStart === -1) { console.error('ERROR: Dashboard not found after insert'); process.exit(1); }
// Find matching closing brace
let depth = 0, i = dashStart;
while (i < src.length) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  i++;
}
const oldDashboard = src.slice(dashStart, i);
src = src.replace(oldDashboard, NEW_DASHBOARD);

// 3. Replace RowModal function
const rowModalStart = src.indexOf('function RowModal({ row, columns, label, idField, onClose, t }) {');
if (rowModalStart === -1) { console.error('ERROR: RowModal not found'); process.exit(1); }
let depth2 = 0, j = rowModalStart;
while (j < src.length) {
  if (src[j] === '{') depth2++;
  else if (src[j] === '}') { depth2--; if (depth2 === 0) { j++; break; } }
  j++;
}
const oldRowModal = src.slice(rowModalStart, j);
src = src.replace(oldRowModal, NEW_ROW_MODAL);

// 4. Add 'map' to NAV_ITEMS
src = src.replace(
  "{ id:'explorer',   label:'Data Explorer',       icon:'⊞' },\n];",
  "{ id:'explorer',   label:'Data Explorer',       icon:'⊞' },\n  { id:'map',        label:'Asset Map',           icon:'🗺' },\n];"
);

// 5. Add MapView to ViewComponent map
src = src.replace(
  "pms: PMsView, badactors: BadActorsView, explorer: ExplorerView,",
  "pms: PMsView, badactors: BadActorsView, explorer: ExplorerView, map: MapView,"
);

writeFileSync(appPath, src, 'utf8');
console.log('App.jsx patched successfully');
