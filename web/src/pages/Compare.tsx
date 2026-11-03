import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import { RATINGS, fmtDate, type PhotoFull } from '../data';
import { Fit, Header, Loading, Swatches } from '../components/bits';

/** Two photographs side by side, to choose between them. */
export function Compare() {
  const [sp] = useSearchParams();
  const r = useApi<{ a: PhotoFull; b: PhotoFull; similarity: number }>(`/compare?a=${sp.get('a')}&b=${sp.get('b')}`);
  if (!r.data) return <div className="page"><Header /><Loading error={r.error} /></div>;
  const { a, b, similarity } = r.data;
  const rows: [string, (p: PhotoFull) => string][] = [
    ['Average rating', (p) => (p.reviewCount ? `${p.avgRating.toFixed(1)} ${RATINGS[Math.round(p.avgRating) - 1].emoji} (${p.reviewCount})` : 'Not reviewed')],
    ['Pixels', (p) => (p.w ? `${p.w} × ${p.h}` : '–')],
    ['Captured', (p) => fmtDate(p.capturedAt, { day: 'numeric', month: 'short', year: 'numeric' }) || '–'],
    ['Camera', (p) => p.camera || '–'],
    ['Exposure', (p) => p.exposure || '–'],
    ['Light', (p) => (p.brightness === null ? '–' : `${p.brightness < 0.35 ? 'dark' : p.brightness > 0.65 ? 'bright' : 'mid-tone'}, ${p.contrast! < 0.15 ? 'low' : p.contrast! > 0.28 ? 'high' : 'medium'} contrast`)],
    ['Subjects', (p) => p.tags.filter((t) => t.kind === 'subject' && t.accepted).map((t) => t.name).join(', ') || '–'],
    ['Tags', (p) => p.tags.filter((t) => t.kind === 'tag' && t.accepted).map((t) => t.name).join(', ') || '–'],
  ];
  const side = (p: PhotoFull) => (
    <div style={{ minWidth: 0 }}>
      <div className="cmp-stage"><Fit p={p} /></div>
      <h2 className="serif" style={{ fontSize: 24, margin: '12px 0 6px' }}><Link to={`/photo/${p.id}`}>{p.title}</Link></h2>
      <Swatches palette={p.palette} />
    </div>
  );
  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ fontSize: 13, marginBottom: 18 }}>
        <Link to={`/photo/${a.id}`} className="t2">← Back</Link>
        <span className="t2">{Math.round(similarity * 100)}% alike</span>
      </div>
      <div className="cmp">{side(a)}{side(b)}</div>
      <table className="cmp-table">
        <tbody>{rows.map(([k, f]) => <tr key={k}><th>{k}</th><td>{f(a)}</td><td>{f(b)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
