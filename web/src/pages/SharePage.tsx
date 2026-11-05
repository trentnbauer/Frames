import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RATINGS, fmtDate } from '../data';
import { Fit, Img, Mark, useKey } from '../components/bits';
import { Wall } from '../components/CompositionWall';
import { LayoutSuggest } from '../components/LayoutSuggest';
import { arrange, photosOf, type Layout, type Print } from '../layout';
import type { Target } from '../target';
import { imgUrl } from '../api';

type G = { id: number; title: string; ar: number; n: number };
type Shared = { kind: 'collection' | 'shoot'; chosenIds?: number[]; target?: Target | null; layout?: Layout | null; name: string; description: string; allowDownload: boolean; allowReview: boolean; expiresAt: string | null; photos: G[]; viewer?: { name: string; role: string } | null; signIn?: { id: string; name: string }[] };

/** What someone with a share link sees. It never calls the signed-in part of the app. */
export function SharePage() {
  const { token = '' } = useParams();
  const [d, setD] = useState<Shared | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'review'>('grid');
  const [look, setLook] = useState<number | null>(null);
  const nameKey = `frames-guest-name-${token}`;
  const [typed, setReviewer] = useState(() => { try { return localStorage.getItem(nameKey) ?? ''; } catch { return ''; } });
  const reviewer = d?.viewer?.name ?? typed; // someone signed in is known by their account's name
  const [asking, setAsking] = useState<null | ((name: string) => void)>(null); // the name box, and what to do once there is a name
  const setName = (n: string) => { setReviewer(n); try { localStorage.setItem(nameKey, n); } catch { /* the name is only remembered for next time */ } };
  // Reviewing and suggesting are done under a name, so the photographer can tell guests apart: ask once, remember it on this device.
  const withName = (then: (name: string) => void) => { if (reviewer.trim()) then(reviewer.trim()); else setAsking(() => then); };
  const [dl, setDl] = useState<{ done: number; total: number; ready: boolean } | null>(null);
  const [picking, setPicking] = useState<number | null>(null); // the print a suggestion is being chosen for
  const [mine, setMine] = useState<Record<number, number>>({}); // print -> the candidate this guest suggested
  const [sugErr, setSugErr] = useState('');
  const [relayout, setRelayout] = useState(false); // the layout suggestion box
  const [relayoutSent, setRelayoutSent] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    document.title = 'Frames | Shared photographs';
    fetch(`/api/s/${token}`).then(async (r) => (r.ok ? setD(await r.json()) : setGone((await r.json().catch(() => ({}))).error ?? 'This link is not available'))).catch(() => setGone('Could not load this link'));
  }, [token]);

  useKey((e) => {
    if (look === null || !d) return;
    if (e.key === 'Escape') setLook(null);
    if (e.key === 'ArrowLeft') setLook((look + d.photos.length - 1) % d.photos.length);
    if (e.key === 'ArrowRight') setLook((look + 1) % d.photos.length);
  }, [look, d]);

  useEffect(() => { if (d?.name) document.title = `Frames | ${d.name}`; }, [d?.name]);
  if (gone) return <Shell><h1 className="serif" style={{ fontSize: 44, margin: '12vh 0 12px' }}>This link isn’t available.</h1><p className="t2">{gone}. Ask whoever sent it for a new one.</p></Shell>;
  if (!d) return <Shell><p className="muted">Loading…</p></Shell>;
  const photos = d.photos.map((p) => ({ ...p, share: token }));

  // Straight to the browser's own downloader, in order, so files go to disk untouched.
  const download = async () => {
    cancelled.current = false;
    const pad = String(photos.length).length;
    setDl({ done: 0, total: photos.length, ready: false });
    for (let i = 0; i < photos.length; i++) {
      if (cancelled.current) { setDl(null); return; }
      const a = document.createElement('a');
      a.href = `/api/s/${token}/photos/${photos[i].id}/original?n=${i + 1}&pad=${pad}`;
      a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
      setDl({ done: i + 1, total: photos.length, ready: false });
      await new Promise((r) => setTimeout(r, 450));
    }
    setDl({ done: photos.length, total: photos.length, ready: true });
  };

  const prints = (d.chosenIds ?? []).map((id) => photos.find((p) => p.id === id)).filter((p): p is (typeof photos)[number] => !!p);
  const others = photos.filter((p) => !(d.chosenIds ?? []).includes(p.id));
  const showPrints = d.kind === 'collection' && prints.length > 0;
  const suggest = async (forId: number, photoId: number | null) => {
    setSugErr('');
    const r = await fetch(`/api/s/${token}/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forId, photoId, reviewer }) });
    if (!r.ok) { setSugErr((await r.json().catch(() => ({}))).error ?? 'Could not save that'); return; }
    setMine((m) => { const c = { ...m }; if (photoId === null) delete c[forId]; else c[forId] = photoId; return c; });
    setPicking(null);
  };
  const wallPrints: Print[] = d.layout ? (d.layout.mode === 'free' ? d.layout.prints : arrange(d.layout.prints, d.layout.mode)) : [];
  const count = prints.length;
  const wallPhotos = new Map(photos.map((p) => [p.id, { id: p.id, title: p.title, w: 0, h: 0, ar: p.ar }]));

  if (view === 'review') return <GuestReview token={token} photos={photos} reviewer={reviewer} onDone={() => setView('grid')} />;

  return (
    <Shell>
      <h1 className="title" style={{ marginBottom: 8 }}>{d.name}</h1>
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
          <div className="label" style={{ marginBottom: 12, display: 'flex', alignItems: 'baseline', gap: 14 }}>The {count === 1 ? 'print' : `${count} prints`}
            {d.allowReview && d.layout && <button className="t2" style={{ textDecoration: 'underline', textTransform: 'none', letterSpacing: 0 }} onClick={() => withName(() => setRelayout(true))}>{relayoutSent ? 'Suggest a different layout again' : 'Suggest a different layout'}</button>}
            {relayoutSent && <span className="muted" role="status" style={{ textTransform: 'none', letterSpacing: 0 }}>Sent. Thank you.</span>}
          </div>
          {relayout && d.layout && <LayoutSuggest token={token} start={wallPrints} mode={d.layout.mode === 'free' ? 'free' : d.layout.mode} photos={wallPhotos} reviewer={reviewer} onClose={() => setRelayout(false)} onSent={() => { setRelayout(false); setRelayoutSent(true); }} />}
          {wallPrints.length > 0 && (
            <div style={{ background: '#161615', borderRadius: 8, padding: '28px 28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <Wall prints={wallPrints} mode="free" editing={false} sel={-1} photos={wallPhotos} over={null} locked share={token} onSelect={(i) => { const pid = photosOf(wallPrints[i])[0]; const at = photos.findIndex((x) => x.id === pid); if (at >= 0) setLook(at); }} onEdit={() => undefined} onMoved={() => undefined} onOver={() => undefined} onDropPhoto={() => undefined} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
            {wallPrints.flatMap((pr, n) => photosOf(pr).map((pid) => ({ pr, n, p: photos.find((x) => x.id === pid) })).filter((x) => !!x.p)).map(({ n, p }) => {
              const sug = mine[p!.id] !== undefined ? photos.find((x) => x.id === mine[p!.id]) : null;
              return (
                <div key={p!.id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12.5 }}>
                  <button onClick={() => setLook(photos.indexOf(p!))} aria-label={`Open ${p!.title}`}><img src={imgUrl(p!.id, 'thumb', token)} alt="" style={{ height: 40, borderRadius: 3, display: 'block' }} /></button>
                  <span className="muted">Print {n + 1} · {p!.title}</span>
                  {d.allowReview && others.length > 0 && (sug ? (
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><img src={imgUrl(sug.id, 'thumb', token)} alt="" style={{ height: 28, borderRadius: 3 }} /><span className="muted">You suggested this instead</span><button className="t2" onClick={() => suggest(p!.id, null)}>Undo</button></span>
                  ) : <button className="t2" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }} onClick={() => withName(() => setPicking(p!.id))}>Suggest another</button>)}
                </div>
              );
            })}
          </div>
          {sugErr && <p className="reason" role="alert">{sugErr}</p>}
          {others.length > 0 && <div className="label" style={{ marginBottom: 12 }}>Other candidates</div>}
        </>
      )}
      <div className="just">
        {(showPrints ? others : photos).map((p) => (
          <button key={p.id} style={{ flex: `${p.ar} ${p.ar} ${p.ar * 200}px`, aspectRatio: String(p.ar) }} onClick={() => setLook(photos.indexOf(p))} aria-label={`Open ${p.title}`}><Img p={p} /></button>
        ))}
        <i />
      </div>
      {asking && (
        <NameBox initial={reviewer} token={token} signIn={d.signIn ?? []} onCancel={() => setAsking(null)} onDone={(n) => { setName(n); const go = asking; setAsking(null); go(n); }} />
      )}
      {picking !== null && (
        <div onMouseDown={(e) => e.target === e.currentTarget && setPicking(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-label="Suggest another" style={{ background: '#161615', borderRadius: 14, padding: 28, width: 760, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)' }}>
            <h2 style={{ font: "400 30px 'Instrument Serif',serif", margin: '0 0 6px' }}>Suggest another</h2>
            <p style={{ fontSize: 13, color: '#8f8c86', margin: '0 0 16px' }}>Pick the photograph you think should be in this print instead. It is sent to whoever shared this; nothing changes until they decide.</p>
            <div className="just">
              {others.map((p) => <button key={p.id} style={{ flex: `${p.ar} ${p.ar} ${p.ar * 140}px`, aspectRatio: String(p.ar) }} onClick={() => suggest(picking, p.id)} aria-label={`Suggest ${p.title}`}><Img p={p} /></button>)}
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
      <textarea aria-label={placeholder} className="area" rows={2} maxLength={1000} placeholder={placeholder} value={text} onChange={(e) => { setText(e.target.value); if (state === 'sent') setState('idle'); }} onKeyDown={(e) => e.stopPropagation()} style={{ flex: 1, minWidth: 240, maxWidth: 520 }} />
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
      <form role="dialog" aria-label="Your name" onSubmit={(e) => { e.preventDefault(); if (ok) onDone(n.trim().slice(0, 60)); }} style={{ background: '#161615', borderRadius: 14, padding: 28, width: 420, maxWidth: '100%', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)' }}>
        <h2 style={{ font: "400 30px 'Instrument Serif',serif", margin: '0 0 6px' }}>What should we call you?</h2>
        <p style={{ fontSize: 13, color: '#8f8c86', margin: '0 0 16px' }}>Your name is shown to whoever shared these, next to what you rate and suggest. It stays on this device so you are not asked again.</p>
        <input autoFocus value={n} onChange={(e) => setN(e.target.value)} maxLength={60} placeholder="Your name" aria-label="Your name" className="namebox" style={{ width: '100%', marginBottom: 16 }} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" className="pill" onClick={onCancel}>Cancel</button>
          <button className="pill primary" disabled={!ok}>Continue with this name</button>
        </div>
        {signIn.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,.08)' }}>
            <p style={{ fontSize: 13, color: '#8f8c86', margin: '0 0 10px' }}>Or make a free guest account, and this stays in your own list of what has been shared with you, with no need for the link.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {signIn.map((p) => <a key={p.id} className="pill" href={`/auth/login/${p.id}?guest=1&returnTo=${encodeURIComponent(`/s/${token}`)}`}>Continue with {p.name}</a>)}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="page" style={{ paddingBottom: 60 }}>
      <header className="header"><span className="lockup"><Mark />Frames</span><span className="faint" style={{ fontSize: 12 }}>Shared with you</span></header>
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
