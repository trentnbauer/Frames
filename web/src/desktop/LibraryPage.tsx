import { Kbd, useShortcuts } from '../components/shortcuts';
import { useEffect, useState } from 'react';
import { SegSlider } from '../components/SegSlider';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { imgUrl, useApi } from '../api';
import { AddPhotosModal } from '../components/AddPhotos';
import { LibraryMore } from '../components/LibraryMore';
import { useLibraryFilters } from '../components/LibraryFilters';
import type { PhotoLite, Shoot } from '../data';
import { JustifiedGrid, Lock, PickedBar, isDue, serif, useToast } from './parts';

const mono = "'IBM Plex Mono',monospace";
const SHOOT_CHIPS: [string, string][] = [['due', 'Has photos due'], ['prot', 'Protected'], ['untitled', 'Untitled']];
const PHOTO_CHIPS: [string, string][] = [['due', 'Due for review'], ['unrated', 'Unrated'], ['loved', 'Loved'], ['noplace', 'No location'], ['noshoot', 'No shoot']];
/** A shoot nobody has named keeps the date (or nothing) it was given. */
export const isUntitled = (s: Shoot) => !s.name.trim() || /^\d{1,2} [A-Za-z]{3} \d{4}$/.test(s.name.trim());

/** The Library's Sort by: uploaded or taken date, newest or oldest, or score; undated and unrated photographs always go last. "match" keeps the given order. */
export function sortPhotos(ps: PhotoLite[], sort: string): PhotoLite[] {
  if (sort === 'match') return ps;
  const when = (p: PhotoLite) => (sort.startsWith('taken') ? p.dateEdit ?? p.capturedAt ?? '' : p.addedAt);
  const old = sort.endsWith('-old') || sort === 'score-low';
  return [...ps].sort((x, y) => {
    if (sort.startsWith('score')) { if (!x.reviewCount !== !y.reviewCount) return x.reviewCount ? -1 : 1; const d = old ? x.avgRating - y.avgRating : y.avgRating - x.avgRating; if (d) return d; } // unrated always last
    else { const a = when(x), c = when(y); if (!a !== !c) return a ? -1 : 1; if (a !== c) return old ? (a < c ? -1 : 1) : (a < c ? 1 : -1); } // undated always last
    return x.id - y.id;
  });
}

