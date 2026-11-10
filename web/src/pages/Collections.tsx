import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { arrange, chosenIn, findPhoto, metres, photosOf, place, printsSummary, problem as printProblem, WALL_BG, lowRes, ppiOf, PPI_CHOICES, DEFAULT_PPI, sizeName as printSize, unplace, frameOf, rectsIn, FRAMES, MATS, type Mode, type Print } from '../layout';
import { PrintModal, ShoppingList, Wall } from '../components/CompositionWall';
import { RoomBackground } from '../components/RoomBackground';
import { Header, Img, Justified, Loading, useTitle } from '../components/bits';
import { SharePanel } from '../components/SharePanel';
import { Modal } from '../components/Modal';
import { useSearchParams as useSP } from 'react-router-dom';
import { useUi } from '../ui';

type SuggestedSet = { name: string; reason: string; aiAssisted: boolean; photoIds: number[]; photos: PhotoLite[] };
type Insights = {
  repetitive: { photoIds: number[] }[];
  alternatives: { forId: number; reason: string; candidates: PhotoLite[] }[];
  complementary: PhotoLite[];
  aiAssisted: boolean;
};
type Ranked = { id: number; mine: number | null; mineN: number; guest: number | null; guestN: number; score: number };
type Ranking = { weight: number; guests: number; items: Ranked[] };

const serif = "'Instrument Serif',Georgia,serif";
const mono = "'IBM Plex Mono',monospace";
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)' } as const;
const lightBtn = { background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999 } as const;
const ring = 'inset 0 0 0 1px var(--outline)';
const fmt = (n: number | null) => (n === null ? '–' : n.toFixed(1));
const thumb = (id: number) => imgUrl(id, 'thumb');
/** "3 × A3", "A2 + 2 × A5": what a composition is made of, for its card. */
const printsShort = (c: Collection) => { const m = new Map<string, number>(); c.layout.prints.forEach((p) => m.set(p.size, (m.get(p.size) || 0) + 1)); return [...m].map(([k, n]) => (n > 1 ? `${n} × ${printSize(k)}` : printSize(k))).join(' + '); };
const isFull = (prints: Print[]) => prints.length > 0 && prints.every((p) => photosOf(p).length === (p.stack ? 2 : 1));
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

