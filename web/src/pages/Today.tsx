import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';
import { Header, Img } from '../components/bits';

export function Today() {
  const { summary } = useStore();
  const nav = useNavigate();
  const recs = useApi<{ forgotten: PhotoLite[] }>('/recommendations');
  const date = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const s = summary;
  const forgotten = recs.data?.forgotten ?? [];

  return (
    <div className="page">
      <Header right={<span className="t2" style={{ fontSize: 13 }}>{date}</span>} />
      {s && s.total === 0 ? (
        <div style={{ maxWidth: 560 }}>
          <h1 className="serif" style={{ fontSize: 64, lineHeight: 1, margin: '0 0 20px' }}>Your library is empty.</h1>
          <p className="t2" style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 24px' }}>
            Put photographs in the library folder you mounted, then bring them in. Originals are never changed.
          </p>
          <Link to="/shoots" className="pill primary">Go to Photoshoots</Link>
        </div>
      ) : (
        <div className="today">
          <div>
            <h1>
              {!s ? 'Loading…' : s.due === 0 ? 'Nothing is waiting to be seen again.' : `${s.due} ${s.due === 1 ? 'photograph is' : 'photographs are'} waiting to be seen again.`}
            </h1>
            <p className="t2" style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 400, margin: '0 0 24px' }}>
              {s && s.due > 0
                ? `${s.shootNames.length ? `From ${s.shootNames.join(' and ')}. ` : ''}About ${s.minutes} ${s.minutes === 1 ? 'minute' : 'minutes'} at your usual pace.`
                : 'Come back when the next ones are due.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button className="pill primary" onClick={() => nav('/review')} disabled={!s || s.due === 0}>
                {s?.resumable ? 'Resume review' : 'Begin review'}
              </button>
              <span className="muted" style={{ fontSize: 13 }}>or press R</span>
            </div>
          </div>
          <div style={{ aspectRatio: '3 / 2', overflow: 'hidden', borderRadius: 8, background: 'var(--surface)' }}>
            {s?.nextId && <Img p={{ id: s.nextId, ar: 1.5 }} className="blur" style={{ aspectRatio: '3 / 2', width: '100%', height: '100%' }} />}
          </div>
        </div>
      )}
      {forgotten.length > 0 && (
        <>
          <div className="spread" style={{ marginBottom: 14 }}>
            <h2 className="serif" style={{ fontSize: 28 }}>Not seen in over a year</h2>
            <span className="muted" style={{ fontSize: 12.5 }}>Rated 4+ the first time</span>
          </div>
          <div className="strip">
            {forgotten.map((p) => (
              <Link key={p.id} to={`/photo/${p.id}`} style={{ aspectRatio: String(p.ar) }} aria-label={p.title}>
                <Img p={p} style={{ height: '100%', width: 'auto' }} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
