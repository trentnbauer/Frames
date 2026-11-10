import { Link } from 'react-router-dom';
import { useApi } from '../api';
import { RATINGS, type PhotoLite } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';

type S = {
  photos: number; bytes: number; completePct: number; avgRating: number; inCollections: number;
  dist: { value: number; n: number }[]; perShoot: { id: number; name: string; n: number }[]; top: PhotoLite[];
  subjects: { name: string; n: number }[]; tags: { name: string; n: number }[];
  trend: { month: string; avg: number; n: number }[]; bySession: { session: number; avg: number; n: number }[];
};
const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

function Bars({ title, rows }: { title: string; rows: { key: string | number; label: string; n: number; to?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div>
      <div className="label" style={{ marginBottom: 10 }}>{title}</div>
      {rows.length === 0 && <span className="muted" style={{ fontSize: 13 }}>Nothing yet.</span>}
      {rows.map((r) => (
        <div className="bl" key={r.key}>
          {r.to ? <Link to={r.to}>{r.label}</Link> : <span>{r.label}</span>}
          <span className="b"><i style={{ width: `${(r.n / max) * 100}%` }} /></span><span className="v">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

/** Average rating over time as a line. 1 to 5 on the side. */
function Trend({ rows }: { rows: { month: string; avg: number; n: number }[] }) {
  if (rows.length < 2) return <span className="muted" style={{ fontSize: 13 }}>A trend appears once you have reviewed across at least two months.</span>;
  const W = 520, H = 130, pad = 28;
  const x = (i: number) => pad + (i / (rows.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - 1) / 4) * (H - pad * 2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Average rating by month: ${rows.map((r) => `${r.month} ${r.avg}`).join(', ')}`} style={{ width: '100%', maxWidth: 560, display: 'block' }}>
      {[1, 3, 5].map((v) => <g key={v}><line x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} stroke="var(--hair)" /><text x={4} y={y(v) + 4} fill="#6f6c67" fontSize="10" fontFamily="IBM Plex Mono">{v}</text></g>)}
      <polyline fill="none" stroke="#efede8" strokeWidth="1.5" points={rows.map((r, i) => `${x(i)},${y(r.avg)}`).join(' ')} />
      {rows.map((r, i) => <circle key={r.month} cx={x(i)} cy={y(r.avg)} r="3" fill="#efede8"><title>{`${r.month}: ${r.avg} (${r.n} reviews)`}</title></circle>)}
      <text x={pad} y={H - 6} fill="#6f6c67" fontSize="10" fontFamily="IBM Plex Mono">{rows[0].month}</text>
      <text x={W - pad} y={H - 6} textAnchor="end" fill="#6f6c67" fontSize="10" fontFamily="IBM Plex Mono">{rows[rows.length - 1].month}</text>
    </svg>
  );
}

export function Stats() {
  const st = useApi<S>('/stats');
  const d = st.data;
  return (
    <div className="page">
      <Header />
      <Title>Stats</Title>
      {(st.loading || st.error) && <Loading error={st.error} />}
      {d && (
        <>
          <div className="big5">
            {[[d.photos.toLocaleString(), 'photographs'], [size(d.bytes), 'storage'], [`${d.completePct}%`, 'completed all reviews'], [d.avgRating ? d.avgRating.toFixed(1) : '–', 'average rating'], [String(d.inCollections), 'in collections']].map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}
          </div>
          <div className="lists">
            <Bars title="Rating distribution" rows={RATINGS.map((r) => ({ key: r.value, label: `${r.emoji} ${r.label}`, n: d.dist.find((x) => x.value === r.value)?.n ?? 0 }))} />
            <Bars title="Photos per shoot" rows={d.perShoot.map((s) => ({ key: s.id, label: s.name, n: s.n, to: `/shoots/${s.id}` }))} />
          </div>
          <div className="lists">
            <Bars title="Subjects" rows={d.subjects.map((s) => ({ key: s.name, label: s.name, n: s.n, to: `/library?subject=${encodeURIComponent(s.name)}` }))} />
            <Bars title="Tags" rows={d.tags.map((s) => ({ key: s.name, label: s.name, n: s.n, to: `/library?tag=${encodeURIComponent(s.name)}` }))} />
          </div>
          <div className="lists">
            <div><div className="label" style={{ marginBottom: 10 }}>Average rating by month</div><Trend rows={d.trend} /></div>
            <Bars title="Average rating by session (×10)" rows={d.bySession.map((b) => ({ key: b.session, label: `Session ${b.session}`, n: Math.round(b.avg * 10) }))} />
          </div>
          {d.top.length > 0 && (
            <>
              <div className="label" style={{ marginBottom: 12 }}>Highest rated</div>
              <div className="strip" style={{ height: 110 }}>{d.top.map((p) => <Link key={p.id} to={`/photo/${p.id}`} style={{ aspectRatio: String(p.ar) }} aria-label={p.title}><Img p={p} style={{ height: '100%', width: 'auto' }} /></Link>)}</div>
            </>
          )}
        </>
      )}
    </div>
  );
}
