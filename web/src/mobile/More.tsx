import { useState } from 'react';
import { api, useApi } from '../api';
import { RATINGS, type Collection } from '../data';
import { useStore } from '../store';
import { BackPill, Eyebrow } from './ui';

type S = { photos: number; dist: { value: number; n: number }[]; trend: { month: string; avg: number; n: number }[]; years: string[] };
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const tile = { background: 'var(--surface)', borderRadius: 14, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 6 } as const;

/** Stats on a phone: four numbers, how you rate, reviews over time and the cameras you use most. */
export function MobileStats() {
  const st = useApi<S>('/stats');
  const comps = useApi<Collection[]>('/collections');
  const gear = useApi<{ cameras: { name: string; n: number }[] }>('/gear');
  const d = st.data;
  const reviews = d ? d.dist.reduce((n, x) => n + x.n, 0) : 0;
  const great = d ? d.dist.filter((x) => x.value >= 4).reduce((n, x) => n + x.n, 0) : 0;
  const walls = (comps.data ?? []).filter((c) => c.stage === 'done').length;
  const max = Math.max(1, ...(d?.dist.map((x) => x.n) ?? [1]));
  const trend = d?.trend.slice(-8) ?? [];
  const tmax = Math.max(1, ...trend.map((t) => t.n));
  const cams = (gear.data?.cameras ?? []).slice(0, 5);
  const cmax = Math.max(1, ...cams.map((c) => c.n));
  return (
    <div className="ppage" data-screen-label="Stats">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
        <div style={{ paddingTop: 4 }}><BackPill /></div>
        <h1 style={{ font: '400 56px/1 var(--serif)', margin: 0 }}>Stats</h1>
        {st.error && <p role="alert" className="muted">Something went wrong: {st.error}</p>}
        {d && <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[[d.photos.toLocaleString(), 'Photographs'], [reviews.toLocaleString(), 'Reviews'], [`${reviews ? Math.round((great / reviews) * 100) : 0}%`, 'Rated great or love'], [String(walls), walls === 1 ? 'Wall done' : 'Walls done']].map(([v, l]) => <div key={l} style={tile}><span style={{ font: '400 40px/1 var(--serif)' }}>{v}</span><span style={{ fontSize: 14, color: 'var(--muted)' }}>{l}</span></div>)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Eyebrow>HOW YOU RATE</Eyebrow>
            {RATINGS.map((r) => { const n = d.dist.find((x) => x.value === r.value)?.n ?? 0; return (
              <div key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 36 }}>
                <span style={{ fontSize: 22, width: 36 }} aria-label={r.label}>{r.emoji}</span>
                <span style={{ flex: 1, height: 8, borderRadius: 4, background: 'var(--hair)', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: `${Math.round((n / max) * 100)}%`, background: 'var(--text2)', borderRadius: 4 }} /></span>
                <span style={{ width: 28, textAlign: 'right', font: '400 13px var(--mono)', color: 'var(--muted)' }}>{n}</span>
              </div>); })}
          </div>
          {trend.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><Eyebrow>REVIEWS PER MONTH</Eyebrow><Eyebrow>LAST {trend.length} {trend.length === 1 ? 'MONTH' : 'MONTHS'}</Eyebrow></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 190, borderBottom: '1px solid var(--outline)' }}>
                {trend.map((t, i) => <div key={t.month} title={`${MONTH[Number(t.month.slice(5, 7)) - 1]} · ${t.n}`} style={{ flex: 1, maxWidth: 90, height: `${Math.max(8, Math.round((t.n / tmax) * 100))}%`, borderRadius: '4px 4px 0 0', background: i === trend.length - 1 ? 'var(--text)' : 'var(--chip)' }} />)}
              </div>
            </div>
          )}
          {cams.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Eyebrow style={{ paddingBottom: 8 }}>MOST USED</Eyebrow>
              {cams.map((c) => <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0 0', borderTop: '1px solid var(--hair)' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ fontSize: 17 }}>{c.name}</span><span style={{ font: '400 12px var(--mono)', color: 'var(--faint)', textTransform: 'uppercase' }}>{c.n} photos</span></div><i style={{ display: 'block', height: 2, width: `${Math.round((c.n / cmax) * 100)}%`, background: 'var(--text2)', marginBottom: 14 }} /></div>)}
            </div>
          )}
        </>}
      </div>
    </div>
  );
}

type Recovery = { id: number; title: string; file: string; removedAt: string; expiresAt: string; originalAvailable: boolean; reviews: number };
const ago = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };

/** Recently removed on a phone: what was taken out of Frames, with Restore. */
export function MobileRemoved() {
  const photos = useApi<Recovery[]>('/recovery');
  const days = useApi<{ days: number }>('/recovery/settings');
  const { refreshSummary } = useStore();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const restore = async (p: Recovery) => {
    setBusy(p.id); setErr('');
    try { await api(`/recovery/${p.id}/restore`, { body: {} }); photos.reload(); refreshSummary(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const list = photos.data ?? [];
  return (
    <div className="ppage" data-screen-label="Recently removed">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ paddingTop: 4 }}><BackPill /></div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><h1 style={{ font: '400 44px/1 var(--serif)', margin: 0 }}>Recently removed</h1><span style={{ font: '400 12px var(--mono)', color: 'var(--faint)' }}>{list.length}</span></div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--text2)' }}>Removed photographs stay here for {days.data?.days ?? 30} days. Restoring brings back their ratings, tags and compositions.</p>
        {err && <div role="alert" className="reason">{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--hair)' }}>
          {list.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--hair)' }}>
              <span style={{ width: 52, height: 52, flexShrink: 0, borderRadius: 4, background: 'var(--surface)' }} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 17, overflowWrap: 'anywhere' }}>{p.title || p.file}</span><span style={{ fontSize: 13, color: 'var(--muted)' }}>Removed {ago(p.removedAt)}{p.originalAvailable ? '' : ' · original missing'}</span></span>
              <button disabled={busy !== null} onClick={() => restore(p)} style={{ height: 40, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 15 }}>{busy === p.id ? 'Restoring…' : 'Restore'}</button>
            </div>
          ))}
          {photos.data && list.length === 0 && <div style={{ padding: '24px 0', fontSize: 13.5, color: 'var(--muted)' }}>Nothing removed recently.</div>}
        </div>
      </div>
    </div>
  );
}
