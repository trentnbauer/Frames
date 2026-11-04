import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { checkTarget, parseTarget, printRatio, requiredPx, type Collection, type PhotoLite, type Target } from '../data';
import { Header, Img, Justified, Loading } from '../components/bits';
import { SharePanel } from '../components/SharePanel';
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
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67' } as const;
const lightBtn = { background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999 } as const;
const ring = 'inset 0 0 0 1px rgba(255,255,255,.2)';
const fmt = (n: number | null) => (n === null ? '–' : n.toFixed(1));
const thumb = (id: number) => imgUrl(id, 'thumb');
const sizeName = (t: Target) => (t.size === 'custom' ? `${t.widthMm}×${t.heightMm} mm` : t.size === 'none' ? 'pixels only' : t.size);
const targetShort = (t: Target) => `${t.count} × ${sizeName(t)}`;
const targetLabel = (t: Target) => [t.count > 1 ? `${t.count} ×` : '', sizeName(t), t.orientation !== 'any' ? t.orientation : '', `${t.ppi} PPI`].filter(Boolean).join(' ');
const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

/** The cover of a composition card: only the photographs chosen for the prints, laid out by how many there are. */
export function CompCover({ c }: { c: Collection }) {
  const ids = c.chosenIds.slice(0, 3);
  const img = (id: number, extra: React.CSSProperties = {}) => <img key={id} src={thumb(id)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', ...extra }} />;
  const grid: React.CSSProperties = ids.length >= 3 ? { gridTemplateColumns: '2fr 1fr', gridTemplateRows: '1fr 1fr' } : ids.length === 2 ? { gridTemplateColumns: '1fr 1fr' } : { gridTemplateColumns: '1fr' };
  return (
    <Link to={`/collections/${c.id}`} aria-label={`Open ${c.name}`} style={{ display: 'grid', ...grid, gap: 4, aspectRatio: '2.2', borderRadius: 6, overflow: 'hidden', background: '#161615', marginBottom: 12, alignItems: 'center', justifyItems: 'center' }}>
      {ids.length === 0 && <span style={{ fontSize: 12.5, color: '#6f6c67' }}>Nothing chosen yet</span>}
      {ids.length >= 3 ? <>{img(ids[0], { gridRow: 'span 2' })}{img(ids[1])}{img(ids[2])}</> : ids.map((id) => img(id))}
    </Link>
  );
}

function Card({ c }: { c: Collection }) {
  const t = c.target;
  const full = !!t && c.chosenIds.length >= t.count;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <CompCover c={c} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <h3 style={{ font: `400 22px ${serif}`, margin: 0 }}>{c.name}</h3>
        <span style={{ fontSize: 12.5, color: '#8f8c86' }}>{t ? targetShort(t) : 'No target'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, margin: '8px 0 6px' }}>
        {t && Array.from({ length: Math.min(t.count, 12) }, (_, i) => <i key={i} style={{ width: 10, height: 14, display: 'inline-block', background: i < c.chosenIds.length ? '#efede8' : 'transparent', boxShadow: i < c.chosenIds.length ? 'none' : 'inset 0 0 0 1px rgba(255,255,255,.2)' }} />)}
        <span style={{ fontSize: 12, color: '#8f8c86', marginLeft: t ? 6 : 0 }}>{!t ? `${c.photoIds.length} photographs` : full ? 'Ready to export' : `${c.chosenIds.length} of ${t.count} chosen · ${c.photoIds.length} candidates`}</span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <Link to={`/collections/${c.id}`} style={{ borderRadius: 999, padding: '8px 16px', fontSize: 13, fontWeight: 500, background: full ? '#efede8' : 'rgba(255,255,255,.08)', color: full ? '#0d0d0d' : '#efede8' }}>{full ? 'Export for print' : 'Continue picking'}</Link>
        <Link to={`/collections/${c.id}`} style={{ borderRadius: 999, padding: '8px 14px', fontSize: 13, boxShadow: ring }}>Open</Link>
      </div>
    </div>
  );
}

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
  const all = colls.data ?? [];
  const active = all.filter((c) => !c.printedAt);
  const printed = all.filter((c) => c.printedAt);
  return (
    <div className="page">
      <Header />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h1 style={{ font: `400 48px/1 ${serif}`, margin: 0 }}>Compositions</h1>
          {colls.data && <span style={{ fontSize: 13, color: '#8f8c86' }}>{active.length} in progress · {printed.length} printed</span>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={openSearch} style={{ borderRadius: 999, padding: '11px 18px', fontSize: 13, boxShadow: ring }}>From a search…</button>
          <button onClick={() => openNew()} style={{ ...lightBtn, padding: '11px 20px', fontSize: 14 }}>New composition</button>
        </div>
      </div>
      {(colls.loading || colls.error) && <Loading error={colls.error} />}
      {colls.data && all.length === 0 && <div className="empty">No compositions yet. A composition is a curated set of photographs you can download as untouched original files.</div>}
      {active.length > 0 && (
        <>
          <div style={{ ...eyebrow, marginBottom: 14 }}>In progress</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '28px 24px', marginBottom: 48 }}>{active.map((c) => <Card key={c.id} c={c} />)}</div>
        </>
      )}
      {(sets.data ?? []).length > 0 && (
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
      {printed.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 20, marginBottom: 6 }}>
            <h2 style={{ font: `400 28px ${serif}`, margin: 0 }}>Printed</h2>
            <span style={{ fontSize: 12.5, color: '#8f8c86' }}>Done and archived. Reopen any time.</span>
          </div>
          {printed.map((c) => (
            <Link key={c.id} to={`/collections/${c.id}`} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'auto 1fr auto auto', gap: 18, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,.08)', textAlign: 'left' }}>
              <span style={{ display: 'flex', gap: 3, height: 40 }}>{c.chosenIds.slice(0, 6).map((id) => <img key={id} src={thumb(id)} alt="" style={{ height: '100%', aspectRatio: String(byId.get(id)?.ar ?? 1.5), objectFit: 'cover', borderRadius: 2, display: 'block' }} />)}</span>
              <span style={{ font: `400 20px ${serif}` }}>{c.name}</span>
              <span style={{ fontSize: 12.5, color: '#a8a59f' }}>{c.target ? targetShort(c.target) : ''}</span>
              <span style={{ font: `400 12px ${mono}`, color: '#8f8c86' }}>{dayOf(c.printedAt!)}</span>
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
  const suggestions = useApi<{ suggestions: { forId: number; photoId: number; by: string[]; notes: string[] }[] }>(`/collections/${id}/suggestions`);
  const [editing, setEditing] = useState(false);
  const [qs] = useSearchParams();
  const [adding, setAdding] = useState(qs.get('add') === '1'); // a new, empty composition opens with the photographs to choose from
  const [tab, setTab] = useState<'ranked' | 'face'>('ranked');
  const [fo, setFo] = useState<Fo | null>(null);
  const [dl, setDl] = useState<Dl | null>(null);
  const [sharing, setSharing] = useState(false);
  const [exporting, setExporting] = useState<'ready' | 'downloaded' | 'printed' | null>(null);
  const [fSub, setFSub] = useState<string[]>([]);
  const [fTag, setFTag] = useState<string[]>([]);
  const [pick, setPick] = useState<Set<number>>(new Set());
  const [over, setOver] = useState<number | null>(null);
  const [dropNote, setDropNote] = useState('');
  const subjects = useApi<{ name: string; n: number }[]>(adding ? '/tags?kind=subject' : null);
  const tagList = useApi<{ name: string; n: number }[]>(adding ? '/tags?kind=tag' : null);
  const filt = new URLSearchParams(); if (fSub.length) filt.set('subject', fSub.join(',')); if (fTag.length) filt.set('tag', fTag.join(','));
  const found = useApi<{ photos: PhotoLite[] }>(adding && (fSub.length || fTag.length) ? `/photos?${filt}` : null);
  const cancelled = useRef(false);

  const c = coll.data;
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const target = c?.target ?? null;
  const rk = ranking.data;
  const rankOf = new Map((rk?.items ?? []).map((r, i) => [r.id, { ...r, rank: i + 1 }]));
  const order = c ? [...c.photoIds].sort((a, b) => (rankOf.get(a)?.rank ?? 1e9) - (rankOf.get(b)?.rank ?? 1e9)) : [];
  const problemOf = (pid: number) => { const p = byId.get(pid); return p && target ? checkTarget(p, target).problem : null; };
  const pool = c ? order.filter((pid) => !c.chosenIds.includes(pid) && !problemOf(pid)).slice(0, 6) : [];
  const state: Fo = fo ?? { champ: pool[0], next: 1, round: 1, done: pool.length < 2 };

  // ← and → pick a side in "Help me decide".
  useEffect(() => {
    if (tab !== 'face') return;
    const f = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft') pickSide(0); if (e.key === 'ArrowRight') pickSide(1); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  });

  if (!c) return <div className="page"><Header /><Loading error={coll.error} /></div>;
  const printed = !!c.printedAt;
  const reload = () => { ranking.reload(); insights.reload(); suggestions.reload(); };
  const save = async (patch: Record<string, unknown>) => { coll.set(await api<Collection>(`/collections/${c.id}`, { method: 'PATCH', body: patch })); reload(); };
  // Takes a photograph out of this composition (it stays in the library, and any print slot it held is freed).
  const removeFromComp = async (pid: number) => { coll.set(await api<Collection>(`/collections/${c.id}/photos/${pid}`, { method: 'DELETE' })); reload(); };
  // A guest's suggestion: swap it into the print it was for (in the same slot), or put it aside.
  const useSuggestion = async (forId: number, photoId: number) => {
    const next = c.chosenIds.map((x) => (x === forId ? photoId : x));
    await api(`/collections/${c.id}/suggestions?forId=${forId}&photoId=${photoId}`, { method: 'DELETE' });
    await save({ chosenIds: next, order: [...next, ...c.photoIds.filter((x) => !next.includes(x))] });
  };
  const dismissSuggestion = async (forId: number, photoId: number) => { await api(`/collections/${c.id}/suggestions?forId=${forId}&photoId=${photoId}`, { method: 'DELETE' }); suggestions.reload(); };
  const addPhoto = async (pid: number) => { coll.set(await api<Collection>(`/collections/${c.id}/photos/${pid}`, { method: 'PUT' })); reload(); };
  const req = target ? requiredPx(target) : null;
  const chosen = c.chosenIds.map((pid) => byId.get(pid)).filter((p): p is PhotoLite => !!p);
  const count = target?.count ?? 0;
  const full = !!target && c.chosenIds.length >= count;
  const tooSmall = order.filter((pid) => problemOf(pid)).length;
  const unrated = order.filter((pid) => !rankOf.get(pid)?.mineN).length;

  // Dragging a candidate (or a print) onto a print slot: it takes that place; one already there goes back to the candidates,
  // or swaps if it came from another slot. The chosen photographs are also put first, in slot order, so the order survives.
  const dropOn = (slot: number, pid: number) => {
    if (!target || printed) return;
    setOver(null); setDropNote('');
    const bad = problemOf(pid);
    if (bad) { setDropNote(`${byId.get(pid)?.title ?? 'That photograph'} cannot go in a print: ${bad}`); return; }
    const chosenNow = [...c.chosenIds];
    const from = chosenNow.indexOf(pid);
    let next: number[];
    if (from >= 0) {
      next = [...chosenNow];
      const to = Math.min(slot, next.length - 1);
      [next[from], next[to]] = [next[to], next[from]];
    } else if (slot < chosenNow.length) { next = [...chosenNow]; next[slot] = pid; }
    else if (chosenNow.length < count) next = [...chosenNow, pid];
    else return;
    save({ chosenIds: next, order: [...next, ...c.photoIds.filter((x) => !next.includes(x))] });
  };
  const toggle = (pid: number) => {
    if (!target || printed) return;
    const on = c.chosenIds.includes(pid);
    if (!on && (c.chosenIds.length >= count || problemOf(pid))) return;
    save({ chosenIds: on ? c.chosenIds.filter((x) => x !== pid) : [...c.chosenIds, pid] });
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
  // Each slot is drawn in the shape of the print: portrait when the target is, and capped so a tall slot does not fill the screen.
  const slotRatio = (pid?: number) => printRatio(target ?? parseTarget({ size: 'none', orientation: 'any', ppi: 300, count: 1 })!, pid ? byId.get(pid) : null);
  const tall = !!target && (target.orientation === 'portrait' || (target.orientation === 'any' && chosen.some((p) => p.h > p.w)));
  const slotsMax = count * (tall ? 300 : 420) + (count - 1) * 16;
  const exportLabel = printed ? 'Printed' : full ? `Export ${count} for print` : target ? `Choose ${count - c.chosenIds.length} more to export` : 'Add a target to export';
  const canExport = full && !printed;
  const w = rk?.weight ?? 35;
  const fa = byId.get(state.champ), fb = byId.get(pool[state.next]) ?? fa;
  const heading = (t: string) => <h3 style={{ font: `400 19px/1.2 ${serif}`, margin: '0 0 8px', color: '#efede8' }}>{t}</h3>;

  return (
    <div className="page">
      <Header />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 20 }}>
        <Link to="/collections" style={{ color: '#a8a59f' }}>← Compositions</Link>
        <span style={{ display: 'flex', gap: 18, color: '#a8a59f' }}>
          <button onClick={() => setSharing(!sharing)} aria-expanded={sharing}>Share for review</button>
          <button onClick={() => setAdding(!adding)}>{adding ? 'Done adding' : 'Add photos'}</button>
          <button onClick={async () => { if (confirm(`Delete “${c.name}”? The photographs themselves are not touched.`)) { await api(`/collections/${c.id}`, { method: 'DELETE' }); nav('/collections'); } }}>Delete</button>
        </span>
      </div>
      {sharing && <SharePanel kind="collection" id={c.id} onClose={() => setSharing(false)} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {printed && <div style={{ ...eyebrow, color: '#a8a59f', marginBottom: 8 }}>Printed · {dayOf(c.printedAt!)}</div>}
          <input className="serif inline" aria-label="Composition name" defaultValue={c.name} key={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && save({ name: e.target.value })} style={{ fontSize: 52, lineHeight: 1 }} />
          <input aria-label="Theme" className="t2 inline" placeholder="Add a theme" defaultValue={c.theme} onBlur={(e) => e.target.value !== c.theme && save({ theme: e.target.value })} style={{ fontSize: 13.5, marginTop: 8 }} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <button onClick={() => (canExport || printed) && setExporting(printed ? 'printed' : 'ready')} disabled={!canExport && !printed} style={{ background: canExport ? '#efede8' : 'rgba(255,255,255,.08)', color: canExport ? '#0d0d0d' : '#8f8c86', fontWeight: 500, borderRadius: 999, padding: '13px 24px', fontSize: 14.5 }}>{exportLabel}</button>
          <div style={{ fontSize: 12, color: '#8f8c86', marginTop: 8 }}>{printed ? 'In the Printed archive' : `Originals · in print order${target && target.size !== 'none' ? ` · ${target.size === 'custom' ? 'custom size' : target.size} checked` : ''}`}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.08)', borderBottom: '1px solid rgba(255,255,255,.08)', padding: '12px 0', margin: '22px 0 24px', fontSize: 13.5 }}>
        <span style={eyebrow}>Target</span>
        {target ? (
          <>
            <span><b style={{ fontWeight: 500 }}>{targetLabel(target)}</b>{req && <>, so at least <b style={{ fontWeight: 500 }}>{req[0]} × {req[1]} px</b> each</>}</span>
            <span style={{ color: '#8f8c86' }}>{c.chosenIds.length} of {count} chosen · {c.photoIds.length} candidates{tooSmall > 0 ? ` · ${tooSmall} too small` : ''}</span>
          </>
        ) : <span style={{ color: '#8f8c86' }}>No target yet. Set the number of prints and the size to rank and check candidates.</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 16, color: '#a8a59f' }}>
          <span>Ranking: yours {100 - w}% · guests {w}%</span>
          <button onClick={() => setEditing(!editing)}>{target ? 'Change target' : 'Add target'}</button>
        </span>
      </div>
      {editing && <TargetForm t={target} weight={w} onChange={(t) => save({ target: t })} onWeight={async (v) => { await api('/collections/guest-weight', { method: 'PUT', body: { weight: v } }); ranking.reload(); }} onClear={() => { save({ target: null }); setEditing(false); }} />}

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

      {target && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count},minmax(0,1fr))`, gap: 16, marginBottom: 32, maxWidth: `min(100%, ${slotsMax}px)` }}>
          {Array.from({ length: count }, (_, i) => {
            const p = byId.get(c.chosenIds[i]);
            return (
              <div key={i}>
                <div data-slot={i + 1}
                  onDragOver={(e) => { if (!printed) { e.preventDefault(); setOver(i); } }} onDragLeave={() => setOver((o) => (o === i ? null : o))}
                  onDrop={(e) => { e.preventDefault(); const pid = Number(e.dataTransfer.getData('text/plain')); if (pid) dropOn(i, pid); }}
                  style={{ aspectRatio: String(slotRatio(c.chosenIds[i])), borderRadius: 8, background: over === i ? '#1e1e1d' : '#161615', position: 'relative', overflow: 'hidden', boxShadow: over === i ? 'inset 0 0 0 2px #efede8' : p ? 'inset 0 0 0 1px #efede8' : 'inset 0 0 0 1px rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {p ? <img src={imgUrl(p.id, 'preview')} alt={p.title} draggable={!printed} onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.id))} style={{ position: 'absolute', inset: 8, width: 'calc(100% - 16px)', height: 'calc(100% - 16px)', objectFit: 'contain', cursor: printed ? 'default' : 'grab' }} />
                    : <span style={{ fontSize: 12.5, color: '#6f6c67', textAlign: 'center', padding: '0 16px' }}>Print {i + 1}<br />Drag one here, or choose from the ranking below</span>}
                  <span style={{ position: 'absolute', top: 8, left: 10, font: `italic 400 20px ${serif}`, color: '#efede8', textShadow: '0 1px 6px rgba(0,0,0,.6)' }}>{i + 1}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, color: '#8f8c86', minHeight: 18 }}>
                  <span>{p ? `${p.title} · ${fmt(rankOf.get(p.id)?.score ?? null)}` : ''}</span>
                  {p && !printed && <button onClick={() => toggle(p.id)} style={{ color: '#6f6c67' }}>remove</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dropNote && <div className="reason" role="status" style={{ marginBottom: 12, fontSize: 13 }}>{dropNote}</div>}
      {c.photoIds.length === 0 && !adding && <div className="empty">This composition is empty. Use Add photos, or Add to composition on a photograph.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 40 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setTab('ranked')} style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, background: tab === 'ranked' ? 'rgba(255,255,255,.08)' : 'transparent' }}>Ranked · {c.photoIds.length}</button>
              <button onClick={() => { setTab('face'); setFo(null); }} style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, background: tab === 'face' ? 'rgba(255,255,255,.08)' : 'transparent' }}>Help me decide</button>
            </div>
            {order.length > 0 && <Link to={`/review?ids=${(unrated > 0 ? order.filter((pid) => !rankOf.get(pid)?.mineN) : order).join(',')}`} style={{ fontSize: 13, color: '#a8a59f' }}>Rate these candidates ({unrated} not yet rated by you)</Link>}
          </div>

          {tab === 'ranked' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '18px 14px' }}>
              {order.map((pid, i) => {
                const p = byId.get(pid); const r = rankOf.get(pid);
                if (!p) return null;
                const prob = problemOf(pid); const on = c.chosenIds.includes(pid);
                const slot = c.chosenIds.indexOf(pid) + 1;
                return (
                  <div key={pid} style={{ position: 'relative' }}>
                    <button draggable={!printed && !!target} onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(pid)); e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setOver(null)} onClick={() => toggle(pid)} aria-pressed={on} aria-label={`${p.title}${prob ? ', does not meet target' : ''}`} style={{ width: '100%', aspectRatio: '1.5', background: '#161615', borderRadius: 8, padding: 8, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: on ? 'inset 0 0 0 1px #efede8' : prob ? 'inset 0 0 0 1px rgba(231,140,120,.7)' : 'none', opacity: prob ? 0.6 : 1 }}>
                      <img src={imgUrl(pid, 'thumb')} alt="" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                      <span style={{ position: 'absolute', top: 6, left: 8, font: `500 11px ${mono}`, background: 'rgba(0,0,0,.62)', padding: '2px 6px', borderRadius: 4 }}>#{i + 1}</span>
                      {on && <span style={{ position: 'absolute', top: 6, right: printed ? 8 : 36, fontSize: 11, background: '#efede8', color: '#0d0d0d', fontWeight: 500, padding: '2px 8px', borderRadius: 999 }}>Print {slot}</span>}
                    </button>
                    {!printed && <button aria-label={`Remove ${p.title} from this composition`} title="Remove from this composition" onClick={() => removeFromComp(pid)} style={{ position: 'absolute', top: 5, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,.62)', color: '#efede8', fontSize: 12, lineHeight: '24px', textAlign: 'center' }}>✕</button>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                      <span style={{ font: `400 22px/1 ${serif}` }}>{fmt(r?.score ?? null)}</span>
                      <span style={{ font: `400 11.5px ${mono}`, color: '#8f8c86' }}>you {fmt(r?.mine ?? null)} · guests {fmt(r?.guest ?? null)} ({r?.guestN ?? 0})</span>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, marginTop: 6 }}><i style={{ display: 'block', height: '100%', width: `${Math.round(((r?.score ?? 0) / 5) * 100)}%`, background: '#a8a59f', borderRadius: 2 }} /></div>
                    {prob && <div style={{ fontSize: 12, color: 'oklch(0.78 0.11 35)', marginTop: 6, lineHeight: 1.35 }}>{prob}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'face' && (
            <div style={{ background: '#161615', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
                <span style={{ font: `400 24px ${serif}` }}>{state.done ? 'Your pick' : 'Which one goes on the wall?'}</span>
                <span style={{ font: `400 12px ${mono}`, color: '#8f8c86' }}>{pool.length < 2 ? '' : state.done ? `${pool.length - 1} rounds` : `Round ${state.round} of ${Math.max(1, pool.length - 1)}`}</span>
              </div>
              {pool.length < 2 && <p className="muted">Add a few more candidates that meet the target, then choose between them here.</p>}
              {pool.length >= 2 && !state.done && fa && fb && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    {[fa, fb].map((p, side) => (
                      <button key={p.id} onClick={() => pickSide(side as 0 | 1)} aria-label={`Pick ${p.title}`} style={{ aspectRatio: '1.4', background: '#0d0d0d', borderRadius: 8, padding: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)' }}>
                        <img src={imgUrl(p.id, 'preview')} alt="" style={{ maxWidth: '100%', maxHeight: '100%', display: 'block' }} />
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, font: `400 11.5px ${mono}`, color: '#8f8c86', marginTop: 8 }}>
                    <span>{fa.title} · {fmt(rankOf.get(fa.id)?.score ?? null)}</span><span>{fb.title} · {fmt(rankOf.get(fb.id)?.score ?? null)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6f6c67', marginTop: 14 }}>Pick the one that belongs on the wall. ← / → keys. The winner stays for the next round.</div>
                </>
              )}
              {pool.length >= 2 && state.done && fa && (
                <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                  <img src={imgUrl(fa.id, 'preview')} alt="" style={{ height: 200, borderRadius: 6, display: 'block' }} />
                  <div>
                    <div style={{ fontSize: 13.5, color: '#a8a59f', marginBottom: 14 }}>{fa.title} won every round it played.</div>
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

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 28, fontSize: 13, color: '#a8a59f' }}>
          <div>
            {heading('Guest reviews')}
            <div style={{ marginBottom: 10 }}>{rk && rk.guests > 0 ? `${rk.guests} ${rk.guests === 1 ? 'guest' : 'guests'} rated these photographs. Their scores count for ${w}% of the ranking.` : 'No one has rated these yet. Send a link and their scores feed the ranking.'}</div>
            <button onClick={() => setSharing(true)} style={{ borderRadius: 999, padding: '8px 14px', fontSize: 13, boxShadow: ring, color: '#efede8' }}>{rk && rk.guests > 0 ? 'Ask more people' : 'Share for review'}</button>
          </div>
          {(suggestions.data?.suggestions ?? []).length > 0 && !printed && (
            <div>{heading('Guest suggestions')}
              {suggestions.data!.suggestions.map((g) => (
                <div key={`${g.forId}-${g.photoId}`} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <img src={thumb(g.photoId)} alt={byId.get(g.photoId)?.title ?? ''} style={{ height: 52, borderRadius: 4 }} />
                    <span style={{ color: '#6f6c67' }}>instead of</span>
                    <img src={thumb(g.forId)} alt={byId.get(g.forId)?.title ?? ''} style={{ height: 52, borderRadius: 4 }} />
                  </div>
                  <div style={{ marginBottom: 6 }}>{g.by.join(', ')} {g.by.length === 1 ? 'suggests' : 'suggest'} this for print {c.chosenIds.indexOf(g.forId) + 1}.{g.notes.map((n, i) => <div key={i} style={{ fontStyle: 'italic', color: '#8f8c86' }}>“{n}”</div>)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => useSuggestion(g.forId, g.photoId)} style={{ background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999, padding: '6px 12px', fontSize: 12.5 }}>Use it</button>
                    <button onClick={() => dismissSuggestion(g.forId, g.photoId)} style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12.5, boxShadow: ring }}>Dismiss</button>
                  </div>
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
          <div role="dialog" aria-label="Export for print" style={{ background: '#161615', borderRadius: 14, padding: 28, width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)' }}>
            {exporting !== 'printed' ? (
              <>
                <h2 style={{ font: `400 30px ${serif}`, margin: '0 0 6px' }}>Export for print</h2>
                <p style={{ fontSize: 13, color: '#8f8c86', margin: '0 0 18px' }}>{target ? targetLabel(target) : ''}. Untouched originals, numbered in print order.</p>
                {chosen.map((p, i) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '64px 1fr auto', gap: 14, alignItems: 'center', padding: '8px 0', borderTop: '1px solid rgba(255,255,255,.08)' }}>
                    <img src={thumb(p.id)} alt="" style={{ width: 64, height: 44, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                    <span style={{ font: `400 12.5px ${mono}` }}>{String(i + 1).padStart(String(chosen.length).length, '0')}_{p.file}</span>
                    <span style={{ fontSize: 12, color: '#8f8c86' }}>{p.w} × {p.h}</span>
                  </div>
                ))}
                {exporting === 'ready' && <button onClick={download} disabled={dl?.state === 'working'} style={{ ...lightBtn, marginTop: 18, width: '100%', padding: '13px 24px', fontSize: 14.5 }}>{dl?.state === 'working' ? `Downloading ${dl.done} of ${dl.total}…` : `Download ${chosen.length} originals`}</button>}
                {exporting === 'downloaded' && (
                  <div style={{ marginTop: 18, background: 'rgba(255,255,255,.04)', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 13.5, marginBottom: 4 }}>Downloads started · {dl?.total ?? chosen.length} files sent to your browser, in order.{dl && dl.skipped > 0 ? ` ${dl.skipped} could not be included because the original file is missing.` : ''}</div>
                    <div style={{ fontSize: 12.5, color: '#8f8c86', marginBottom: 12 }}>Once they're at the lab, mark this composition as printed. It moves to the Printed archive.</div>
                    <button onClick={async () => { await save({ printed: true }); setExporting('printed'); }} style={{ ...lightBtn, padding: '11px 20px', fontSize: 14 }}>Mark as printed</button>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 style={{ font: `400 36px ${serif}`, margin: '0 0 8px' }}>Printed.</h2>
                <p style={{ fontSize: 13.5, color: '#a8a59f', margin: '0 0 20px' }}>{c.name} is in the Printed archive. Its photographs stay in your library and can join other compositions.</p>
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

function TargetForm({ t, weight, onChange, onWeight, onClear }: { t: Target | null; weight: number; onChange: (t: Target) => void; onWeight: (w: number) => void; onClear: () => void }) {
  const v = t ?? parseTarget({ size: 'A3', orientation: 'any', ppi: 300, count: 1 })!;
  const num = (s: string) => (s === '' ? undefined : Number(s));
  const upd = (p: Partial<Target>) => onChange({ ...v, ...p } as Target);
  return (
    <div className="form" style={{ marginBottom: 24 }}>
      <label>Prints <input type="number" min={1} value={v.count} onChange={(e) => upd({ count: Math.max(1, Number(e.target.value) || 1) })} /></label>
      <label>Print size <select value={v.size} onChange={(e) => upd({ size: e.target.value as Target['size'] })}><option value="none">No print size</option><option>A4</option><option>A3</option><option>A2</option><option value="custom">Custom (mm)</option></select></label>
      {v.size === 'custom' && <>
        <label>Width mm <input type="number" min={10} value={v.widthMm ?? ''} onChange={(e) => upd({ widthMm: num(e.target.value) })} /></label>
        <label>Height mm <input type="number" min={10} value={v.heightMm ?? ''} onChange={(e) => upd({ heightMm: num(e.target.value) })} /></label>
      </>}
      <label>PPI <input type="number" min={72} max={1200} value={v.ppi} onChange={(e) => upd({ ppi: Math.max(72, Number(e.target.value) || 300) })} /></label>
      <label>Orientation <select value={v.orientation} onChange={(e) => upd({ orientation: e.target.value as Target['orientation'] })}><option value="any">either</option><option value="portrait">portrait</option><option value="landscape">landscape</option></select></label>
      <label>Min width px <input type="number" min={0} value={v.minWidth ?? ''} onChange={(e) => upd({ minWidth: num(e.target.value) })} /></label>
      <label>Min height px <input type="number" min={0} value={v.minHeight ?? ''} onChange={(e) => upd({ minHeight: num(e.target.value) })} /></label>
      <label>Aspect ratio <input key={v.aspect ?? ''} defaultValue={v.aspect ?? ''} placeholder="3:2" style={{ width: 70 }} aria-label="Aspect ratio" onBlur={(e) => e.target.value !== (v.aspect ?? '') && upd({ aspect: e.target.value || undefined })} /></label>
      {v.aspect && <label><select aria-label="Aspect ratio is" value={v.aspectMode ?? 'preferred'} onChange={(e) => upd({ aspectMode: e.target.value as 'preferred' | 'required' })}><option value="preferred">preferred</option><option value="required">required</option></select></label>}
      <label>Guests’ share of the ranking % <input type="number" min={0} max={60} step={5} aria-label="Guests’ share of the ranking" defaultValue={weight} key={weight} onBlur={(e) => { const n = Math.round(Number(e.target.value)); if (n >= 0 && n <= 60 && n !== weight) onWeight(n); }} style={{ width: 70 }} /></label>
      {t && <button className="t2" onClick={onClear}>No target</button>}
    </div>
  );
}
