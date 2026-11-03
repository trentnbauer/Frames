import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { RATINGS } from '../data';
import { useStore } from '../store';
import { Fit, Loading, useKey } from '../components/bits';

type Session = { runId: string; queue: { id: number; ar: number }[]; index: number; ratings: Record<number, number>; notes: Record<number, string> };

/** Previous ratings are never shown here: the review is blind by design. */
export function Review() {
  const nav = useNavigate();
  const { refreshSummary } = useStore();
  const [s, setS] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState('');
  const [noting, setNoting] = useState(false);

  useEffect(() => {
    api<Session>('/review/start', { method: 'POST', body: {} }).then(setS).catch((e: Error) => setError(e.message));
  }, []);

  const done = !!s && s.index >= s.queue.length;
  const cur = s && !done ? s.queue[s.index] : null;

  const leave = () => { refreshSummary(); nav('/'); };
  const move = async (index: number) => { if (s) setS(await api<Session>('/review/session', { method: 'PUT', body: { index } })); };
  // Moves on at once and saves in the background, so quick key presses never land on the same photo.
  // If a rating can't be saved, you are put back on that photo.
  const rate = (n: number) => {
    if (!s || !cur) return;
    const before = s;
    setNoting(false);
    setS({ ...s, ratings: { ...s.ratings, [cur.id]: n }, index: s.index + 1 });
    api('/review/rate', { body: { photoId: cur.id, rating: n, note: s.notes[cur.id] } })
      .then(() => refreshSummary())
      .catch((e: Error) => { setS(before); setSaveErr(`That rating was not saved (${e.message}). Try it again.`); });
  };
  const saveNote = async (note: string) => {
    if (!s || !cur) return;
    // The note belongs to the rating, so a note on an unrated photo waits until it is rated.
    if (s.ratings[cur.id] !== undefined) setS(await api<Session>('/review/note', { body: { photoId: cur.id, note } }));
    else setS({ ...s, notes: { ...s.notes, [cur.id]: note } });
  };

  useKey((e) => {
    if (!s) return;
    if (done) { if (e.key === 'Escape') leave(); return; }
    if (/^[1-5]$/.test(e.key)) rate(Number(e.key));
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); setNoting(true); }
    else if (e.key === 'ArrowLeft') move(Math.max(0, s.index - 1));
    else if (e.key === ' ') { e.preventDefault(); move(s.index + 1); }
    else if (e.key === 'Escape') leave(); // progress is already saved
  }, [s, done]);

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
      <Link to="/" onClick={() => refreshSummary()} className="esc">Esc</Link>
      <div className="photo">{cur && <Fit p={{ id: cur.id, ar: cur.ar }} />}</div>
      <div className="scale" role="group" aria-label="Rate this photograph">
        {RATINGS.map((x) => (
          <button key={x.value} className={sel === x.value ? 'sel' : ''} onClick={() => rate(x.value)} aria-label={`${x.value}, ${x.label}`}>
            <span className="e">{x.emoji}</span>
            <span className="n">{x.value}</span>
          </button>
        ))}
      </div>
      <button className="notebtn" onClick={() => setNoting(true)}>N note</button>
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
