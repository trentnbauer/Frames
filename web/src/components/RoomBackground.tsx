import { useRef, useState } from 'react';
import { api } from '../api';

type Bg = { w: number; h: number; v: number };
const MAX_SIDE = 1600;

/** The picture of a room is made smaller here first, so it is quick to send and the server keeps a modest file. */
function shrink(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}

/**
 * Buttons for the room picture behind a composition: add or replace it, give it a scale (mark a known width on it, so a print looks the
 * right size against the couch or door), and remove it. The picture is only for the person making the composition: it is never in a share link.
 */
export function RoomBackground({ id, bg, onChanged, onScale }: { id: number; bg: Bg | null | undefined; onChanged: () => void; onScale: (mmPerPx: number) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [marking, setMarking] = useState(false);
  const [err, setErr] = useState('');
  const upload = async (f: File) => {
    setErr('');
    try { await api(`/collections/${id}/background`, { method: 'PUT', body: { image: await shrink(f) } }); onChanged(); } catch (e) { setErr((e as Error).message); }
  };
  const pill = { padding: '6px 12px', borderRadius: 999, fontSize: 12.5, background: 'transparent', color: '#efede8', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)' } as const;
  return (
    <>
      <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a picture of the room" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f); }} />
      <button onClick={() => file.current?.click()} style={pill}>{bg ? 'Change room photo' : 'Room photo'}</button>
      {bg && <button onClick={() => setMarking(true)} style={pill}>Set scale</button>}
      {bg && <button onClick={async () => { await api(`/collections/${id}/background`, { method: 'DELETE' }); onChanged(); }} style={pill}>Remove room photo</button>}
      {err && <span className="reason" role="alert" style={{ fontSize: 12.5 }}>{err}</span>}
      {marking && bg && <ScaleBox id={id} bg={bg} onClose={() => setMarking(false)} onSave={(m) => { setMarking(false); onScale(m); }} />}
    </>
  );
}

/** Click two ends of something you know the width of (a couch, a door), say how wide it is, and the prints are drawn at their real size against it. */
function ScaleBox({ id, bg, onClose, onSave }: { id: number; bg: Bg; onClose: () => void; onSave: (mmPerPx: number) => void }) {
  const [pts, setPts] = useState<{ x: number; y: number }[]>([]); // fractions of the picture
  const [len, setLen] = useState('');
  const [unit, setUnit] = useState<'cm' | 'm' | 'in'>('cm');
  const px = pts.length === 2 ? Math.hypot((pts[1].x - pts[0].x) * bg.w, (pts[1].y - pts[0].y) * bg.h) : 0;
  const mm = Number(len) * (unit === 'cm' ? 10 : unit === 'm' ? 1000 : 25.4);
  const ok = px > 5 && mm > 0 && Number.isFinite(mm);
  const mmPerPx = ok ? mm / px : 0;
  return (
    <div className="sheet-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-label="Set the scale" style={{ background: '#161615', borderRadius: 14, padding: 20, width: 720, maxWidth: '100%', maxHeight: '95vh', overflow: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)' }}>
        <h2 style={{ font: "400 26px 'Instrument Serif',Georgia,serif", margin: '0 0 6px' }}>Set the scale</h2>
        <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>Click both ends of something whose real width you know, such as a couch, a door or a window. Then type how wide it is.</p>
        <div onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const p = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; setPts((cur) => (cur.length >= 2 ? [p] : [...cur, p])); }}
          style={{ position: 'relative', cursor: 'crosshair', lineHeight: 0 }}>
          <img src={`/api/collections/${id}/background?v=${bg.v}`} alt="Your room" draggable={false} style={{ width: '100%', display: 'block', borderRadius: 6 }} />
          {pts.length === 2 && <svg viewBox="0 0 1 1" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}><line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y} stroke="#e5533d" strokeWidth="0.004" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 2 }} /></svg>}
          {pts.map((p, i) => <span key={i} style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: 12, height: 12, margin: '-6px 0 0 -6px', borderRadius: '50%', background: '#e5533d', boxShadow: '0 0 0 2px #fff', pointerEvents: 'none' }} />)}
        </div>
        <div className="form" style={{ marginTop: 12 }}>
          <label>It is <input value={len} onChange={(e) => setLen(e.target.value)} inputMode="decimal" aria-label="Real width" style={{ width: 90 }} /></label>
          <select aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value as 'cm' | 'm' | 'in')}><option value="cm">cm</option><option value="m">m</option><option value="in">inches</option></select>
          <span className="muted" style={{ fontSize: 12.5 }}>{pts.length < 2 ? `Click ${pts.length === 0 ? 'the first end' : 'the other end'}.` : ok ? 'Ready.' : 'Type the width.'}</span>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="pill" onClick={onClose}>Cancel</button>
          <button className="pill primary" disabled={!ok} onClick={() => onSave(Math.round(mmPerPx * 1000) / 1000)}>Use this scale</button>
        </div>
      </div>
    </div>
  );
}
