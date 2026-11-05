import { Link, useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { useStore } from '../store';
import { useUi } from '../ui';
import { Header } from '../components/bits';
import { Card } from './Collections';

type SuggestedSet = { name: string; reason: string; photoIds: number[]; photos: PhotoLite[] };

const serif = "'Instrument Serif',Georgia,serif";
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' } as const;
const lightBtn = { background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999 } as const;
const cover = (id: number) => imgUrl(id, 'thumb');

/** Home: what is due to review, a way into composing, compositions in progress, and the newest shoots. */
export function Today() {
  const { summary: s } = useStore();
  const { openNew, openSearch } = useUi();
  const nav = useNavigate();
  const recs = useApi<SuggestedSet[]>('/collections/suggestions');
  const comps = useApi<Collection[]>('/collections');
  const shoots = useApi<Shoot[]>('/shoots');
  const lib = useApi<{ photos: PhotoLite[] }>('/photos');
  const byId = new Map((lib.data?.photos ?? []).map((p) => [p.id, p]));
  const suggestion = recs.data?.[0];
  const shootsOf = (ids: number[]) => new Set(ids.map((id) => byId.get(id)?.shootId)).size;

  const startSuggested = async (x: SuggestedSet) => {
    const c = await api<Collection>('/collections', { body: { name: x.name, photoIds: x.photoIds } });
    await api('/recommendations/feedback', { body: { kind: 'together', photoIds: x.photoIds, verdict: 'accept' } });
    nav(`/collections/${c.id}`);
  };
  const begin = () => nav(s && s.due === 0 && !s.resumable && s.early > 0 ? '/review?early' : '/review');
  const active = (comps.data ?? []).filter((c) => c.photoIds.length > 0 && !c.printedAt).slice(0, 3);
  const recent = [...(shoots.data ?? [])].filter((x) => x.count > 0).slice(0, 8);

  if (s && s.total === 0) {
    return (
      <div className="page">
        <Header />
        <div style={{ maxWidth: 560 }}>
          <h1 className="serif" style={{ fontSize: 64, lineHeight: 1, margin: '0 0 20px' }}>Your library is empty.</h1>
          <p className="t2" style={{ fontSize: 14, lineHeight: 1.55, margin: '0 0 24px' }}>Put photographs in the library folder you mounted, then bring them in. Originals are never changed.</p>
          <Link to="/shoots" className="pill primary">Go to Photoshoots</Link>
        </div>
      </div>
    );
  }

  const dueLine = !s ? 'Loading…' : s.due === 0 ? 'Nothing is waiting to be seen again.' : `${s.due} ${s.due === 1 ? 'photograph is' : 'photographs are'} waiting to be seen again.`;
  const dueText = s && s.due > 0
    ? `${s.shootNames.length ? `From ${s.shootNames.join(' and ')}. ` : ''}About ${s.minutes} ${s.minutes === 1 ? 'minute' : 'minutes'}. Your ratings rank every composition they belong to.`
    : 'Come back when the next ones are due, or begin anyway with the photographs you have not seen for longest.';

  return (
    <div className="page">
      <Header />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(360px,1fr))', gap: 24, marginBottom: 56 }}>
        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#161615', minHeight: 380, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: 32 }}>
          {s?.nextId && <img src={cover(s.nextId)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(.55)', transform: 'scale(1.15)' }} />}
          <div style={{ position: 'relative' }}>
            <div style={{ ...eyebrow, color: '#efede8', opacity: 0.8, marginBottom: 14 }}>Review</div>
            <h1 style={{ font: `400 52px/1 ${serif}`, margin: '0 0 16px', textWrap: 'pretty' }}>{dueLine}</h1>
            <p style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 400, margin: '0 0 24px', color: '#efede8' }}>{dueText}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button onClick={begin} disabled={!s || (s.due === 0 && !s.resumable && s.early === 0)} style={{ ...lightBtn, padding: '13px 24px', fontSize: 14.5 }}>
                {s?.resumable ? 'Resume review' : s && s.due === 0 && s.early > 0 ? 'Review anyway' : 'Begin review'}
              </button>
              <span style={{ fontSize: 13, color: '#efede8', opacity: 0.75 }}>or press R</span>
            </div>
          </div>
        </div>

        <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#161615', minHeight: 380, display: 'flex', flexDirection: 'column', padding: 32 }}>
          <div style={{ ...eyebrow, color: '#6f6c67', marginBottom: 14 }}>Compose</div>
          <h1 style={{ font: `400 52px/1 ${serif}`, margin: '0 0 16px' }}>Turn a shoot into prints.</h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, maxWidth: 420, margin: '0 0 20px', color: '#a8a59f' }}>Pick a theme and a print size. Frames ranks the candidates by your scores and your guests’, and checks each one is sharp enough to print.</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 'auto' }}>
            <button onClick={() => openNew()} style={{ ...lightBtn, padding: '13px 24px', fontSize: 14.5 }}>New composition</button>
            <button onClick={openSearch} style={{ borderRadius: 999, padding: '13px 20px', fontSize: 14, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)' }}>From a search…</button>
          </div>
          {suggestion && (
            <div style={{ marginTop: 28, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 14 }}>
              <div style={{ fontSize: 12, color: '#8f8c86', marginBottom: 10 }}>Suggested: looks like a set</div>
              <div style={{ display: 'flex', gap: 8, height: 64, overflow: 'hidden' }}>
                {suggestion.photos.slice(0, 5).map((p) => <img key={p.id} src={cover(p.id)} alt="" style={{ height: '100%', flex: `${p.ar} 1 0`, minWidth: 0, objectFit: 'cover', borderRadius: 3, display: 'block' }} />)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, fontSize: 13 }}>
                <span><span style={{ font: `400 19px ${serif}` }}>{suggestion.name}</span> <span style={{ color: '#8f8c86' }}>· {suggestion.photoIds.length} well-liked photographs{shootsOf(suggestion.photoIds) > 0 ? `, ${shootsOf(suggestion.photoIds)} ${shootsOf(suggestion.photoIds) === 1 ? 'shoot' : 'shoots'}` : ''}</span></span>
                <button onClick={() => startSuggested(suggestion)} style={{ color: '#efede8', textDecoration: 'underline', textUnderlineOffset: 3 }}>Start it</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {active.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
            <h2 style={{ font: `400 28px ${serif}`, margin: 0 }}>Compositions in progress</h2>
            <Link to="/collections" style={{ fontSize: 13, color: '#a8a59f' }}>All compositions →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '28px 24px', marginBottom: 56 }}>
            {active.map((c) => <Card key={c.id} c={c} />)}
          </div>
        </>
      )}

      {recent.length > 0 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <h2 style={{ font: `400 28px ${serif}`, margin: 0 }}>Recent shoots</h2>
            <Link to="/shoots" style={{ fontSize: 13, color: '#a8a59f' }}>Upload a shoot →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 20 }}>
            {recent.map((x) => (
              <Link key={x.id} to={`/shoots/${x.id}`} style={{ textAlign: 'left' }}>
                {x.coverId ? <img src={cover(x.coverId)} alt="" style={{ width: '100%', aspectRatio: '1.8', objectFit: 'cover', borderRadius: 6, display: 'block', marginBottom: 10 }} /> : <div style={{ width: '100%', aspectRatio: '1.8', borderRadius: 6, background: '#161615', marginBottom: 10 }} />}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ font: `400 19px ${serif}` }}>{x.name}</span><span style={{ fontSize: 12, color: '#8f8c86' }}>{x.count}</span></div>
                <div style={{ height: 2, background: 'rgba(255,255,255,.1)', margin: '8px 0 6px' }}><i style={{ display: 'block', height: '100%', background: '#a8a59f', width: `${x.reviewPct}%` }} /></div>
                <div style={{ fontSize: 11.5, color: '#6f6c67' }}>{x.reviewPct >= 100 ? `All ${x.sessions} sessions done` : `Reviews ${x.reviewPct}% done`}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
