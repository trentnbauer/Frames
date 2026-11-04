import { useState } from 'react';
import { api, useApi } from '../api';
import type { Shoot } from '../data';

/** Move these photographs into a photoshoot that exists, or into a new one made on the spot. Nothing is deleted: only which shoot they belong to changes. */
export function MoveToShoot({ ids, except, onDone, up = false }: { ids: number[]; except?: number; onDone: (msg: string) => void; up?: boolean }) {
  const shoots = useApi<Shoot[]>('/shoots');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const said = (n: string) => `Moved ${ids.length} ${ids.length === 1 ? 'photograph' : 'photographs'} to “${n}”.`;
  const move = async (s: Shoot) => {
    try { await api(`/shoots/${s.id}/move`, { body: { photoIds: ids } }); setOpen(false); onDone(said(s.name)); } catch (e) { setErr((e as Error).message); }
  };
  const create = async () => {
    if (!name.trim()) return;
    try { const s = await api<Shoot>('/shoots', { body: { name: name.trim(), photoIds: ids } }); setName(''); setOpen(false); onDone(said(s.name)); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <span style={{ position: 'relative' }}>
      <button className="pill" disabled={ids.length === 0} aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) shoots.reload(); setOpen(!open); }}>Move to…</button>
      {open && (
        <div className="menu" role="menu" aria-label="Move to a photoshoot" style={up ? { bottom: '110%', top: 'auto', minWidth: 260, maxHeight: 'min(320px, 45vh)', overflow: 'auto' } : { minWidth: 260 }}>
          <form onSubmit={(e) => { e.preventDefault(); create(); }} style={{ display: 'flex', gap: 6, padding: 6 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New photoshoot name" aria-label="New photoshoot name" />
            <button className="pill">Create</button>
          </form>
          {(shoots.data ?? []).filter((s) => s.id !== except).map((s) => <button key={s.id} role="menuitem" onClick={() => move(s)}>{s.name} <span className="faint">{s.count}</span></button>)}
          {err && <span className="reason menu-note">{err}</span>}
        </div>
      )}
    </span>
  );
}
