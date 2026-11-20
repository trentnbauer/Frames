import { useMemo, useState } from 'react';
import { api, imgUrl, useApi } from '../api';
import type { Collection } from '../data';
import { useUi } from '../ui';
import { Modal } from './Modal';
import { CarouselMaker } from './CarouselMaker';
import { useNavigate } from 'react-router-dom';

/**
 * The one composition picker, used by the photo page, the library's selection, search and review.
 * Existing: search a long list; with no search, the compositions these photographs are already in (ticked) come first, then the 5 most
 * recently edited. Printed ones are hidden. Ticking adds the photographs as candidates (never straight into a print); unticking removes them.
 * New: a name, then New composition opens with the photographs loaded.
 * It first asks what is being made: a composition (this picker), an Instagram carousel or a zine.
 */
export function CompPicker({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: (msg: string) => void }) {
  type Kind = 'wall' | 'carousel' | 'zine';
  const [kind, setKind] = useState<Kind | null>(null);
  const back = () => setKind(null);
  const what = ids.length === 1 ? 'this photo' : `${ids.length} photos`;
  if (kind === 'wall') return <WallPicker ids={ids} onClose={onClose} onDone={onDone} onBack={back} />;
  if (kind === 'carousel') return <Modal title="Instagram carousel" sub={`${ids.length === 1 ? '1 photo' : `${ids.length} photos`}, in the order you picked them`} width={760} onClose={onClose}><CarouselMaker ids={ids} /><BackRow onBack={back} /></Modal>;
  if (kind === 'zine') return <ZinePicker ids={ids} onClose={onClose} onBack={back} />;
  // First, what is being made: the same photographs can go on a wall, into a carousel or into a zine.
  const kinds: [Kind, string, string][] = [['wall', 'Composition', 'Prints arranged on a wall'], ['carousel', 'Instagram carousel', 'Bordered slides to post'], ['zine', 'Zine', 'A printable booklet']];
  return (
    <Modal title={`Add ${what} to…`} width={560} onClose={onClose}>
      <div role="group" aria-label="What to make" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {kinds.map(([k, label, sub]) => (
          <button key={k} type="button" onClick={() => setKind(k)} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 64, padding: '0 16px', borderRadius: 12, textAlign: 'left', boxShadow: 'inset 0 0 0 1px var(--outline)' }}>
            <span style={{ flex: 1 }}><span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>{label}</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{sub}</span></span>
            <span aria-hidden style={{ color: 'var(--muted)' }}>›</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

const BackRow = ({ onBack }: { onBack: () => void }) => <div style={{ paddingTop: 10 }}><button className="btn" onClick={onBack}>← Back</button></div>;

/** Add the photographs to a zine, one a page at the end, or start a new zine with them; then open it to lay them out. */
function ZinePicker({ ids, onClose, onBack }: { ids: number[]; onClose: () => void; onBack: () => void }) {
  type Zine = { id: number; name: string; printedCount: number; coverId: number | null };
  const zines = useApi<Zine[]>('/zines');
  const nav = useNavigate();
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  // The photographs become candidates, as in a composition; they are laid out on the pages in the zine.
  const go = async (z: Zine | null) => {
    setBusy(true); setErr('');
    try {
      const made = z ? await api<Zine>(`/zines/${z.id}`, { method: 'PUT', body: { addCandidates: ids } }) : await api<Zine>('/zines', { body: { name: 'Untitled zine', photoIds: ids } });
      onClose(); nav(`/zines/${made.id}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <Modal title="Add to a zine" sub="They become candidates, ready to drag onto the pages" width={560} onClose={onClose}>
      <div role="group" aria-label="Zines" style={{ display: 'flex', flexDirection: 'column', maxHeight: 320, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 8px', flexWrap: 'wrap' }}>
          <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, boxShadow: 'inset 0 0 0 1px var(--outline)', display: 'grid', placeItems: 'center', fontSize: 22, color: 'var(--muted)' }}>+</span>
          <span style={{ fontWeight: 500, flex: 1 }}>New zine</span>
          <button className="btn outline" style={{ height: 32, paddingInline: 14 }} disabled={busy} onClick={() => void go(null)}>Create</button>
        </div>
        {zines.error && <div role="alert" className="reason">{zines.error}</div>}
        {zines.data?.map((z) => (
          <button key={z.id} type="button" disabled={busy} onClick={() => void go(z)} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 8px', borderRadius: 10, textAlign: 'left' }}>
            <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, background: z.coverId != null ? `url(${imgUrl(z.coverId, 'thumb')}) center/cover var(--surface)` : 'var(--surface)' }} />
            <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 15, overflowWrap: 'anywhere' }}>{z.name}</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{z.printedCount} pages</span></span>
          </button>
        ))}
      </div>
      {err && <div role="alert" className="reason">{err}</div>}
      <BackRow onBack={onBack} />
    </Modal>
  );
}

/** Prints on a wall: tick existing compositions, or name a new one. */
function WallPicker({ ids, onClose, onDone, onBack }: { ids: number[]; onClose: () => void; onDone: (msg: string) => void; onBack: () => void }) {
  const colls = useApi<Collection[]>('/collections');
  const { openNew } = useUi();
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const open = useMemo(() => (colls.data ?? []).filter((c) => c.stage !== 'done' && !c.printedAt), [colls.data]);
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
  const needle = q.trim();
  const label = needle ? (shown.length ? `${shown.length} matching ${shown.length === 1 ? 'composition' : 'compositions'}` : 'No composition matches') : ids.some((id) => open.some((c) => c.photoIds.includes(id))) ? 'Already in · most recent' : 'Recent compositions';
  const hit = (t: string) => { const at = needle ? t.toLowerCase().indexOf(needle.toLowerCase()) : -1; return at < 0 ? t : <>{t.slice(0, at)}<b style={{ fontWeight: 500, background: 'var(--chip)', borderRadius: 3 }}>{t.slice(at, at + needle.length)}</b>{t.slice(at + needle.length)}</>; };
  const stageName = (c: Collection) => (c.stage === 'review' ? 'Review' : c.stage === 'done' ? 'Done' : 'Progress');
  const n = (c: Collection) => c.photoIds.length;

  return (
    <Modal title={`Add ${ids.length === 1 ? 'this photo' : `${ids.length} photos`}`} width={560} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', borderRadius: 999, background: 'var(--surface)', boxShadow: `inset 0 0 0 1px ${needle ? 'var(--text)' : 'var(--outline)'}` }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }}><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.4 3.4" /></svg>
          <input value={q} onChange={(e) => { setQ(e.target.value); setName(e.target.value); }} onKeyDown={(e) => { if (e.key === 'Enter') { if (changes.length) void apply(); else if (needle && shown.length === 0) create(); } }} placeholder="Find a composition, or type a name for a new one" aria-label="Composition name" autoFocus style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--text)', font: '400 15px var(--sans, inherit)' }} />
        </label>
        <span style={{ font: '500 11px var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 4px 0' }}>{label}</span>
        <div role="group" aria-label="Compositions" style={{ display: 'flex', flexDirection: 'column', maxHeight: 300, overflowY: 'auto' }}>
          {colls.loading && <div className="muted" style={{ padding: 12 }}>Loading…</div>}
          {shown.map((c) => (
            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 8px', borderRadius: 10, cursor: 'pointer', background: state(c) ? 'var(--hover)' : undefined }}>
              <input type="checkbox" checked={state(c)} onChange={(e) => setTicks((t) => ({ ...(t ?? {}), [c.id]: e.target.checked }))} style={{ width: 18, height: 18, flexShrink: 0 }} />
              <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, background: (c.chosenIds[0] ?? c.photoIds[0]) ? `url(${imgUrl(c.chosenIds[0] ?? c.photoIds[0], 'thumb')}) center/cover var(--surface)` : 'var(--surface)' }} />
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 15, overflowWrap: 'anywhere' }}>{hit(c.name)}</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{stageName(c)} · {n(c)} {n(c) === 1 ? 'candidate' : 'candidates'}</span></span>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{n(c)}</span>
            </label>
          ))}
          {!colls.loading && shown.length === 0 && !needle && <div className="muted" style={{ padding: 12, fontSize: 13.5 }}>No open compositions yet. Type a name to make one.</div>}
          {needle && (
            <button onClick={create} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 8px', borderTop: shown.length ? '1px solid var(--hair)' : undefined, borderRadius: 10, textAlign: 'left', background: shown.length === 0 ? 'var(--hover)' : undefined }}>
              <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, boxShadow: 'inset 0 0 0 1px var(--outline)', display: 'grid', placeItems: 'center', fontSize: 22, color: 'var(--muted)', marginLeft: 32 }}>+</span>
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontWeight: 500, overflowWrap: 'anywhere' }}>Create “{needle}”</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>New composition, with {what} in it</span></span>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>Enter ↵</span>
            </button>
          )}
        </div>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: '1px solid var(--hair)' }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : ''}</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onBack}>← Back</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={apply} disabled={!changes.length || busy}>Add</button>
        </div>
      </div>
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
