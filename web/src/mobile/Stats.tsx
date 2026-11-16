import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { imgUrl, useApi } from '../api';
import { RATINGS, type PhotoLite } from '../data';
import { BackPill, Eyebrow, Row, Seg } from './ui';

type S = {
  year: string; years: string[]; photos: number; bytes: number; completePct: number; avgRating: number; inCollections: number;
  dist: { value: number; n: number }[]; perShoot: { id: number; name: string; n: number }[]; top: PhotoLite[];
  subjects: { name: string; n: number }[]; tags: { name: string; n: number }[];
  trend: { month: string; avg: number; n: number }[]; bySession: { session: number; avg: number; n: number }[];
};
type C = { reviewed: number; shared: number; received: number; average: number | null; notes: number; you: number | null; guests: number | null; community: number | null; favourites: { id: number; avg: number; n: number; title?: string }[] };
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (n: number) => Math.round(n).toLocaleString('en-AU');
const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(0)} GB` : `${Math.round(b / 1e6)} MB`);
const tile = { background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 } as const;

const Tiles = ({ items }: { items: [string, string][] }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
    {items.map(([v, l], i) => <div key={l} style={{ ...tile, gridColumn: items.length % 2 && i === items.length - 1 ? 'span 2' : undefined }}><span style={{ font: '400 40px/1 var(--serif)' }}>{v}</span><span style={{ fontSize: 13, color: 'var(--muted)' }}>{l}</span></div>)}
  </div>
);

/** A titled list of bars, each optionally a link. */
function Bars({ title, rows, more }: { title: string; rows: { label: string; n: number; to?: string }[]; more?: { label: string; to: string } }) {
  const nav = useNavigate();
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (rows.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><Eyebrow>{title.toUpperCase()}</Eyebrow>{more && <button onClick={() => nav(more.to)} style={{ fontSize: 13, color: 'var(--text2)', minHeight: 32 }}>{more.label}</button>}</div>
      {rows.map((r) => (
        <button key={r.label} disabled={!r.to} onClick={() => r.to && nav(r.to)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', gap: 6, minHeight: 44, padding: '8px 0', textAlign: 'left', borderTop: '1px solid var(--hair)' }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{r.label}</span><span style={{ font: '400 13px var(--mono)', color: 'var(--muted)' }}>{fmt(r.n)}</span></span>
          <span style={{ height: 6, borderRadius: 3, background: 'var(--hair)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.round((r.n / max) * 100)}%`, background: 'var(--text2)', borderRadius: 3 }} /></span>
        </button>
      ))}
    </div>
  );
}

const Thumbs = ({ photos, onOpen }: { photos: { id: number; ar: number; label?: string }[]; onOpen: (id: number) => void }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
    {photos.map((p) => <button key={p.id} aria-label={p.label ?? `Photograph ${p.id}`} onClick={() => onOpen(p.id)} style={{ aspectRatio: '1', borderRadius: 4, background: `url(${imgUrl(p.id, 'thumb')}) center/cover var(--surface)` }} />)}
  </div>
);

