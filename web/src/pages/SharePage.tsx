import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RATINGS, fmtDate } from '../data';
import { Fit, Img, Mark, useKey } from '../components/bits';
import { PrintModal, Wall } from '../components/CompositionWall';
import { LayoutSuggest } from '../components/LayoutSuggest';
import { ShareMobile, usePhone } from './ShareMobile';
import { HumanCheck } from '../components/HumanCheck';
import { FRAMES, WALL_BG, arrange, bounds, metres, newPrintId, photosOf, sizeLabel, type Layout, type Print } from '../layout';
import type { Target } from '../target';
import { imgUrl } from '../api';
import { PinGate } from './Auth';
import { GuestEditor } from '../screens/GuestEditor';

type G = { id: number; title: string; ar: number; n: number };
type Shared = { askName?: boolean; owner?: string; allowSuggest?: boolean; kind: 'collection' | 'shoot'; chosenIds?: number[]; target?: Target | null; layout?: Layout | null; name: string; description: string; allowDownload: boolean; allowReview: boolean; expiresAt: string | null; photos: G[]; viewer?: { name: string; role: string } | null; signIn?: { id: string; name: string }[] };

/** "3 × A3 · 1.6 × 0.6 m": what the wall is made of and how much room it takes. */
const spanText = (ps: Print[]) => {
  if (!ps.length) return '';
  const c = new Map<string, number>();
  ps.forEach((p) => c.set(p.size, (c.get(p.size) || 0) + 1));
  const b = bounds(ps);
  return `${[...c].map(([k, n]) => (n > 1 ? `${n} × ${k}` : k)).join(', ')} · ${metres(b.w)} × ${metres(b.h)} m`;
};

