import { useState } from 'react';
import { arrange, printsSummary, type Mode, type Print } from '../layout';
import { PrintModal, Wall, type Pic } from './CompositionWall';
import { usePhone } from '../pages/ShareMobile';

const ring = 'inset 0 0 0 1px rgba(255,255,255,.2)';

/**
 * A guest's way to say "what about different prints?": the same wall as the photographer's, with sizes, frames and the number of prints
 * changeable. Nothing here touches the composition; it is sent as a suggestion the photographer can apply or dismiss.
 */
export function LayoutSuggest({ token, start, mode: startMode, photos, reviewer, onClose, onSent }: {
  token: string; start: Print[]; mode: Mode; photos: Map<number, Pic>; reviewer: string; onClose: () => void; onSent: () => void;
}) {
  const phone = usePhone();
  const [prints, setPrints] = useState<Print[]>(start);
  const [mode, setMode] = useState<Mode>(startMode);
  const [sel, setSel] = useState(0);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const wall = mode === 'free' ? prints : arrange(prints, mode);
  const set = (ps: Print[], m: Mode = mode) => { setPrints(m === 'free' ? ps : arrange(ps, m)); setMode(m); };
  const edit = (fn: (q: Print) => void) => set(wall.map((p, k) => { if (k !== sel) return p; const q = { ...p, frame: p.frame ? { ...p.frame } : null }; fn(q); if (!q.stack) q.photoId2 = null; return q; }));
  const send = async () => {
    setBusy(true); setErr('');
    const r = await fetch(`/api/s/${token}/layout`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewer, layout: { mode, prints: wall }, note }) });
    setBusy(false);
    if (r.ok) onSent(); else setErr((await r.json().catch(() => ({}))).error ?? 'Could not send that');
  };
  const pill = (on = false) => ({ padding: '6px 12px', borderRadius: 999, fontSize: 12.5, background: on ? '#efede8' : 'transparent', color: on ? '#0d0d0d' : '#efede8', boxShadow: ring });
  return (
    <div className="lay-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <section className="lay-box" role="dialog" aria-label="Suggest a different layout" style={{ background: '#161615', borderRadius: 14, padding: 24, width: 880, maxWidth: '100%', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ font: "400 30px 'Instrument Serif',Georgia,serif", margin: '0 0 4px' }}>Suggest a different layout</h2>
          <button className="t2" onClick={onClose}>Close</button>
        </div>
        <p style={{ fontSize: 13, color: '#8f8c86', margin: '0 0 14px' }}>Change the size, frame or number of prints and send it. It is shown to whoever shared this as a suggestion; nothing of theirs is changed.</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          {([['row', 'Row'], ['grid', 'Grid'], ['feature', 'Feature']] as const).map(([k, l]) => <button key={k} aria-pressed={mode === k} onClick={() => set(prints, k)} style={pill(mode === k)}>{l}</button>)}
          <button onClick={() => { const last = wall[wall.length - 1]; set([...wall, { ...last, id: Math.max(...wall.map((q) => q.id)) + 1, photoId: null, photoId2: null, frame: last.frame ? { ...last.frame } : null }], mode === 'free' ? 'row' : mode); setSel(wall.length); }} disabled={wall.length >= 12} style={pill()}>+ Add a print</button>
          <button onClick={() => setEditing(!editing)} aria-pressed={editing} style={pill(editing)}>{editing ? 'Moving prints' : 'Move prints'}</button>
          <span className="muted" style={{ fontSize: 12.5, marginLeft: 'auto' }}>{printsSummary(wall)}</span>
        </div>
        <div style={{ background: '#0d0d0d', borderRadius: 8, padding: '24px 24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
          <Wall compact={phone} prints={wall} mode={mode} editing={editing} sel={sel} photos={photos} over={null} locked={false} share={token} onSelect={setSel} onEdit={(i) => { setSel(i); setOpen(true); }} onMoved={(ps) => set(ps, 'free')} onOver={() => undefined} onDropPhoto={() => undefined} />
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>Click a print to select it, then <b>Edit</b> on it for its size, orientation and frame. Drawn to scale.</p>
        <textarea aria-label="Note with your suggestion" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Say why (optional)" rows={2} style={{ width: '100%', marginBottom: 12 }} />
        {err && <div className="reason" role="alert" style={{ marginBottom: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="pill" onClick={onClose}>Cancel</button>
          <button className="pill primary" onClick={send} disabled={busy}>Send suggestion</button>
        </div>
      </section>
      {open && <PrintModal prints={wall} index={sel} count={wall.length} onChange={edit}
        onApplyAll={() => { const f = wall[sel].frame; set(wall.map((p) => ({ ...p, frame: f ? { ...f, size: p.frame ? p.frame.size : f.size } : null }))); }}
        onDelete={() => { if (wall.length <= 1) return; setOpen(false); setSel(0); set(wall.filter((_, k) => k !== sel), mode === 'free' ? 'row' : mode); }} onClose={() => setOpen(false)} />}
    </div>
  );
}
