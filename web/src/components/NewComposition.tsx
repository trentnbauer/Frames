import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import type { NewCompositionStart } from '../ui';

const label = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67', marginBottom: 8 } as const;
const ring = 'inset 0 0 0 1px rgba(255,255,255,.2)';
const opt = (on: boolean) => ({ background: on ? '#efede8' : 'transparent', color: on ? '#0d0d0d' : '#efede8', boxShadow: ring });

/**
 * "+ Composition": a name, how many prints and what size, and optionally subjects and tags to look for. Photographs that have any of the
 * chosen subjects or tags are put in as the first candidates; otherwise they are added afterwards (or come with it, from a search, a shoot or a selection).
 */
export function NewComposition({ start, onClose }: { start: NewCompositionStart; onClose: () => void }) {
  const nav = useNavigate();
  const [name, setName] = useState(start.name ?? '');
  const [count, setCount] = useState(3);
  const [size, setSize] = useState<'A4' | 'A3' | 'A2'>('A3');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const subjects = useApi<{ name: string; n: number }[]>('/tags?kind=subject');
  const tags = useApi<{ name: string; n: number }[]>('/tags?kind=tag');
  const [fSub, setFSub] = useState<string[]>([]);
  const [fTag, setFTag] = useState<string[]>([]);
  const [found, setFound] = useState<number[]>([]);
  const [looking, setLooking] = useState(false);
  // The photographs that have any of the chosen subjects or tags.
  useEffect(() => {
    if (!fSub.length && !fTag.length) { setFound([]); return; }
    let live = true; setLooking(true);
    Promise.all([...fSub.map((n) => `subject=${encodeURIComponent(n)}`), ...fTag.map((n) => `tag=${encodeURIComponent(n)}`)].map((q) => api<{ photos: PhotoLite[] }>(`/photos?${q}`)))
      .then((rs) => { if (live) { setFound([...new Set(rs.flatMap((r) => r.photos.map((p) => p.id)))]); setLooking(false); } })
      .catch(() => { if (live) setLooking(false); });
    return () => { live = false; };
  }, [fSub.join('|'), fTag.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = [...new Set([...(start.photoIds ?? []), ...found])];
  const flip = (list: string[], set: (v: string[]) => void, n: string) => set(list.includes(n) ? list.filter((x) => x !== n) : [...list, n]);
  const chips = (title: string, items: { name: string; n: number }[] | null, list: string[], set: (v: string[]) => void) => (items ?? []).length > 0 && (
    <>
      <div style={label}>{title}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', maxHeight: 96, overflow: 'auto' }}>
        {(items ?? []).map((t) => <button key={t.name} aria-pressed={list.includes(t.name)} onClick={() => flip(list, set, t.name)} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12.5, ...opt(list.includes(t.name)) }}>{t.name} · {t.n}</button>)}
      </div>
    </>
  );
  const create = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    try {
      const c = await api<Collection>('/collections', { body: { name: name.trim() || 'Untitled composition', photoIds: ids } });
      await api(`/collections/${c.id}`, { method: 'PATCH', body: { target: { count, size, orientation: 'any', ppi: 300 } } });
      onClose(); nav(`/collections/${c.id}${ids.length ? '' : '?add=1'}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-label="New composition" style={{ background: '#161615', borderRadius: 14, padding: 28, width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)' }}>
        <h2 style={{ font: "400 30px 'Instrument Serif',serif", margin: '0 0 18px' }}>New composition</h2>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, for example: Neon signs" aria-label="Composition name"
          style={{ width: '100%', background: '#0d0d0d', border: 0, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxShadow: ring, outline: 'none', marginBottom: 20 }} />
        <div style={label}>Prints</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5, 6].map((v) => <button key={v} aria-pressed={count === v} onClick={() => setCount(v)} style={{ width: 40, height: 36, borderRadius: 8, ...opt(count === v) }}>{v}</button>)}
        </div>
        <div style={label}>Print size</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
          {(['A4', 'A3', 'A2'] as const).map((v) => <button key={v} aria-pressed={size === v} onClick={() => setSize(v)} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, ...opt(size === v) }}>{v}</button>)}
        </div>
        {chips('Subjects to look for (optional)', subjects.data, fSub, setFSub)}
        {chips('Tags to look for (optional)', tags.data, fTag, setFTag)}
        {err && <p className="reason" role="alert">{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: '#8f8c86' }}>{looking ? 'Looking…' : ids.length ? `${ids.length} candidates → best ${count} at ${size}` : `${count} × ${size}. You add the photographs next.`}</span>
          <button onClick={create} disabled={busy} style={{ background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14 }}>Create and rank</button>
        </div>
      </div>
    </div>
  );
}
