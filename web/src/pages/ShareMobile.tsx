import { useEffect, useRef, useState } from 'react';
import { SegSlider } from '../components/SegSlider';
import { RATINGS, fmtDate } from '../data';
import { Mark } from '../components/bits';
import { Wall, type Pic } from '../components/CompositionWall';
import { PAD, frameOf, metres, photosOf, rectsIn, sizeLabel, type Layout, type Print } from '../layout';
import { Sheet } from '../components/Sheet';
import { imgUrl } from '../api';

export type SharedPhoto = { id: number; title: string; ar: number; n: number };
type Viewer = { name: string } | null | undefined;
const mono = "'IBM Plex Mono',monospace";
const serif = "'Instrument Serif',Georgia,serif";
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)' } as const;
const ring = 'inset 0 0 0 1px var(--outline)';
const SWATCH: Record<string, string> = { black: '#151514', white: '#e9e7e1', oak: '#b08a5e', walnut: '#5b3f2c', silver: '#a3a3a0' };

/** Whether the page should use the phone layout: a narrow screen, or a phone held sideways. */
/** Who is looking, top right of every shared page: the signed-in account's or typed name, otherwise Guest. */
export function Who({ name }: { name: string }) {
  const n = name.trim();
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13.5, flex: 'none', marginLeft: 'auto' }}>
      <span aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', background: n ? 'var(--accent)' : 'var(--surface)', boxShadow: n ? undefined : 'inset 0 0 0 1px var(--outline)', color: n ? '#0d0d0d' : 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 500 }}>{n ? n[0].toUpperCase() : 'G'}</span>
      {n ? n.split(/\s+/)[0] : 'Guest'}
    </span>
  );
}

export function usePhone(): boolean {
  const q = '(max-width: 700px), (max-height: 520px) and (orientation: landscape)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q), f = () => setOn(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return on;
}

type Props = {
  token: string;
  d: { kind?: string; name: string; description: string; allowReview: boolean; allowDownload: boolean; expiresAt: string | null; layout?: Layout | null; viewer?: Viewer; owner?: string };
  photos: SharedPhoto[]; wallPrints: Print[]; others: SharedPhoto[]; reviewer: string;
  withName: (then: (name: string) => void) => void; changeName: () => void;
  /** The guest's version, kept by the page: print's own photograph -> the candidate put in its place, and print id -> frame colour. */
  mine: Record<number, number>; frames: Record<number, string>; swap: (forId: number, photoId: number | null) => void; setFrame: (printId: number, colour: string | null) => void;
  changes: number; dirty: boolean; sending: boolean; sendNote: { ok: boolean; text: string } | null; sendBack: () => void; discard: () => void; sugErr: string;
  dl: { done: number; total: number; ready: boolean } | null; download: () => void; cancelDl: () => void;
  openLayout: () => void; layoutSent: boolean;
};

/**
 * The share page on a phone: the wall at the top, the other candidates to hold and drag onto a print, a bar of actions at the bottom, and a
 * lightbox that rates, comments and swaps. Tapping a print opens its photograph; the frame colour and the swap are in the lightbox.
 */