/** Library on a wide screen (the design): one page with Shoots and Photos views, a search, chips, and a Select mode for the photos. */
export function LibraryPage() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  // Every filter in the address (from the Filters menus, Search, Stats or "Find similar") goes to the server; the view's own keys do not.
  const asked = new URLSearchParams(sp); for (const k of ['view', 'add', 'adv', 'select', 'f', 'sort', 'dir']) asked.delete(k);
  const filtered = asked.toString() !== '';
  const photos = useApi<{ total: number; photos: PhotoLite[] }>(`/photos${filtered ? `?${asked}` : ''}`);
  // A link with filters (from Search, Stats or "Find similar") opens the Photos view.
  const view = sp.get('view') === 'photos' || (filtered && sp.get('view') !== 'shoots') ? 'photos' : 'shoots';
  const [q, setQ] = useState('');
  const [chip, setChip] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(sp.get('add') === '1');
  const shoots = useApi<Shoot[]>('/shoots');
  const filters = useLibraryFilters(shoots.data ?? []);
  const pending = useApi<{ count: number }>('/library/pending');
  const toast = useToast();
  const all = shoots.data ?? [];
  const list = photos.data?.photos ?? [];
  const needle = q.trim().toLowerCase();
  const setView = (v: string) => { const n = new URLSearchParams(sp); n.set('view', v); n.delete('add'); setSp(n, { replace: true }); setChip(null); setSelecting(false); setPicked(new Set()); };
  const reload = () => { shoots.reload(); photos.reload(); };
  // I imports the waiting files, and is listed in the ? sheet only while the banner shows.
  useShortcuts([{ key: 'i', label: 'Import new files', run: () => setAdding(true), off: (pending.data?.count ?? 0) === 0 }]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role=dialog]') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === 's' && view === 'photos') setSelecting((s) => { if (s) setPicked(new Set()); return !s; });
      else if (e.key.toLowerCase() === 'a') setAdding(true);
      else if (e.key === 'Escape' && selecting) { setSelecting(false); setPicked(new Set()); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [view, selecting]);

  const shootCards = all.filter((s) => {
    if (needle && ![s.name, s.place, s.dates].join(' ').toLowerCase().includes(needle)) return false;
    if (chip === 'due') return s.dueCount > 0;
    if (chip === 'prot') return !!s.protected;
    if (chip === 'untitled') return isUntitled(s);
    return true;
  });
  const shootName = new Map(all.map((s) => [s.id, s]));
  const match = (p: PhotoLite) => (!needle || [p.title, p.file, p.place, p.camera, shootName.get(p.shootId)?.name ?? ''].join(' ').toLowerCase().includes(needle))
    && (!chip || (chip === 'due' && isDue(p)) || (chip === 'unrated' && p.reviewCount === 0) || (chip === 'loved' && p.avgRating >= 4.5) || (chip === 'noplace' && !p.place && p.lat === null) || (chip === 'noshoot' && p.orphaned));
  const total = photos.data?.total ?? list.length;
  const year = all[0]?.importedAt?.slice(0, 4) ?? String(new Date().getFullYear());
  // Photos are one grid, sorted by the Sort by box (in the address); "Best match" keeps the server's order for Find similar and search by meaning.
  const byMeaning = !!(sp.get('similarTo') || sp.get('semantic'));
  const SORTS: [string, string][] = [...(byMeaning ? [['match', 'Best match'] as [string, string]] : []), ['added', 'Uploaded'], ['taken', 'Taken'], ['score', 'Score']];
  const field = SORTS.some(([k]) => k === sp.get('sort')) ? sp.get('sort')! : byMeaning ? 'match' : 'added';
  const asc = sp.get('dir') === 'asc'; // newest or highest first unless the arrow says otherwise
  const sort = field === 'match' || !asc ? field : field === 'score' ? 'score-low' : `${field}-old`;
  const setSort = (k: string, d = asc) => { const n = new URLSearchParams(sp); n.set('sort', k); if (d) n.set('dir', 'asc'); else n.delete('dir'); setSp(n, { replace: true }); };
  const sorted = (ps: PhotoLite[]) => sortPhotos(ps, sort);
  const flip = (id: number) => setPicked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chips = view === 'shoots' ? SHOOT_CHIPS : PHOTO_CHIPS;

  return (
    <div className="page-shell" data-screen-label="Library">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}><h1 style={{ font: `400 48px/1 ${serif}`, margin: 0 }}>Library</h1><span style={{ fontSize: 13, color: 'var(--muted)' }}>{total.toLocaleString()} photographs · {all.length} shoots</span></div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flex: 'none' }}><button onClick={() => setAdding(true)} style={{ display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 24px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 15, whiteSpace: 'nowrap' }}>Add photos</button><Kbd k="A" /></span>
      </div>
      {(pending.data?.count ?? 0) > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, background: 'linear-gradient(100deg, color-mix(in srgb, var(--accent) 12%, var(--surface)) 0%, var(--surface) 65%)', marginBottom: 16, fontSize: 14 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text)' }} /><span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{pending.data!.count} new files</b> <span style={{ color: 'var(--text2)' }}>in your library folder</span></span>
          <button className="btn outline" style={{ height: 32 }} onClick={() => setAdding(true)}>Import {pending.data!.count} {pending.data!.count === 1 ? 'file' : 'files'}</button><Kbd k="I" />
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        <div role="tablist" aria-label="Show" style={{ display: 'flex', flex: 'none', gap: 2, padding: 4, borderRadius: 999, background: 'var(--surface)' }}><SegSlider />
          {([['shoots', 'Shoots', all.length], ['photos', 'Photos', total]] as const).map(([k, l, n]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 32, padding: '0 16px', borderRadius: 999, fontSize: 13.5, background: view === k ? 'var(--btn-bg)' : 'transparent', color: view === k ? 'var(--btn-fg)' : 'var(--text2)', fontWeight: view === k ? 500 : 400 }}>{l}<span style={{ font: `400 11px ${mono}`, color: view === k ? 'var(--btn-fg)' : 'var(--faint)', opacity: view === k ? 0.6 : 1 }}>{n}</span></button>)}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={view === 'shoots' ? 'Find a shoot, place or year' : 'Search titles, places, cameras, tags'} aria-label="Search the library" style={{ flex: '1 1 220px', minWidth: 160, height: 40, borderRadius: 999, background: 'var(--surface)', border: 0, outline: 'none', padding: '0 18px', color: 'var(--text)', fontSize: 14 }} />
        {view === 'shoots' && chips.map(([k, l]) => { const on = chip === k; return <button key={k} aria-pressed={on} onClick={() => setChip(on ? null : k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 999, fontSize: 13.5, whiteSpace: 'nowrap', flex: 'none', background: on ? 'var(--chip)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--outline)', color: on ? 'var(--text)' : 'var(--text2)' }}>{l}</button>; })}
        {view === 'photos' && <button onClick={() => filters.setFiltersOpen(!filters.filtersOpen)} aria-expanded={filters.filtersOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40, padding: '0 16px', borderRadius: 999, fontSize: 14, whiteSpace: 'nowrap', flex: 'none', boxShadow: 'inset 0 0 0 1px var(--outline)', color: filters.filtersOpen ? 'var(--text)' : 'var(--text2)' }}>Filters{filters.chips.length + (chip ? 1 : 0) ? ` · ${filters.chips.length + (chip ? 1 : 0)}` : ''} {filters.filtersOpen ? '▴' : '▾'}</button>}
        {view === 'photos' && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' }}>
            <div role="radiogroup" aria-label="Sort by" style={{ display: 'flex', gap: 2, padding: 4, borderRadius: 999, background: 'var(--surface)' }}><SegSlider />
              {SORTS.map(([k, l]) => <button key={k} role="radio" aria-checked={field === k} onClick={() => setSort(k)} style={{ height: 32, padding: '0 14px', borderRadius: 999, fontSize: 13.5, whiteSpace: 'nowrap', background: field === k ? 'var(--btn-bg)' : 'transparent', color: field === k ? 'var(--btn-fg)' : 'var(--text2)', fontWeight: field === k ? 500 : 400 }}>{l}</button>)}
            </div>
            {field !== 'match' && <button onClick={() => setSort(field, !asc)} aria-label={asc ? (field === 'score' ? 'Lowest first: show highest first' : 'Oldest first: show newest first') : (field === 'score' ? 'Highest first: show lowest first' : 'Newest first: show oldest first')} title={asc ? (field === 'score' ? 'Lowest first' : 'Oldest first') : (field === 'score' ? 'Highest first' : 'Newest first')} style={{ width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: asc ? 'rotate(180deg)' : 'none', transition: 'transform .25s ease' }}><path d="M8 2.5v11M3.5 9 8 13.5 12.5 9" /></svg>
            </button>}
          </div>
        )}
        {view === 'photos' && <span className="library-more"><LibraryMore /></span>}
        {view === 'photos' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flex: 'none' }}><button onClick={() => { setSelecting(!selecting); setPicked(new Set()); }} aria-pressed={selecting} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 16px', borderRadius: 999, fontSize: 14, whiteSpace: 'nowrap', background: selecting ? 'var(--btn-bg)' : 'transparent', color: selecting ? 'var(--btn-fg)' : 'var(--text)', boxShadow: selecting ? 'none' : 'inset 0 0 0 1px var(--outline)' }}>{selecting ? 'Done selecting' : 'Select'}</button><Kbd k="S" /></span>}
      </div>
      {view === 'photos' && filters.filtersOpen && (
        <div role="group" aria-label="Quick filters" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {PHOTO_CHIPS.map(([k, l]) => { const on = chip === k; return <button key={k} aria-pressed={on} onClick={() => setChip(on ? null : k)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px', borderRadius: 999, fontSize: 13.5, whiteSpace: 'nowrap', background: on ? 'var(--chip)' : 'var(--hover)', color: on ? 'var(--text)' : 'var(--text2)' }}>{l}</button>; })}
        </div>
      )}
      {view === 'photos' && filters.panel}
      {view === 'photos' && (filters.chips.length > 0 || !!chip) && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '-12px 0 24px' }}>
          {chip && <button onClick={() => setChip(null)} aria-label={`Remove filter ${PHOTO_CHIPS.find(([k]) => k === chip)?.[1]}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px 0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 13 }}>{PHOTO_CHIPS.find(([k]) => k === chip)?.[1]} <span aria-hidden style={{ color: 'var(--muted)' }}>×</span></button>}
          {filters.chips.map((c) => <button key={c.label} onClick={c.remove} aria-label={`Remove filter ${c.label}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px 0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 13 }}>{c.label} <span aria-hidden style={{ color: 'var(--muted)' }}>×</span></button>)}
          <button onClick={() => { setChip(null); filters.clear(); }} style={{ fontSize: 13, color: 'var(--text2)', marginLeft: 4 }}>Clear all</button>
        </div>
      )}

      {view === 'shoots' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '28px 16px' }}>
            {shootCards.map((s) => (
              <button key={s.id} onClick={() => nav(`/shoots/${s.id}`)} style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0 }}>
                <div style={{ position: 'relative', width: '100%', aspectRatio: '1.6', borderRadius: 8, marginBottom: 10, background: `${s.coverId ? `url(${imgUrl(s.coverId, 'thumb')}) center/cover ` : ''}var(--surface)` }}>
                  {s.dueCount > 0 && <span style={{ position: 'absolute', left: 8, bottom: 8, fontSize: 11.5, background: 'rgba(0,0,0,.62)', padding: '3px 8px', borderRadius: 999, color: '#efede8' }}>{s.dueCount} due</span>}
                  {s.protected && <span title="Protected from deletion" style={{ position: 'absolute', right: 8, top: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, background: 'rgba(0,0,0,.62)', padding: '3px 9px 3px 7px', borderRadius: 999, color: '#efede8' }}><Lock size={12} />Protected</span>}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}><span style={{ font: `400 20px ${serif}`, color: isUntitled(s) ? 'var(--text2)' : 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name.trim() || 'Untitled shoot'}</span><span style={{ fontSize: 12, color: 'var(--muted)', flexShrink: 0 }}>{s.count} {s.count === 1 ? 'photo' : 'photos'}</span></div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.place || 'Add a place'} · {s.dates}</div>
              </button>
            ))}
          </div>
          {shoots.data && shootCards.length === 0 && <div style={{ padding: 32, borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)', fontSize: 14 }}>{all.length === 0 ? 'No photoshoots yet. Add photos to start one.' : 'No shoots match that.'}</div>}
        </>
      )}

      {view === 'photos' && (() => {
        // Every photograph (or every match) in one grid, not split by shoot, in the chosen order.
        const hits = sorted(list.filter(match));
        const title = needle ? `Results for “${q.trim()}”` : filtered || chip ? 'Matching photos' : 'All photos';
        return (
          <div style={{ marginBottom: 36 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}><span style={{ font: `400 24px/1 ${serif}` }}>{title}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{hits.length} {hits.length === 1 ? 'photo' : 'photos'}</span></div>
              {selecting && hits.length > 0 && <button onClick={() => setPicked((c) => { const n = new Set(c); const every = hits.every((p) => n.has(p.id)); hits.forEach((p) => (every ? n.delete(p.id) : n.add(p.id))); return n; })} style={{ fontSize: 13, color: 'var(--text2)', flexShrink: 0 }}>{hits.every((p) => picked.has(p.id)) ? 'Clear' : 'Select all'}</button>}
            </div>
            {hits.length > 0
              ? <JustifiedGrid photos={hits} selecting={selecting} picked={picked} due={isDue} badge={(p) => (p.orphaned ? '' : all.find((x) => x.id === p.shootId)?.name.trim() ?? '')} onClick={(p) => (selecting ? flip(p.id) : nav(`/photo/${p.id}?in=library`))} />
              : photos.data && <div style={{ padding: 32, borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)', fontSize: 14 }}>No photographs match.</div>}
          </div>
        );
      })()}

      {selecting && <PickedBar ids={[...picked]} photos={list} shoots={all} onClear={() => setPicked(new Set())} onChanged={reload} say={toast.say} />}
      {adding && <AddPhotosModal onClose={() => { setAdding(false); if (sp.get('add')) { const n = new URLSearchParams(sp); n.delete('add'); setSp(n, { replace: true }); } }} onDone={reload} />}
      {toast.node}
    </div>
  );
}