/** Stats on a phone: everything the wide screen shows (overview, community, imports), in the phone's own layout. */
export function MobileStats() {
  const nav = useNavigate();
  const [tab, setTab] = useState<'overview' | 'community'>('overview');
  const [year, setYear] = useState('');
  const st = useApi<S>(`/stats${year ? `?year=${year}` : ''}`);
  const cm = useApi<C>('/community/stats');
  const d = st.data, c = cm.data;
  const trend = d?.trend ?? [];
  const tmax = Math.max(1, ...trend.map((t) => t.n));
  const line = trend.map((t, i) => `${8 + (trend.length > 1 ? (i / (trend.length - 1)) * 304 : 152)},${96 - ((t.avg - 1) / 4) * 84}`).join(' ');
  const monthName = (m: string) => MONTH[Number(m.slice(5, 7)) - 1] ?? m;
  const yearPill = (y: string, label: string) => <button key={y} aria-pressed={year === y} onClick={() => setYear(y)} style={{ height: 36, padding: '0 16px', borderRadius: 999, fontSize: 13.5, background: year === y ? 'var(--btn-bg)' : 'transparent', color: year === y ? 'var(--btn-fg)' : 'var(--text2)', boxShadow: year === y ? 'none' : 'inset 0 0 0 1px var(--outline)' }}>{label}</button>;
  const note = c && c.you != null && c.community != null ? (c.community > c.you + 0.05 ? 'The community rates your work a little higher than you do.' : c.community < c.you - 0.05 ? 'The community rates your work a little lower than you do.' : 'The community rates your work about the same as you do.') : 'Ratings from the community appear here once others have reviewed your photos.';
  return (
    <div className="ppage" data-screen-label="Stats">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ paddingTop: 4 }}><BackPill /></div>
        <h1 style={{ font: '400 56px/1 var(--serif)', margin: 0 }}>Stats</h1>
        <Seg label="Stats view" value={tab} onPick={setTab} options={[['overview', 'Overview'], ['community', 'Community']]} />
        {st.error && <p role="alert" className="muted">Something went wrong: {st.error}</p>}
        {tab === 'overview' && d && <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{[['', 'All time'], ...d.years.slice(0, 2).map((y) => [y, y])].map(([y, l]) => yearPill(y, l))}</div>
          <Tiles items={[[fmt(d.photos), 'Photographs'], [size(d.bytes), 'Storage'], [`${d.completePct}%`, 'Finished all reviews'], [d.avgRating ? d.avgRating.toFixed(1) : '–', 'Average rating'], [fmt(d.inCollections), 'In compositions']]} />
          <Bars title="Rating distribution" rows={RATINGS.map((r) => ({ label: `${r.emoji}  ${r.label}`, n: d.dist.find((x) => x.value === r.value)?.n ?? 0 }))} />
          {trend.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Eyebrow>AVERAGE RATING OVER TIME</Eyebrow>
              <svg viewBox="0 0 320 110" role="img" aria-label={`Average rating by month, from ${trend[0].avg.toFixed(1)} to ${trend[trend.length - 1].avg.toFixed(1)}`} style={{ width: '100%', height: 'auto' }}>
                {[1, 3, 5].map((v) => <line key={v} x1="8" x2="312" y1={96 - ((v - 1) / 4) * 84} y2={96 - ((v - 1) / 4) * 84} stroke="var(--hair)" />)}
                <polyline points={line} fill="none" stroke="var(--text)" strokeWidth="1.6" strokeLinejoin="round" />
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', font: '400 11px var(--mono)', color: 'var(--faint)' }}><span>{monthName(trend[0].month)}</span><span>{monthName(trend[trend.length - 1].month)}</span></div>
              <Eyebrow style={{ marginTop: 8 }}>REVIEWS PER MONTH</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, borderBottom: '1px solid var(--outline)' }}>
                {trend.slice(-12).map((t) => <div key={t.month} title={`${monthName(t.month)} · ${t.n}`} style={{ flex: 1, height: `${Math.max(6, Math.round((t.n / tmax) * 100))}%`, borderRadius: '3px 3px 0 0', background: 'var(--text2)' }} />)}
              </div>
            </div>
          )}
          {d.bySession.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Eyebrow>AVERAGE BY REVIEW SESSION</Eyebrow>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 110 }}>
                {d.bySession.map((b) => <div key={b.session} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }}><span style={{ font: '400 12px var(--mono)', color: 'var(--muted)' }}>{b.avg.toFixed(1)}</span><i style={{ display: 'block', width: '100%', height: `${Math.max(8, Math.round(((b.avg - 1) / 4) * 70))}%`, borderRadius: '3px 3px 0 0', background: 'var(--text2)' }} /><span style={{ font: '400 11px var(--mono)', color: 'var(--faint)' }}>S{b.session}</span></div>)}
              </div>
            </div>
          )}
          <Bars title="Photos per shoot" rows={d.perShoot.slice(0, 6).map((s) => ({ label: s.name, n: s.n, to: `/shoots/${s.id}` }))} more={d.perShoot.length > 6 ? { label: 'All shoots →', to: '/library' } : undefined} />
          <Bars title="Subjects" rows={d.subjects.slice(0, 8).map((s) => ({ label: s.name, n: s.n, to: `/library?subject=${encodeURIComponent(s.name)}` }))} />
          <Bars title="Tags" rows={d.tags.slice(0, 8).map((s) => ({ label: s.name, n: s.n, to: `/library?tag=${encodeURIComponent(s.name)}` }))} />
          {d.top.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}><Eyebrow>TOP RATED</Eyebrow><Thumbs photos={d.top.slice(0, 9)} onOpen={(id) => nav(`/photo/${id}`)} /></div>}
          <div style={{ display: 'flex', flexDirection: 'column' }}><Row label="Imports" sub="What was brought in, and from where" onClick={() => nav('/stats?tab=imports')} /></div>
        </>}
        {tab === 'community' && c && <>
          <Tiles items={[[fmt(c.reviewed), 'Photos you’ve reviewed'], [fmt(c.shared), 'Of yours shared'], [fmt(c.received), 'Ratings received'], [c.average != null ? c.average.toFixed(1) : '–', 'Community average'], [fmt(c.notes), 'Written notes received']]} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Eyebrow>HOW YOUR RATINGS COMPARE</Eyebrow>
            {([['You', c.you], ['Guests', c.guests], ['Community', c.community]] as [string, number | null][]).map(([l, a]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 36 }}>
                <span style={{ width: 84, fontSize: 14, color: 'var(--text2)' }}>{l}</span>
                <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--hair)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${a == null ? 0 : Math.round((a / 5) * 100)}%`, background: 'var(--text2)', borderRadius: 4 }} /></span>
                <span style={{ width: 32, textAlign: 'right', font: '400 13px var(--mono)', color: 'var(--muted)' }}>{a == null ? '–' : a.toFixed(1)}</span>
              </div>
            ))}
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--text2)' }}>{note}</p>
          </div>
          {c.favourites.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Eyebrow style={{ paddingBottom: 8 }}>THE COMMUNITY’S FAVOURITES OF YOURS</Eyebrow>
              {c.favourites.map((f) => <Row key={f.id} thumb={imgUrl(f.id, 'thumb')} label={f.title || `Photo ${f.id}`} sub={`${f.n} ${f.n === 1 ? 'rating' : 'ratings'}`} meta={f.avg.toFixed(1)} onClick={() => nav(`/photo/${f.id}`)} />)}
            </div>
          )}
        </>}
        {tab === 'community' && !c && !cm.error && <p className="muted">Loading…</p>}
      </div>
    </div>
  );
}
