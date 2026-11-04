import { useState } from 'react';
import { api, useApi } from '../api';
import type { Collection } from '../data';

/** Add these photographs to a composition that exists, or start a new one with them. */
export function AddToComposition({ ids, onDone, up = false }: { ids: number[]; onDone: (msg: string) => void; up?: boolean }) {
  const colls = useApi<Collection[]>('/collections');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const add = async (c: Collection) => {
    try { for (const id of ids) await api(`/collections/${c.id}/photos/${id}`, { method: 'PUT' }); setOpen(false); onDone(`Added ${ids.length} ${ids.length === 1 ? 'photograph' : 'photographs'} to “${c.name}”.`); } catch (e) { setErr((e as Error).message); }
  };
  const create = async () => {
    if (!name.trim()) return;
    try { const c = await api<Collection>('/collections', { body: { name: name.trim(), photoIds: ids } }); setName(''); setOpen(false); onDone(`Created “${c.name}” with ${ids.length} ${ids.length === 1 ? 'photograph' : 'photographs'}.`); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <span style={{ position: 'relative' }}>
      <button className="pill primary" disabled={ids.length === 0} aria-haspopup="menu" aria-expanded={open} onClick={() => { if (!open) colls.reload(); setOpen(!open); }}>Add {ids.length || ''} to a composition</button>
      {open && (
        <div className="menu" role="menu" style={up ? { bottom: '110%', top: 'auto', minWidth: 240 } : { minWidth: 240 }}>
          {(colls.data ?? []).length === 0 && <span className="faint menu-note">No compositions yet</span>}
          {(colls.data ?? []).map((c) => <button key={c.id} role="menuitem" onClick={() => add(c)}>{c.name}</button>)}
          <form onSubmit={(e) => { e.preventDefault(); create(); }} style={{ display: 'flex', gap: 6, padding: 6 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New composition name" aria-label="New composition name" />
            <button className="pill">Create</button>
          </form>
          {err && <span className="reason menu-note">{err}</span>}
        </div>
      )}
    </span>
  );
}