/** The cover of a composition card: the wall drawn to scale on its grid, each print framed with its photograph (or an empty mat). */
export function CompCover({ c }: { c: Collection }) {
  const laid = c.layout.mode === 'free' ? c.layout.prints : arrange(c.layout.prints, c.layout.mode);
  const f = frameOf(laid, 0);
  const rects = rectsIn(laid, f);
  return (
    <Link to={`/collections/${c.id}`} aria-label={`Open ${c.name}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', aspectRatio: '1.6', borderRadius: 10, overflow: 'hidden', background: WALL_BG, marginBottom: 14, padding: '9% 8%', backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
      <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: String(f.W / f.H), maxHeight: '100%' }}>
        {laid.map((p, i) => {
          const r = rects[i];
          if (!r) return null;
          const photo = p.photoId;
          const colour = p.frame ? (FRAMES[p.frame.color] ?? FRAMES.black) : 'transparent';
          return (
            <i key={p.id} style={{ position: 'absolute', ...r, background: p.frame ? (MATS[p.frame.mat] ?? MATS.white) : 'var(--surface)', boxShadow: p.frame ? `0 0 0 ${Math.max(2, Math.round(f.W ? 0.014 * 100 : 2))}px ${colour}, 0 4px 10px rgba(0,0,0,.4)` : '0 4px 10px rgba(0,0,0,.4)', overflow: 'hidden', display: 'block' }}>
              {photo ? <img src={thumb(photo)} alt="" style={{ position: 'absolute', inset: p.frame ? '12%' : 0, width: p.frame ? '76%' : '100%', height: p.frame ? '76%' : '100%', objectFit: 'cover' }} /> : <span style={{ position: 'absolute', inset: p.frame ? '12%' : 0, background: 'rgba(120,118,112,.55)' }} />}
            </i>
          );
        })}
      </span>
    </Link>
  );
}

export function Card({ c }: { c: Collection }) {
  const full = isFull(c.layout.prints);
  const held = chosenIn(c.layout.prints).length, slots = c.layout.prints.reduce((k, p) => k + (p.stack ? 2 : 1), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <CompCover c={c} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <Link to={`/collections/${c.id}`}><h3 style={{ font: `400 20px ${serif}`, margin: 0 }}>{c.name}</h3></Link>
        <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: mono }}>{printsShort(c)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: 'var(--muted)' }}>
        <span style={{ width: 80, height: 3, background: 'var(--hair)', borderRadius: 2, display: 'inline-block' }}><i style={{ display: 'block', height: '100%', width: `${slots ? (held / slots) * 100 : 0}%`, background: 'var(--text)', borderRadius: 2 }} /></span>
        {full ? 'Ready to export' : held === 0 ? 'Not started' : `${held} of ${slots} chosen`}
      </div>
    </div>
  );
}

/** The frames a composition needs, e.g. "2 × white A3 · no mat, 1 × oak A2 · white mat". */
const framesLine = (c: Collection) => {
  const m = new Map<string, number>();
  for (const p of c.layout.prints) if (p.frame) { const k = `${p.frame.color} ${p.frame.size ?? p.size} · ${p.frame.size && p.frame.size !== p.size ? `${(p.frame as { matColor?: string }).matColor ?? 'white'} mat` : 'no mat'}`; m.set(k, (m.get(k) || 0) + (p.stack ? 2 : 1)); }
  return [...m].map(([k, n]) => `${n} × ${k}`).join(', ') || 'No frames';
};
const FILTERS = [['progress', 'In progress'], ['ready', 'Ready to export'], ['printed', 'Printed']] as const;

export function Collections() {
  const colls = useApi<Collection[]>('/collections');
  const sets = useApi<SuggestedSet[]>('/collections/suggestions');
  const { openNew, openSearch } = useUi();
  const nav = useNavigate();
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const start = async (s: SuggestedSet) => {
    const c = await api<Collection>('/collections', { body: { name: s.name, photoIds: s.photoIds } });
    await api('/recommendations/feedback', { body: { kind: 'together', photoIds: s.photoIds, verdict: 'accept' } });
    nav(`/collections/${c.id}`);
  };
  const skip = async (s: SuggestedSet) => { await api('/recommendations/feedback', { body: { kind: 'together', photoIds: s.photoIds, verdict: 'reject' } }); sets.reload(); };
  const [sp, setSp] = useSP();
  const filter = (FILTERS.find((f) => f[0] === sp.get('filter')) ?? FILTERS[0])[0];
  const all = colls.data ?? [];
  const active = all.filter((c) => !c.printedAt);
  const ready = active.filter((c) => isFull(c.layout.prints));
  const progress = active.filter((c) => !isFull(c.layout.prints));
  const printed = all.filter((c) => c.printedAt);
  const showProgress = filter === 'progress';
  const showReady = filter === 'ready';
  const showPrinted = filter === 'printed';
  const [findC, setFindC] = useState('');
  const [sortC, setSortC] = useState<'edited' | 'name'>('edited');
  const match = (c: Collection) => !findC.trim() || c.name.toLowerCase().includes(findC.trim().toLowerCase());
  const order = (l: Collection[]) => [...l].filter(match).sort((a, b) => (sortC === 'name' ? a.name.localeCompare(b.name) : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id));
  const prints = printed.reduce((n, c) => n + c.layout.prints.length, 0);
  const frames = printed.reduce((n, c) => n + c.layout.prints.filter((p) => p.frame).length, 0);
  const count = (k: string) => (k === 'progress' ? progress.length : k === 'ready' ? ready.length : printed.length);
  return (
    <div className="page">
      <Header />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h1 style={{ font: `400 48px/1 ${serif}`, margin: 0 }}>Compositions</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => openNew()} className="btn primary lg">New composition</button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 14, borderBottom: '1px solid var(--hair)', marginBottom: 28, flexWrap: 'wrap' }} role="tablist" aria-label="Filter compositions">
        {FILTERS.map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => { const n = new URLSearchParams(sp); if (k === 'progress') n.delete('filter'); else n.set('filter', k); setSp(n, { replace: true }); }} style={{ height: 36, padding: '0 14px', borderRadius: 999, fontSize: 13.5, background: filter === k ? 'var(--chip)' : 'transparent', color: filter === k ? 'var(--text)' : 'var(--text2)' }}>{l} <span className="faint" style={{ marginLeft: 4 }}>{count(k)}</span></button>)}
        <span style={{ flex: 1 }} />
        <input className="field-in" style={{ width: 280, height: 36, borderRadius: 999, background: 'var(--surface)', boxShadow: 'none' }} value={findC} onChange={(e) => setFindC(e.target.value)} placeholder="Find a composition" aria-label="Find a composition" />
        <select aria-label="Sort" value={sortC} onChange={(e) => setSortC(e.target.value as 'edited' | 'name')} style={{ height: 36, borderRadius: 999, background: 'var(--surface)', boxShadow: 'none' }}><option value="edited">Last edited</option><option value="name">Name</option></select>
      </div>
      {(colls.loading || colls.error) && <Loading error={colls.error} />}
      {colls.data && all.length === 0 && <div className="empty">No compositions yet. A composition is a curated set of photographs you can download as untouched original files.</div>}
      {showReady && ready.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '36px 24px', marginBottom: 48 }} className="comp-grid">
            {order(ready).map((c) => (
              <div key={c.id}>
                <Card c={c} />
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 6 }}>{printsShort(c)} · {framesLine(c)}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {showProgress && progress.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '36px 24px', marginBottom: 48 }} className="comp-grid">{order(progress).map((c) => <Card key={c.id} c={c} />)}</div>
        </>
      )}
      {colls.data && all.length > 0 && count(filter) === 0 && <div className="empty">{filter === 'ready' ? 'Nothing is ready to export yet. A composition is ready when every print has a photo.' : filter === 'printed' ? 'Nothing printed yet.' : 'Nothing here.'}</div>}
      {false && (sets.data ?? []).length > 0 && (
        <section style={{ marginBottom: 48 }}>
          <h2 style={{ font: `400 28px ${serif}`, margin: '0 0 4px' }}>Suggested compositions</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 18px' }}>Well-liked photographs from different photoshoots that look like they belong together.</p>
          <div className="card-grid">
            {sets.data!.map((s) => (
              <div key={s.photoIds.join('-')} className="sug">
                <div className="strip-mini">{s.photos.slice(0, 5).map((p) => <Img key={p.id} p={p} style={{ height: 64, width: 'auto' }} />)}</div>
                <div className="spread"><h3 style={{ font: `400 22px ${serif}`, margin: 0 }}>{s.name}</h3><span className="muted" style={{ fontSize: 12.5 }}>{s.photoIds.length}</span></div>
                <div className="muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>{s.reason}{s.aiAssisted ? ' · AI-assisted' : ''}</div>
                <div className="acts"><button className="pill primary" onClick={() => start(s)}>Start this composition</button><button className="pill" onClick={() => skip(s)}>Not for me</button></div>
              </div>
            ))}
          </div>
        </section>
      )}
      {showPrinted && printed.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--hair)', paddingTop: 20, marginBottom: 6 }}>
            <h2 style={{ font: `400 28px ${serif}`, margin: 0 }}>Printed</h2>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{printed.length} compositions · {prints} prints · {frames} frames · done and archived, reopen any time</span>
          </div>
          {printed.map((c) => (
            <Link key={c.id} to={`/collections/${c.id}`} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 18, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--hair)', textAlign: 'left' }}>
              <span style={{ display: 'flex', gap: 3, height: 40 }}>{c.chosenIds.slice(0, 6).map((id) => <img key={id} src={thumb(id)} alt="" style={{ height: '100%', aspectRatio: String(byId.get(id)?.ar ?? 1.5), objectFit: 'cover', borderRadius: 2, display: 'block' }} />)}</span>
              <span style={{ font: `400 20px ${serif}` }}>{c.name}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text2)' }}>{c.layout.prints.length} print{c.layout.prints.length === 1 ? '' : 's'} · {framesLine(c)}</span>
              <span style={{ font: `400 12px ${mono}`, color: 'var(--muted)' }}>{dayOf(c.printedAt!)}</span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

type Dl = { done: number; total: number; skipped: number; state: 'working' | 'ready' };
type Fo = { champ: number; next: number; round: number; done: boolean };

export function CollectionDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { openNew } = useUi();
  const coll = useApi<Collection>(`/collections/${id}`);
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const insights = useApi<Insights>(`/collections/${id}/insights`);
  const ranking = useApi<Ranking>(`/collections/${id}/ranking`);
  const guestComments = useApi<{ comments: { id: number; by: string; photoId: number | null; photoTitle: string | null; body: string; at: string }[] }>(`/collections/${id}/comments`);
  const suggestions = useApi<{ suggestions: { forId: number; photoId: number; by: string[]; notes: string[] }[] }>(`/collections/${id}/suggestions`);
  const frameIdeas = useApi<{ suggestions: { printId: number; color: string; by: string[] }[] }>(`/collections/${id}/frame-suggestions`);
  const layoutIdeas = useApi<{ suggestions: { id: number; by: string; note: string | null; at: string; layout: { mode: Mode; prints: Print[] } }[] }>(`/collections/${id}/layout-suggestions`);
  const [editing, setEditing] = useState(true); // moving prints about and changing sizes and frames
  const [editW, setEditW] = useState(false);
  const [lay, setLay] = useState<Print[] | null>(null);
  const [mode, setMode] = useState<Mode>('row');
  const [selPrint, setSelPrint] = useState(0);
  const [printModal, setPrintModal] = useState(false);
  const [note, setNote] = useState('');
  const [qs] = useSearchParams();
  const [adding, setAdding] = useState(qs.get('add') === '1'); // a new, empty composition opens with the photographs to choose from
  const [tab, setTab] = useState<'ranked' | 'face'>('ranked');
  const [candFilter, setCandFilter] = useState<'best' | 'fits' | 'unrated'>('best');
  const [fo, setFo] = useState<Fo | null>(null);
  const [dl, setDl] = useState<Dl | null>(null);
  const [sharing, setSharing] = useState(false);
  const shareList = useApi<{ status: string }[]>(id ? `/shares?kind=collection&id=${id}` : null);
  const liveShare = !!shareList.data?.some((l) => l.status === 'active');
  const [exporting, setExporting] = useState<'ready' | 'downloaded' | 'printed' | null>(null);
  const [fSub, setFSub] = useState<string[]>([]);
  const [fTag, setFTag] = useState<string[]>([]);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [over, setOver] = useState<number | null>(null);
  const subjects = useApi<{ name: string; n: number }[]>(adding ? '/tags?kind=subject' : null);
  const tagList = useApi<{ name: string; n: number }[]>(adding ? '/tags?kind=tag' : null);
  const filt = new URLSearchParams(); if (fSub.length) filt.set('subject', fSub.join(',')); if (fTag.length) filt.set('tag', fTag.join(','));
  const found = useApi<{ photos: PhotoLite[] }>(adding && (fSub.length || fTag.length) ? `/photos?${filt}` : null);
  const cancelled = useRef(false);

  const c = coll.data;
  useTitle(c?.name ?? 'Composition');
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  // The prints, from the server, kept here while they are edited. A layout that is not a free one is laid out again whenever it changes.
  useEffect(() => { if (c) { setMode(c.layout.mode); setLay(c.layout.prints); } }, [c?.layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const prints: Print[] = lay ?? c?.layout.prints ?? [];
  const wallPrints = mode === 'free' ? prints : arrange(prints, mode);
  // A room picture behind the wall: drawn at its real size from the scale, or (until a scale is set) taken to be 3 metres across.
  const mmPerPx = c?.layout.bg?.mmPerPx ?? (c?.background ? 3000 / c.background.w : 0);
  const stage = c?.background ? { w: c.background.w * mmPerPx, h: c.background.h * mmPerPx, url: `/api/collections/${c.id}/background?v=${c.background.v}` } : undefined;
  const setScale = (m: number) => saveLayout(prints, mode, ppi, m);
  const firstEmpty = wallPrints.findIndex((p) => photosOf(p).length < (p.stack ? 2 : 1));
  const sel = Math.min(editing ? selPrint : Math.max(0, firstEmpty), Math.max(0, prints.length - 1));
  const sp = wallPrints[sel];
  const rk = ranking.data;
  const rankOf = new Map((rk?.items ?? []).map((r, i) => [r.id, { ...r, rank: i + 1 }]));
  const order = c ? [...c.photoIds].sort((a, b) => (rankOf.get(a)?.rank ?? 1e9) - (rankOf.get(b)?.rank ?? 1e9)) : [];
  const ppi = c?.layout.ppi ?? DEFAULT_PPI; // the sharpness wanted; a photograph below it is allowed, with a warning
  const problemOf = (pid: number) => { const p = byId.get(pid); return p && sp ? printProblem(p, sp) : null; };
  const warns: Record<number, string> = {};
  wallPrints.forEach((pr, i) => { const low = photosOf(pr).map((pid) => ppiOf(byId.get(pid), pr)).filter((n): n is number => n !== null && n < ppi); if (low.length) warns[i] = `${Math.min(...low)} PPI`; });
  const lowCount = Object.keys(warns).length;
  const lowOf = (pid: number) => { const p = byId.get(pid); return p && sp ? lowRes(p, sp, ppi) : null; };
  const pool = c ? order.filter((pid) => !c.chosenIds.includes(pid) && !problemOf(pid)).slice(0, 6) : [];
  const state: Fo = fo ?? { champ: pool[0], next: 1, round: 1, done: pool.length < 2 };

  // ← and → pick a side in "Help me decide".
  useEffect(() => {
    if (tab !== 'face') return;
    const f = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') pickSide(0); if (e.key === 'ArrowRight') pickSide(1); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  const [guestsOpen, setGuestsOpen] = useState(qs.has('guests'));
  const [guestTab, setGuestTab] = useState<'suggestions' | 'ratings' | 'comments'>(qs.get('guests') === 'ratings' ? 'ratings' : 'suggestions');
  const pending = (suggestions.data?.suggestions.length ?? 0) + (frameIdeas.data?.suggestions.length ?? 0) + (layoutIdeas.data?.suggestions.length ?? 0);
  const wallRef = useRef<HTMLDivElement>(null);
  const [fs, setFs] = useState(false);
  const toggleFs = async () => {
    const el = wallRef.current;
    if (!el) return;
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => undefined); return; }
    if (fs) { setFs(false); return; }
    try { await el.requestFullscreen(); } catch { setFs(true); } // no native fullscreen here: a fixed overlay instead (Esc closes it)
  };
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && fs && !document.fullscreenElement) setFs(false); };
    document.addEventListener('fullscreenchange', on); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('fullscreenchange', on); window.removeEventListener('keydown', esc); };
  }, [fs]);
  if (!c) return <div className="page"><Header /><Loading error={coll.error} /></div>;
  const printed = !!c.printedAt;
  const reload = () => { ranking.reload(); insights.reload(); suggestions.reload(); };
  const save = async (patch: Record<string, unknown>) => { coll.set(await api<Collection>(`/collections/${c.id}`, { method: 'PATCH', body: patch })); reload(); };
  // Takes a photograph out of this composition (it stays in the library, and any print slot it held is freed).
  const removeFromComp = async (pid: number) => { coll.set(await api<Collection>(`/collections/${c.id}/photos/${pid}`, { method: 'DELETE' })); reload(); };
  // Saves the prints (laid out as they are shown) and what they hold. The server keeps the chosen photographs in print order.
  const saveLayout = async (ps: Print[], m: Mode = mode, nextPpi: number = ppi, scale?: number) => {
    const laid = m === 'free' ? ps : arrange(ps, m);
    setLay(laid); setMode(m);
    coll.set(await api<Collection>(`/collections/${c.id}`, { method: 'PATCH', body: { layout: { mode: m, prints: laid, ppi: nextPpi, ...(scale ? { bg: { mmPerPx: scale } } : c?.layout.bg ? { bg: c.layout.bg } : {}) } } })); reload();
  };
  // A guest's suggestion: swap it into the print it was for (in the same place), or put it aside.
  const useSuggestion = async (forId: number, photoId: number) => {
    await api(`/collections/${c.id}/suggestions?forId=${forId}&photoId=${photoId}`, { method: 'DELETE' });
    await saveLayout(prints.map((p) => ({ ...p, photoId: p.photoId === forId ? photoId : p.photoId, photoId2: p.photoId2 === forId ? photoId : p.photoId2 })));
  };
  const dismissSuggestion = async (forId: number, photoId: number) => { await api(`/collections/${c.id}/suggestions?forId=${forId}&photoId=${photoId}`, { method: 'DELETE' }); suggestions.reload(); };
  const addPhoto = async (pid: number) => { coll.set(await api<Collection>(`/collections/${c.id}/photos/${pid}`, { method: 'PUT' })); reload(); };
  const chosen = chosenIn(prints).map((pid) => byId.get(pid)).filter((p): p is PhotoLite => !!p);
  const slotCount = prints.reduce((n, p) => n + (p.stack ? 2 : 1), 0);
  const full = isFull(prints);
  const tooSmall = order.filter((pid) => problemOf(pid)).length;
  const unrated = order.filter((pid) => !rankOf.get(pid)?.mineN).length;
  const photoOf = (pid: number) => { const p = byId.get(pid); return p ? { w: p.w, h: p.h } : undefined; };

  // A candidate onto a print (dragged, or clicked while that print is the one chosen): it takes that place, and one already
  // in another print swaps with what was there. One that does not fit is refused with the reason.
  const assign = (i: number, pid: number) => {
    if (printed) return;
    const r = place(wallPrints, i, pid, photoOf, ppi);
    if (!r.prints) { setNote(`${byId.get(pid)?.title ?? 'That photograph'} can’t go in print ${i + 1}. ${r.note}`); return; }
    setNote(r.warn ? `⚠ ${byId.get(pid)?.title ?? 'That photograph'} is in print ${i + 1}, but ${r.warn}` : ''); void saveLayout(r.prints);
  };
  const toggle = (pid: number) => {
    if (printed) return;
    if (findPhoto(wallPrints, pid)) { setNote(''); void saveLayout(unplace(wallPrints, pid)); } else assign(sel, pid);
  };
  // Changes the selected print; photographs that no longer suit it are kept, with a note saying so.
  const editSel = (fn: (q: Print) => void) => {
    const ps = wallPrints.map((p, k) => { if (k !== sel) return p; const q = { ...p, frame: p.frame ? { ...p.frame } : null }; fn(q); if (!q.stack) q.photoId2 = null; return q; });
    const bad = photosOf(ps[sel]).map((pid) => ({ pid, why: printProblem(byId.get(pid), ps[sel]) })).find((x) => x.why);
    const low = photosOf(ps[sel]).map((pid) => ({ pid, why: lowRes(byId.get(pid), ps[sel], ppi) })).find((x) => x.why);
    setNote(bad ? `${byId.get(bad.pid)?.title ?? 'A photograph'} no longer fits print ${sel + 1}: ${bad.why}` : low ? `⚠ ${byId.get(low.pid)?.title ?? 'A photograph'} in print ${sel + 1}: ${low.why}` : '');
    void saveLayout(ps);
  };
  function pickSide(side: 0 | 1) {
    if (state.done || pool.length < 2) return;
    const challenger = pool[state.next];
    const champ = side === 0 ? state.champ : challenger;
    const next = state.next + 1;
    setFo({ champ, next, round: state.round + 1, done: next >= pool.length });
  }

  // Hands each original to the browser's own downloader, in print order. The browser streams every
  // file straight to disk, so nothing is held in memory and the files are never altered.
  const download = async () => {
    const present = chosen.filter((p) => !p.missing);
    const pad = String(present.length).length;
    cancelled.current = false;
    setDl({ done: 0, total: present.length, skipped: chosen.length - present.length, state: 'working' });
    for (let i = 0; i < present.length; i++) {
      if (cancelled.current) { setDl(null); return; }
      const a = document.createElement('a');
      a.href = `/api/photos/${present[i].id}/original?n=${i + 1}&pad=${pad}`;
      a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
      setDl({ done: i + 1, total: present.length, skipped: chosen.length - present.length, state: 'working' });
      await new Promise((r) => setTimeout(r, 450)); // browsers drop downloads fired in the same instant
    }
    setDl({ done: present.length, total: present.length, skipped: chosen.length - present.length, state: 'ready' });
    setExporting('downloaded');
  };

  const candidates = ((fSub.length || fTag.length ? found.data?.photos : lib.data?.photos) ?? []).filter((p) => !c.photoIds.includes(p.id));
  const addPicked = async () => { let last = c; for (const pid of pick) last = await api<Collection>(`/collections/${c.id}/photos/${pid}`, { method: 'PUT' }); coll.set(last); setPick(new Set()); reload(); };
  const ins = insights.data;
  const exportLabel = printed ? `Export ${slotCount} again` : full ? `Export ${slotCount} and mark as done` : `Choose ${slotCount - chosenIn(prints).length} more to export`;
  const canExport = full && !printed;
  const live = frameOf(wallPrints, 0);
  const w = rk?.weight ?? 35;
  const fa = byId.get(state.champ), fb = byId.get(pool[state.next]) ?? fa;
  const heading = (t: string) => <h3 style={{ font: `400 19px/1.2 ${serif}`, margin: '0 0 8px', color: 'var(--text)' }}>{t}</h3>;

  const guestBlocks = (
    <div style={{ fontSize: 13, color: 'var(--text2)' }}>
      {pending === 0 && <p className="muted" style={{ margin: 0 }}>Nothing waiting. Suggestions from guests show up here for you to approve or deny.</p>}
          {(frameIdeas.data?.suggestions ?? []).length > 0 && (
            <div>{heading('Frames')}
              {frameIdeas.data!.suggestions.map((g) => {
                const at = prints.findIndex((q) => q.id === g.printId);
                if (at < 0 || !prints[at].frame) return null;
                const clear = async () => { await api(`/collections/${c.id}/frame-suggestions?printId=${g.printId}&color=${g.color}`, { method: 'DELETE' }); frameIdeas.reload(); };
                return (
                  <div key={`${g.printId}-${g.color}`} style={{ marginBottom: 14 }}>
                    <div style={{ marginBottom: 6 }}>{g.by.join(', ')} {g.by.length === 1 ? 'suggests' : 'suggest'} a <b style={{ fontWeight: 500, color: 'var(--text)' }}>{g.color}</b> frame for print {at + 1}, instead of {prints[at].frame!.color}.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={async () => { await saveLayout(prints.map((q) => (q.id === g.printId && q.frame ? { ...q, frame: { ...q.frame, color: g.color } } : q))); await clear(); }} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '6px 12px', fontSize: 12.5 }}>Use {g.color}</button>
                      <button onClick={clear} style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12.5, boxShadow: ring }}>Deny</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(layoutIdeas.data?.suggestions ?? []).length > 0 && (
            <div>{heading('Layouts')}
              {layoutIdeas.data!.suggestions.map((g) => {
                // The suggestion is only the prints; the photographs already placed stay with the prints that keep their number, and any that no longer fit are taken out.
                const merged = g.layout.prints.map((p) => { const cur = prints.find((q) => q.id === p.id); return { ...p, photoId: cur?.photoId ?? null, photoId2: p.stack ? cur?.photoId2 ?? null : null }; });
                const out = merged.flatMap((p) => photosOf(p).map((pid) => ({ p, pid, why: printProblem(byId.get(pid), p) }))).filter((x) => x.why);
                const kept = merged.map((p) => ({ ...p, photoId: out.some((x) => x.p === p && x.pid === p.photoId) ? null : p.photoId, photoId2: out.some((x) => x.p === p && x.pid === p.photoId2) ? null : p.photoId2 }));
                const lost = chosenIn(prints).length - chosenIn(kept).length;
                return (
                  <div key={g.id} style={{ marginBottom: 16 }}>
                    <div style={{ marginBottom: 4 }}>{g.by} suggests <b style={{ fontWeight: 500, color: 'var(--text)' }}>{printsSummary(g.layout.prints)}</b>{g.note && <> · “{g.note}”</>}</div>
                    <div style={{ color: 'var(--faint)', marginBottom: 6 }}>Now: {printsSummary(prints)}.{lost > 0 && ` Applying it takes ${lost} ${lost === 1 ? 'photograph' : 'photographs'} out of ${lost === 1 ? 'its' : 'their'} print${lost === 1 ? '' : 's'}: ${lost === 1 ? 'it does' : 'they do'} not fit.`}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={async () => { await saveLayout(kept, g.layout.mode); await api(`/collections/${c.id}/layout-suggestions/${g.id}`, { method: 'DELETE' }); layoutIdeas.reload(); }} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '6px 12px', fontSize: 12.5 }}>Use this layout</button>
                      <button onClick={async () => { await api(`/collections/${c.id}/layout-suggestions/${g.id}`, { method: 'DELETE' }); layoutIdeas.reload(); }} style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12.5, boxShadow: ring }}>Deny</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {(suggestions.data?.suggestions ?? []).length > 0 && (
            <div>{heading('Photos')}
              {suggestions.data!.suggestions.map((g) => (
                <div key={`${g.forId}-${g.photoId}`} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <img src={thumb(g.photoId)} alt={byId.get(g.photoId)?.title ?? ''} style={{ height: 52, borderRadius: 4 }} />
                    <span style={{ color: 'var(--faint)' }}>instead of</span>
                    <img src={thumb(g.forId)} alt={byId.get(g.forId)?.title ?? ''} style={{ height: 52, borderRadius: 4 }} />
                  </div>
                  <div style={{ marginBottom: 6 }}>{g.by.join(', ')} {g.by.length === 1 ? 'suggests' : 'suggest'} this for print {c.chosenIds.indexOf(g.forId) + 1}.{g.notes.map((n, i) => <div key={i} style={{ fontStyle: 'italic', color: 'var(--muted)' }}>“{n}”</div>)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => useSuggestion(g.forId, g.photoId)} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '6px 12px', fontSize: 12.5 }}>Approve</button>
                    <button onClick={() => dismissSuggestion(g.forId, g.photoId)} style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12.5, boxShadow: ring }}>Deny</button>
                  </div>
                </div>
              ))}
            </div>
          )}
    </div>
  );
  return (
    <div className="page">
      <Header />
      <div className="editor-head" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link to="/collections" style={{ height: 32, padding: '0 14px', borderRadius: 999, background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', fontSize: 13.5, color: 'var(--text2)' }}>← Compositions</Link>
        <div style={{ flex: 1, minWidth: 220, display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <input className="serif inline" aria-label="Composition name" defaultValue={c.name} key={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && save({ name: e.target.value })} style={{ fontSize: 40, lineHeight: 1, width: 'auto', minWidth: 160, flex: '0 1 auto', field: undefined } as React.CSSProperties} size={Math.max(8, c.name.length)} />
          <span className="faint" style={{ fontSize: 12.5, fontFamily: mono }}>{printsShort(c)} · {metres(live.w)} × {metres(live.h)} m</span>
        </div>
        <button className="btn outline" onClick={() => setGuestsOpen(true)} style={{ gap: 8 }}>Guests{pending > 0 && <span className="mono" style={{ background: 'var(--chip)', borderRadius: 999, fontSize: 11, padding: '1px 8px' }}>{pending}</span>}</button>
        <button className="btn outline" onClick={() => setSharing(!sharing)} aria-expanded={sharing}>Share <span className="faint" style={{ fontSize: 12 }}>{liveShare ? '· on' : ''}</span></button>
        <button className="btn primary lg" onClick={() => (canExport || printed) && setExporting(printed ? 'printed' : 'ready')} disabled={!canExport && !printed} style={{ opacity: canExport || printed ? 1 : 0.5 }}>{printed ? 'Export again' : canExport ? `Export · ${slotCount} prints` : `Export · ${slotCount - chosenIn(prints).length} print${slotCount - chosenIn(prints).length === 1 ? '' : 's'} empty`}</button>
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14, fontSize: 13, color: 'var(--muted)' }}>
        <input aria-label="Theme" className="t2 inline" placeholder="Add a theme" defaultValue={c.theme} onBlur={(e) => e.target.value !== c.theme && save({ theme: e.target.value })} style={{ fontSize: 13.5, maxWidth: 260 }} />
        <button onClick={() => setAdding(!adding)}>{adding ? 'Done adding' : '+ Add photos'}</button>
        <button onClick={async () => { if (confirm(`Delete “${c.name}”? The photographs themselves are not touched.`)) { await api(`/collections/${c.id}`, { method: 'DELETE' }); nav('/collections'); } }}>Delete</button>
        {printed && <button onClick={async () => { await save({ printed: false }); }} style={{ textDecoration: 'underline' }}>Reopen</button>}
      </div>
      {sharing && <SharePanel kind="collection" id={c.id} name={c.name} onClose={() => setSharing(false)} />}
      {guestsOpen && (
        <Modal title="Guests" sub="What the people you shared this with have said and suggested." width={620} onClose={() => setGuestsOpen(false)}>
          <div className="seg" role="tablist">{([['suggestions', `Suggested changes${pending ? ` · ${pending}` : ''}`], ['ratings', 'Ratings'], ['comments', 'Comments']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={guestTab === k} className={guestTab === k ? 'on' : ''} onClick={() => setGuestTab(k)}>{l}</button>)}</div>
          <div style={{ maxHeight: '55vh', overflow: 'auto' }}>
            {guestTab === 'suggestions' && guestBlocks}
            {guestTab === 'ratings' && <GuestRatings id={c.id} />}
            {guestTab === 'comments' && <GuestComments id={c.id} />}
          </div>
        </Modal>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', borderTop: '1px solid var(--hair)', borderBottom: '1px solid var(--hair)', padding: '12px 0', margin: '22px 0 24px', fontSize: 13.5 }}>
        <span style={eyebrow}>Prints</span>
        <span><b style={{ fontWeight: 500 }}>{printsSummary(wallPrints)}</b>, <b style={{ fontWeight: 500 }}>{metres(live.w)} × {metres(live.h)} m</b> on the wall</span>
        <span style={{ color: 'var(--muted)' }}>{chosenIn(prints).length} of {slotCount} chosen · {c.photoIds.length} candidates</span>
        <label style={{ color: 'var(--text2)', display: 'flex', gap: 8, alignItems: 'center' }}>Sharpness wanted
          <select aria-label="Sharpness wanted, in pixels per inch" value={ppi} disabled={printed} onChange={(e) => void saveLayout(wallPrints, mode, Number(e.target.value))} style={{ background: 'transparent', color: 'inherit', borderRadius: 6, padding: '2px 6px', boxShadow: ring }}>
            {[...new Set([...PPI_CHOICES, ppi])].sort((a, b) => b - a).map((n) => <option key={n} value={n} style={{ color: '#000' }}>{n} PPI{n === 300 ? ' (print quality)' : ''}</option>)}
          </select>
        </label>
        {lowCount > 0 && <span role="status" style={{ color: 'oklch(0.78 0.11 35)' }}>⚠ {lowCount} {lowCount === 1 ? 'print has' : 'prints have'} a photograph below {ppi} PPI</span>}
        <span style={{ marginLeft: 'auto', color: 'var(--text2)', display: 'flex', gap: 10, alignItems: 'baseline' }}>
          Ranking: yours {100 - w}% · guests {w}%
          {editW ? <input type="number" min={0} max={60} step={5} aria-label="Guests’ share of the ranking" defaultValue={w} onBlur={async (e) => { const n = Math.round(Number(e.target.value)); setEditW(false); if (n >= 0 && n <= 60 && n !== w) { await api('/collections/guest-weight', { method: 'PUT', body: { weight: n } }); ranking.reload(); } }} autoFocus style={{ width: 64, borderRadius: 6, padding: '2px 6px' }} /> : <button onClick={() => setEditW(true)} style={{ fontSize: 12, textDecoration: 'underline', textUnderlineOffset: 3 }}>Change</button>}
        </span>
      </div>

      {adding && (
        <div style={{ marginBottom: 32 }}>
          <div className="label" style={{ marginBottom: 10 }}>Choose photographs to add</div>
          <div className="chips-row" style={{ marginBottom: 12 }}>
            <select aria-label="Filter by subject" value="" onChange={(e) => e.target.value && setFSub([...fSub, e.target.value])}>
              <option value="">Filter by subject…</option>
              {(subjects.data ?? []).filter((t) => !fSub.includes(t.name)).map((t) => <option key={t.name} value={t.name}>{t.name} ({t.n})</option>)}
            </select>
            <select aria-label="Filter by tag" value="" onChange={(e) => e.target.value && setFTag([...fTag, e.target.value])}>
              <option value="">Filter by tag…</option>
              {(tagList.data ?? []).filter((t) => !fTag.includes(t.name)).map((t) => <option key={t.name} value={t.name}>{t.name} ({t.n})</option>)}
            </select>
            {fSub.map((t) => <span key={'s' + t} className="chip">Subject: {t} <button aria-label={`Remove subject ${t}`} onClick={() => setFSub(fSub.filter((x) => x !== t))}>✕</button></span>)}
            {fTag.map((t) => <span key={'t' + t} className="chip">Tag: {t} <button aria-label={`Remove tag ${t}`} onClick={() => setFTag(fTag.filter((x) => x !== t))}>✕</button></span>)}
          </div>
          <Justified h={110} photos={candidates.slice(0, 200)} picked={pick} onTick={(p) => setPick((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
          <div className="selbar" style={{ position: 'static' }}>
            <span>{pick.size} selected{(fSub.length || fTag.length) ? ` · ${candidates.length} match the filter` : ''}</span>
            <button className="t2" onClick={() => setPick(new Set(candidates.slice(0, 200).map((p) => p.id)))}>Select all shown</button>
            <button className="pill primary" disabled={pick.size === 0} onClick={addPicked}>Add {pick.size || ''} to this composition</button>
          </div>
          {candidates.length === 0 && <div className="empty">Every photograph is already here.</div>}
        </div>
      )}

      <div className="editor-grid">
      <div>
        <div ref={wallRef} className={fs ? 'wall-fs' : ''} style={{ position: fs && !document.fullscreenElement ? 'fixed' : 'relative', inset: fs && !document.fullscreenElement ? 0 : undefined, zIndex: fs ? 80 : undefined, background: WALL_BG, borderRadius: fs ? 0 : 8, padding: '28px 28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: fs ? '100vh' : 500 }}>
          <button onClick={toggleFs} aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'} title={fs ? 'Exit fullscreen (Esc)' : 'Fullscreen'} style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 3, borderRadius: 999, padding: '7px 14px', fontSize: 13, background: 'rgba(13,13,13,.6)', color: '#efede8' }}>{fs ? '⤡ Exit fullscreen' : '⤢ Fullscreen'}</button>
          {false && <button onClick={() => { setEditing(!editing); setSelPrint(0); }} style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, borderRadius: 999, padding: '7px 14px', fontSize: 13, fontWeight: 500, background: editing ? 'var(--text)' : 'rgba(13,13,13,.6)', color: editing ? '#0d0d0d' : 'var(--text)', boxShadow: editing ? 'none' : 'inset 0 0 0 1px var(--outline)' }}>{editing ? 'Done' : 'Edit layout'}</button>}
          {editing && !printed && (
            <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => saveLayout(wallPrints, mode === 'free' ? 'row' : mode)} title="Re-space the prints evenly" style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12.5, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.3)', color: '#efede8' }}>Line up</button>
              <span style={{ width: 1, height: 16, background: 'var(--chip)', margin: '0 4px' }} />
              <button onClick={() => { const last = wallPrints[wallPrints.length - 1]; const m = mode === 'free' ? 'row' : mode; void saveLayout([...wallPrints, { ...last, id: Math.max(...wallPrints.map((q) => q.id)) + 1, photoId: null, photoId2: null, frame: last.frame ? { ...last.frame } : null }], m); setSelPrint(wallPrints.length); }} style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12.5, boxShadow: 'inset 0 0 0 1px var(--outline)' }}>+ Add a print</button>
              <span style={{ width: 1, height: 16, background: 'var(--chip)', margin: '0 4px' }} />
              <RoomBackground id={c!.id} bg={c?.background} onChanged={() => { coll.reload?.(); reload(); }} onScale={(m) => void setScale(m)} />
            </div>
          )}
          <Wall stage={stage} warn={warns} prints={wallPrints} mode={mode} editing={editing} sel={sel} photos={byId} over={over} locked={printed} onSelect={setSelPrint} onEdit={(i) => { setSelPrint(i); setPrintModal(true); }} onMoved={(ps) => void saveLayout(ps, 'free')} onOver={setOver} onDropPhoto={assign} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--faint)', marginTop: 8 }}>
          <span>{editing ? 'Drawn to scale. Drag a print to move it, or use Edit on a print to change its size and frame.' : 'Drawn to scale. Drag a candidate onto a print, or use Edit layout to move prints and change sizes and frames.'}</span>
          <span style={{ fontFamily: mono }}>{stage ? (c?.layout.bg ? `Room photo at your scale: ${(stage.w / 1000).toFixed(1)} m across` : 'Room photo: scale not set, taken to be 3 m across. Use Edit layout, then Set scale.') : '1 square = 10 cm'}</span>
        </div>
        {note && <div role="status" style={{ fontSize: 13, color: 'oklch(0.78 0.11 35)', marginTop: 10 }}>{note}</div>}
      </div>
      <div>
      {!printed && <PrintModal inline prints={wallPrints} index={sel} count={wallPrints.length} ppi={ppi} photoId={wallPrints[sel]?.photoId} onChange={editSel}
        onApplyAll={() => { const f = wallPrints[sel].frame; void saveLayout(wallPrints.map((p) => ({ ...p, frame: f ? { ...f, size: p.frame ? p.frame.size : p.size === f.size ? p.size : f.size } : null }))); }}
        onDelete={() => { if (wallPrints.length <= 1) return; setPrintModal(false); setSelPrint(0); void saveLayout(wallPrints.filter((_, k) => k !== sel), mode === 'free' ? 'row' : mode); }} onClose={() => setPrintModal(false)} />}
      </div>
      </div>
      {printed && <ShoppingList prints={wallPrints} ppi={ppi} />}


      {c.photoIds.length === 0 && !adding && <div className="empty">This composition is empty. Use Add photos, or Add to composition on a photograph.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 40 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 className="serif" style={{ fontSize: 28 }}>Candidates</h2>
              {([['best', `Best first · ${c.photoIds.length}`], ['fits', `Fits ${sp ? printSize(sp.size) : ''} · ${order.filter((pid) => !problemOf(pid)).length}`], ['unrated', `Unrated · ${unrated}`]] as const).map(([k, l]) => (
                <button key={k} onClick={() => { setCandFilter(k); setTab('ranked'); }} aria-pressed={tab === 'ranked' && candFilter === k} style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13.5, background: tab === 'ranked' && candFilter === k ? 'var(--chip)' : 'transparent', color: tab === 'ranked' && candFilter === k ? 'var(--text)' : 'var(--text2)' }}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, fontSize: 13.5, color: 'var(--text2)' }}>
              <button onClick={() => { setTab('face'); setFo(null); }} aria-pressed={tab === 'face'} style={{ color: tab === 'face' ? 'var(--text)' : undefined }}>Help me decide</button>
              {order.length > 0 && <Link to={`/review?ids=${(unrated > 0 ? order.filter((pid) => !rankOf.get(pid)?.mineN) : order).join(',')}`}>Rate these</Link>}
              <button onClick={() => setAdding(!adding)}>{adding ? 'Done adding' : '+ Add photos'}</button>
            </div>
          </div>
          {tab === 'ranked' && !printed && wallPrints.length > 0 && <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>Click a photo to put it in Print {sel + 1}. If it’s already on the wall, the two swap.</p>}

          {tab === 'ranked' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '18px 14px' }}>
              {order.filter((pid) => candFilter === 'fits' ? !problemOf(pid) : candFilter === 'unrated' ? !rankOf.get(pid)?.mineN : true).map((pid, i) => {
                const p = byId.get(pid); const r = rankOf.get(pid);
                if (!p) return null;
                const at = findPhoto(wallPrints, pid); const on = !!at;
                const prob = on ? null : problemOf(pid);
                const low = at ? lowRes(p, wallPrints[at.index], ppi) : prob ? null : lowOf(pid);
                const slot = at ? at.index + 1 : 0;
                return (
                  <div key={pid} style={{ position: 'relative' }}>
                    <button draggable={!printed} onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(pid)); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setOver(null)} onClick={() => toggle(pid)} aria-pressed={on} aria-label={`${p.title}${prob ? ', does not meet target' : ''}`} style={{ width: '100%', aspectRatio: '1.5', background: 'var(--surface)', borderRadius: 8, padding: 8, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: on ? 'inset 0 0 0 1px #efede8' : prob ? 'inset 0 0 0 1px rgba(231,140,120,.7)' : 'none', opacity: prob ? 0.6 : 1 }}>
                      <img src={imgUrl(pid, 'thumb')} alt="" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                      <span style={{ position: 'absolute', top: 6, left: 8, font: `500 11px ${mono}`, background: 'rgba(0,0,0,.62)', padding: '2px 6px', borderRadius: 4 }}>#{i + 1}</span>
                      {on && <span style={{ position: 'absolute', top: 6, right: printed ? 8 : 36, fontSize: 11, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, padding: '2px 8px', borderRadius: 999 }}>Print {slot}</span>}
                    </button>
                    {!printed && <button aria-label={`Remove ${p.title} from this composition`} title="Remove from this composition" onClick={() => removeFromComp(pid)} style={{ position: 'absolute', top: 5, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,.62)', color: 'var(--text)', fontSize: 12, lineHeight: '24px', textAlign: 'center' }}>✕</button>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                      <span style={{ font: `400 22px/1 ${serif}` }}>{fmt(r?.score ?? null)}</span>
                      <span style={{ font: `400 11.5px ${mono}`, color: 'var(--muted)' }}>you {fmt(r?.mine ?? null)} · guests {fmt(r?.guest ?? null)} ({r?.guestN ?? 0})</span>
                    </div>
                    <div style={{ height: 3, background: 'var(--hair)', borderRadius: 2, marginTop: 6 }}><i style={{ display: 'block', height: '100%', width: `${Math.round(((r?.score ?? 0) / 5) * 100)}%`, background: 'var(--text2)', borderRadius: 2 }} /></div>
                    {prob && <div style={{ fontSize: 12, color: 'oklch(0.78 0.11 35)', marginTop: 6, lineHeight: 1.35 }}>{prob}</div>}
                    {low && <div role="note" style={{ fontSize: 12, color: 'oklch(0.78 0.11 35)', marginTop: 6, lineHeight: 1.35 }}>⚠ {low}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'face' && (
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <span style={{ font: `400 24px ${serif}` }}>{state.done ? 'Your pick' : 'Which one goes on the wall?'}</span>
                <span style={{ font: `400 12px ${mono}`, color: 'var(--muted)' }}>{pool.length < 2 ? '' : state.done ? `${pool.length - 1} rounds` : `Round ${state.round} of ${Math.max(1, pool.length - 1)}`}</span>
              </div>
              {pool.length < 2 && <p className="muted">Add a few more candidates that meet the target, then choose between them here.</p>}
              {pool.length >= 2 && !state.done && fa && fb && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {[fa, fb].map((p, side) => (
                      <button key={p.id} onClick={() => pickSide(side as 0 | 1)} aria-label={`Pick ${p.title}`} style={{ aspectRatio: '1.4', background: 'var(--bg)', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px var(--hair)' }}>
                        <img src={imgUrl(p.id, 'preview')} alt="" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, font: `400 11.5px ${mono}`, color: 'var(--muted)', marginTop: 8 }}>
                    <span>{fa.title} · {fmt(rankOf.get(fa.id)?.score ?? null)}</span><span>{fb.title} · {fmt(rankOf.get(fb.id)?.score ?? null)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--faint)', marginTop: 14 }}>Pick the one that belongs on the wall. ← / → keys. The winner stays for the next round.</div>
                </>
              )}
              {pool.length >= 2 && state.done && fa && (
                <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                  <img src={imgUrl(fa.id, 'preview')} alt="" style={{ height: 200, borderRadius: 6, display: 'block' }} />
                  <div>
                    <div style={{ fontSize: 13.5, color: 'var(--text2)', marginBottom: 14 }}>{fa.title} won every round it played.</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => { toggle(fa.id); setFo(null); setTab('ranked'); }} style={{ ...lightBtn, padding: '11px 20px', fontSize: 14 }}>Put it in the next print</button>
                      <button onClick={() => setFo(null)} style={{ borderRadius: 999, padding: '11px 18px', fontSize: 13, boxShadow: ring }}>Run again</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 28, fontSize: 13, color: 'var(--text2)' }}>
          <div>
            {heading('Guest reviews')}
            <div style={{ marginBottom: 10 }}>{rk && rk.guests > 0 ? `${rk.guests} ${rk.guests === 1 ? 'guest' : 'guests'} rated these photographs. Their scores count for ${w}% of the ranking.` : 'No one has rated these yet. Send a link and their scores feed the ranking.'}</div>
            <button onClick={() => setSharing(true)} style={{ borderRadius: 999, padding: '8px 14px', fontSize: 13, boxShadow: ring, color: 'var(--text)' }}>{rk && rk.guests > 0 ? 'Ask more people' : 'Share for review'}</button>
          </div>
          {(guestComments.data?.comments ?? []).length > 0 && (
            <div>{heading('Guest comments')}
              {guestComments.data!.comments.slice(0, 12).map((cm) => (
                <div key={cm.id} style={{ marginBottom: 10 }}>
                  <div style={{ color: 'var(--text)' }}>{cm.by} <span style={{ color: 'var(--faint)' }}>· {cm.photoId ? <Link className="t2" to={`/photo/${cm.photoId}`}>{cm.photoTitle ?? 'a photograph'}</Link> : 'the whole set'}</span></div>
                  <div>{cm.body}</div>
                </div>
              ))}
            </div>
          )}
          {ins && ins.repetitive.length > 0 && (
            <div>{heading('Nearly the same')}
              {ins.repetitive.map((g) => <div key={g.photoIds.join('-')} style={{ marginBottom: 8 }}>{g.photoIds.map((x) => byId.get(x)?.title ?? 'A photo').slice(0, 2).join(' and ')} look alike. Only one is likely to make the wall. <Link className="t2" style={{ textDecoration: 'underline' }} to={`/compare?a=${g.photoIds[0]}&b=${g.photoIds[1]}`}>Compare</Link></div>)}
            </div>
          )}
          {ins && ins.complementary.length > 0 && (
            <div>{heading(`Would sit well here${ins.aiAssisted ? ' · AI-assisted' : ''}`)}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {ins.complementary.map((p) => <button key={p.id} title={`${Math.round((p.similarity ?? 0) * 100)}% match. Add it`} aria-label={`Add suggested ${p.title}`} onClick={() => addPhoto(p.id)} style={{ borderRadius: 4, overflow: 'hidden' }}><img src={thumb(p.id)} alt="" style={{ height: 52, display: 'block' }} /></button>)}
              </div>
            </div>
          )}
          {ins && ins.alternatives.length > 0 && (
            <div>{heading('Alternatives')}
              {ins.alternatives.map((a) => (
                <div key={a.forId} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>For {byId.get(a.forId)?.title ?? 'a photo'} · {a.reason}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{a.candidates.map((p) => <button key={p.id} title={`${Math.round((p.similarity ?? 0) * 100)}% similar. Add it`} aria-label={`Add alternative ${p.title}`} onClick={() => addPhoto(p.id)} style={{ borderRadius: 4, overflow: 'hidden' }}><img src={thumb(p.id)} alt="" style={{ height: 52, display: 'block' }} /></button>)}</div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {exporting && (
        <div onMouseDown={(e) => e.target === e.currentTarget && setExporting(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-label="Export for print" style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 0 0 1px var(--hair),0 12px 30px rgba(0,0,0,.5)' }}>
            {exporting !== 'printed' ? (
              <>
                <h2 style={{ font: `400 30px ${serif}`, margin: '0 0 6px' }}>Export for print</h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 18px' }}>{printsSummary(wallPrints)}. Untouched originals, numbered in print order (a stacked print’s two photographs are two files, never joined).</p>
                {lowCount > 0 && <p role="note" style={{ fontSize: 13, color: 'oklch(0.78 0.11 35)', margin: '0 0 14px' }}>⚠ {lowCount} {lowCount === 1 ? 'print has' : 'prints have'} a photograph with fewer pixels than {ppi} PPI asks for at its size, marked below. They may look soft; the lab or print shop can tell you whether that is acceptable.</p>}
                {chosen.map((p, i) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 14, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--hair)' }}>
                    <img src={thumb(p.id)} alt="" style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                    <span style={{ font: `400 12.5px ${mono}` }}>{String(i + 1).padStart(String(chosen.length).length, '0')}_{p.file}</span>
                    <span style={{ fontSize: 12, color: warns[wallPrints.findIndex((q) => photosOf(q).includes(p.id))] ? 'oklch(0.78 0.11 35)' : 'var(--muted)' }}>{p.w} × {p.h}{(() => { const at = findPhoto(wallPrints, p.id); const n = at ? ppiOf(p, wallPrints[at.index]) : null; return n !== null && n < ppi ? ` · ⚠ ${n} PPI` : ''; })()}</span>
                  </div>
                ))}
                {exporting === 'ready' && <button onClick={download} disabled={dl?.state === 'working'} style={{ ...lightBtn, marginTop: 18, width: '100%', padding: '13px 24px', fontSize: 14.5 }}>{dl?.state === 'working' ? `Downloading ${dl.done} of ${dl.total}…` : `Download ${chosen.length} originals`}</button>}
                {exporting === 'downloaded' && (
                  <div style={{ marginTop: 18, background: 'var(--hover)', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 13.5, marginBottom: 4 }}>Downloads started · {dl?.total ?? chosen.length} files sent to your browser, in order.{dl && dl.skipped > 0 ? ` ${dl.skipped} could not be included because the original file is missing.` : ''}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 12 }}>Once they're at the lab, mark this composition as done. It moves to the Printed archive and its shopping list shows.</div>
                    <button onClick={async () => { await save({ printed: true }); setExporting('printed'); }} style={{ ...lightBtn, padding: '11px 20px', fontSize: 14 }}>Mark as done</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 style={{ font: `400 36px ${serif}`, margin: '0 0 8px' }}>Done.</h2>
                <p style={{ fontSize: 13.5, color: 'var(--text2)', margin: '0 0 20px' }}>{c.name} is in the Printed archive, with its shopping list. Its photographs stay in your library and can join other compositions.</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => nav('/collections')} style={{ ...lightBtn, padding: '11px 20px', fontSize: 14 }}>Back to compositions</button>
                  <button onClick={() => { setExporting(null); openNew(); }} style={{ borderRadius: 999, padding: '11px 18px', fontSize: 13, boxShadow: ring }}>Start another</button>
                  <button onClick={async () => { await save({ printed: false }); setExporting(null); }} style={{ borderRadius: 999, padding: '11px 18px', fontSize: 13, boxShadow: ring }}>Reopen</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


type GuestReviews = { photoId: number; title: string; n: number; avg: number; entries: { reviewer: string; rating: number; note: string | null }[] }[];
/** Ratings from every link of this composition, per photograph. */
function GuestRatings({ id }: { id: number }) {
  const links = useApi<{ id: number }[]>(`/shares?kind=collection&id=${id}`);
  const [rows, setRows] = useState<GuestReviews>([]);
  useEffect(() => { (async () => { const all: GuestReviews = []; for (const l of links.data ?? []) all.push(...(await api<GuestReviews>(`/shares/${l.id}/reviews`).catch(() => []))); setRows(all); })(); }, [links.data]);
  if (!rows.length) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No ratings yet.</p>;
  return <>{rows.map((r) => <div key={r.photoId} style={{ padding: '8px 0', borderTop: '1px solid var(--hair)' }}><b style={{ fontWeight: 500 }}>{r.title}</b> <span className="muted">· {r.avg.toFixed(1)} from {r.n}</span>{r.entries.map((e, i) => <div key={i} className="muted" style={{ fontSize: 12.5 }}>{e.reviewer}: {'★'.repeat(e.rating)}{e.note && <> “{e.note}”</>}</div>)}</div>)}</>;
}
function GuestComments({ id }: { id: number }) {
  const c = useApi<{ comments: { id: number; by: string; photoTitle: string | null; body: string; at: string }[] }>(`/collections/${id}/comments`);
  if (!c.data?.comments.length) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No comments yet.</p>;
  return <>{c.data.comments.map((x) => <div key={x.id} style={{ padding: '8px 0', borderTop: '1px solid var(--hair)' }}><b style={{ fontWeight: 500 }}>{x.by}</b> <span className="muted">· {x.photoTitle ?? 'the whole set'}</span><div style={{ fontSize: 13.5 }}>{x.body}</div></div>)}</>;
}
