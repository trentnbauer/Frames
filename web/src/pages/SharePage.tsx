import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RATINGS, fmtDate } from '../data';
import { Fit, Img, Mark, useKey } from '../components/bits';

type G = { id: number; title: string; ar: number; n: number };
type Shared = { kind: 'collection' | 'shoot'; name: string; description: string; allowDownload: boolean; allowReview: boolean; expiresAt: string | null; photos: G[] };

/** What someone with a share link sees. It never calls the signed-in part of the app. */
export function SharePage() {
  const { token = '' } = useParams();
  const [d, setD] = useState<Shared | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'review'>('grid');
  const [look, setLook] = useState<number | null>(null);
  const [reviewer, setReviewer] = useState('');
  const [dl, setDl] = useState<{ done: number; total: number; ready: boolean } | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    document.title = 'Shared photographs';
    fetch(`/api/s/${token}`).then(async (r) => (r.ok ? setD(await r.json()) : setGone((await r.json().catch(() => ({}))).error ?? 'This link is not available'))).catch(() => setGone('Could not load this link'));
  }, [token]);

  useKey((e) => {
    if (look === null || !d) return;
    if (e.key === 'Escape') setLook(null);
    if (e.key === 'ArrowLeft') setLook((look + d.photos.length - 1) % d.photos.length);
    if (e.key === 'ArrowRight') setLook((look + 1) % d.photos.length);
  }, [look, d]);

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

  if (view === 'review') return <GuestReview token={token} photos={photos} reviewer={reviewer} onDone={() => setView('grid')} />;

  return (
    <Shell>
      <h1 className="title" style={{ marginBottom: 8 }}>{d.name}</h1>
      {d.description && <p className="t2" style={{ fontSize: 14, maxWidth: 620, margin: '0 0 8px' }}>{d.description}</p>}
      <p className="muted" style={{ fontSize: 12.5, margin: '0 0 24px' }}>{photos.length} {photos.length === 1 ? 'photograph' : 'photographs'} shared with you{d.expiresAt && ` · link works until ${fmtDate(d.expiresAt, { day: 'numeric', month: 'short', year: 'numeric' })}`}</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        {d.allowReview && (
          <>
            <input className="namebox" aria-label="Your name" placeholder="Your name (optional)" value={reviewer} maxLength={60} onChange={(e) => setReviewer(e.target.value)} />
            <button className="pill primary" onClick={() => setView('review')}>Review these</button>
          </>
        )}
        {d.allowDownload && <button className={'pill' + (d.allowReview ? '' : ' primary')} onClick={download} disabled={!!dl && !dl.ready}>Download files</button>}
        {dl && <span className="muted" role="status" style={{ fontSize: 13 }}>{dl.ready ? `${dl.total} files sent to your downloads.` : `Downloading ${dl.done} of ${dl.total}…`} {!dl.ready && <button className="t2" onClick={() => { cancelled.current = true; }}>Cancel</button>}</span>}
      </div>
      <div className="just">
        {photos.map((p, i) => (
          <button key={p.id} style={{ flex: `${p.ar} ${p.ar} ${p.ar * 200}px`, aspectRatio: String(p.ar) }} onClick={() => setLook(i)} aria-label={`Open ${p.title}`}><Img p={p} /></button>
        ))}
        <i />
      </div>
      {look !== null && (
        <div className="review-screen" role="dialog" aria-label="Photograph">
          <div className="counter">{look + 1} <span>/ {photos.length}</span></div>
          <button className="esc" onClick={() => setLook(null)}>Close</button>
          <div className="photo"><Fit p={photos[look]} /></div>
          <button className="lbnav" style={{ left: 12 }} aria-label="Previous" onClick={() => setLook((look + photos.length - 1) % photos.length)}>‹</button>
          <button className="lbnav" style={{ right: 12 }} aria-label="Next" onClick={() => setLook((look + 1) % photos.length)}>›</button>
        </div>
      )}
    </Shell>
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
