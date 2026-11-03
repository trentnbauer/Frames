import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { RATINGS, type PhotoLite } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';

type S = {
  photos: number; bytes: number; completePct: number; avgRating: number; inCollections: number;
  dist: { value: number; n: number }[]; perShoot: { id: number; name: string; n: number }[]; top: PhotoLite[];
};

const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

export function Stats() {
  const st = useApi<S>('/stats');
  const d = st.data;
  const maxD = Math.max(1, ...(d?.dist.map((x) => x.n) ?? []));
  const maxP = Math.max(1, ...(d?.perShoot.map((x) => x.n) ?? []));
  return (
    <div className="page">
      <Header />
      <Title>Stats</Title>
      {(st.loading || st.error) && <Loading error={st.error} />}
      {d && (
        <>
          <div className="big5">
            {[
              [d.photos.toLocaleString(), 'photographs'],
              [size(d.bytes), 'storage'],
              [`${d.completePct}%`, 'completed all reviews'],
              [d.avgRating ? d.avgRating.toFixed(1) : '–', 'average rating'],
              [String(d.inCollections), 'in collections'],
            ].map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}
          </div>
          <div className="lists">
            <div>
              <div className="label" style={{ marginBottom: 10 }}>Rating distribution</div>
              {RATINGS.map((r) => {
                const n = d.dist.find((x) => x.value === r.value)?.n ?? 0;
                return <div className="bl" key={r.value}><span>{r.emoji} {r.label}</span><span className="b"><i style={{ width: `${(n / maxD) * 100}%` }} /></span><span className="v">{n}</span></div>;
              })}
            </div>
            <div>
              <div className="label" style={{ marginBottom: 10 }}>Photos per shoot</div>
              {d.perShoot.length === 0 && <span className="muted">No shoots yet.</span>}
              {d.perShoot.map((s) => (
                <div className="bl" key={s.id}><span>{s.name}</span><span className="b"><i style={{ width: `${(s.n / maxP) * 100}%` }} /></span><span className="v">{s.n}</span></div>
              ))}
            </div>
          </div>
          {d.top.length > 0 && (
            <>
              <div className="label" style={{ marginBottom: 12 }}>Highest rated</div>
              <div className="strip" style={{ height: 110 }}>
                {d.top.map((p) => (
                  <Link key={p.id} to={`/photo/${p.id}`} style={{ aspectRatio: String(p.ar) }} aria-label={p.title}><Img p={p} style={{ height: '100%', width: 'auto' }} /></Link>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
