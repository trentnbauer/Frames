import { useMemo, useState } from 'react';
import { api, useApi } from '../api';
import type { Collection } from '../data';
import { useUi } from '../ui';
import { Modal } from './Modal';

/**
 * The one composition picker, used by the photo page, the library's selection, search and review.
 * Existing: search a long list; with no search, the compositions these photographs are already in (ticked) come first, then the 5 most
 * recently edited. Printed ones are hidden. Ticking adds the photographs as candidates (never straight into a print); unticking removes them.
 * New: a name, then New composition opens with the photographs loaded.
 */
export function CompPicker({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: (msg: string) => void }) {
  const colls = useApi<Collection[]>('/collections');
  const { openNew } = useUi();
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = useMemo(() => (colls.data ?? []).filter((c) => !c.printedAt), [colls.data]);
  // Which compositions hold every one of these photographs already (the start state of the ticks).
  const has = (c: Collection) => ids.length > 0 && ids.every((id) => c.photoIds.includes(id));
  const [ticks, setTicks] = useState<Record<number, boolean> | null>(null);
  const state = (c: Collection) => ticks?.[c.id] ?? has(c);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle) return open.filter((c) => c.name.toLowerCase().includes(needle)).slice(0, 50);
    const inAlready = open.filter((c) => ids.some((id) => c.photoIds.includes(id)));
    const recent = [...open].filter((c) => !inAlready.includes(c)).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id).slice(0, 5);
    return [...inAlready, ...recent];
  }, [open, q, ids]);
  const changes = open.filter((c) => (ticks?.[c.id] ?? has(c)) !== has(c));

  const apply = async () => {
    setBusy(true); setErr('');
    try {
      for (const c of changes) {
        const on = ticks![c.id];
        for (const id of ids) if (on ? !c.photoIds.includes(id) : c.photoIds.includes(id)) await api(`/collections/${c.id}/photos/${id}`, { method: on ? 'PUT' : 'DELETE' });
      }
      const added = changes.filter((c) => ticks![c.id]).length, removed = changes.length - added;
      onDone([added ? `Added to ${added} ${added === 1 ? 'composition' : 'compositions'}` : '', removed ? `Removed from ${removed}` : ''].filter(Boolean).join(' · ') || 'No changes');
      onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const create = () => { if (!name.trim()) return; onClose(); openNew({ name: name.trim(), photoIds: ids }); };
  const what = ids.length === 1 ? 'photograph' : `${ids.length} photographs`;

  return (
    <Modal title="Add to composition" sub={`Added as candidates, ranked by score. Nothing goes straight into a print.`} width={520} onClose={onClose}
      foot={tab === 'existing'
        ? <><span className="grow">{err ? <span className="reason" style={{ margin: 0 }}>{err}</span> : changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : ''}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={apply} disabled={!changes.length || busy}>Apply</button></>
        : <><span className="grow" /><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={create} disabled={!name.trim()}>Create and continue</button></>}>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={tab === 'existing'} className={tab === 'existing' ? 'on' : ''} onClick={() => setTab('existing')}>Existing composition</button>
        <button role="tab" aria-selected={tab === 'new'} className={tab === 'new' ? 'on' : ''} onClick={() => setTab('new')}>New composition</button>
      </div>
      {tab === 'existing' ? (
        <>
          <input className="field-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${open.length} composition${open.length === 1 ? '' : 's'}`} aria-label="Search compositions" autoFocus />
          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 320, overflow: 'auto', margin: '0 -8px' }}>
            {colls.loading && <div className="muted" style={{ padding: 12 }}>Loading…</div>}
            {!colls.loading && shown.length === 0 && <div className="muted" style={{ padding: 12, fontSize: 13.5 }}>{q ? 'No composition has that name.' : 'No open compositions yet. Make one on the New composition tab.'}</div>}
            {!q && shown.length > 0 && <div className="eyebrow" style={{ padding: '4px 8px 8px' }}>{ids.some((id) => open.some((c) => c.photoIds.includes(id))) ? 'Already in · most recent' : 'Most recent'}</div>}
            {shown.map((c) => (
              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px', borderRadius: 8, cursor: 'pointer' }} className="pickrow">
                <input type="checkbox" checked={state(c)} onChange={(e) => setTicks((t) => ({ ...(t ?? {}), [c.id]: e.target.checked }))} />
                <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
                <span className="faint" style={{ fontSize: 12 }}>{c.photoIds.length} photo{c.photoIds.length === 1 ? '' : 's'}</span>
              </label>
            ))}
          </div>
        </>
      ) : (
        <>
          <input className="field-in" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} placeholder="Composition name" aria-label="Composition name" autoFocus />
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>New composition opens next, with {what} already loaded.</p>
        </>
      )}
    </Modal>
  );
}

/** A button that opens the picker. Same props as ever: the photographs, what to say when done, and the label. */
export function AddToComposition({ ids, onDone, label, hero }: { ids: number[]; onDone: (msg: string) => void; up?: boolean; label?: string; hero?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={hero || !label ? 'btn primary' : 'btn outline'} disabled={ids.length === 0} aria-haspopup="dialog" onClick={() => setOpen(true)}>{label ?? 'Add to composition'}</button>
      {open && <CompPicker ids={ids} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}
