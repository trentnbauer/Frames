import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RATINGS, photoById } from '../data';
import { DUE_IDS, shuffle, useStore, type ReviewState } from '../store';
import { Fit, useKey } from '../components/bits';

export function Review() {
  const { review, setReview } = useStore();
  const nav = useNavigate();
  const [noting, setNoting] = useState(false);

  // Start a fresh randomised session, or resume a saved one that is not finished.
  useEffect(() => {
    if (!review || review.index >= review.queue.length) {
      if (review && review.index >= review.queue.length) return; // show summary
      setReview({ queue: shuffle(DUE_IDS), index: 0, ratings: {}, notes: {} });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const r = review;
  const done = !!r && r.index >= r.queue.length;
  const cur = r && !done ? photoById(r.queue[r.index]) : null;

  const patch = (p: Partial<ReviewState>) => r && setReview({ ...r, ...p });
  const rate = (n: number) => {
    if (!r || !cur) return;
    setNoting(false);
    patch({ ratings: { ...r.ratings, [cur.id]: n }, index: r.index + 1 });
  };

  useKey((e) => {
    if (!r || done) { if (e.key === 'Escape') nav('/'); return; }
    if (/^[1-5]$/.test(e.key)) rate(Number(e.key));
    else if (e.key.toLowerCase() === 'n') { e.preventDefault(); setNoting(true); }
    else if (e.key === 'ArrowLeft') patch({ index: Math.max(0, r.index - 1) });
    else if (e.key === ' ') { e.preventDefault(); patch({ index: r.index + 1 }); }
    else if (e.key === 'Escape') nav('/'); // progress is already saved
  }, [r, done]);

  if (!r) return null;

  if (done) {
    const rated = Object.values(r.ratings);
    return (
      <div className="review-screen" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <h1 className="serif" style={{ fontSize: 64, lineHeight: 1 }}>Session complete.</h1>
          <p className="t2" style={{ margin: '16px 0 28px' }}>
            {rated.length} rated · {r.queue.length - rated.length} skipped
            {rated.length > 0 && ` · average ${RATINGS[Math.round(rated.reduce((a, b) => a + b, 0) / rated.length) - 1].emoji} ${(rated.reduce((a, b) => a + b, 0) / rated.length).toFixed(1)}`}
          </p>
          <button className="pill primary" onClick={() => { setReview(null); nav('/'); }}>Done</button>
        </div>
      </div>
    );
  }

  const sel = cur ? r.ratings[cur.id] : undefined;
  return (
    <div className="review-screen">
      <div className="counter">{r.index + 1} <span>/ {r.queue.length}</span></div>
      <Link to="/" className="esc">Esc</Link>
      <div className="photo">{cur && <Fit p={cur} />}</div>
      <div className="scale" role="group" aria-label="Rate this photograph">
        {RATINGS.map((x) => (
          <button key={x.value} className={sel === x.value ? 'sel' : ''} onClick={() => rate(x.value)} aria-label={`${x.value}, ${x.label}`}>
            <span className="e">{x.emoji}</span>
            <span className="n">{x.value}</span>
          </button>
        ))}
      </div>
      <button className="notebtn" onClick={() => setNoting(true)}>N note</button>
      {noting && cur && (
        <div className="notebox">
          <textarea
            autoFocus rows={3} placeholder="A note for this photograph…" value={r.notes[cur.id] ?? ''}
            onChange={(e) => patch({ notes: { ...r.notes, [cur.id]: e.target.value } })}
            onKeyDown={(e) => { if (e.key === 'Escape' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); e.stopPropagation(); setNoting(false); } }}
          />
          <div className="faint" style={{ fontSize: 11.5 }}>Enter to save · Esc to close</div>
        </div>
      )}
    </div>
  );
}
