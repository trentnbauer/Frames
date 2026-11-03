import { Link, useNavigate } from 'react-router-dom';
import { PHOTOS, photoById } from '../data';
import { DUE_IDS, useStore } from '../store';
import { Header, Img } from '../components/bits';

export function Today() {
  const { dueCount, review, settings } = useStore();
  const nav = useNavigate();
  const next = photoById(review ? review.queue[review.index] ?? DUE_IDS[0] : DUE_IDS[0]);
  const forgotten = PHOTOS.filter((p) => p.reviews.length > 0 && p.reviews[0].rating >= 4).slice(0, 12);
  const date = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const resuming = review && review.index > 0 && review.index < review.queue.length;
  const mins = Math.max(1, Math.round(dueCount * 0.19));
  return (
    <div className="page">
      <Header right={<span className="t2" style={{ fontSize: 13 }}>{date}</span>} />
      <div className="today">
        <div>
          <h1>
            {dueCount === 0
              ? 'Nothing is waiting to be seen again.'
              : `${dueCount} photographs are waiting to be seen again.`}
          </h1>
          <p className="t2" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 400, margin: '0 0 24px' }}>
            Session 3 of {settings.sessions} for Fog studies and Harbour nights. About {mins} minutes at your usual pace.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button className="pill primary" onClick={() => nav('/review')} disabled={dueCount === 0}>
              {resuming ? 'Resume review' : 'Begin review'}
            </button>
            <span className="muted" style={{ fontSize: 13 }}>or press R</span>
          </div>
        </div>
        <div style={{ aspectRatio: '3 / 2', overflow: 'hidden', borderRadius: 8, background: 'var(--surface)' }}>
          <Img p={{ ar: 1.5, hue: next.hue }} className="blur" style={{ aspectRatio: '3 / 2', height: '100%' }} />
        </div>
      </div>
      <div className="spread" style={{ marginBottom: 14 }}>
        <h2 className="serif" style={{ fontSize: 28 }}>Not seen in over a year</h2>
        <span className="muted" style={{ fontSize: 12.5 }}>Rated 4+ the first time · <Link to="/library" className="t2">See all</Link></span>
      </div>
      <div className="strip">
        {forgotten.map((p) => (
          <Link key={p.id} to={`/photo/${p.id}`} style={{ aspectRatio: String(p.ar) }} aria-label={p.title}>
            <Img p={p} style={{ height: '100%', width: 'auto' }} />
          </Link>
        ))}
      </div>
    </div>
  );
}