/** What someone with a share link sees. It never calls the signed-in part of the app. */
export function SharePage() {
  const { token = '' } = useParams();
  const [d, setD] = useState<Shared | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null); // the Turnstile site key, when the link asks to be shown a person is here
  const [tries, setTries] = useState(0);
  const [pin, setPin] = useState<{ lockedFor: number } | null>(null); // the link has a PIN this device has not entered yet
  const [view, setView] = useState<'grid' | 'review'>('grid');
  const [look, setLook] = useState<number | null>(null);
  const nameKey = `frames-guest-name-${token}`;
  const [typed, setReviewer] = useState(() => { try { return localStorage.getItem(nameKey) ?? ''; } catch { return ''; } });
  const reviewer = d?.viewer?.name ?? typed; // someone signed in is known by their account's name
  const [asking, setAsking] = useState<null | ((name: string) => void)>(null); // the name box, and what to do once there is a name
  const setName = (n: string) => { setReviewer(n); try { localStorage.setItem(nameKey, n); } catch { /* the name is only remembered for next time */ } };
  // Reviewing and suggesting are done under a name, so the photographer can tell guests apart: ask once, remember it on this device.
  const withName = (then: (name: string) => void) => { if (reviewer.trim()) then(reviewer.trim()); else if (d && d.askName === false) then('Guest'); else setAsking(() => then); };
  const [dl, setDl] = useState<{ done: number; total: number; ready: boolean } | null>(null);
  const [over, setOver] = useState<number | null>(null); // the print a candidate is being dragged over
  const [picking, setPicking] = useState<number | null>(null); // the print a suggestion is being chosen for
  const [selPrint, setSelPrint] = useState(0);
  const [mine, setMine] = useState<Record<number, number>>({}); // print -> the candidate this guest suggested
  const [sugErr, setSugErr] = useState('');
  // The guest's version of the composition: photographs swapped in and frame colours changed. It lives here, on this page, and is shown on the
  // wall straight away; nothing reaches the photographer until "Send back" (and what was sent can be changed and sent again).
  const [frames, setFrames] = useState<Record<number, string>>({}); // print id -> the frame colour this guest picked
  const [draft, setDraft] = useState<Print[] | null>(null); // the guest's own layout: other sizes, frames, more or fewer prints
  const [fs, setFs] = useState(false);
  const wallBox = useRef<HTMLDivElement>(null);
  const [sentSnap, setSentSnap] = useState('{"m":{},"f":{},"l":null}'); // the version last sent
  const [sending, setSending] = useState(false);
  const [sendNote, setSendNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [relayout, setRelayout] = useState(false); // the layout suggestion box
  const [relayoutSent, setRelayoutSent] = useState(false);
  const cancelled = useRef(false);
  const phone = usePhone(); // a phone gets its own layout, below

  useEffect(() => {
    document.title = 'Shared photographs · Frames';
    fetch(`/api/s/${token}`).then(async (r) => {
      if (r.ok) { setChallenge(null); setPin(null); return setD(await r.json()); }
      const j = await r.json().catch(() => ({}));
      if (r.status === 401 && j.pinRequired) return setPin({ lockedFor: j.lockedFor ?? 0 });
      if (r.status === 403 && j.challenge?.siteKey) return setChallenge(j.challenge.siteKey);
      setGone(j.error ?? 'This link is not available');
    }).catch(() => setGone('Could not load this link'));
  }, [token, tries]);

  // Escape backs out of whatever is on top, even from a comment box (which the other keys ignore): the name box, the swap list, then the photograph.
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (asking) setAsking(null); else if (picking !== null) setPicking(null); else if (look !== null) setLook(null); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [asking, picking, look]);
  useKey((e) => {
    if (look === null || !d) return;
    if (e.key === 'ArrowLeft') setLook((look + d.photos.length - 1) % d.photos.length);
    if (e.key === 'ArrowRight') setLook((look + 1) % d.photos.length);
  }, [look, d]);

  useEffect(() => { if (d?.name) document.title = `${d.name} · Frames`; }, [d?.name]);
  if (gone) return <Shell><h1 className="serif" style={{ fontSize: 44, margin: '12vh 0 12px' }}>This link isn’t available.</h1><p className="t2">{gone}. Ask whoever sent it for a new one.</p></Shell>;
  if (challenge) {
    const pass = async (t: string) => { const r = await fetch(`/api/s/${token}/human`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) }); if (r.ok) setTries((n) => n + 1); };
    return <Shell><h1 className="serif" style={{ fontSize: 44, margin: '12vh 0 12px' }}>One moment.</h1><p className="t2" style={{ marginBottom: 22 }}>Please show that you are a person to open this link.</p><HumanCheck siteKey={challenge} onToken={(t) => void pass(t)} /></Shell>;
  }
  if (pin) return <PinGate token={token} lockedFor={pin.lockedFor} onDone={() => { setPin(null); setTries((t) => t + 1); }} />;
  if (!d) return <Shell><p className="muted">Loading…</p></Shell>;
  const photos = d.photos.map((p) => ({ ...p, share: token }));

  // Straight to the browser's own downloader, in order, so files go to disk untouched.
  const download = async () => {
    cancelled.current = false;
    // Only the photographs in the composition, when there is one.
    const chosen = d.chosenIds ?? [];
    const files = chosen.length ? photos.filter((p) => chosen.includes(p.id)) : photos;
    const pad = String(files.length).length;
    setDl({ done: 0, total: files.length, ready: false });
    for (let i = 0; i < files.length; i++) {
      if (cancelled.current) { setDl(null); return; }
      const a = document.createElement('a');
      a.href = `/api/s/${token}/photos/${files[i].id}/original?n=${i + 1}&pad=${pad}`;
      a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
      setDl({ done: i + 1, total: files.length, ready: false });
      await new Promise((r) => setTimeout(r, 450));
    }
    setDl({ done: files.length, total: files.length, ready: true });
  };

  const prints = (d.chosenIds ?? []).map((id) => photos.find((p) => p.id === id)).filter((p): p is (typeof photos)[number] => !!p);
  const others = photos.filter((p) => !(d.chosenIds ?? []).includes(p.id));
  const showPrints = d.kind === 'collection' && prints.length > 0;
  // Putting a candidate in a print (or taking it back out) only changes this guest's version.
  const swap = (forId: number, photoId: number | null) => {
    setSugErr(''); setSendNote(null);
    setMine((m) => { const c: Record<number, number> = {}; for (const [k, v] of Object.entries(m)) if (v !== photoId) c[Number(k)] = v; if (photoId !== null) c[forId] = photoId; else delete c[forId]; return c; }); // one candidate goes in one print
    setPicking(null);
  };
  const setFrame = (printId: number, colour: string | null) => { setSendNote(null); setFrames((f) => { const c = { ...f }; if (colour === null) delete c[printId]; else c[printId] = colour; return c; }); };
  const changes = Object.keys(mine).length + Object.keys(frames).length + (draft ? 1 : 0);
  const draftNow = JSON.stringify({ m: mine, f: frames, l: draft });
  const dirty = draftNow !== sentSnap;
  const discard = () => { const was = JSON.parse(sentSnap) as { m: Record<number, number>; f: Record<number, string>; l: Print[] | null }; setMine(was.m); setFrames(was.f); setDraft(was.l); setSendNote(null); };
  // Sends what differs from the last send, one suggestion for each, under the guest's name.
  const sendBack = () => withName(async (name) => {
    setSending(true); setSendNote(null);
    const was = JSON.parse(sentSnap) as { m: Record<number, number>; f: Record<number, string>; l: Print[] | null };
    const errs: string[] = [];
    const post = async (path: string, body: object) => { const r = await fetch(`/api/s/${token}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, reviewer: name }) }); if (!r.ok) errs.push((await r.json().catch(() => ({}))).error ?? 'Could not save that'); };
    for (const k of new Set([...Object.keys(was.m), ...Object.keys(mine)])) { const now = mine[Number(k)] ?? null; if (now !== (was.m[Number(k)] ?? null)) await post('suggest', { forId: Number(k), photoId: now }); }
    for (const k of new Set([...Object.keys(was.f), ...Object.keys(frames)])) { const now = frames[Number(k)] ?? null; if (now !== (was.f[Number(k)] ?? null)) await post('frame', { printId: Number(k), color: now }); }
    if (draft && JSON.stringify(draft) !== JSON.stringify(was.l)) await post('layout', { layout: { mode: 'free', prints: draft }, note: '' });
    setSending(false);
    if (errs.length) setSendNote({ ok: false, text: errs[0] }); else { setSentSnap(draftNow); setSendNote({ ok: true, text: 'Sent. Thank you.' }); }
  });
  const wallPrints: Print[] = d.layout ? (d.layout.mode === 'free' ? d.layout.prints : arrange(d.layout.prints, d.layout.mode)) : [];
  const count = prints.length;
  // The guest's version, as drawn: swapped photographs in their prints (and the ones they replaced back among the candidates), their frame colours.
  const swapped = new Set(Object.values(mine));
  const baseWall: Print[] = draft ?? wallPrints;
  const origOf = (id: number) => wallPrints.find((q) => q.id === id);
  const viewPrints: Print[] = baseWall.map((pr) => {
    const swapOf = (id: number | null) => (id !== null && mine[id] !== undefined ? mine[id] : id);
    return { ...pr, photoId: swapOf(pr.photoId), photoId2: swapOf(pr.photoId2), frame: pr.frame && frames[pr.id] ? { ...pr.frame, color: frames[pr.id] } : pr.frame };
  });
  const viewOthers = [...others.filter((o) => !swapped.has(o.id)), ...Object.keys(mine).map((k) => photos.find((x) => x.id === Number(k))).filter((x): x is (typeof photos)[number] => !!x)];
  // A candidate dropped on a print takes its place. A photograph that was in a print can only go back to its own print (the photographer chose it for the wall).
  const dropOn = (i: number, pid: number) => {
    const orig = viewPrints[i] && origOf(viewPrints[i].id) ? photosOf(origOf(viewPrints[i].id)!)[0] : undefined;
    if (orig === undefined) return;
    if (mine[pid] !== undefined) { if (pid === orig) swap(orig, null); else setSugErr('That photograph was in another print. Drag it back onto that print, or drop a different candidate here.'); return; }
    if (wallPrints.some((q) => photosOf(q).includes(pid))) { setSugErr('That photograph is already in a print.'); return; }
    setSugErr(''); swap(orig, pid);
  };
  const cloneP = (p: Print): Print => ({ ...p, frame: p.frame ? { ...p.frame } : null });
  const selI = Math.max(0, Math.min(selPrint, baseWall.length - 1));
  const editSel = (fn: (q: Print) => void) => { const b = baseWall.map(cloneP); if (!b[selI]) return; fn(b[selI]); if (!b[selI].stack) b[selI].photoId2 = null; setDraft(b); setSendNote(null); };
  const addPrint = () => { const b = baseWall.map(cloneP); const last = b[b.length - 1]; if (!last) return; b.push({ ...cloneP(last), id: newPrintId() + 1000, photoId: null, photoId2: null, x: last.x + 80, y: last.y + 80 }); setDraft(b); setSelPrint(b.length - 1); setSendNote(null); };
  const lineUp = () => { setDraft(arrange(baseWall.map(cloneP), 'row')); setSendNote(null); };
  const toggleFs = async () => { const el = wallBox.current; if (!el) return; if (document.fullscreenElement) { await document.exitFullscreen().catch(() => undefined); return; } try { await el.requestFullscreen(); } catch { setFs(!fs); } };
  const canEdit = !!(d.allowReview && d.allowSuggest && d.layout);
  const wallPhotos = new Map(photos.map((p) => [p.id, { id: p.id, title: p.title, w: 0, h: 0, ar: p.ar }]));

  if (phone) {
    return (
      <>
        <ShareMobile token={token} d={d} photos={photos} wallPrints={wallPrints} reviewer={reviewer} withName={withName} changeName={() => setAsking(() => () => undefined)}
          mine={mine} frames={frames} others={viewOthers} swap={swap} setFrame={setFrame} changes={changes} dirty={dirty} sending={sending} sendNote={sendNote} sendBack={sendBack} discard={discard} sugErr={sugErr} dl={dl} download={download} cancelDl={() => { cancelled.current = true; }}
          openLayout={() => setRelayout(true)} layoutSent={relayoutSent} />
        {relayout && d.layout && <LayoutSuggest token={token} start={wallPrints} mode={d.layout.mode === 'free' ? 'free' : d.layout.mode} photos={wallPhotos} photoPrints={viewPrints} candidates={viewOthers} pick={dropOn} undo={(i) => { const o = photosOf(wallPrints[i])[0]; if (o !== undefined) swap(o, null); }} isSwapped={(i) => { const o = photosOf(wallPrints[i])[0]; return o !== undefined && mine[o] !== undefined; }} error={sugErr} reviewer={reviewer} onClose={() => setRelayout(false)} onSent={() => { setRelayout(false); setRelayoutSent(true); }} />}
        {asking && <NameBox initial={reviewer} token={token} signIn={d.signIn ?? []} onCancel={() => setAsking(null)} onDone={(n) => { setName(n); const go = asking; setAsking(null); go(n); }} />}
      </>
    );
  }

  // The design's guest view: the wall, the shortlisted candidates, try changes, send them back.
  if (d.kind === 'collection' && d.layout && d.allowReview && d.allowSuggest && wallPrints.length > 0 && view === 'grid') {
    return (
      <Shell who={reviewer}>
        <div style={{ marginBottom: 12, fontSize: 13 }} className="muted">{reviewer.trim() ? `You’re ${reviewer.trim()}. ` : ''}<button className="t2" style={{ textDecoration: 'underline' }} onClick={() => withName(() => setView('review'))}>Rate these photos</button>{d.allowDownload && <> · <button className="t2" style={{ textDecoration: 'underline' }} onClick={download}>Download files</button></>}</div>
        <GuestEditor token={token} name={d.name} owner={d.owner} layout={d.layout} chosenIds={d.chosenIds ?? []} photos={photos} askName={withName} />
        {asking && <NameBox initial={reviewer} token={token} signIn={d.signIn ?? []} onCancel={() => setAsking(null)} onDone={(n) => { setName(n); const go = asking; setAsking(null); go(n); }} />}
      </Shell>
    );
  }
  if (view === 'review') return <GuestReview token={token} photos={photos} reviewer={reviewer} onDone={() => setView('grid')} />;

  return (
    <Shell who={reviewer}>
      {showPrints && d.allowReview && (
        <div className="guest-head" style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="muted" style={{ fontSize: 13 }}>{d.owner ? `${d.owner} wants your opinion on` : 'Your opinion is wanted on'}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}><h1 className="serif" style={{ fontSize: 44, lineHeight: 1 }}>{d.name}</h1><span className="faint" style={{ fontSize: 12.5, fontFamily: 'var(--mono)' }}>{spanText(viewPrints)}</span></div>
          </div>
          <nav className="steps" aria-label="Your steps" style={{ order: -1, width: '100%', justifyContent: 'center', marginBottom: 8 }}>
            <span style={{ padding: '6px 12px' }}>✓ 1 Rate</span><span className="arrow">→</span><span className={dirty ? '' : 'on'} style={{ padding: '6px 12px', borderRadius: 999, background: dirty ? undefined : 'var(--hover)', color: dirty ? undefined : 'var(--text)' }}>2 Try changes</span><span className="arrow">→</span><span style={{ padding: '6px 12px', borderRadius: 999, background: dirty ? 'var(--hover)' : undefined, color: dirty ? 'var(--text)' : undefined }}>3 Send to {d.owner || 'them'}</span>
          </nav>
          <button className="muted" style={{ opacity: dirty ? 1 : 0.5 }} onClick={discard} disabled={!dirty}>Undo my changes</button>
          <button className="btn primary lg" onClick={sendBack} disabled={!dirty || sending}>{sending ? 'Sending…' : `Send to ${d.owner || 'them'}${dirty ? ` · ${changes}` : ''}`}</button>
        </div>
      )}
      {!(showPrints && d.allowReview) && <h1 className="title" style={{ marginBottom: 8 }}>{d.name}</h1>}
      {d.description && <p className="t2" style={{ fontSize: 14, maxWidth: 620, margin: '0 0 8px' }}>{d.description}</p>}
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 24px' }}>{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'} shared with you{d.expiresAt && ` · link works until ${fmtDate(d.expiresAt, { day: 'numeric', month: 'short', year: 'numeric' })}`}</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        {d.allowReview && (
          <>
            <button className="pill primary" onClick={() => withName(() => setView('review'))}>Review these</button>
            {reviewer.trim() && <span className="muted" style={{ fontSize: 13 }}>as {reviewer.trim()}{!d.viewer && <> · <button className="t2" style={{ textDecoration: 'underline' }} onClick={() => setAsking(() => () => undefined)}>change</button></>}</span>}
          </>
        )}
        {d.allowDownload && <button className={'pill' + (d.allowReview ? '' : ' primary')} onClick={download} disabled={!!dl && !dl.ready}>Download files</button>}
        {dl && <span className="muted" role="status" style={{ fontSize: 13 }}>{dl.ready ? `${dl.total} files sent to your downloads.` : `Downloading ${dl.done} of ${dl.total}…`} {!dl.ready && <button className="t2" onClick={() => { cancelled.current = true; }}>Cancel</button>}</span>}
      </div>
      {showPrints && (
        <>
          {relayout && d.layout && <LayoutSuggest token={token} start={wallPrints} mode={d.layout.mode === 'free' ? 'free' : d.layout.mode} photos={wallPhotos} photoPrints={viewPrints} candidates={viewOthers} pick={dropOn} undo={(i) => { const o = photosOf(wallPrints[i])[0]; if (o !== undefined) swap(o, null); }} isSwapped={(i) => { const o = photosOf(wallPrints[i])[0]; return o !== undefined && mine[o] !== undefined; }} error={sugErr} reviewer={reviewer} onClose={() => setRelayout(false)} onSent={() => { setRelayout(false); setRelayoutSent(true); }} />}
          {sendNote && <div role="status" className={sendNote.ok ? 'muted' : 'reason'} style={{ marginBottom: 12, fontSize: 13 }}>{sendNote.text}</div>}
          {wallPrints.length > 0 && (
            <div className="editor-grid">
              <div>
                <div ref={wallBox} style={{ position: fs ? 'fixed' : 'relative', inset: fs ? 0 : undefined, zIndex: fs ? 80 : undefined, background: WALL_BG, borderRadius: fs ? 0 : 8, padding: '28px 28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 420, backgroundImage: 'linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px)', backgroundSize: '24px 24px' }}>
                  <button onClick={toggleFs} aria-label={fs ? 'Exit fullscreen' : 'Fullscreen'} style={{ position: 'absolute', top: 14, left: 14, zIndex: 3, borderRadius: 999, padding: '7px 14px', fontSize: 12.5, background: 'rgba(13,13,13,.72)', color: '#efede8' }}>{fs ? '✕ Exit' : '⤢ Fullscreen'}</button>
                  {canEdit && (
                    <div style={{ position: 'absolute', top: 14, right: 14, zIndex: 3, display: 'flex', gap: 8 }}>
                      <button onClick={() => withName(addPrint)} style={{ borderRadius: 999, padding: '7px 14px', fontSize: 12.5, background: 'rgba(13,13,13,.72)', color: '#efede8' }}>+ Print</button>
                      <button onClick={() => withName(lineUp)} style={{ borderRadius: 999, padding: '7px 14px', fontSize: 12.5, background: 'rgba(13,13,13,.72)', color: '#efede8' }}>Line up</button>
                    </div>
                  )}
                  <Wall prints={viewPrints} mode="free" editing={false} sel={selI} photos={wallPhotos} over={over} locked={!d.allowReview} share={token} onSelect={(i) => setSelPrint(i)} onEdit={(i) => setSelPrint(i)} onMoved={() => undefined} onOver={setOver} onDropPhoto={dropOn} />
                  <div style={{ position: 'absolute', left: 16, right: 16, bottom: 10, display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 11.5, color: 'var(--faint)' }}>
                    <span>{canEdit ? 'Drag a candidate onto a print to fill it' : 'Drawn to scale'}</span><span style={{ fontFamily: 'var(--mono)' }}>1 square = 10 cm</span>
                  </div>
                </div>
              </div>
              {canEdit ? (() => {
                const pr = viewPrints[selI]; const orig = pr ? origOf(pr.id) : undefined;
                const pid = pr ? photosOf(pr)[0] : undefined;
                const swappedIn = pid !== undefined && Object.values(mine).includes(pid);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <PrintModal inline prints={baseWall} index={selI} count={baseWall.length} photoId={undefined} onChange={editSel} title={pid !== undefined ? photos.find((x) => x.id === pid)?.title : undefined} thumb={pid !== undefined ? imgUrl(pid, 'thumb', token) : undefined} hint={viewOthers.length ? 'Click a candidate below, or drag one onto the print.' : 'This is the print.'} sharpness={pid === undefined ? 'pick a photo first' : undefined}
                      onApplyAll={() => { const f = baseWall[selI]?.frame; setDraft(baseWall.map((p) => ({ ...cloneP(p), frame: f ? { ...f, size: p.frame ? p.frame.size : f.size } : null }))); }}
                      onDelete={() => { if (baseWall.length <= 1) return; setDraft(baseWall.filter((_, k) => k !== selI)); setSelPrint(0); }} onClose={() => undefined} />
                    {swappedIn && orig && <button className="t2" style={{ textAlign: 'left', textDecoration: 'underline', fontSize: 13 }} onClick={() => { const o = photosOf(orig)[0]; if (o !== undefined) swap(o, null); }}>Put the original photo back</button>}
                  </div>
                );
              })() : (() => {
                const pr = viewPrints[selI]; const pid = pr ? photosOf(pr)[0] : undefined;
                const cur = pid !== undefined ? photos.find((x) => x.id === pid) : undefined;
                return pr ? (
                  <aside aria-label="This print" style={{ background: 'var(--surface)', borderRadius: 14, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="spread" style={{ alignItems: 'baseline' }}><span className="serif" style={{ fontSize: 28 }}>Print {selI + 1}</span><span className="muted" style={{ fontSize: 13 }}>{cur ? cur.title : 'empty'}</span></div>
                    <div className="spread"><span className="eyebrow">Print size</span><span style={{ fontSize: 14 }}>{sizeLabel(pr)}</span></div>
                    <div className="spread"><span className="eyebrow">Orientation</span><span style={{ fontSize: 14, textTransform: 'capitalize' }}>{pr.orientation}</span></div>
                  </aside>
                ) : null;
              })()}
            </div>
          )}
          {viewOthers.length > 0 && d.allowReview && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, margin: '28px 0 6px', flexWrap: 'wrap' }}>
              <h2 className="serif" style={{ fontSize: 28, margin: 0, fontWeight: 400 }}>Candidates</h2>
              <span className="chip" style={{ background: 'var(--chip)', borderRadius: 999, padding: '6px 12px', fontSize: 13 }}>All · {viewOthers.length}</span>
              <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>The photos {d.owner || 'they'} shortlisted · drag one onto a print</span>
            </div>
          )}
          {d.allowReview && viewOthers.length > 0 && <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>Click a photo to put it in Print {selI + 1}.</p>}
          {sugErr && <p className="reason" role="alert">{sugErr}</p>}
        </>
      )}
      {showPrints ? (
        <div className="cand-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: '18px 14px', alignItems: 'start' }}>
          {viewOthers.map((p) => (
            <button key={p.id} draggable={d.allowReview} onDragStart={(e) => { e.dataTransfer.setData('text/plain', String(p.id)); e.dataTransfer.effectAllowed = 'move'; }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'var(--surface)', borderRadius: 8, padding: 8 }}
              onClick={() => { const pr = viewPrints[selI]; const o = pr ? origOf(pr.id) : undefined; const target = d.allowReview && d.allowSuggest && o ? photosOf(o)[0] : undefined; if (target !== undefined) withName(() => swap(target, p.id)); else setLook(photos.indexOf(p)); }} aria-label={`Open ${p.title}`}>
              <Img p={p} style={{ width: '100%', aspectRatio: String(p.ar), objectFit: 'cover', display: 'block', borderRadius: 2 }} />
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="just">
          {photos.map((p) => (
            <button key={p.id} style={{ flex: `${p.ar} ${p.ar} ${p.ar * 200}px`, aspectRatio: String(p.ar) }} onClick={() => setLook(photos.indexOf(p))} aria-label={`Open ${p.title}`}><Img p={p} /></button>
          ))}
          <i />
        </div>
      )}
      {asking && (
        <NameBox initial={reviewer} token={token} signIn={d.signIn ?? []} onCancel={() => setAsking(null)} onDone={(n) => { setName(n); const go = asking; setAsking(null); go(n); }} />
      )}
      {picking !== null && (
        <div onMouseDown={(e) => e.target === e.currentTarget && setPicking(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-label="Suggest another" style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: 760, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 0 0 1px var(--hair),0 12px 30px rgba(0,0,0,.5)' }}>
            <h2 style={{ font: "400 30px 'Instrument Serif',serif", margin: '0 0 6px' }}>Suggest another</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>Pick the photograph you think should be in this print instead. It is sent to whoever shared this; nothing changes until they decide.</p>
            <div className="just">
              {others.filter((o) => !swapped.has(o.id) || mine[picking] === o.id).map((p) => <button key={p.id} style={{ flex: `${p.ar} ${p.ar} ${p.ar * 140}px`, aspectRatio: String(p.ar) }} onClick={() => swap(picking, p.id)} aria-label={`Suggest ${p.title}`}><Img p={p} /></button>)}
              <i />
            </div>
          </div>
        </div>
      )}
      {d.allowReview && (
        <div style={{ marginTop: 32 }}>
          <div className="label" style={{ marginBottom: 8 }}>A comment for the person who shared this</div>
          <CommentBox token={token} reviewer={reviewer} photoId={null} placeholder="Say what you think of the whole set…" ask={withName} />
        </div>
      )}
      {look !== null && (
        <div className="review-screen" role="dialog" aria-label="Photograph">
          <div className="counter">{look + 1} <span>/ {photos.length}</span></div>
          <button className="esc" onClick={() => setLook(null)}>Close</button>
          <div className="photo"><Fit p={photos[look]} /></div>
          {d.allowReview && <div style={{ position: 'absolute', bottom: 24, left: 56, right: 56, display: 'flex', justifyContent: 'center' }}><CommentBox key={photos[look].id} token={token} reviewer={reviewer} photoId={photos[look].id} placeholder="Comment on this photograph…" ask={withName} /></div>}
          <button className="lbnav" style={{ left: 12 }} aria-label="Previous" onClick={() => setLook((look + photos.length - 1) % photos.length)}>‹</button>
          <button className="lbnav" style={{ right: 12 }} aria-label="Next" onClick={() => setLook((look + 1) % photos.length)}>›</button>
        </div>
      )}
    </Shell>
  );
}

/** A comment for the photographer. Guests cannot read comments back (theirs or anyone's): it is sent, and that is all. */
function CommentBox({ token, reviewer, photoId, placeholder, ask }: { token: string; reviewer: string; photoId: number | null; placeholder: string; ask: (then: (name: string) => void) => void }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [err, setErr] = useState('');
  const send = () => { if (text.trim() && state !== 'sending') ask((name) => void post(name)); }; // comments are made under a name too
  const post = async (name: string) => {
    setState('sending'); setErr('');
    const r = await fetch(`/api/s/${token}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId, body: text, reviewer: name }) });
    if (r.ok) { setText(''); setState('sent'); } else { setErr((await r.json().catch(() => ({}))).error ?? 'Could not send that'); setState('error'); }
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <textarea aria-label={placeholder} className="area" rows={2} maxLength={1000} placeholder={placeholder} value={text} onChange={(e) => { setText(e.target.value); if (state === 'sent') setState('idle'); }} onKeyDown={(e) => { if (e.key !== 'Escape') e.stopPropagation(); }} style={{ flex: 1, minWidth: 240, maxWidth: 520 }} />
      <button className="pill" onClick={send} disabled={!text.trim() || state === 'sending'}>Send</button>
      {state === 'sent' && <span className="muted" role="status" style={{ fontSize: 12.5, alignSelf: 'center' }}>Sent. Only the person who shared this will see it.</span>}
      {state === 'error' && <span className="reason" role="alert" style={{ fontSize: 12.5, alignSelf: 'center' }}>{err}</span>}
    </div>
  );
}

