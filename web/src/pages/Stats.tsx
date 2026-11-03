import { Link } from 'react-router-dom';
import { COLLECTIONS, PHOTOS, RATINGS, SHOOTS, avg } from '../data';
import { Header, Img, Title } from '../components/bits';

export function Stats() {
  const all = PHOTOS.flatMap((p) => p.reviews.map((r) => r.rating));
  const dist = RATINGS.map((r) => ({ ...r, n: all.filter((x) => x === r.value).length }));
  const maxD = Math.max(...dist.map((d) => d.n), 1);
  const per = SHOOTS.map((s) => ({ s, n: PHOTOS.filter((p) => p.shootId === s.id).length }));
  const maxP = Math.max(...per.map((x) => x.n), 1);
  const complete = Math.round((PHOTOS.filter((p) => p.reviews.length >= 6).length / PHOTOS.length) * 100);
  const inColl = new Set(COLLECTIONS.flatMap((c) => c.photoIds)).size;
  const top = [...PHOTOS].sort((a, b) => avg(b.reviews) - avg(a.reviews)).slice(0, 10);
  const gb = (PHOTOS.reduce((n, p) => n + p.sizeMb, 0) / 1024).toFixed(1);

  return (
    <div className="page">
      <Header />
      <Title>Stats</Title>
      <div className="big5">
        {[
          [String(PHOTOS.length), 'photographs'],
          [`${gb} GB`, 'storage'],
          [`${complete}%`, 'completed all reviews'],
          [(all.reduce((a, b) => a + b, 0) / all.length).toFixed(1), 'average rating'],
          [String(inColl), 'in collections'],
        ].map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}
      </div>
      <div className="lists">
        <div>
          <div className="label" style={{ marginBottom: 10 }}>Rating distribution</div>
          {dist.map((d) => (
            <div className="bl" key={d.value}><span>{d.emoji} {d.label}</span><span className="b"><i style={{ width: `${(d.n / maxD) * 100}%` }} /></span><span className="v">{d.n}</span></div>
          ))}
        </div>
        <div>
          <div className="label" style={{ marginBottom: 10 }}>Photos per shoot</div>
          {per.map(({ s, n }) => (
            <div className="bl" key={s.id}><span>{s.name}</span><span className="b"><i style={{ width: `${(n / maxP) * 100}%` }} /></span><span className="v">{n}</span></div>
          ))}
        </div>
      </div>
      <div className="label" style={{ marginBottom: 12 }}>Highest rated</div>
      <div className="strip" style={{ height: 110 }}>
        {top.map((p) => (
          <Link key={p.id} to={`/photo/${p.id}`} style={{ aspectRatio: String(p.ar) }} aria-label={p.title}><Img p={p} style={{ height: '100%', width: 'auto' }} /></Link>
        ))}
      </div>
    </div>
  );
}
