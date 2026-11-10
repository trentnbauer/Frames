import { useRef, useState } from 'react';
import { api } from '../api';

/** A map to place a pin on. Tiles and place search come from OpenStreetMap through this server, only once a map is opened. */
const TILE = 256, W = 560, H = 360, MAX_Z = 18;
const worldPx = (z: number) => TILE * 2 ** z;
export const project = (lat: number, lon: number, z: number) => {
  const s = Math.sin((Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180);
  return { x: ((lon + 180) / 360) * worldPx(z), y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldPx(z) };
};
export const unproject = (x: number, y: number, z: number) => ({
  lon: (x / worldPx(z)) * 360 - 180,
  lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / worldPx(z)))) * 180) / Math.PI,
});

type Hit = { name: string; lat: number; lon: number };

export function MapPin({ lat, lon, onSave, onClose }: { lat: number | null; lon: number | null; onSave: (lat: number | null, lon: number | null) => void; onClose: () => void }) {
  const [z, setZ] = useState(lat !== null ? 12 : 2);
  const [c, setC] = useState<{ lat: number; lon: number }>({ lat: lat ?? 20, lon: lon ?? 0 });
  const [pin, setPin] = useState<{ lat: number; lon: number } | null>(lat !== null && lon !== null ? { lat, lon } : null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [err, setErr] = useState('');
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);

  const mid = project(c.lat, c.lon, z);
  const left = mid.x - W / 2, top = mid.y - H / 2;
  const n = 2 ** z;
  const tiles: { key: string; x: number; y: number; src: string }[] = [];
  for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + H) / TILE); ty++) {
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + W) / TILE); tx++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n; // the map repeats sideways
      tiles.push({ key: `${z}/${tx}/${ty}`, x: tx * TILE - left, y: ty * TILE - top, src: `/api/map/tile/${z}/${wx}/${ty}` });
    }
  }
  const at = (e: { clientX: number; clientY: number }, el: HTMLElement) => { const r = el.getBoundingClientRect(); return unproject(left + (e.clientX - r.left), top + (e.clientY - r.top), z); };
  const pinXY = pin ? (() => { const p = project(pin.lat, pin.lon, z); return { x: p.x - left, y: p.y - top }; })() : null;
  const zoom = (d: number) => setZ((v) => Math.max(1, Math.min(MAX_Z, v + d)));
  const search = async () => {
    if (!q.trim()) return;
    setErr(''); setHits(null);
    try { setHits(await api<Hit[]>(`/map/search?q=${encodeURIComponent(q.trim())}`)); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div className="sheet-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Place a pin on the map" style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, width: W + 40, maxWidth: '100%', maxHeight: '95vh', overflow: 'auto', boxShadow: '0 0 0 1px var(--hair),0 12px 30px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
          <h2 style={{ font: "400 26px 'Instrument Serif',Georgia,serif", margin: 0 }}>Place a pin</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: 'var(--text2)' }}>✕</button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void search(); }} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search for a place to move the map" aria-label="Search the map" style={{ flex: 1 }} />
          <button className="pill">Search</button>
        </form>
        {err && <div className="reason" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
        {hits && (hits.length === 0 ? <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>No place found.</div> : (
          <div style={{ marginBottom: 10 }}>{hits.map((h) => <button key={`${h.lat},${h.lon}`} onClick={() => { setC({ lat: h.lat, lon: h.lon }); setZ(12); setHits(null); }} style={{ display: 'block', textAlign: 'left', fontSize: 12.5, padding: '4px 0', color: 'var(--text)' }}>{h.name}</button>)}</div>
        ))}
        <div aria-label="Map" onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, cx: mid.x, cy: mid.y, moved: false }; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true; if (d.moved) setC(unproject(d.cx - dx, d.cy - dy, z)); }}
          onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && !d.moved) setPin(at(e, e.currentTarget as HTMLElement)); }}
          onWheel={(e) => zoom(e.deltaY < 0 ? 1 : -1)}
          style={{ position: 'relative', width: W, maxWidth: '100%', height: H, overflow: 'hidden', background: '#33322f', borderRadius: 8, cursor: 'crosshair', touchAction: 'none', userSelect: 'none' }}>
          {tiles.map((t) => <img key={t.key} src={t.src} alt="" draggable={false} referrerPolicy="no-referrer" style={{ position: 'absolute', left: t.x, top: t.y, width: TILE, height: TILE, pointerEvents: 'none' }} />)}
          {pinXY && <span aria-label="Pin" style={{ position: 'absolute', left: pinXY.x - 7, top: pinXY.y - 7, width: 14, height: 14, borderRadius: '50%', background: '#e5533d', boxShadow: '0 0 0 2px #fff, 0 2px 6px rgba(0,0,0,.5)', pointerEvents: 'none' }} />}
          <div style={{ position: 'absolute', right: 8, top: 8, display: 'flex', flexDirection: 'column', gap: 4 }} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
            <button className="pill" onClick={() => zoom(1)} aria-label="Zoom in">+</button>
            <button className="pill" onClick={() => zoom(-1)} aria-label="Zoom out">−</button>
          </div>
          <span style={{ position: 'absolute', left: 6, bottom: 4, fontSize: 10.5, color: '#222', background: 'rgba(255,255,255,.75)', padding: '0 4px', borderRadius: 3 }}>© OpenStreetMap contributors</span>
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>Click the map to drop the pin; drag to move the map.{pin ? ` Pin at ${pin.lat.toFixed(5)}, ${pin.lon.toFixed(5)}.` : ' No pin yet.'}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="t2" disabled={!pin && lat === null} onClick={() => { setPin(null); }}>Remove the pin</button>
          <span style={{ display: 'flex', gap: 10 }}>
            <button className="pill" onClick={onClose}>Cancel</button>
            <button className="pill primary" onClick={() => onSave(pin?.lat ?? null, pin?.lon ?? null)}>Save</button>
          </span>
        </div>
      </div>
    </div>
  );
}