export function ShareMobile(p: Props) {
  const { token, d, photos, wallPrints, others, reviewer, withName } = p;
  const canReview = d.allowReview;
  const byId = new Map(photos.map((x) => [x.id, x]));
  const wallPhotos = new Map<number, Pic>(photos.map((x) => [x.id, { id: x.id, title: x.title, w: 0, h: 0, ar: x.ar }]));
  const swapOf = (id: number | null) => (id !== null && p.mine[id] !== undefined ? p.mine[id] : id);
  const shown = wallPrints.map((pr) => ({ ...pr, photoId: swapOf(pr.photoId), photoId2: swapOf(pr.photoId2), frame: pr.frame && p.frames[pr.id] ? { ...pr.frame, color: p.frames[pr.id] } : pr.frame }));
  const order = [...shown.flatMap(photosOf).map((id) => byId.get(id)).filter((x): x is SharedPhoto => !!x), ...others];
  const [look, setLook] = useState<number | null>(null);
  const [lookText, setLookText] = useState('');
  const [picking, setPicking] = useState<number | null>(null); // the chosen photograph whose print a suggestion is for
  const [framing, setFraming] = useState<number | null>(null); // index of the print whose frame colour is being suggested
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [comment, setComment] = useState('');
  const [commentNote, setCommentNote] = useState('');
  const [toast, setToast] = useState('');
  const [drag, setDrag] = useState<{ pid: number; x: number; y: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flash = (t: string) => { setToast(t); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(''), 2400); };
  useEffect(() => () => clearTimeout(timer.current), []);

  const rate = (photoId: number, rating: number) => withName(async (name) => {
    const was = ratings[photoId];
    setRatings((r) => ({ ...r, [photoId]: rating }));
    try { await fetch(`/api/s/${token}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId, rating, reviewer: name }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not save that'); }); }
    catch (e) { setRatings((r) => { const c = { ...r }; if (was === undefined) delete c[photoId]; else c[photoId] = was; return c; }); flash((e as Error).message); }
  });
  const sendText = (photoId: number | null, text: string, done: () => void) => withName(async (name) => {
    try { await fetch(`/api/s/${token}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId, body: text, reviewer: name }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not send that'); }); done(); }
    catch (e) { flash((e as Error).message); }
  });

  // Holding a candidate picks it up; letting go over a print suggests it there. A short tap opens it. Moving before the hold is a scroll.
  const d0 = useRef<{ pid: number; sx: number; sy: number; x: number; y: number; active: boolean; timer?: ReturnType<typeof setTimeout> } | null>(null);
  const suppress = useRef(false);
  const hit = (x: number, y: number) => { const t = document.elementFromPoint(x, y)?.closest('[data-print]'); return t ? Number(t.getAttribute('data-print')) - 1 : null; };
  const cleanup = () => {
    if (d0.current?.timer) clearTimeout(d0.current.timer);
    d0.current = null;
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp); window.removeEventListener('touchmove', onTouch);
    setDrag(null); setOver(null);
  };
  const onTouch = (ev: TouchEvent) => { if (d0.current?.active) ev.preventDefault(); };
  function onMove(ev: PointerEvent) {
    const s = d0.current; if (!s) return;
    s.x = ev.clientX; s.y = ev.clientY;
    if (!s.active) { if (Math.hypot(s.x - s.sx, s.y - s.sy) > 8) cleanup(); return; }
    setDrag({ pid: s.pid, x: s.x, y: s.y }); setOver(hit(s.x, s.y));
  }
  function onUp() {
    const s = d0.current;
    if (s?.active) {
      suppress.current = true; setTimeout(() => { suppress.current = false; }, 80);
      const at = hit(s.x, s.y), pr = at !== null ? wallPrints[at] : null, forId = pr ? photosOf(pr)[0] : undefined;
      if (forId !== undefined && canReview) {
        // A photograph taken out of a print can only go back to its own print; any other candidate takes the print's place.
        if (p.mine[s.pid] !== undefined && forId !== s.pid) flash('That photograph was in another print. Hold it and drop it back on that print.');
        else if (p.mine[s.pid] !== undefined) { p.swap(forId, null); flash(`Put back in print ${at! + 1}.`); }
        else { p.swap(forId, s.pid); flash(`Changed print ${at! + 1}. Send it back when you are ready.`); }
      }
    }
    cleanup();
  }
  const down = (pid: number) => (e: React.PointerEvent) => {
    if (!canReview || p.wallPrints.length === 0) return;
    const s = { pid, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, active: false } as NonNullable<typeof d0.current>;
    s.timer = setTimeout(() => { s.active = true; setDrag({ pid, x: s.x, y: s.y }); }, 280);
    d0.current = s;
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onTouch, { passive: false });
  };
  useEffect(() => cleanup, []); // eslint-disable-line react-hooks/exhaustive-deps

  const f = wallPrints.length ? frameOf(wallPrints, PAD) : null;
  const openPrint = (i: number) => { const pid = photosOf(shown[i])[0]; const at = order.findIndex((x) => x.id === pid); if (at >= 0) { setLook(at); setLookText(''); } };
  const unrated = order.findIndex((x) => ratings[x.id] === undefined);
  const rated = Object.keys(ratings).length;
  const go = (n: number) => { if (look === null) return; setLook((look + n + order.length) % order.length); setLookText(''); };
  const swipe = useRef(0);
  // Escape (a keyboard on a phone or a small window) backs out of the top layer: frame colour, swap list, then the photograph.
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (framing !== null) setFraming(null); else if (picking !== null) setPicking(null); else if (look !== null) setLook(null); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [framing, picking, look]);

  const lp = look !== null ? order[look] : null;
  const slot = lp ? shown.findIndex((pr) => photosOf(pr).includes(lp.id)) : -1;
  const sugOf = slot >= 0 ? mine_for(slot) : undefined;
  function mine_for(i: number) { const pid = photosOf(wallPrints[i])[0]; return p.mine[pid] !== undefined ? byId.get(p.mine[pid]) : undefined; } // the candidate this print has in the guest's version

  const owner = d.owner || 'them';
  const hint = (t: string) => <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text2)' }}>{t}</span>;
  const rateRow = (pid: number, h: number, fs: number) => (
    <div role="group" aria-label="Rate this photograph" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
      {RATINGS.map((r) => {
        const on = ratings[pid] === r.value;
        return <button key={r.value} onClick={() => rate(pid, r.value)} aria-label={`Rate ${r.label}`} aria-pressed={on} style={{ height: h, borderRadius: 12, background: on ? 'var(--btn-bg)' : 'var(--chip)', fontSize: fs }}>{r.emoji}</button>;
      })}
    </div>
  );
  const [filter, setFilter] = useState<'all' | 'todo' | 'rated'>('all');
  const [note, setNote] = useState(''); // the note for the person who shared this
  const [sentAll, setSentAll] = useState(false); // ratings are saved as they are made; Send tells the person they are in
  const ratedCount = photos.filter((x) => ratings[x.id] !== undefined).length;
  const tiles = photos.filter((x) => filter === 'all' || (filter === 'rated' ? ratings[x.id] !== undefined : ratings[x.id] === undefined));
  const daysLeft = d.expiresAt ? Math.max(0, Math.ceil((new Date(d.expiresAt).getTime() - Date.now()) / 86_400_000)) : null;
  const expiry = daysLeft === null ? '' : `Link expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
  const lockup = <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: `italic 400 20px/1 ${serif}` }}><Mark />Frames</span>;
  const sendNote = () => { if (!note.trim()) return; sendText(null, note, () => { setNote(''); flash(`Sent to ${owner}`); }); };
  const spanLabel = f ? `${[...wallPrints.reduce((m, q) => m.set(q.size, (m.get(q.size) || 0) + 1), new Map<string, number>())].map(([k, n]) => (n > 1 ? `${n} × ${k}` : k)).join(', ')} · ${metres(f.w)} × ${metres(f.h)} m` : '';

  return (
    <div className="sm-cols" style={{ minHeight: '100dvh', background: 'var(--page)', color: 'var(--text)', overflowX: 'clip' }}>
      <div className="sm-left" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {f ? (
          <div style={{ padding: '22px 20px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text2)' }}><Mark /><span style={{ fontSize: 13 }}>{d.owner ? `Shared by ${d.owner}` : 'A composition was shared with you'}</span><Who name={reviewer} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <h1 style={{ font: `400 40px/1 ${serif}`, margin: 0, textWrap: 'balance' as never }}>{d.name}</h1>
              <span style={{ font: `400 11.5px ${mono}`, color: 'var(--faint)' }}>{spanLabel}</span>
              {d.description && <p style={{ fontSize: 14, color: 'var(--text2)', margin: '4px 0 0' }}>{d.description}</p>}
            </div>
            <div aria-label="The wall" style={{ position: 'relative', width: '100%', height: 220, borderRadius: 12, overflow: 'hidden', backgroundColor: 'var(--wall-bg)', backgroundImage: 'linear-gradient(var(--wall-grid) 1px,transparent 1px),linear-gradient(90deg,var(--wall-grid) 1px,transparent 1px)', backgroundSize: '20px 20px', display: 'grid', placeItems: 'center' }}>
              <div style={{ position: 'relative', height: '100%', maxWidth: '100%', aspectRatio: String(f.W / f.H) }}>
                {rectsIn(shown, f).map((r, i) => {
                  const pr = shown[i], pid = photosOf(pr)[0], fr = pr.frame;
                  return (
                    <button key={pr.id} onClick={() => openPrint(i)} aria-label={`Print ${i + 1}`} style={{ position: 'absolute', ...r, background: fr && fr.color !== 'none' ? SWATCH[fr.color] ?? '#151514' : 'transparent', padding: fr && fr.color !== 'none' ? 3 : 0, boxSizing: 'border-box', boxShadow: '0 4px 10px rgba(0,0,0,.35)' }}>
                      <span style={{ display: 'block', width: '100%', height: '100%', background: fr ? '#f4f1ea' : 'transparent', padding: fr ? '8%' : 0, boxSizing: 'border-box' }}>
                        <span style={{ display: 'block', width: '100%', height: '100%', background: pid !== undefined && byId.get(pid) ? `url(${imgUrl(pid, 'thumb', token)}) center/cover` : 'var(--wall-empty-bg)' }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {canReview && hint(`Rate each print. ${owner === 'them' ? 'They see' : `${owner} sees`} your ratings and suggestions, not your email.`)}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {shown.map((pr, i) => {
                const ids = photosOf(pr), origin = photosOf(wallPrints[i])[0], kept = origin !== undefined && p.mine[origin] !== undefined;
                return ids.length === 0 ? (
                  <section key={pr.id} aria-label={`Print ${i + 1}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0', borderTop: '1px solid var(--hair)' }}>
                    <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 4, background: 'var(--surface)' }} />
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15 }}>Not chosen yet</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Print {i + 1} · {pr.size}</span></span>
                  </section>
                ) : (
                  <section key={pr.id} aria-label={`Print ${i + 1}`} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', borderTop: '1px solid var(--hair)' }}>
                    {ids.map((pid) => {
                      const ph = byId.get(pid);
                      return (
                        <div key={pid} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <button onClick={() => { const at = order.findIndex((x) => x.id === pid); if (at >= 0) { setLook(at); setLookText(''); } }} aria-label={ph ? `Look closer at ${ph.title}` : 'Empty print'} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                            <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 4, background: ph ? `url(${imgUrl(pid, 'thumb', token)}) center/cover` : 'var(--surface)' }} />
                            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{ph?.title ?? `Print ${i + 1}`}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Print {i + 1} · {pr.size}</span></span>
                          </button>
                          {canReview && rateRow(pid, 46, 20)}
                        </div>
                      );
                    })}
                    {canReview && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {origin !== undefined && others.length > 0 && <button onClick={() => setPicking(origin)} style={{ minHeight: 36, fontSize: 13, color: 'var(--text2)' }}>Swap photo…</button>}
                        {pr.frame && <button onClick={() => setFraming(i)} style={{ minHeight: 36, fontSize: 13, color: 'var(--text2)' }}>Frame colour…</button>}
                        {kept && <button onClick={() => p.swap(origin, null)} style={{ minHeight: 36, fontSize: 13, color: 'var(--text2)', }}>Put original back</button>}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
            {d.allowDownload && <button onClick={p.download} disabled={!!p.dl && !p.dl.ready} style={{ alignSelf: 'flex-start', height: 44, padding: '0 18px', borderRadius: 999, fontSize: 14, boxShadow: ring }}>{p.dl ? (p.dl.ready ? `${p.dl.total} files sent to your downloads` : `Downloading ${p.dl.done} of ${p.dl.total}…`) : 'Download originals'}</button>}
            {canReview && d.layout && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => withName(() => p.openLayout())} style={{ height: 44, padding: '0 16px', borderRadius: 999, fontSize: 14, boxShadow: ring }}>{p.layoutSent ? 'Suggest a change again' : 'Suggest a different layout…'}</button>
                {p.layoutSent && <span role="status" style={{ fontSize: 12, color: 'var(--muted)' }}>Sent. Thank you.</span>}
              </div>
            )}
            {p.sugErr && <p className="reason" role="alert">{p.sugErr}</p>}
          </div>
        ) : (
          <div style={{ padding: '18px 20px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 40 }}>{lockup}<Who name={reviewer} /></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 14 }}>
              <h1 style={{ font: `400 52px/.95 ${serif}`, margin: 0, textWrap: 'balance' as never, overflowWrap: 'anywhere' }}>{d.name}</h1>
              {d.description && <p style={{ margin: '2px 0 0', font: `italic 400 21px/1.3 ${serif}`, color: 'var(--text2)', textWrap: 'pretty' as never }}>{d.description}</p>}
              <span style={{ fontSize: 12.5, color: 'var(--faint)' }}>{expiry}</span>
            </div>
            {d.allowDownload && (
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 14, padding: 18, borderRadius: 14, background: 'var(--surface)', overflow: 'hidden' }}>
                {photos[0] && <div aria-hidden style={{ position: 'absolute', inset: -40, background: `url(${imgUrl(photos[0].id, 'thumb', token)}) center/cover`, filter: 'var(--home-review-image-filter)', opacity: 'var(--home-review-image-opacity)' as never }} />}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: 'var(--btn-bg)', color: 'var(--btn-fg)', display: 'grid', placeItems: 'center' }}><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg></span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}><span style={{ font: `400 26px/1.05 ${serif}` }}>Download all {photos.length}</span><span style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--muted)' }}>Full-size originals, one file after another. {owner === 'them' ? 'They allowed' : `${owner} allowed`} downloads on this link.</span></div>
                </div>
                <button onClick={p.download} disabled={!!p.dl && !p.dl.ready} style={{ position: 'relative', height: 48, borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 15, textAlign: 'center' }}>{p.dl ? (p.dl.ready ? `${p.dl.total} files sent to your downloads` : `Downloading ${p.dl.done} of ${p.dl.total}…`) : 'Download originals'}</button>
                {p.dl && !p.dl.ready && <button onClick={p.cancelDl} style={{ position: 'relative', minHeight: 32, fontSize: 13, color: 'var(--text2)' }}>Cancel</button>}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--hair)', padding: '14px 0 12px' }}>
              {canReview ? (
                <div role="tablist" aria-label="Show" style={{ flex: 1, display: 'flex', gap: 2, padding: 3, borderRadius: 999, background: 'var(--surface)' }}><SegSlider />
                  {([['all', 'All', photos.length], ['todo', 'To rate', photos.length - ratedCount], ['rated', 'Rated', ratedCount]] as const).map(([k, l, n]) => (
                    <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, height: 34, borderRadius: 999, background: filter === k ? 'var(--btn-bg)' : 'transparent', color: filter === k ? 'var(--btn-fg)' : 'var(--text2)', fontSize: 13, whiteSpace: 'nowrap' }}>{l}<span style={{ font: `400 10.5px ${mono}`, color: filter === k ? 'var(--btn-fg)' : 'var(--faint)', opacity: filter === k ? 0.6 : 1 }}>{n}</span></button>
                  ))}
                </div>
              ) : <span style={{ font: `400 22px ${serif}` }}>All photographs</span>}
            </div>
          </div>
        )}
      </div>

      <div className="sm-right" style={{ minWidth: 0, paddingBottom: 200 }}>
        {!f && (
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ columns: 2, columnGap: 4 }}>
              {tiles.map((x) => {
                const r = RATINGS.find((q) => q.value === ratings[x.id]);
                return (
                  <button key={x.id} onClick={() => { const at = order.findIndex((o) => o.id === x.id); if (at >= 0) { setLook(at); setLookText(''); } }} aria-label={x.title} style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: String(x.ar), margin: '0 0 4px', breakInside: 'avoid', borderRadius: 4, background: `url(${imgUrl(x.id, 'thumb', token)}) center/cover var(--surface)` }}>
                    {r && <span style={{ position: 'absolute', left: 6, bottom: 6, height: 24, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 9px 0 7px', borderRadius: 999, background: 'rgba(0,0,0,.62)', color: '#efede8', fontSize: 11.5 }}><span style={{ fontSize: 14, lineHeight: 1 }}>{r.emoji}</span>{r.label}</span>}
                  </button>
                );
              })}
            </div>
            {tiles.length === 0 && <div style={{ margin: '12px 0 0', padding: 24, borderRadius: 12, background: 'var(--surface)', fontSize: 13.5, color: 'var(--muted)' }}>{filter === 'rated' ? 'Nothing rated yet.' : 'All rated. Thank you.'}</div>}
          </div>
        )}
        {canReview && (
          <div style={{ padding: '28px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ font: `500 11px ${mono}`, letterSpacing: '.08em', color: 'var(--faint)' }}>A note for {owner}</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="What do you think?" aria-label="Note" style={{ width: '100%', boxSizing: 'border-box', resize: 'none', border: 0, outline: 'none', borderRadius: 12, padding: '12px 14px', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 15, fontFamily: 'inherit' }} />
            <button onClick={sendNote} disabled={!note.trim()} style={{ alignSelf: 'flex-end', height: 44, padding: '0 20px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14, opacity: note.trim() ? 1 : 0.45 }}>Send</button>
          </div>
        )}
      </div>

      {f ? ((p.dirty || p.sendNote || p.dl) && (
        <div className="sm-bar" style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 5, background: 'var(--page)', boxShadow: '0 -1px 0 var(--hair)', padding: '12px 16px max(16px, env(safe-area-inset-bottom))' }}>
          {p.dl && (
            <div role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: 'var(--text2)', marginBottom: 10 }}>
              <span>{p.dl.ready ? `${p.dl.total} files sent to your downloads.` : `Downloading ${p.dl.done} of ${p.dl.total}…`}</span>
              {!p.dl.ready && <button onClick={p.cancelDl} style={{ minHeight: 32, color: 'var(--text)' }}>Cancel</button>}
            </div>
          )}
          {canReview && (p.dirty || p.sendNote) && (
            <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 12.5, color: p.sendNote && !p.sendNote.ok ? 'var(--danger)' : 'var(--text2)' }}>
              {p.dirty && <button onClick={p.sendBack} disabled={p.sending} style={{ flex: 1, height: 46, borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 14.5 }}>{p.sending ? 'Sending…' : `Send to ${owner} · ${p.changes}`}</button>}
              {p.dirty && <button onClick={p.discard} style={{ minHeight: 44, padding: '0 8px', color: 'var(--text2)', }}>Undo changes</button>}
              {p.sendNote && <span style={{ flex: '1 1 100%' }}>{p.sendNote.text}</span>}
            </div>
          )}
        </div>
      )) : canReview && look === null && (
        <div className="sm-bar" style={{ position: 'fixed', left: 12, right: 12, bottom: 24, zIndex: 38, borderRadius: 22, background: 'var(--raised2)', boxShadow: 'var(--float)', padding: '10px 10px 10px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 14 }}>{ratedCount} of {photos.length} rated <span style={{ color: 'var(--ok)', fontSize: 12.5 }}>✓ Saved</span></span>
            <span style={{ height: 3, borderRadius: 2, background: 'var(--hair)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.round((ratedCount / Math.max(1, photos.length)) * 100)}%`, background: 'var(--text)' }} /></span>
          </div>
          {sentAll ? <span role="status" style={{ height: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', fontSize: 13.5, color: 'var(--ok)' }}>✓ Done</span>
            : <button onClick={() => { if (!ratedCount) { flash('Rate a photograph first'); return; } withName(() => { setSentAll(true); flash(`Thank you, ${owner} has your ratings`); }); }} style={{ height: 44, padding: '0 18px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 14 }}>Finish</button>}
        </div>
      )}

      {drag && <img src={imgUrl(drag.pid, 'thumb', token)} alt="" style={{ position: 'fixed', left: drag.x, top: drag.y, height: 72, transform: 'translate(-50%, -110%)', borderRadius: 4, zIndex: 80, pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.6)' }} />}
      {toast && <div role="status" style={{ position: 'fixed', left: '50%', top: 58, transform: 'translateX(-50%)', zIndex: 95, maxWidth: 'calc(100vw - 32px)', padding: '9px 16px', borderRadius: 999, background: 'var(--raised2)', boxShadow: 'var(--float)', fontSize: 13, color: 'var(--text)', textAlign: 'center' }}>{toast}</div>}

      {lp && look !== null && (
        <div role="dialog" aria-label="Photograph" style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'var(--review)', color: '#efede8', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'max(14px, env(safe-area-inset-top)) 14px 0' }}>
            <button onClick={() => setLook(null)} aria-label="Close" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,237,232,.1)', display: 'grid', placeItems: 'center', fontSize: 15 }}>✕</button>
            <span style={{ font: `italic 400 20px/1 ${serif}` }}>{look + 1} / {order.length}</span>
            {d.allowDownload
              ? <a href={`/api/s/${token}/photos/${lp.id}/original`} download aria-label="Download original" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(239,237,232,.1)', color: '#efede8', display: 'grid', placeItems: 'center' }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg></a>
              : <span style={{ width: 40 }} />}
          </div>
          <div className="sm-lb" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div onPointerDown={(e) => { swipe.current = e.clientX; }} onPointerUp={(e) => { const dx = e.clientX - swipe.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}
              style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pan-y' }}>
              <img src={imgUrl(lp.id, 'preview', token)} alt={lp.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
            </div>
            <div className="sm-lbp" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 14, padding: '12px 16px max(30px, env(safe-area-inset-bottom))' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '0 4px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                  <span style={{ font: `400 26px/1.05 ${serif}`, overflowWrap: 'anywhere' }}>{lp.title}</span>
                  <span style={{ fontSize: 12.5, color: '#8f8c86' }}>{slot >= 0 ? `Print ${slot + 1} · ${sizeLabel(wallPrints[slot])}` : f ? 'Candidate' : ''}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => go(-1)} aria-label="Previous" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,237,232,.1)', display: 'grid', placeItems: 'center', opacity: look > 0 ? 1 : 0.3 }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg></button>
                  <button onClick={() => go(1)} aria-label="Next" style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(239,237,232,.1)', display: 'grid', placeItems: 'center', opacity: look < order.length - 1 ? 1 : 0.3 }}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5 10.5 8 6 12.5" /></svg></button>
                </div>
              </div>
              {canReview && slot >= 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => setPicking(photosOf(wallPrints[slot])[0])} style={{ flexShrink: 0, height: 40, padding: '0 16px', borderRadius: 999, fontSize: 13.5, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.2)' }}>Swap photo…</button>
                  {wallPrints[slot].frame && <button onClick={() => setFraming(slot)} style={{ flexShrink: 0, height: 40, padding: '0 16px', borderRadius: 999, fontSize: 13.5, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.2)' }}>Frame colour…</button>}
                  {sugOf && (
                    <>
                      <img src={imgUrl(sugOf.id, 'thumb', token)} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#a8a59f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>In your version: {sugOf.title}</span>
                      <button onClick={() => p.swap(photosOf(wallPrints[slot])[0], null)} style={{ flexShrink: 0, minHeight: 44, fontSize: 13, color: '#a8a59f', }}>Put original back</button>
                    </>
                  )}
                </div>
              )}
              {canReview && (
                <>
                  <div role="group" aria-label="Rate this photograph" style={{ display: 'flex', gap: 4, padding: 5, borderRadius: 22, background: '#1e1e1d' }}>
                    {RATINGS.map((r) => {
                      const on = ratings[lp.id] === r.value;
                      return (
                        <button key={r.value} onClick={() => { setSentAll(false); rate(lp.id, r.value); if (!f && look < order.length - 1) setTimeout(() => go(1), 280); }} aria-pressed={on} aria-label={`Rate ${r.label}`}
                          style={{ flex: 1, height: 64, borderRadius: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: on ? '#efede8' : 'transparent', color: on ? '#0d0d0d' : '#a8a59f' }}>
                          <span style={{ fontSize: 24, lineHeight: 1 }}>{r.emoji}</span><span style={{ fontSize: 11 }}>{r.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={lookText} onChange={(e) => setLookText(e.target.value)} onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }} maxLength={1000} placeholder="Comment on this photograph…" aria-label="Comment on this photograph"
                      style={{ flex: 1, minWidth: 0, height: 44, background: '#161615', border: 0, borderRadius: 999, padding: '0 16px', fontSize: 15, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.14)', outline: 'none', color: 'inherit', fontFamily: 'inherit' }} />
                    <button onClick={() => { if (lookText.trim()) sendText(lp.id, lookText, () => { setLookText(''); flash(`Sent to ${owner}`); }); }} style={{ flexShrink: 0, height: 44, padding: '0 16px', borderRadius: 999, fontSize: 14, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.2)', opacity: lookText.trim() ? 1 : 0.45 }}>Send</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {picking !== null && (() => {
        const idx = wallPrints.findIndex((pr) => photosOf(pr).includes(picking)), pr = wallPrints[idx];
        return (
          <Sheet title="Suggest a different photo" sub={`${pr ? `For print ${idx + 1}, ${sizeLabel(pr)} ${pr.orientation}. ` : ''}Shown on the wall now. Sent when you tap Send to ${owner}.`} onClose={() => setPicking(null)}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {others.filter((x) => p.mine[x.id] === undefined).map((x) => {
                const wrong = !!pr && (pr.orientation === 'portrait') !== (x.ar < 1);
                return (
                  <button key={x.id} onClick={() => { p.swap(picking, x.id); setPicking(null); flash(`Changed print ${idx + 1}. Send it back when you are ready.`); }} aria-label={`Suggest ${x.title}`}
                    style={{ flexShrink: 0, height: 96, aspectRatio: String(x.ar), borderRadius: 3, position: 'relative', overflow: 'hidden', opacity: wrong ? 0.55 : 1 }}>
                    <img src={imgUrl(x.id, 'thumb', token)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {wrong && <span style={{ position: 'absolute', left: 4, right: 4, bottom: 4, fontSize: 11, lineHeight: 1.25, background: 'rgba(0,0,0,.72)', color: '#efede8', padding: '3px 5px', borderRadius: 3, textAlign: 'left' }}>{x.ar < 1 ? 'Portrait' : 'Landscape'}</span>}
                  </button>
                );
              })}
            </div>
          </Sheet>
        );
      })()}

      {framing !== null && wallPrints[framing]?.frame && (() => {
        const pr = wallPrints[framing], cur = p.frames[pr.id] ?? pr.frame!.color;
        return (
          <Sheet title={`Frame for print ${framing + 1}`} sub={`Now ${pr.frame!.color}. Try another colour on the wall.`} onClose={() => { if (p.frames[pr.id]) flash(`Changed print ${framing + 1} to a ${p.frames[pr.id]} frame. Send it back when you are ready.`); setFraming(null); }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {Object.keys(SWATCH).map((c) => (
                <button key={c} onClick={() => p.setFrame(pr.id, c === pr.frame!.color ? null : c)} aria-pressed={cur === c} aria-label={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 48, fontSize: 12, color: cur === c ? 'var(--text)' : 'var(--text2)' }}>
                  <span style={{ width: 44, height: 44, borderRadius: '50%', background: SWATCH[c], boxShadow: cur === c ? '0 0 0 2px var(--raised2), 0 0 0 4px var(--text)' : 'inset 0 0 0 1px var(--outline)' }} />
                  {c[0].toUpperCase() + c.slice(1)}
                </button>
              ))}
            </div>
            {p.frames[pr.id] && <button onClick={() => p.setFrame(pr.id, null)} style={{ alignSelf: 'flex-start', minHeight: 44, fontSize: 13, color: 'var(--text2)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Back to {pr.frame!.color}</button>}
          </Sheet>
        );
      })()}
    </div>
  );
}
