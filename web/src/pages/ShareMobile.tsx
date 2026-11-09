import { useEffect, useRef, useState } from 'react';
import { RATINGS, fmtDate } from '../data';
import { Mark } from '../components/bits';
import { Wall, type Pic } from '../components/CompositionWall';
import { PAD, WALL_BG, frameOf, metres, photosOf, sizeLabel, type Layout, type Print } from '../layout';
import { imgUrl } from '../api';

export type SharedPhoto = { id: number; title: string; ar: number; n: number };
type Viewer = { name: string } | null | undefined;
const mono = "'IBM Plex Mono',monospace";
const serif = "'Instrument Serif',Georgia,serif";
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67' } as const;
const ring = 'inset 0 0 0 1px rgba(255,255,255,.2)';
const SWATCH: Record<string, string> = { black: '#151514', white: '#e9e7e1', oak: '#b08a5e', walnut: '#5b3f2c', silver: '#a3a3a0' };

/** Whether the page should use the phone layout: a narrow screen, or a phone held sideways. */
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
  d: { name: string; description: string; allowReview: boolean; allowDownload: boolean; expiresAt: string | null; layout?: Layout | null; viewer?: Viewer };
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

  return (
    <div className="sm-cols" style={{ minHeight: '100dvh', background: '#0d0d0d', overflowX: 'clip' }}>
      <div className="sm-left" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 0' }}>
          <span className="lockup" style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Mark />Frames</span>
          <span style={{ fontSize: 12, color: '#6f6c67' }}>{d.viewer ? 'Shared with you' : 'Shared with you'}</span>
        </header>
        <div style={{ padding: '18px 20px 0' }}>
          <h1 style={{ font: `400 38px/1.02 ${serif}`, margin: '0 0 10px', textWrap: 'pretty' as never }}>{d.name}</h1>
          <div className="sm-meta">
            {d.description && <p style={{ fontSize: 14, color: '#a8a59f', margin: '0 0 8px' }}>{d.description}</p>}
            <p style={{ fontSize: 12.5, color: '#8f8c86', margin: 0 }}>{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'} shared with you{d.expiresAt && ` · link works until ${fmtDate(d.expiresAt, { day: 'numeric', month: 'short', year: 'numeric' })}`}</p>
          </div>
        </div>
        {f && (
          <>
            <div style={{ padding: '22px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12 }}>
              <span style={eyebrow}>{wallPrints.length === 1 ? 'The print' : `The ${wallPrints.length} prints`}</span>
              <span style={{ font: `400 11.5px ${mono}`, color: '#8f8c86' }}>{metres(f.w)} × {metres(f.h)} m</span>
            </div>
            <div style={{ position: 'relative', margin: 0, background: WALL_BG, padding: '18px 8px 68px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {canReview && d.layout && (
                <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, zIndex: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => withName(() => p.openLayout())} style={{ height: 34, padding: '0 14px', borderRadius: 999, fontSize: 13, fontWeight: 500, background: 'rgba(13,13,13,.6)', boxShadow: ring }}>{p.layoutSent ? 'Suggest a change again' : 'Suggest a change'}</button>
                  {p.layoutSent && <span role="status" style={{ fontSize: 12, color: '#8f8c86' }}>Sent. Thank you.</span>}
                </div>
              )}
              <Wall compact fill prints={shown} mode="free" editing={false} sel={over ?? -1} photos={wallPhotos} over={over} locked share={token} onSelect={openPrint} onEdit={() => undefined} onMoved={() => undefined} onOver={() => undefined} onDropPhoto={() => undefined} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 20px 0', fontSize: 12, color: '#6f6c67' }}>
              <span>Tap a print to look closer{canReview ? ', rate it or swap it' : ''}.</span>
              <span style={{ fontFamily: mono, whiteSpace: 'nowrap', flex: 'none' }}>1 square = 10 cm</span>
            </div>
          </>
        )}
      </div>

      <div className="sm-right" style={{ minWidth: 0, paddingBottom: 200 }}>
        <div style={{ padding: '28px 20px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
            <span style={eyebrow}>{f ? 'Other candidates' : 'Photographs'}</span>
            <span style={{ fontSize: 12, color: '#6f6c67' }}>{(f ? others : photos).length}</span>
          </div>
          {canReview && f && others.length > 0 && <p style={{ fontSize: 12.5, color: '#8f8c86', margin: '-4px 0 12px' }}>Hold one, then drag it onto a print to try it there.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(f ? others : photos).map((x) => (
              <button key={x.id} onClick={() => { if (suppress.current) return; const at = order.findIndex((o) => o.id === x.id); if (at >= 0) { setLook(at); setLookText(''); } }} onPointerDown={down(x.id)} onContextMenu={(e) => e.preventDefault()} aria-label={`Open ${x.title}`}
                style={{ flex: 'none', height: 64, aspectRatio: String(x.ar), borderRadius: 3, overflow: 'hidden', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' as never, opacity: drag?.pid === x.id ? 0.4 : 1 }}>
                <img src={imgUrl(x.id, 'thumb', token)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
              </button>
            ))}
          </div>
          {p.sugErr && <p className="reason" role="alert" style={{ marginTop: 10 }}>{p.sugErr}</p>}
        </div>
        {canReview && (
          <div style={{ padding: '32px 20px 0' }}>
            <div style={{ ...eyebrow, marginBottom: 10 }}>A comment for the person who shared this</div>
            <textarea value={comment} onChange={(e) => { setComment(e.target.value); setCommentNote(''); }} rows={3} maxLength={1000} placeholder="Say what you think of the whole set…" aria-label="Comment on the whole set"
              style={{ width: '100%', background: '#161615', border: 0, borderRadius: 10, padding: '12px 14px', fontSize: 15, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)', outline: 'none', resize: 'none', color: 'inherit', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 10 }}>
              <span role="status" style={{ fontSize: 12.5, color: '#8f8c86' }}>{commentNote}</span>
              <button onClick={() => { if (comment.trim()) sendText(null, comment, () => { setComment(''); setCommentNote('Sent. Only the person who shared this will see it.'); }); }} style={{ flex: 'none', minHeight: 44, padding: '0 20px', borderRadius: 999, fontSize: 14, boxShadow: ring, opacity: comment.trim() ? 1 : 0.45 }}>Send</button>
            </div>
          </div>
        )}
      </div>

      <div className="sm-bar" style={{ position: 'fixed', bottom: 0, right: 0, zIndex: 5, background: 'rgba(13,13,13,.96)', boxShadow: '0 -1px 0 rgba(255,255,255,.08)', backdropFilter: 'blur(10px)', padding: '12px 16px max(16px, env(safe-area-inset-bottom))' }}>
        {p.dl && (
          <div role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, color: '#a8a59f', marginBottom: 10 }}>
            <span>{p.dl.ready ? `${p.dl.total} files sent to your downloads.` : `Downloading ${p.dl.done} of ${p.dl.total}…`}</span>
            {!p.dl.ready && <button onClick={p.cancelDl} style={{ minHeight: 32, color: '#efede8' }}>Cancel</button>}
          </div>
        )}
        {canReview && (p.dirty || p.sendNote) && (
          <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10, fontSize: 12.5, color: p.sendNote && !p.sendNote.ok ? 'oklch(0.78 0.11 35)' : '#a8a59f' }}>
            {p.dirty && <button onClick={p.sendBack} disabled={p.sending} style={{ flex: 1, height: 46, borderRadius: 999, background: '#efede8', color: '#0d0d0d', fontWeight: 500, fontSize: 14.5 }}>{p.sending ? 'Sending…' : `Send back to the photographer · ${p.changes}`}</button>}
            {p.dirty && <button onClick={p.discard} style={{ minHeight: 44, padding: '0 8px', color: '#a8a59f', textDecoration: 'underline', textUnderlineOffset: 3 }}>Discard</button>}
            {p.sendNote && <span style={{ flex: '1 1 100%' }}>{p.sendNote.text}</span>}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {canReview && <button onClick={() => withName(() => { setLook(unrated >= 0 ? unrated : 0); setLookText(''); })} style={{ flex: 1, height: 50, borderRadius: 999, background: '#efede8', color: '#0d0d0d', fontWeight: 500, fontSize: 15 }}>{rated === 0 ? 'Review these' : unrated >= 0 ? `Keep reviewing · ${rated} of ${order.length}` : 'Review again'}</button>}
          {d.allowDownload && <button onClick={p.download} disabled={!!p.dl && !p.dl.ready} style={{ flex: canReview ? '0 0 auto' : 1, height: 50, borderRadius: 999, padding: '0 20px', fontSize: 15, fontWeight: 500, background: canReview ? 'transparent' : '#efede8', color: canReview ? '#efede8' : '#0d0d0d', boxShadow: canReview ? ring : 'none' }}>Download</button>}
        </div>
        {canReview && reviewer.trim() && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, fontSize: 12.5, color: '#8f8c86', marginTop: 8 }}>
            as {reviewer.trim()}{!d.viewer && <> · <button onClick={p.changeName} style={{ color: '#a8a59f', textDecoration: 'underline', textUnderlineOffset: 3 }}>change</button></>}
          </div>
        )}
      </div>

      {drag && <img src={imgUrl(drag.pid, 'thumb', token)} alt="" style={{ position: 'fixed', left: drag.x, top: drag.y, height: 72, transform: 'translate(-50%, -110%)', borderRadius: 4, zIndex: 80, pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.6)' }} />}
      {toast && <div role="status" style={{ position: 'fixed', left: 16, right: 16, bottom: 130, zIndex: 90, background: '#efede8', color: '#0d0d0d', borderRadius: 12, padding: '10px 14px', fontSize: 13.5, textAlign: 'center' }}>{toast}</div>}

      {lp && look !== null && (
        <div role="dialog" aria-label="Photograph" style={{ position: 'fixed', inset: 0, zIndex: 20, background: '#000', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 12px 0 20px' }}>
            <span style={{ font: `400 13px ${mono}` }}>{look + 1} <span style={{ color: '#6f6c67' }}>/ {order.length}</span></span>
            <button onClick={() => setLook(null)} style={{ minHeight: 44, padding: '0 10px', fontSize: 14, color: '#a8a59f' }}>Close</button>
          </div>
          <div className="sm-lb" style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <div onPointerDown={(e) => { swipe.current = e.clientX; }} onPointerUp={(e) => { const dx = e.clientX - swipe.current; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); }}
              style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'pan-y' }}>
              <img src={imgUrl(lp.id, 'preview', token)} alt={lp.title} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
            </div>
            <div className="sm-lbp" style={{ flex: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12, padding: '12px 16px max(16px, env(safe-area-inset-bottom))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '0 4px' }}>
                <span style={{ font: `400 22px/1.1 ${serif}` }}>{lp.title}</span>
                <span style={{ fontSize: 12, color: '#8f8c86', flex: 'none' }}>{slot >= 0 ? `Print ${slot + 1} · ${sizeLabel(wallPrints[slot])}` : 'Candidate'}</span>
              </div>
              {canReview && slot >= 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => setPicking(photosOf(wallPrints[slot])[0])} style={{ flex: 'none', height: 44, padding: '0 18px', borderRadius: 999, fontSize: 14, boxShadow: ring }}>Swap photo</button>
                  {wallPrints[slot].frame && <button onClick={() => setFraming(slot)} style={{ flex: 'none', height: 44, padding: '0 18px', borderRadius: 999, fontSize: 14, boxShadow: ring }}>Frame colour</button>}
                  {sugOf && (
                    <>
                      <img src={imgUrl(sugOf.id, 'thumb', token)} alt="" style={{ width: 24, height: 24, borderRadius: 3, objectFit: 'cover', flex: 'none' }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#a8a59f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>In your version: {sugOf.title}</span>
                      <button onClick={() => p.swap(photosOf(wallPrints[slot])[0], null)} style={{ flex: 'none', minHeight: 44, fontSize: 13, color: '#a8a59f', textDecoration: 'underline', textUnderlineOffset: 3 }}>Undo</button>
                    </>
                  )}
                </div>
              )}
              {canReview && (
                <>
                  <div role="group" aria-label="Rate this photograph" style={{ display: 'flex', gap: 6 }}>
                    {RATINGS.map((r) => {
                      const on = ratings[lp.id] === r.value;
                      return (
                        <button key={r.value} onClick={() => rate(lp.id, r.value)} aria-label={`${r.value}, ${r.label}`} aria-pressed={on}
                          style={{ flex: 1, height: 54, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: on ? '#efede8' : 'transparent', color: on ? '#0d0d0d' : '#efede8', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.16)' }}>
                          <span style={{ fontSize: 19, lineHeight: 1 }}>{r.emoji}</span><span style={{ font: `500 11px ${mono}` }}>{r.value}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input value={lookText} onChange={(e) => setLookText(e.target.value)} onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }} maxLength={1000} placeholder="Comment on this photograph…" aria-label="Comment on this photograph"
                      style={{ flex: 1, minWidth: 0, height: 44, background: '#161615', border: 0, borderRadius: 999, padding: '0 16px', fontSize: 15, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)', outline: 'none', color: 'inherit', fontFamily: 'inherit' }} />
                    <button onClick={() => { if (lookText.trim()) sendText(lp.id, lookText, () => { setLookText(''); flash('Sent. Only the person who shared this will see it.'); }); }} style={{ flex: 'none', height: 44, padding: '0 16px', borderRadius: 999, fontSize: 14, boxShadow: ring, opacity: lookText.trim() ? 1 : 0.45 }}>Send</button>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '-4px -8px 0' }}>
                <button onClick={() => go(-1)} aria-label="Previous" style={{ width: 56, height: 44, fontSize: 26, color: '#a8a59f' }}>‹</button>
                <span style={{ fontSize: 12, color: '#6f6c67' }}>Swipe for the next</span>
                <button onClick={() => go(1)} aria-label="Next" style={{ width: 56, height: 44, fontSize: 26, color: '#a8a59f' }}>›</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {picking !== null && (() => {
        const idx = wallPrints.findIndex((pr) => photosOf(pr).includes(picking)), pr = wallPrints[idx];
        return (
          <div onClick={(e) => e.target === e.currentTarget && setPicking(null)} style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div role="dialog" aria-label="Suggest another" style={{ width: '100%', maxHeight: '82%', overflowY: 'auto', background: '#161615', borderRadius: '20px 20px 0 0', padding: '10px 20px 34px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)', margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <h2 style={{ font: `400 28px/1.1 ${serif}`, margin: 0 }}>Suggest another</h2>
                <button onClick={() => setPicking(null)} style={{ minHeight: 44, fontSize: 14, color: '#a8a59f' }}>Close</button>
              </div>
              <p style={{ fontSize: 13, color: '#8f8c86', margin: '4px 0 16px' }}>{pr ? `For print ${idx + 1}, ${sizeLabel(pr)} ${pr.orientation}. ` : ''}It goes on the wall here; it is only sent when you send it back.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {others.filter((x) => p.mine[x.id] === undefined).map((x) => {
                  const wrong = !!pr && (pr.orientation === 'portrait') !== (x.ar < 1);
                  return (
                    <button key={x.id} onClick={() => { p.swap(picking, x.id); setPicking(null); flash(`Changed print ${idx + 1}. Send it back when you are ready.`); }} aria-label={`Suggest ${x.title}`}
                      style={{ flex: 'none', height: 96, aspectRatio: String(x.ar), borderRadius: 3, position: 'relative', overflow: 'hidden', opacity: wrong ? 0.55 : 1 }}>
                      <img src={imgUrl(x.id, 'thumb', token)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {wrong && <span style={{ position: 'absolute', left: 4, right: 4, bottom: 4, fontSize: 11, lineHeight: 1.25, background: 'rgba(0,0,0,.72)', padding: '3px 5px', borderRadius: 3, textAlign: 'left' }}>{x.ar < 1 ? 'Portrait' : 'Landscape'}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {framing !== null && wallPrints[framing]?.frame && (() => {
        const pr = wallPrints[framing], cur = p.frames[pr.id] ?? pr.frame!.color;
        return (
          <div onClick={(e) => e.target === e.currentTarget && setFraming(null)} style={{ position: 'fixed', inset: 0, zIndex: 30, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div role="dialog" aria-label="Frame colour" style={{ width: '100%', overflowY: 'auto', background: '#161615', borderRadius: '20px 20px 0 0', padding: '10px 20px 34px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,.2)', margin: '0 auto 16px' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <h2 style={{ font: `400 28px/1.1 ${serif}`, margin: 0 }}>Frame for print {framing + 1}</h2>
                <button onClick={() => { if (p.frames[pr.id]) flash(`Changed print ${framing + 1} to a ${p.frames[pr.id]} frame. Send it back when you are ready.`); setFraming(null); }} style={{ minHeight: 44, fontSize: 14, color: '#a8a59f' }}>Done</button>
              </div>
              <p style={{ fontSize: 13, color: '#8f8c86', margin: '4px 0 18px' }}>It is {pr.frame!.color} now. Pick another colour to try it on the wall. It is only sent when you send it back.</p>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {Object.keys(SWATCH).map((c) => (
                  <button key={c} onClick={() => p.setFrame(pr.id, c === pr.frame!.color ? null : c)} aria-pressed={cur === c} aria-label={c} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, minWidth: 48, fontSize: 12, color: cur === c ? '#efede8' : '#a8a59f' }}>
                    <span style={{ width: 44, height: 44, borderRadius: '50%', background: SWATCH[c], boxShadow: cur === c ? '0 0 0 2px #161615, 0 0 0 4px #efede8' : 'inset 0 0 0 1px rgba(255,255,255,.2)' }} />
                    {c[0].toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
              {p.frames[pr.id] && <button onClick={() => p.setFrame(pr.id, null)} style={{ minHeight: 44, marginTop: 10, fontSize: 13, color: '#a8a59f', textDecoration: 'underline', textUnderlineOffset: 3 }}>Back to {pr.frame!.color}</button>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
