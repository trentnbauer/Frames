import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { RATINGS } from '../data';
import { useStore } from '../store';
import { Fit, Loading, useKey } from '../components/bits';
import { CompPicker } from '../components/AddToComposition';
import type { Collection } from '../data';

type Session = { runId: string; queue: { id: number; ar: number }[]; index: number; ratings: Record<number, number>; notes: Record<number, string> };

/** Previous ratings are never shown here: the review is blind by design. */
export function Review() {
  const nav = useNavigate();
  const { refreshSummary } = useStore();
  const [s, setS] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState('');
  const [noting, setNoting] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (() => {
      const q = new URLSearchParams(window.location.search);
      const photoIds = q.get('ids')?.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0);
      return api<Session>('/review/start', { method: 'POST', body: photoIds?.length ? { photoIds } : { early: q.has('early') } });
    })().then(setS).catch((e: Error) => setError(e.message));
  }, []);

  const colls = useApi<Collection[]>('/collections');
  // After a high rating, offer the best-fit composition: the open one worked on most recently that does not hold the photo yet.
  const [offer, setOffer] = useState<{ id: number; comp: Collection } | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const bestFit = (photoId: number) => [...(colls.data ?? [])].filter((c) => !c.printedAt && !c.photoIds.includes(photoId)).sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || b.id - a.id)[0] ?? null;
  const addOffer = async () => { if (!offer) return; await api(`/collections/${offer.comp.id}/photos/${offer.id}`, { method: 'PUT' }); setMsg(`Added to “${offer.comp.name}” as a candidate.`); setOffer(null); colls.reload(); };
  useEffect(() => { if (!offer) return; const t = setTimeout(() => setOffer(null), 6000); return () => clearTimeout(t); }, [offer]);
  const done = !!s && s.index >= s.queue.length;
  const cur = s && !done ? s.queue[s.index] : null;

  const leave = () => { refreshSummary(); nav('/'); };
  const move = async (index: number) => { if (s) setS(await api<Session>('/review/session', { method: 'PUT', body: { index } })); };
  // Moves on at once and saves in the background, so quick key presses never land on the same photo.
  // If a rating can't be saved, you are put back on that photo.
  const rate = (n: number) => {
    if (!s || !cur) return;
    const before = s;
    setNoting(false); setMsg('');
    setS({ ...s, ratings: { ...s.ratings, [cur.id]: n }, index: s.index + 1 });
    const fit = n >= 4 ? bestFit(cur.id) : null;
    setOffer(fit ? { id: cur.id, comp: fit } : null);
    api('/review/rate', { body: { photoId: cur.id, rating: n, note: s.notes[cur.id] } })
      .then(() => refreshSummary())
      .catch((e: Error) => { setS(before); setSaveErr(`That rating was not saved (${e.message}). Try it again.`); });
  };
  const remove = async () => {
    if (!s || !cur) return;
    if (!window.confirm('Take this photograph out of Frames?\n\nIts reviews, tags and composition places go with it. The file in your library folder is not touched (a copy Frames holds itself, such as an upload, is deleted).')) return;
    try { await api(`/photos/${cur.id}`, { method: 'DELETE' }); refreshSummary(); await move(s.index + 1); } catch (e) { setSaveErr(`Not deleted (${(e as Error).message}).`); }
  };
  const saveNote = async (note: string) => {
    if (!s || !cur) return;
    // The note belongs to the rating, so a note on an unrated photo waits until it is rated.
    if (s.ratings[cur.id] !== undefined) setS(await api<Session>('/review/note', { body: { photoId: cur.id, note } }));
    else setS({ ...s, notes: { ...s.notes, [cur.id]: note } });
  };

  useKey((e) => {
    if (!s || (e.target as HTMLElement)?.tagName === 'INPUT') return; // typing a composition name
    if (done) { if (e.key === 'Escape') leave(); return; }
    if (e.key.toLowerCase() === 'a' && offer) { e.preventDefault(); void addOffer(); }
    else if (/^[1-5]$/.test(e.key)) rate(Number(e.key));
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); setNoting(true); }
    else if (e.key === 'ArrowLeft') move(Math.max(0, s.index - 1));
    else if (e.key === ' ') { e.preventDefault(); move(s.index + 1); }
    else if (e.key === 'Escape') leave(); // progress is already saved
  }, [s, done, offer]);

  if (error) return <div className="review-screen"><Loading error={error} /></div>;
  if (!s) return <div className="review-screen"><Loading /></div>;

  if (s.queue.length === 0) {
    return (
      <div className="review-screen" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <h1 className="serif" style={{ fontSize: 64, lineHeight: 1 }}>Nothing to review.</h1>
          <p className="t2" style={{ margin: '16px 0 28px' }}>Photographs come back here when they are due.</p>
          <button className="pill primary" onClick={() => api('/review/session', { method: 'DELETE' }).then(leave)}>Back to Today</button>
        </div>
      </div>
    );
  }

  if (done) {
    const rated = Object.values(s.ratings);
    const mean = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
    return (
      <div className="review-screen" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <h1 className="serif" style={{ fontSize: 64, lineHeight: 1 }}>Session complete.</h1>
          <p className="t2" style={{ margin: '16px 0 28px' }}>
            {rated.length} rated · {s.queue.length - rated.length} skipped
            {rated.length > 0 && ` · average ${RATINGS[Math.round(mean) - 1].emoji} ${mean.toFixed(1)}`}
          </p>
          <button className="pill primary" onClick={() => api('/review/session', { method: 'DELETE' }).then(leave)}>Done</button>
        </div>
      </div>
    );
  }

  const sel = cur ? s.ratings[cur.id] : undefined;
  return (
    <div className="review-screen">
      <div className="counter">{s.index + 1} <span>/ {s.queue.length}</span></div>
      <div className="esc" style={{ display: 'flex', gap: 16 }}><span>Review session</span><Link to="/" onClick={() => refreshSummary()}>Esc to finish</Link></div>
      <div className="photo">{cur && <Fit p={{ id: cur.id, ar: cur.ar }} />}</div>
      <div className="scale" role="group" aria-label="Rate this photograph">
        {RATINGS.map((x) => (
          <button key={x.value} className={sel === x.value ? 'sel' : ''} onClick={() => rate(x.value)} aria-label={`${x.value}, ${x.label}`}>
            <span className="e">{x.emoji}</span>
            <span className="n">{x.value} {x.label}</span>
          </button>
        ))}
      </div>
      <button className="notebtn" onClick={() => setNoting(true)}>N note</button>
      {cur && (
        <div style={{ position: 'absolute', top: 24, right: 28, display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
          {msg && <span className="t2" role="status">{msg}</span>}
          <button className="pill" onClick={() => setPicker(cur.id)}>Add to composition</button>
          <button className="pill" onClick={remove}>Delete</button>
        </div>
      )}
      {offer && (
        <div className="toast" role="status" style={{ top: 'auto', bottom: 150, width: 380 }}>
          <div style={{ marginBottom: 10 }}>Nice one. Add it to <b style={{ fontWeight: 500 }}>{offer.comp.name}</b>?</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn primary" style={{ height: 34 }} onClick={addOffer}>Add <span className="mono" style={{ fontSize: 11, opacity: .7, marginLeft: 6 }}>A</span></button>
            <button className="btn outline" style={{ height: 34 }} onClick={() => { setPicker(offer.id); setOffer(null); }}>Choose…</button>
            <button className="muted" onClick={() => setOffer(null)}>Not now</button>
          </div>
        </div>
      )}
      {picker !== null && <CompPicker ids={[picker]} onClose={() => setPicker(null)} onDone={(m) => { setMsg(m); colls.reload(); }} />}
      {saveErr && <div className="reason" role="alert" style={{ position: 'absolute', bottom: 100, left: 0, right: 0, textAlign: 'center' }}>{saveErr}</div>}
      {noting && cur && (
        <div className="notebox">
          <textarea
            autoFocus rows={3} placeholder="A note for this photograph…" defaultValue={s.notes[cur.id] ?? ''}
            onBlur={(e) => saveNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) {
                e.preventDefault(); e.stopPropagation();
                saveNote((e.target as HTMLTextAreaElement).value);
                setNoting(false);
              }
            }}
          />
          <div className="faint" style={{ fontSize: 11.5 }}>Enter to save · Esc to close</div>
        </div>
      )}
    </div>
  );
}
