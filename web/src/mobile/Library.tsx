import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { AddPhotosModal } from '../components/AddPhotos';
import { CompPicker } from '../components/AddToComposition';
import { usePinchColumns } from '../thumbZoom';
import { MoveToShoot } from '../components/MoveToShoot';
import { Sheet } from '../components/Sheet';
import { RATINGS, type PhotoLite, type Shoot } from '../data';
import { useStore } from '../store';
import { Eyebrow, Seg } from './ui';

const FILTERS: [string, string][] = [['due', 'Due for review'], ['ai', '✦ AI suggestions'], ['unrated', 'Unrated'], ['loved', 'Loved'], ['noplace', 'No location'], ['noshoot', 'No shoot']];
const dueNow = (p: PhotoLite) => !!p.nextReviewAt && p.nextReviewAt <= new Date().toISOString();

/** Library on a phone: Photos (by shoot, three across) and Shoots (a card each), with search, filters and a Select mode that rates, moves or adds to a composition. */
export function MobileLibrary() {
  const pinch = usePinchColumns(); // spread two fingers over the photographs to make them bigger
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'shoots' ? 'shoots' : 'photos';
  const filter = sp.get('f') ?? '';
  const { todoItems, refreshSummary, settings } = useStore();
  const [qText, setQText] = useState(sp.get('q') ?? '');
  const timer = useRef(0);
  const [adding, setAdding] = useState(sp.get('add') === '1');
  const [selecting, setSelecting] = useState(sp.get('select') === '1');
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [sheet, setSheet] = useState<null | 'rate' | 'move' | 'comp'>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const q = sp.get('q') ?? '';
  const server = new URLSearchParams();
  if (q) server.set('q', q);
  if (filter === 'due') server.set('review', 'due');
  if (filter === 'unrated') server.set('review', 'unrated');
  if (filter === 'loved') server.set('rating', '4+');
  const list = useApi<{ total: number; photos: PhotoLite[] }>(`/photos?${server.toString()}`);
  const shoots = useApi<Shoot[]>('/shoots');
  const aiIds = useMemo(() => new Set(todoItems.filter((i) => i.key === 'ai-tags' || i.key === 'ai-description').flatMap((i) => i.ids ?? [])), [todoItems]);
  const photos = (list.data?.photos ?? []).filter((p) => (filter === 'ai' ? aiIds.has(p.id) : filter === 'noplace' ? p.lat === null && !p.place : filter === 'noshoot' ? p.orphaned : true));
  const shootName = (id: number) => shoots.data?.find((s) => s.id === id)?.name ?? 'Photos';
  const orphans = photos.filter((p) => p.orphaned);
  // A search shows every match together, not split by shoot.
  const groups = q ? (photos.length ? [{ s: { id: 0, name: `Results for “${q}”`, dates: '' } as Shoot, ps: [...orphans, ...(shoots.data ?? []).flatMap((s) => photos.filter((p) => p.shootId === s.id))] }] : []) : [...(orphans.length ? [{ s: { id: 0, name: 'No shoot', dates: '' } as Shoot, ps: orphans }] : []), ...(shoots.data ?? []).map((s) => ({ s, ps: photos.filter((p) => p.shootId === s.id) })).filter((g) => g.ps.length)];
  const flip = (id: number) => setSel((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = [...sel];
  const done = (msg: string) => { setSheet(null); setSelecting(false); setSel(new Set()); setNote(msg); list.reload(); shoots.reload(); refreshSummary(); window.setTimeout(() => setNote(''), 2600); };
  const bulkRate = async (rating: number) => {
    setBusy(true); setErr('');
    try { for (const id of ids) await api('/review/rate', { body: { photoId: id, rating } }); done(`Rated ${ids.length} ${rating} of 5`); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const move = async (to: Shoot | string) => {
    setBusy(true); setErr('');
    try {
      if (typeof to === 'string') await api('/shoots', { body: { name: to, photoIds: ids } }); else await api(`/shoots/${to.id}/move`, { body: { photoIds: ids } });
      done(`Moved ${ids.length} ${ids.length === 1 ? 'photograph' : 'photographs'}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const count = (list.data?.total ?? photos.length).toLocaleString();

  return (
    <div className="pscreen ptab" style={{ padding: '28px 0 130px' }}>
      <div style={{ padding: '0 20px 4px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><h1 style={{ font: '400 44px/1 var(--serif)', margin: 0 }}>Library</h1><span style={{ font: '400 12px var(--mono)', color: 'var(--faint)' }}>{count}</span></div>
          <div style={{ display: 'flex', gap: 8 }}>
            {view === 'photos' && <button onClick={() => { setSelecting(!selecting); setSel(new Set()); }} style={{ height: 40, padding: '0 16px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>{selecting ? 'Cancel' : 'Select'}</button>}
            <button onClick={() => setAdding(true)} aria-label="Add photos" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--btn-bg)', color: 'var(--btn-fg)', display: 'grid', placeItems: 'center', fontSize: 20, lineHeight: 1 }}>+</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 16px', borderRadius: 999, background: 'var(--surface)' }}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.4" strokeLinecap="round" aria-hidden><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.4 3.4" /></svg>
          <input value={qText} onChange={(e) => { setQText(e.target.value); window.clearTimeout(timer.current); const v = e.target.value.trim(); timer.current = window.setTimeout(() => set('q', v || null), 250); }} placeholder="Search titles, places, cameras, tags" aria-label="Search the library" style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--text)', fontSize: 15 }} />
        </div>
        <Seg label="Library view" value={view} options={[['photos', 'Photos'], ['shoots', 'Shoots']]} onPick={(v) => { setSelecting(false); setSel(new Set()); set('view', v === 'shoots' ? 'shoots' : null); }} />
      </div>

      {view === 'photos' && <>
        <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', padding: '10px 20px 2px' }}>
          {FILTERS.map(([k, l]) => { const on = filter === k; return <button key={k} aria-pressed={on} onClick={() => set('f', on ? null : k)} style={{ flexShrink: 0, height: 34, padding: '0 14px', borderRadius: 999, fontSize: 13, background: on ? 'var(--btn-bg)' : 'transparent', color: on ? 'var(--btn-fg)' : 'var(--text2)', boxShadow: on ? 'none' : 'inset 0 0 0 1px var(--outline)' }}>{l}</button>; })}
        </div>
        {groups.map(({ s, ps }) => (
          <div key={s.id}>
            <div style={{ padding: '22px 20px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                <button onClick={() => { if (s.id) nav(`/shoots/${s.id}`); }} style={{ font: '400 24px/1 var(--serif)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: s.id ? undefined : 'var(--text2)' }}>{s.name}</button>
                <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)', whiteSpace: 'nowrap' }}>{s.dates} · {ps.length}</span>
              </div>
              {selecting && <button onClick={() => setSel((c) => { const n = new Set(c); const all = ps.every((p) => n.has(p.id)); ps.forEach((p) => (all ? n.delete(p.id) : n.add(p.id))); return n; })} style={{ fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap', height: 32 }}>Select all</button>}
            </div>
            <div {...pinch.handlers} style={{ display: 'grid', gridTemplateColumns: `repeat(${pinch.cols},minmax(0,1fr))`, gap: 2, ...pinch.style }}>
              {ps.map((p) => {
                const on = sel.has(p.id);
                return (
                  <button key={p.id} onClick={() => (selecting ? flip(p.id) : nav(`/photo/${p.id}`))} aria-label={p.title || p.file} aria-pressed={selecting ? on : undefined} style={{ position: 'relative', aspectRatio: '1', background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)`, boxShadow: on ? 'inset 0 0 0 3px var(--text)' : 'none', opacity: on ? 0.85 : 1 }}>
                    {!selecting && dueNow(p) && <span style={{ position: 'absolute', left: 6, bottom: 6, height: 18, display: 'inline-flex', alignItems: 'center', padding: '0 7px', borderRadius: 999, background: 'rgba(20,20,19,.82)', color: '#efede8', fontSize: 10.5 }}>Due</span>}
                    {!selecting && filter === 'ai' && <span aria-label="AI suggestions waiting" style={{ position: 'absolute', right: 6, bottom: 6, height: 18, display: 'inline-flex', alignItems: 'center', padding: '0 7px', borderRadius: 999, background: 'rgba(20,20,19,.82)', color: '#efede8', fontSize: 10.5 }}>✦</span>}
                    {selecting && <span style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%', background: on ? '#efede8' : 'rgba(0,0,0,.25)', boxShadow: 'inset 0 0 0 1.5px #fff', display: 'grid', placeItems: 'center', color: '#0d0d0d', fontSize: 12, fontWeight: 600 }}>{on ? '✓' : ''}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {list.data && groups.length === 0 && <div style={{ padding: '48px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}><span style={{ font: '400 26px/1.1 var(--serif)' }}>{q || filter ? 'Nothing matches' : 'No photographs yet'}</span><span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{q || filter ? 'Try another search, or clear the filter.' : 'Tap + to add some.'}</span></div>}
        {photos.length > 0 && groups.length === 0 && <span hidden>{shootName(photos[0].shootId)}</span>}
      </>}

      {view === 'shoots' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26, padding: '18px 20px 0' }}>
          {(shoots.data ?? []).filter((s) => !qText.trim() || s.name.toLowerCase().includes(qText.trim().toLowerCase()) || s.place.toLowerCase().includes(qText.trim().toLowerCase())).map((s) => {
            const covers = [s.coverId, ...(photos.filter((p) => p.shootId === s.id && p.id !== s.coverId).slice(0, 2).map((p) => p.id))];
            return (
              <button key={s.id} onClick={() => nav(`/shoots/${s.id}`)} style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
                <div style={{ width: '100%', height: 178, borderRadius: 12, overflow: 'hidden', display: 'grid', gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr', gap: 2 }}>
                  {[0, 1, 2].map((k) => <div key={k} style={{ gridRow: k === 0 ? '1 / 3' : undefined, background: covers[k] ? `url(${imgUrl(covers[k]!, 'thumb')}) center/cover var(--surface)` : 'var(--surface)' }} />)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <span style={{ font: '400 26px/1.05 var(--serif)', overflowWrap: 'anywhere' }}>{s.name}</span>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{s.place || 'No place'} · {s.dates} · {s.count} photos</span>
                  </div>
                  {s.dueCount > 0 && <span style={{ flexShrink: 0, height: 26, display: 'inline-flex', alignItems: 'center', padding: '0 10px', borderRadius: 999, background: 'var(--chip)', fontSize: 12 }}>{s.dueCount} due</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ flex: 1, height: 2, background: 'var(--hair)', borderRadius: 2 }}><div style={{ height: '100%', width: `${s.reviewPct}%`, background: 'var(--text2)', borderRadius: 2 }} /></div><span style={{ font: '400 11px var(--mono)', color: 'var(--faint)' }}>{Math.round(s.reviewPct)}% REVIEWED</span></div>
              </button>
            );
          })}
          {shoots.data && shoots.data.length === 0 && <div style={{ padding: 32, textAlign: 'center', fontSize: 13.5, color: 'var(--muted)' }}>No photoshoots yet. Tap + to add photographs.</div>}
        </div>
      )}

      {note && <div role="status" style={{ position: 'fixed', top: 58, left: '50%', transform: 'translateX(-50%)', zIndex: 95, maxWidth: 'calc(100vw - 32px)', padding: '9px 16px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 13 }}>{note}</div>}

      {selecting && (
        <div style={{ position: 'fixed', left: 12, right: 12, bottom: 'max(24px, env(safe-area-inset-bottom))', zIndex: 60, borderRadius: 22, background: 'var(--raised2)', boxShadow: 'var(--float)', padding: '8px 8px 8px 18px', display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ flex: 1, fontSize: 14 }}>{sel.size ? `${sel.size} selected` : 'Select photos'}</span>
          <button disabled={!sel.size} onClick={() => { setErr(''); setSheet('rate'); }} style={{ height: 44, padding: '0 12px', borderRadius: 999, fontSize: 13.5, opacity: sel.size ? 1 : 0.4 }}>Rate</button>
          <button disabled={!sel.size} onClick={() => { setErr(''); setSheet('move'); }} style={{ height: 44, padding: '0 12px', borderRadius: 999, fontSize: 13.5, opacity: sel.size ? 1 : 0.4 }}>Move</button>
          {settings && settings.ai !== 'off' && <button disabled={!sel.size || busy} onClick={async () => { setBusy(true); setErr(''); try { await api('/ai/run', { method: 'POST', body: { photoIds: ids } }); done(`Scanning ${ids.length} ${ids.length === 1 ? 'photo' : 'photos'} with AI`); } catch (e) { setNote((e as Error).message); window.setTimeout(() => setNote(''), 3200); } finally { setBusy(false); } }} style={{ height: 44, padding: '0 12px', borderRadius: 999, fontSize: 13.5, opacity: sel.size ? 1 : 0.4 }}>✦ Scan</button>}
          <button disabled={!sel.size} onClick={() => setSheet('comp')} style={{ height: 44, padding: '0 14px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 13.5, opacity: sel.size ? 1 : 0.4 }}>Add to…</button>
        </div>
      )}

      {sheet === 'rate' && (
        <Sheet title={`Rate ${sel.size} ${sel.size === 1 ? 'photo' : 'photos'}`} sub="Counts as today’s rating for each." onClose={() => setSheet(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>{RATINGS.map((r) => <button key={r.value} disabled={busy} onClick={() => bulkRate(r.value)} style={{ height: 76, borderRadius: 16, background: 'var(--chip)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}><span style={{ fontSize: 20, lineHeight: 1 }}>{r.emoji}</span><span style={{ fontSize: 11.5, color: 'var(--text2)' }}>{r.label}</span></button>)}</div>
          {err && <div role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</div>}
        </Sheet>
      )}
      {sheet === 'move' && (
        <Sheet title="Move to a shoot" sub={`${sel.size} ${sel.size === 1 ? 'photograph' : 'photographs'} selected`} onClose={() => setSheet(null)}>
          <MoveToShoot phone count={sel.size} shoots={shoots.data ?? []} canOrphan={ids.some((id) => !(list.data?.photos.find((p) => p.id === id)?.orphaned))} busy={busy} error={err}
            onAdd={(s) => void move(s)} onCreate={(n) => void move(n)} onClose={() => setSheet(null)}
            onOrphan={async () => { setBusy(true); setErr(''); try { await api('/photos/orphan', { body: { photoIds: ids } }); done(`Took ${ids.length} out of their shoots`); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } }} />
        </Sheet>
      )}
      {sheet === 'comp' && <CompPicker ids={ids} onClose={() => setSheet(null)} onDone={done} />}
      {adding && <AddPhotosModal onClose={() => { setAdding(false); if (sp.get('add')) set('add', null); }} onDone={() => { list.reload(); shoots.reload(); }} />}
    </div>
  );
}