/** "What should we call you?": a name the photographer will see next to what this person rates and suggests. */
function NameBox({ initial, token, signIn, onDone, onCancel }: { initial: string; token: string; signIn: { id: string; name: string }[]; onDone: (n: string) => void; onCancel: () => void }) {
  const [n, setN] = useState(initial);
  const ok = n.trim().length > 0;
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onCancel()} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form role="dialog" aria-label="Your name" onSubmit={(e) => { e.preventDefault(); if (ok) onDone(n.trim().slice(0, 60)); }} style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: 420, maxWidth: '100%', boxShadow: '0 0 0 1px var(--hair),0 12px 30px rgba(0,0,0,.5)' }}>
        <h2 style={{ font: "400 30px 'Instrument Serif',serif", margin: '0 0 6px' }}>What should we call you?</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 16px' }}>Your name is shown to whoever shared these, next to what you rate and suggest. It stays on this device so you are not asked again.</p>
        <input autoFocus value={n} onChange={(e) => setN(e.target.value)} maxLength={60} placeholder="Your name" aria-label="Your name" className="namebox" style={{ width: '100%', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="pill" onClick={onCancel}>Cancel</button>
          <button className="pill primary" disabled={!ok}>Continue with this name</button>
        </div>
        {signIn.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--hair)' }}>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 10px' }}>Or make a free guest account, and this stays in your own list of what has been shared with you, with no need for the link.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {signIn.map((p) => <a key={p.id} className="pill" href={`/auth/login/${p.id}?guest=1&returnTo=${encodeURIComponent(`/s/${token}`)}`}>Continue with {p.name}</a>)}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function Shell({ children, who }: { children: React.ReactNode; who?: string }) {
  return (
    <div className="page" style={{ paddingBottom: 60 }}>
      <header className="header"><span className="lockup"><Mark />Frames</span>{who ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 13.5 }}><span aria-hidden style={{ width: 28, height: 28, borderRadius: '50%', background: 'oklch(0.7 0.13 45)', color: '#0d0d0d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 500 }}>{who.trim()[0]?.toUpperCase()}</span>{who.trim().split(/\s+/)[0]}</span> : <span className="faint" style={{ fontSize: 12 }}>Shared with you</span>}</header>
      {children}
    </div>
  );
}

/** Rate each photograph in turn. Each rating is sent as it is made, so nothing is lost if the page is closed. */
function GuestReview({ token, photos, reviewer, onDone }: { token: string; photos: (G & { share: string })[]; reviewer: string; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [noting, setNoting] = useState(false);
  const [err, setErr] = useState('');
  const done = i >= photos.length;
  const cur = photos[i];

  const send = async (photoId: number, rating: number, note?: string) => {
    const r = await fetch(`/api/s/${token}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photoId, rating, note, reviewer }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Could not save that');
  };
  // Moves on at once and sends in the background, so quick key presses never land on the same photo.
  // If a rating can't be saved, you are taken back to that photo with the reason.
  const rate = (n: number) => {
    if (!cur) return;
    const at = i, photo = cur;
    setErr(''); setNoting(false);
    setRatings((r) => ({ ...r, [photo.id]: n }));
    setI(at + 1);
    send(photo.id, n, notes[photo.id]).catch((e: Error) => {
      setRatings((r) => { const c = { ...r }; delete c[photo.id]; return c; });
      setErr(e.message); setI(at);
    });
  };
  useKey((e) => {
    if (e.key === 'Escape') { if (noting) setNoting(false); else onDone(); return; }
    if (done) return;
    if (/^[1-5]$/.test(e.key)) void rate(Number(e.key));
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); setNoting(true); }
    else if (e.key === 'ArrowLeft') setI(Math.max(0, i - 1));
    else if (e.key === ' ') { e.preventDefault(); setI(i + 1); }
  }, [i, done, noting, notes]);

  if (done) {
    const n = Object.keys(ratings).length;
    return (
      <div className="review-screen" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <h1 className="serif" style={{ fontSize: 56, lineHeight: 1 }}>Thank you.</h1>
          <p className="t2" style={{ margin: '16px 0 28px' }}>You rated {n} of {photos.length}. Your answers have been sent.</p>
          <button className="pill primary" onClick={onDone}>Back to the photographs</button>
        </div>
      </div>
    );
  }
  return (
    <div className="review-screen">
      <div className="counter">{i + 1} <span>/ {photos.length}</span></div>
      <button className="esc" onClick={onDone}>Esc</button>
      <div className="photo"><Fit p={cur} /></div>
      <div className="scale" role="group" aria-label="Rate this photograph">
        {RATINGS.map((x) => (
          <button key={x.value} className={ratings[cur.id] === x.value ? 'sel' : ''} onClick={() => rate(x.value)} aria-label={`${x.value}, ${x.label}`}>
            <span className="e">{x.emoji}</span><span className="n">{x.value}</span>
          </button>
        ))}
      </div>
      <button className="notebtn" onClick={() => setNoting(true)}>N note</button>
      {err && <div className="reason" role="alert" style={{ position: 'absolute', bottom: 100, left: 0, right: 0, textAlign: 'center' }}>{err}</div>}
      {noting && (
        <div className="notebox">
          <textarea autoFocus rows={3} maxLength={1000} placeholder="A note about this one…" value={notes[cur.id] ?? ''} onChange={(e) => setNotes({ ...notes, [cur.id]: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); setNoting(false); } }} />
          <div className="faint" style={{ fontSize: 11.5 }}>Sent with your rating. Enter to close.</div>
        </div>
      )}
    </div>
  );
}
