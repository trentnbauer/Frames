import { useEffect, useState } from 'react';
import { api, imgUrl, useApi } from '../api';
import type { PhotoFull } from '../data';

export function RemovalReview({ onChanged }: { onChanged: () => void }) {
  const list = useApi<{ below: number; sessions: number; photos: { id: number; avg: number }[] }>('/photos/delete-suggestions');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [decided, setDecided] = useState(0);
  const [handled, setHandled] = useState<number[]>([]);
  const remaining = list.data?.photos.filter((photo) => !handled.includes(photo.id)) ?? [];
  const current = remaining[0];
  const photo = useApi<PhotoFull>(current ? `/photos/${current.id}` : null);
  const p = photo.data?.id === current?.id ? photo.data : null;
  useEffect(() => { setError(''); }, [current?.id]);
  const act = async (action: 'keep' | 'delete') => {
    if (!p || busy) return;
    if (action === 'delete' && !window.confirm('Delete this photo from Frames?\n\nIts reviews and tags will be removed. Original files will be kept. Photos in compositions or actively shared shoots are protected.')) return;
    setBusy(true); setError('');
    try {
      if (action === 'keep') await api(`/photos/${p.id}/removal/keep`, { body: {} });
      else await api(`/photos/${p.id}/removal/delete`, { body: { confirm: true } });
      setHandled((ids) => [...ids, p.id]); setDecided((count) => count + 1); list.reload(); onChanged();
    } catch (e) { setError((e as Error).message); list.reload(); }
    finally { setBusy(false); }
  };
  if (list.error) return <p role="alert">{list.error}</p>;
  if (!list.data || (current && !p)) return <p className="muted">{photo.error || 'Loading photo…'}</p>;
  if (!current || !p) return <p className="muted">No photos waiting for a removal decision.</p>;
  const history = p.reviews;
  const x = (index: number) => history.length <= 1 ? 202 : 40 + index * 325 / (history.length - 1);
  const y = (rating: number) => 178 - (rating - 1) * 38;
  const points = history.map((review, index) => `${x(index)},${y(review.rating)}`).join(' ');
  return <section aria-label="Removal review">
    <div className="removal-heading"><h1 className="serif">Removal review</h1><span className="muted">Suggested for removal · {decided + 1} of {decided + remaining.length}</span></div>
    <div className="removal-review">
      <div className="removal-photo"><img src={imgUrl(p.id, 'preview')} alt={p.title || p.file} /></div>
      <div className="removal-details">
        <h2 className="serif">{p.title || p.file}</h2>
        <span className="muted">{history.length} review sessions complete</span>
        <div className="removal-average"><span>{current.avg.toFixed(1)}<small> / 5</small></span><span className="muted">Your average rating</span></div>
        <p className="muted">Below your removal threshold of {list.data.below.toFixed(1)} after {list.data.sessions} review sessions.</p>
        <div className="spread"><span className="eyebrow">Your rating history</span><small className="muted">Oldest → newest</small></div>
        <svg viewBox="0 0 390 200" className="removal-history" role="img" aria-label={`Your rating history: ${history.map((review) => review.rating).join(', ')}`}>
          {[1,2,3,4,5].map((rating) => <g key={rating}><line x1="30" y1={y(rating)} x2="375" y2={y(rating)} stroke="var(--outline)" /><text x="8" y={y(rating) + 4} fill="var(--muted)" fontSize="11">{rating}</text></g>)}
          <polyline points={points} fill="none" stroke="var(--text2)" strokeWidth="2" />
          {history.map((review, index) => <circle key={index} cx={x(index)} cy={y(review.rating)} r="5" fill="var(--text)"><title>Session {review.session}: {review.rating}/5 · {new Date(review.date).toLocaleDateString()}</title></circle>)}
        </svg>
        <div className="removal-scores">{history.map((review,index) => <div key={index}><strong>{review.rating}<small> / 5</small></strong><span>Session {review.session}</span><time dateTime={review.date}>{new Date(review.date).toLocaleDateString()}</time></div>)}</div>
        <div className="removal-actions"><button type="button" className="btn primary" disabled={busy} onClick={() => void act('keep')}>Keep</button><button type="button" className="btn outline" disabled={busy} style={{ color: 'var(--danger)' }} onClick={() => void act('delete')}>Delete</button></div>
        <small className="muted">Keep dismisses this suggestion until another rating. Delete asks for confirmation. Original files are kept.</small>
        {error && <p role="alert" className="reason">{error}</p>}
      </div>
    </div>
  </section>;
}
