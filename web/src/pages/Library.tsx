import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import type { PhotoLite, Shoot } from '../data';
import { Header, Justified, Loading, Title } from '../components/bits';
import { useStore } from '../store';
import { useUi } from '../ui';
import { api } from '../api';
import type { Collection } from '../data';
import { CompPicker } from '../components/AddToComposition';
import { AddPhotosButton } from '../components/AddPhotos';
import { Modal } from '../components/Modal';
import { useNavigate } from 'react-router-dom';

const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const RATING_OPTS = [['4+', '4 or better on average'], ['3+', '3 or better on average'], ['under', 'Under 3 on average']];

// All filters live in the address, so a view can be bookmarked or linked to, and several can be combined.
const multi = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function Library() {
  const [sp, setSp] = useSearchParams();
  const { settings } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState(sp.get('q') ?? '');
  const [selecting, setSelecting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const nav = useNavigate();
  const group = (['shoot', 'uploaded', 'taken'] as const).find((g) => g === sp.get('group')) ?? 'shoot';
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [composing, setComposing] = useState(false);
  const { openNew, openSearch } = useUi();
  const colls = useApi<Collection[]>('/collections');
  const lastActive = (colls.data ?? []).find((c) => !c.printedAt);
  const inComps = new Map<number, string[]>();
  for (const c of colls.data ?? []) for (const id of c.photoIds) inComps.set(id, [...(inComps.get(id) ?? []), c.name]);
  const badge = (p: PhotoLite) => { const n = inComps.get(p.id); return n ? (n.length === 1 ? n[0] : `${n.length} compositions`) : undefined; };
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const tick = (p: PhotoLite) => setPicked((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; });
  const tiles = selecting ? { picked, onTick: tick } : {};

  const shoots = useApi<Shoot[]>('/shoots');
  const subjects = useApi<{ name: string; n: number }[]>('/tags?kind=subject');
  const tags = useApi<{ name: string; n: number }[]>('/tags?kind=tag');

  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const toggle = (k: string, v: string) => { const cur = multi(sp.get(k)); set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',')); };
  const clear = () => { setText(''); setSp({}, { replace: true }); setOpen(null); };

  const list = useApi<{ total: number; count: number; photos: PhotoLite[]; semantic: boolean }>(`/photos?${sp.toString()}`);
  const similarTo = sp.get('similarTo');
  const flat = !!(sp.get('q') || similarTo || sp.get('semantic'));
  const groups = useMemo(() => {
    if (!list.data || !shoots.data || flat) return [];
    const photos = list.data.photos;
    if (group === 'taken') {
      // By the month each photograph was taken (the upload date when it has no camera date).
      const by = new Map<string, PhotoLite[]>();
      for (const p of photos) { const k = (p.capturedAt ?? '').slice(0, 7) || 'undated'; (by.get(k) ?? by.set(k, []).get(k)!).push(p); }
      const label = (k: string) => (k === 'undated' ? 'No camera date' : new Date(`${k}-01T12:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }));
      return [...by.entries()].sort((a, b) => (sp.get('order') === 'oldest' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0]))).map(([k, ph]) => ({ s: { id: -1 - ph[0].id, name: label(k), place: '', dates: label(k), key: k } as unknown as Shoot, photos: ph }));
    }
    const newest = sp.get('order') !== 'oldest';
    // "Photoshoot": by when the shoot happened; "Uploaded": by when it came in.
    const key = (s: Shoot) => (group === 'uploaded' ? s.importedAt : s.dateFrom ?? s.importedAt) ?? '';
    const order = [...shoots.data].sort((a, b) => key(a).localeCompare(key(b)) * (newest ? -1 : 1));
    return order.map((s) => ({ s, photos: photos.filter((p) => p.shootId === s.id) })).filter((g) => g.photos.length);
  }, [list.data, shoots.data, flat, sp, group]);
  const count = list.data?.count ?? 0;

  // Coming back from a photograph lands where you were, not at the top.
  const scrollKey = `frames.libScroll:${sp.toString()}`;
  const scrollY = useRef(0);
  useEffect(() => { const f = () => { scrollY.current = window.scrollY; }; window.addEventListener('scroll', f, { passive: true }); return () => { window.removeEventListener('scroll', f); try { sessionStorage.setItem(scrollKey, String(scrollY.current)); } catch { /* storage blocked */ } }; }, [scrollKey]);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !list.data || !shoots.data) return;
    restored.current = true;
    try { const y = Number(sessionStorage.getItem(scrollKey)); if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y)); } catch { /* storage blocked */ }
  }, [list.data, shoots.data, scrollKey]);

  // What is currently filtering, as removable chips.
  const chips: { label: string; remove: () => void }[] = [];
  if (sp.get('shoot')) chips.push({ label: `Photoshoot: ${shoots.data?.find((s) => String(s.id) === sp.get('shoot'))?.name ?? '…'}`, remove: () => set('shoot', null) });
  for (const k of multi(sp.get('missing'))) chips.push({ label: `No ${k}`, remove: () => toggle('missing', k) });
  for (const s of multi(sp.get('subject'))) chips.push({ label: `Subject: ${s}`, remove: () => toggle('subject', s) });
  for (const s of multi(sp.get('tag'))) chips.push({ label: `Tag: ${s}`, remove: () => toggle('tag', s) });
  for (const s of multi(sp.get('colour'))) chips.push({ label: `Colour: ${s}`, remove: () => toggle('colour', s) });
  if (sp.get('rating')) chips.push({ label: `Rating: ${RATING_OPTS.find((r) => r[0] === sp.get('rating'))?.[1] ?? ''}`, remove: () => set('rating', null) });
  if (sp.get('from') || sp.get('to')) chips.push({ label: `Date: ${sp.get('from') ?? '…'} to ${sp.get('to') ?? '…'}`, remove: () => { set('from', null); set('to', null); } });
  if (sp.get('place')) chips.push({ label: `Place: ${sp.get('place')}`, remove: () => set('place', null) });
  if (sp.get('gps')) chips.push({ label: 'Has location', remove: () => set('gps', null) });
  for (const k of ['shape', 'light', 'contrast'] as const) if (sp.get(k)) chips.push({ label: `${k[0].toUpperCase()}${k.slice(1)}: ${sp.get(k)}`, remove: () => set(k, null) });
  if (sp.get('exclude')) chips.push({ label: `Without: ${sp.get('exclude')}`, remove: () => set('exclude', null) });
  if (sp.get('time')) chips.push({ label: `Time: ${sp.get('time')}`, remove: () => set('time', null) });
  if (sp.get('review') === 'excluded') chips.push({ label: 'Left out of review', remove: () => set('review', null) });
  if (similarTo) chips.push({ label: `Similar to photo ${similarTo}`, remove: () => set('similarTo', null) });

  return (
    <MenuState.Provider value={{ open, setOpen }}>
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 20 }}>
        <Title count={list.data ? `${count.toLocaleString()}${count !== list.data.total ? ` of ${list.data.total.toLocaleString()}` : ''}` : undefined}>Library</Title>
        <AddPhotosButton big onDone={() => { list.reload(); shoots.reload(); }} />
      </div>
      <div className="lib-bar" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={openSearch} aria-label="Search the library" style={{ flex: '1 1 320px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', borderRadius: 999, padding: '0 18px', height: 40, color: 'var(--muted)', fontSize: 14, textAlign: 'left' }}>
          {ai ? 'Search or describe a photo' : 'Search filenames, places, tags and metadata'}<span className="faint" style={{ fontSize: 12 }}>⌘K</span>
        </button>
        <button className="btn outline" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} style={{ height: 40 }}>Filters {chips.length > 0 && <span className="mono" style={{ fontSize: 11, background: 'var(--chip)', borderRadius: 999, padding: '1px 7px' }}>{chips.length}</span>}</button>
        <span className="seg" role="group" aria-label="Group by" style={{ alignSelf: 'auto', height: 40, alignItems: 'center' }}>
          {([['shoot', 'Photoshoot'], ['uploaded', 'Uploaded'], ['taken', 'Date taken']] as const).map(([k, l]) => <button key={k} aria-pressed={group === k} className={group === k ? 'on' : ''} onClick={() => set('group', k === 'shoot' ? null : k)}>{l}</button>)}
        </span>
        <select aria-label="Sort" value={sp.get('order') === 'oldest' ? 'oldest' : 'newest'} onChange={(e) => set('order', e.target.value === 'oldest' ? 'oldest' : null)} style={{ height: 40, borderRadius: 999, background: 'var(--surface)', boxShadow: 'none' }}><option value="newest">Newest</option><option value="oldest">Oldest</option></select>
        <button className="btn outline" aria-pressed={selecting} style={{ height: 40 }} onClick={() => { setSelecting(!selecting); setPicked(new Set()); setNote(''); }}>{selecting ? 'Done' : 'Select'}</button>
      </div>
      {filtersOpen && (
        <div className="filters" style={{ marginBottom: 16 }}>
          <Menu id="shoot" label="Photoshoot">
            {(shoots.data ?? []).map((s) => <Item key={s.id} on={sp.get('shoot') === String(s.id)} onClick={() => { set('shoot', String(s.id)); setOpen(null); }}>{s.name}</Item>)}
          </Menu>
          <Menu id="subject" label="Subject">
            {(subjects.data ?? []).length === 0 && <span className="faint menu-note">None yet</span>}
            {(subjects.data ?? []).map((t) => <Item key={t.name} on={multi(sp.get('subject')).includes(t.name)} onClick={() => toggle('subject', t.name)}>{t.name} <span className="faint">{t.n}</span></Item>)}
          </Menu>
          <Menu id="tag" label="Tag">
            {(tags.data ?? []).length === 0 && <span className="faint menu-note">None yet</span>}
            {(tags.data ?? []).map((t) => <Item key={t.name} on={multi(sp.get('tag')).includes(t.name)} onClick={() => toggle('tag', t.name)}>{t.name} <span className="faint">{t.n}</span></Item>)}
          </Menu>
          <Menu id="rating" label="Score">
            {RATING_OPTS.map(([v, l]) => <Item key={v} on={sp.get('rating') === v} onClick={() => { set('rating', v); setOpen(null); }}>{l}</Item>)}
          </Menu>
          <Menu id="colour" label="Colour">
            <div className="colour-grid">{COLOURS.map((c) => <button key={c} aria-label={c} title={c} aria-pressed={multi(sp.get('colour')).includes(c)} className={'cdot c-' + c + (multi(sp.get('colour')).includes(c) ? ' on' : '')} onClick={() => toggle('colour', c)} />)}</div>
          </Menu>
          <Menu id="look" label="Shape & light">
            {([['shape', 'portrait'], ['shape', 'landscape'], ['shape', 'square'], ['light', 'dark'], ['light', 'mid'], ['light', 'bright'], ['contrast', 'low'], ['contrast', 'medium'], ['contrast', 'high']] as const).map(([k, v]) => (
              <Item key={k + v} on={sp.get(k) === v} onClick={() => set(k, sp.get(k) === v ? null : v)}>{k === 'shape' ? v : k === 'light' ? `${v === 'mid' ? 'mid-tone' : v} light` : `${v} contrast`}</Item>
            ))}
          </Menu>
          <Menu id="date" label="Date">
            <label className="menu-field">From <input type="date" value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value || null)} /></label>
            <label className="menu-field">To <input type="date" value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value || null)} /></label>
          </Menu>
          <Menu id="place" label="Location">
            <label className="menu-field">Place <input value={sp.get('place') ?? ''} placeholder="e.g. Fremantle" onChange={(e) => set('place', e.target.value || null)} /></label>
            <Item on={!!sp.get('gps')} onClick={() => set('gps', sp.get('gps') ? null : '1')}>Only photos with GPS</Item>
          </Menu>
        </div>
      )}
      {(chips.length > 0 || sp.get('q')) && (
        <div className="chips-row">
          {sp.get('q') && <span className="chip">“{sp.get('q')}” <button aria-label="Clear search" onClick={() => { setText(''); set('q', null); }}>✕</button></span>}
          {chips.map((c) => <span key={c.label} className="chip">{c.label} <button aria-label={`Remove ${c.label}`} onClick={c.remove}>✕</button></span>)}
          <button className="t2" style={{ fontSize: 12.5 }} onClick={clear}>Clear all</button>
        </div>
      )}
      {sp.get('semantic') === '1' && list.data && !list.data.semantic && sp.get('q') && <div className="muted" role="status" style={{ marginBottom: 14, fontSize: 13 }}>The AI provider could not be reached, so this is a plain text search.</div>}

      {(list.loading || list.error) && <Loading error={list.error} />}
      {list.data && count === 0 && <div className="empty">{chips.length || sp.get('q') ? 'No photographs match.' : <>No photographs yet. Add some on the <Link to="/shoots" className="t2" style={{ textDecoration: 'underline' }}>Photoshoots</Link> page.</>}</div>}
      {flat && list.data && count > 0 && <Justified {...tiles} badges={badge} photos={list.data.photos} captions={similarTo || sp.get('semantic') ? (p) => `${Math.round((p.similarity ?? 0) * 100)}% match` : undefined} />}
      {groups.map(({ s, photos }) => (
        <section className="group" key={s.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0, display: 'inline' }}>{s.id > 0 ? <Link to={`/shoots/${s.id}`}>{s.name}</Link> : s.name}</h2> <span className="muted" style={{ fontSize: 12.5, marginLeft: 10 }}>{[s.place, s.dates === s.name ? '' : s.dates, photos.length].filter(Boolean).join(' · ')}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12.5, color: 'var(--text2)' }}>
              {selecting && <button onClick={() => setPicked((x) => new Set([...x, ...photos.map((p) => p.id)]))}>Select all {photos.length}</button>}
              {!selecting && <button style={{ color: 'var(--text2)' }} onClick={() => { setSelecting(true); setPicked(new Set(photos.map((p) => p.id))); }}>Select all</button>}
            </div>
          </div>
          <Justified {...tiles} badges={badge} photos={photos} />
        </section>
      ))}
      {selecting && (
        <div className="selbar float" role="region" aria-label="Selected photographs">
          <b style={{ fontWeight: 500 }}>{picked.size} selected</b>
          <button style={{ color: 'var(--text2)' }} onClick={() => setPicked(new Set())} disabled={picked.size === 0}>Clear</button>
          <button className="btn outline" disabled={picked.size === 0} onClick={() => setMoving(true)}>Photoshoot…</button>
          <button className="btn outline" disabled={picked.size === 0} onClick={() => setComposing(true)}>Composition…</button>
          <button className="btn outline" disabled={picked.size === 0} onClick={async () => { for (const id of picked) await api(`/portfolio/photos/${id}`, { body: { on: true } }); setNote(`Added ${picked.size} to your portfolio.`); setPicked(new Set()); }}>Add to portfolio</button>
          <button className="btn outline" disabled={picked.size === 0} onClick={async () => { await api('/review/start', { body: { photoIds: [...picked] } }); nav('/review'); }}>Review</button>
          <button className="btn outline" disabled={picked.size === 0} style={{ color: 'var(--danger)' }} onClick={() => setDeleting(true)}>Delete</button>
          {note && <span className="muted" role="status">{note}</span>}
        </div>
      )}
      {composing && <CompPicker ids={[...picked]} onClose={() => setComposing(false)} onDone={(m) => { setNote(m); setPicked(new Set()); colls.reload(); }} />}
      {moving && <MoveModal ids={[...picked]} onClose={() => setMoving(false)} onDone={(m) => { setNote(m); setPicked(new Set()); setMoving(false); list.reload(); shoots.reload(); }} />}
      {deleting && <DeleteModal ids={[...picked]} onClose={() => setDeleting(false)} onDone={(m) => { setNote(m); setPicked(new Set()); setDeleting(false); list.reload(); shoots.reload(); }} />}
    </div>
    </MenuState.Provider>
  );
}

// Defined here, not inside Library, so React keeps the same menu (and the focus in its inputs) between keystrokes.
const MenuState = createContext<{ open: string | null; setOpen: (v: string | null) => void }>({ open: null, setOpen: () => {} });
function Menu({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { open, setOpen } = useContext(MenuState);
  return (
    <span style={{ position: 'relative' }}>
      <button aria-haspopup="menu" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>{label}</button>
      {open === id && <div className="menu" role="menu" style={{ right: 0 }}>{children}</div>}
    </span>
  );
}
function Item({ on, onClick, children }: { on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button role="menuitem" className={on ? 'on' : ''} onClick={onClick}>{children}</button>;
}

/** Move selected photographs to a new shoot (blank = today's date) or an existing one. Ratings, tags and compositions go with them; files on disk are untouched. */
function MoveModal({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: (m: string) => void }) {
  const shoots = useApi<Shoot[]>('/shoots');
  const [target, setTarget] = useState<'new' | number>('new');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const go = async () => {
    try {
      if (target === 'new') { const s = await api<Shoot>('/shoots', { body: { name: name.trim() || today, photoIds: ids } }); onDone(`Moved ${ids.length} to “${s.name}”.`); }
      else { await api(`/shoots/${target}/move`, { body: { photoIds: ids } }); onDone(`Moved ${ids.length} to “${shoots.data?.find((x) => x.id === target)?.name}”.`); }
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal title="Move to a photoshoot" sub="Ratings, tags and compositions move with the photos. Files on disk are untouched." width={480} onClose={onClose}
      foot={<><span className="grow">{err}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={go}>Move {ids.length}</button></>}>
      <div className="seg"><button className={target === 'new' ? 'on' : ''} onClick={() => setTarget('new')}>New photoshoot</button><button className={target !== 'new' ? 'on' : ''} onClick={() => setTarget((shoots.data?.[0]?.id) ?? 'new')}>Existing</button></div>
      {target === 'new'
        ? <input className="field-in" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name (blank = ${today})`} aria-label="Photoshoot name" autoFocus />
        : <select value={String(target)} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Photoshoot">{(shoots.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.count})</option>)}</select>}
    </Modal>
  );
}

/** Delete: take them out of Frames (originals kept), or also move the originals Frames holds to the trash (with RAW and XMP). Cloud files are never touched. */
function DeleteModal({ ids, onClose, onDone }: { ids: number[]; onClose: () => void; onDone: (m: string) => void }) {
  const [mode, setMode] = useState<'keep' | 'trash'>('keep');
  const [err, setErr] = useState('');
  const go = async () => {
    try { const r = await api<{ removed: number; trashed?: number }>('/photos/remove', { body: { ids, originals: mode } }); onDone(`Removed ${r.removed} from Frames${r.trashed ? ` and moved ${r.trashed} originals to the trash` : ''}.`); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Modal title={`Delete ${ids.length} photo${ids.length === 1 ? '' : 's'}?`} width={520} onClose={onClose}
      foot={<><span className="grow">{err}</span><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" style={{ background: 'var(--danger)', color: '#fff' }} onClick={go}>Delete</button></>}>
      {([['keep', 'Remove from Frames', 'Originals are kept where they are. Ratings, tags and compositions for these photos go.'], ['trash', 'Also move the originals to the trash', 'Includes RAW and XMP. Only files Frames itself holds are moved: files in your library folders and in cloud storage are never touched.']] as const).map(([k, t, d]) => (
        <label key={k} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 10, cursor: 'pointer', boxShadow: `inset 0 0 0 1px ${mode === k ? 'var(--text)' : 'var(--hair)'}` }}>
          <input type="radio" name="del" checked={mode === k} onChange={() => setMode(k)} style={{ marginTop: 3 }} /><span><b style={{ fontWeight: 500 }}>{t}</b><br /><span className="muted" style={{ fontSize: 13 }}>{d}</span></span>
        </label>
      ))}
    </Modal>
  );
}
