import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, imgUrl } from '../api';
import { RATINGS, type PhotoLite } from '../data';
import { Header } from '../components/Shell';
import ProtoMore from '../proto/ProtoMore';

type S = {
  year: string; years: string[]; photos: number; bytes: number; completePct: number; avgRating: number; inCollections: number;
  dist: { value: number; n: number }[]; perShoot: { id: number; name: string; n: number }[]; top: PhotoLite[];
  subjects: { name: string; n: number }[]; tags: { name: string; n: number }[];
  trend: { month: string; avg: number; n: number }[]; bySession: { session: number; avg: number; n: number }[];
};
type C = { reviewed: number; shared: number; received: number; average: number | null; notes: number; you: number | null; guests: number | null; community: number | null; favourites: { id: number; avg: number; n: number; title?: string }[] };
const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(0)} GB` : `${Math.round(b / 1e6)} MB`);
const fmt = (n: number) => Math.round(n).toLocaleString('en-AU');
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Stats (design: Proto More, page "stats"): the view model comes straight from the numbers. */
export function Stats() {
  const nav = useNavigate();
  const [year, setYear] = useState('');
  const st = useApi<S>(`/stats${year ? `?year=${year}` : ''}`);
  const cm = useApi<C>('/community/stats');
  const d = st.data, c = cm.data;
  const bars = (title: string, rows: { label: string; n: number; to?: string }[], more?: string, to?: string) => {
    const max = Math.max(1, ...rows.map((r) => r.n));
    return { title, more: more ?? '', to: to ?? '', rows: rows.map((r) => ({ label: r.label, v: fmt(r.n), pct: Math.round((r.n / max) * 100) + '%', to: r.to ?? '' })) };
  };
  const trend = d?.trend ?? [];
  const pts = trend.map((t, i) => `${32 + (trend.length > 1 ? (i / (trend.length - 1)) * 668 : 334)},${140 - ((t.avg - 1) / 4) * 120}`).join(' ');
  const v = d ? {
    isStats: true, isTodo: false, isCompare: false, isDupes: false, isNew: false, isWelcome: false,
    ranges: ['', ...d.years.slice(0, 2)].map((y) => ({ label: y || 'All time', bg: year === y ? 'var(--text)' : 'transparent', fg: year === y ? 'var(--bg)' : 'var(--text2)', go: () => setYear(y) })),
    big: [[fmt(d.photos), 'photographs'], [size(d.bytes), 'storage'], [`${d.completePct}%`, 'finished all reviews'], [d.avgRating ? d.avgRating.toFixed(1) : '–', 'average rating'], [fmt(d.inCollections), 'in compositions']].map(([v2, l]) => ({ v: v2, l })),
    statLists: [
      bars('Rating distribution', RATINGS.map((r) => ({ label: `${r.emoji} ${r.label}`, n: d.dist.find((x) => x.value === r.value)?.n ?? 0 }))),
      bars('Photos per shoot', d.perShoot.map((s) => ({ label: s.name, n: s.n, to: `/shoots/${s.id}` })), 'All shoots →', 'shoots'),
      bars('Subjects', d.subjects.map((s) => ({ label: s.name, n: s.n, to: `/library?subject=${encodeURIComponent(s.name)}` }))),
      bars('Tags', d.tags.map((s) => ({ label: s.name, n: s.n, to: `/library?tag=${encodeURIComponent(s.name)}` }))),
    ],
    months: trend.map((t) => MONTH[Number(t.month.slice(5, 7)) - 1] ?? t.month), trendPts: pts,
    sessions: d.bySession.map((b) => ({ l: 'S' + b.session, v: b.avg.toFixed(1), h: Math.max(8, Math.round(((b.avg - 1) / 4) * 100)) + '%' })),
    top: d.top.map((p) => ({ src: imgUrl(p.id, 'thumb'), ar: p.ar, go: () => nav(`/photo/${p.id}`) })),
    comBig: c ? [[fmt(c.reviewed), 'photos you’ve reviewed'], [fmt(c.shared), 'of yours shared'], [fmt(c.received), 'ratings received'], [c.average != null ? c.average.toFixed(1) : '–', 'community average'], [fmt(c.notes), 'written notes received']].map(([v2, l]) => ({ v: v2, l })) : [],
    comCompare: c ? [['You', c.you, 'var(--text2)'], ['Guests', c.guests, '#d9d6cf'], ['Community', c.community, 'var(--text)']].map(([label, a, col]) => ({ label, c: col, v: a == null ? '–' : (a as number).toFixed(1), pct: a == null ? '0%' : Math.round(((a as number) / 5) * 100) + '%' })) : [],
    comNote: c && c.you != null && c.community != null ? (c.community > c.you + 0.05 ? 'The community rates your work a little higher than you do.' : c.community < c.you - 0.05 ? 'The community rates your work a little lower than you do.' : 'The community rates your work about the same as you do.') : 'Ratings from the community appear here once others have reviewed your photos.',
    comTop: (c?.favourites ?? []).map((f) => ({ src: imgUrl(f.id, 'thumb'), name: f.title || `Photo ${f.id}`, n: f.n, avg: f.avg.toFixed(1), go: () => nav(`/photo/${f.id}`) })),
  } : null;
  return (
    <div className="page-shell">
      <Header />
      {v ? <ProtoMore page="stats" v={v} /> : st.error ? <p role="alert" className="muted">Something went wrong: {st.error}</p> : null}
    </div>
  );
}
