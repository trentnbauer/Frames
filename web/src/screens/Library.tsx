import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { Header } from '../components/Shell';
import { AddPhotosModal, useStatus } from '../components/AddPhotos';
import { useStore } from '../store';
import { useUi } from '../ui';
import { CompPicker } from './CompPicker';
import ProtoLibrary from '../proto/ProtoLibrary';

const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const RATING_OPTS = [['4+', '4 or better on average'], ['3+', '3 or better on average'], ['under', 'Under 3 on average']];
const multi = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

// Defined at module level so React keeps the same menu (and the focus in its inputs) between keystrokes.
const MenuState = createContext<{ open: string | null; setOpen: (v: string | null) => void }>({ open: null, setOpen: () => undefined });
function Menu({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { open, setOpen } = useContext(MenuState);
  return (
    <span style={{ position: 'relative' }}>
      <button aria-haspopup="menu" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>{label}</button>
      {open === id && <div className="menu" role="menu" style={{ right: 0 }}>{children}</div>}
    </span>
  );
}
const Item = ({ on, onClick, children }: { on?: boolean; onClick: () => void; children: React.ReactNode }) => <button role="menuitem" className={on ? 'on' : ''} onClick={onClick}>{children}</button>;

/** Library: the design's screen, driven by the real photographs, shoots and filters (all filters live in the address). */
export function Library() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const { settings } = useStore();
  const { openSearch } = useUi();
  const status = useStatus();
  const ai = !!settings && settings.ai !== 'off';
  const [open, setOpen] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const colls = useApi<Collection[]>('/collections');
  const shoots = useApi<Shoot[]>('/shoots');
  const subjects = useApi<{ name: string; n: number }[]>('/tags?kind=subject');
  const tags = useApi<{ name: string; n: number }[]>('/tags?kind=tag');
  const list = useApi<{ total: number; count: number; photos: PhotoLite[]; semantic: boolean }>(`/photos?${sp.toString()}`);
  const group = (['shoot', 'uploaded', 'taken'] as const).find((g) => g === sp.get('group')) ?? 'shoot';
  const newest = sp.get('order') !== 'oldest';

  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const toggle = (k: string, v: string) => { const cur = multi(sp.get(k)); set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',')); };
  const clear = () => { setSp({}, { replace: true }); setOpen(null); };

  const inComps = new Map<number, number>();
  for (const c of colls.data ?? []) for (const id of c.photoIds) inComps.set(id, (inComps.get(id) ?? 0) + 1);
  const byId = new Map((list.data?.photos ?? []).map((p) => [p.id, p]));
  const shootById = new Map((shoots.data ?? []).map((s) => [s.id, s]));

  const groupsFor = (by: 'shoot' | 'uploaded' | 'taken') => {
    const photos = list.data?.photos ?? [];
    if (by === 'taken') {
      const m = new Map<string, PhotoLite[]>();
      for (const p of photos) { const k = (p.capturedAt ?? '').slice(0, 7) || 'undated'; (m.get(k) ?? m.set(k, []).get(k)!).push(p); }
      const label = (k: string) => (k === 'undated' ? 'No camera date' : new Date(`${k}-01T12:00:00`).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }));
      return [...m.entries()].sort((a, b) => (newest ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0]))).map(([k, ph]) => ({ key: k, name: label(k), meta: `${ph.length}`, ids: ph.map((p) => p.id) }));
    }
    const key = (s: Shoot) => (by === 'uploaded' ? s.importedAt : s.dateFrom ?? s.importedAt) ?? '';
    return [...(shoots.data ?? [])].sort((a, b) => key(a).localeCompare(key(b)) * (newest ? -1 : 1)).map((s) => {
      const ids = photos.filter((p) => p.shootId === s.id).map((p) => p.id);
      return { key: String(s.id), name: s.name, meta: [s.place, s.dates === s.name ? '' : s.dates, ids.length].filter(Boolean).join(' · '), ids };
    });
  };
  const flat = !!(sp.get('q') || sp.get('similarTo') || sp.get('semantic'));
  const flatGroups = () => [{ key: 'all', name: sp.get('q') ? `“${sp.get('q')}”` : 'Results', meta: `${list.data?.count ?? 0}`, ids: (list.data?.photos ?? []).map((p) => p.id) }];

  // What is currently filtering, as removable chips.
  const chips: { label: string; remove: () => void }[] = [];
  if (sp.get('q')) chips.push({ label: `“${sp.get('q')}”`, remove: () => set('q', null) });
  if (sp.get('shoot')) chips.push({ label: `Photoshoot: ${shootById.get(Number(sp.get('shoot')))?.name ?? '…'}`, remove: () => set('shoot', null) });
  for (const k of multi(sp.get('missing'))) chips.push({ label: `No ${k}`, remove: () => toggle('missing', k) });
  for (const s of multi(sp.get('subject'))) chips.push({ label: `Subject: ${s}`, remove: () => toggle('subject', s) });
  for (const s of multi(sp.get('tag'))) chips.push({ label: `Tag: ${s}`, remove: () => toggle('tag', s) });
  for (const s of multi(sp.get('colour'))) chips.push({ label: `Colour: ${s}`, remove: () => toggle('colour', s) });
  if (sp.get('rating')) chips.push({ label: `Score ${sp.get('rating')}`, remove: () => set('rating', null) });
  if (sp.get('from') || sp.get('to')) chips.push({ label: `Date: ${sp.get('from') ?? '…'} to ${sp.get('to') ?? '…'}`, remove: () => { set('from', null); set('to', null); } });
  if (sp.get('place')) chips.push({ label: `Place: ${sp.get('place')}`, remove: () => set('place', null) });
  if (sp.get('gps')) chips.push({ label: 'Has location', remove: () => set('gps', null) });
  for (const k of ['shape', 'light', 'contrast'] as const) if (sp.get(k)) chips.push({ label: `${k[0].toUpperCase()}${k.slice(1)}: ${sp.get(k)}`, remove: () => set(k, null) });
  if (sp.get('exclude')) chips.push({ label: `Without: ${sp.get('exclude')}`, remove: () => set('exclude', null) });
  if (sp.get('time')) chips.push({ label: `Time: ${sp.get('time')}`, remove: () => set('time', null) });
  if (sp.get('review') === 'excluded') chips.push({ label: 'Left out of review', remove: () => set('review', null) });
  if (sp.get('similarTo')) chips.push({ label: `Similar to photo ${sp.get('similarTo')}`, remove: () => set('similarTo', null) });

  const years = [...new Set((list.data?.photos ?? []).map((p) => (p.capturedAt ?? '').slice(0, 4)).filter(Boolean))].sort().reverse();

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

  const count = list.data?.count ?? 0;
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const reload = () => { list.reload(); shoots.reload(); };

  const filtersPanel = filtersOpen ? (
    <MenuState.Provider value={{ open, setOpen }}>
      <div className="filters" style={{ marginBottom: 16 }}>
        <Menu id="shoot" label="Photoshoot">{(shoots.data ?? []).map((s) => <Item key={s.id} on={sp.get('shoot') === String(s.id)} onClick={() => { set('shoot', String(s.id)); setOpen(null); }}>{s.name}</Item>)}</Menu>
        <Menu id="subject" label="Subject">
          {(subjects.data ?? []).length === 0 && <span className="faint menu-note">None yet</span>}
          {(subjects.data ?? []).map((t) => <Item key={t.name} on={multi(sp.get('subject')).includes(t.name)} onClick={() => toggle('subject', t.name)}>{t.name} <span className="faint">{t.n}</span></Item>)}
        </Menu>
        <Menu id="tag" label="Tag">
          {(tags.data ?? []).length === 0 && <span className="faint menu-note">None yet</span>}
          {(tags.data ?? []).map((t) => <Item key={t.name} on={multi(sp.get('tag')).includes(t.name)} onClick={() => toggle('tag', t.name)}>{t.name} <span className="faint">{t.n}</span></Item>)}
        </Menu>
        <Menu id="rating" label="Score">{RATING_OPTS.map(([v, l]) => <Item key={v} on={sp.get('rating') === v} onClick={() => { set('rating', v); setOpen(null); }}>{l}</Item>)}</Menu>
        <Menu id="colour" label="Colour"><div className="colour-grid">{COLOURS.map((c) => <button key={c} aria-label={c} title={c} aria-pressed={multi(sp.get('colour')).includes(c)} className={'cdot c-' + c + (multi(sp.get('colour')).includes(c) ? ' on' : '')} onClick={() => toggle('colour', c)} />)}</div></Menu>
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
    </MenuState.Provider>
  ) : null;

  const v = useMemo(() => ({}), []);
  void v;
  return (
    <div className="page-shell">
      <Header />
      <ProtoLibrary
        groupsFor={(by: 'shoot' | 'uploaded' | 'taken') => (flat ? flatGroups() : groupsFor(by))}
        photoOf={(id: number) => { const p = byId.get(id); const n = inComps.get(id) ?? 0; return { src: imgUrl(id, 'thumb'), ar: p?.ar ?? 1, badge: n ? `In ${n}` : '' }; }}
        countLabel={list.data ? `${count.toLocaleString()}${count !== list.data.total ? ` of ${list.data.total.toLocaleString()}` : ''}` : ''}
        canAdd={!status.data || status.data.storage.local || status.data.storage.cloud} onAddPhotos={() => nav('/shoots?upload=1')}
        searchPh={ai ? 'Search or describe a photo' : 'Search filenames, places, tags and metadata'}
        chips={chips} onClear={clear} onToggleFilters={() => setFiltersOpen(!filtersOpen)} filtersPanel={filtersPanel}
        orderLabel={newest ? 'Newest' : 'Oldest'} toggleOrder={() => set('order', newest ? 'oldest' : null)}
        years={years.map((y) => ({ label: y, go: () => { const n = new URLSearchParams(sp); n.set('from', `${y}-01-01`); n.set('to', `${y}-12-31`); setSp(n, { replace: true }); } }))}
        shoots={(shoots.data ?? []).map((s) => ({ id: s.id, name: s.name, meta: `${s.count} photos · ${s.dates}`, src: s.coverId ? imgUrl(s.coverId, 'thumb') : '' }))}
        fromLabel={(ids: number[]) => [...new Set(ids.map((id) => shootById.get(byId.get(id)?.shootId ?? -1)?.name).filter(Boolean))].join(', ')}
        onOpenPhoto={(id: number) => nav(`/photo/${id}`)}
        onReview={async (ids: number[]) => { await api('/review/start', { body: { photoIds: ids } }); nav('/review'); }}
        onPortfolio={async (ids: number[]) => { for (const id of ids) await api(`/portfolio/photos/${id}`, { body: { on: true } }); }}
        onMove={async (ids: number[], m: { mode: string; name: string; shootId: number | null }) => {
          let dest = '';
          if (m.mode === 'new') { const s = await api<Shoot>('/shoots', { body: { name: m.name || today, photoIds: ids } }); dest = s.name; } else { await api(`/shoots/${m.shootId}/move`, { body: { photoIds: ids } }); dest = shootById.get(m.shootId!)?.name ?? ''; }
          reload(); return dest;
        }}
        onDelete={async (ids: number[], mode: 'frames' | 'trash') => { await api('/photos/remove', { body: { ids, originals: mode === 'trash' ? 'trash' : 'keep' } }); reload(); }}
        renderCompPicker={(ids: number[], onClose: () => void, onDone: (m: string) => void) => <CompPicker ids={ids} onClose={onClose} onDone={onDone} />}
      />
      {list.error && <p role="alert" className="muted" style={{ textAlign: 'center' }}>Something went wrong: {list.error}</p>}
      {list.data && count === 0 && <div className="empty">{chips.length ? 'No photographs match.' : 'No photographs yet. Add some on the Photoshoots page.'}</div>}
      {adding && <AddPhotosModal onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); }} />}
    </div>
  );
}
