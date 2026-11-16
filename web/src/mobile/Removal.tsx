import { useState } from 'react';
import { api, imgUrl, useApi } from '../api';
import { Sheet } from '../components/Sheet';
import { RATINGS, fmtDate, type PhotoFull } from '../data';
import { primaryBtn } from './ui';

/** Removal review on a phone: one suggested photograph at a time, with your rating history, Keep and Delete…. */
export function MobileRemoval({ onChanged, onLeave }: { onChanged: () => void; onLeave: () => void }) {
  const list = useApi<{ below: number; sessions: number; photos: { id: number; avg: number }[] }>('/photos/delete-suggestions');
  const current = list.data?.photos[0] ?? null;
  const photo = useApi<PhotoFull>(current ? `/photos/${current.id}` : null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const act = async (kind: 'keep' | 'delete') => {
    if (!current || busy) return;
    setBusy(true); setErr('');
    try {
      if (kind === 'keep') await api(`/photos/${current.id}/removal/keep`, { body: {} });
      else await api(`/photos/${current.id}/removal/delete`, { body: { confirm: true } });
      setAsking(false); list.reload(); onChanged();
    } catch (e) { setErr((e as Error).message); setAsking(false); } finally { setBusy(false); }
  };
  const p = photo.data;
  const reviews = p?.reviews ?? [];
  const avg = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : current?.avg ?? 0;
  const face = RATINGS[Math.min(4, Math.max(0, Math.round(avg) - 1))];
  const left = list.data?.photos.length ?? 0;
  const head = (
    <div style={{ position: 'absolute', top: 'max(14px, env(safe-area-inset-top))', left: 14, right: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <button onClick={onLeave} style={{ height: 36, padding: '0 14px', borderRadius: 999, background: 'rgba(255,255,255,.1)', fontSize: 13, color: '#a8a59f' }}>← Back</button>
      {left > 0 && <span style={{ font: "400 11.5px 'IBM Plex Mono',monospace", letterSpacing: '.06em', color: '#6f6c67' }}>{left} TO DECIDE</span>}
    </div>
  );
  if (list.data && !current) {
    return (
      <div data-screen-label="Removal review" style={{ position: 'fixed', inset: 0, background: '#000', color: '#efede8', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: '0 28px' }}>
        {head}
        <span style={{ font: "500 11px 'IBM Plex Mono',monospace", letterSpacing: '.08em', color: '#6f6c67' }}>REMOVAL REVIEW</span>
        <span style={{ font: "400 46px/1 'Instrument Serif',Georgia,serif" }}>Nothing to decide.</span>
        <span style={{ fontSize: 14, lineHeight: 1.5, color: '#a8a59f' }}>No photographs are waiting for a removal decision.</span>
        <button onClick={onLeave} style={{ ...primaryBtn, background: '#efede8', color: '#0d0d0d', marginTop: 12 }}>Done</button>
      </div>
    );
  }
  return (
    <div data-screen-label="Removal review" style={{ position: 'fixed', inset: 0, background: '#000', color: '#efede8', overflowY: 'auto' }}>
      {head}
      {current && (
        <div style={{ display: 'flex', flexDirection: 'column', padding: '88px 20px 40px', minHeight: '100%', boxSizing: 'border-box' }}>
          <div role="img" aria-label={p?.title || 'Photograph'} style={{ width: 'calc(100% + 16px)', margin: '0 -8px', height: 'min(38dvh, 360px)', background: `url(${imgUrl(current.id, 'preview')}) center/contain no-repeat` }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 28 }}>
            <span style={{ font: "500 11px 'IBM Plex Mono',monospace", letterSpacing: '.08em', color: '#6f6c67' }}>REMOVAL REVIEW</span>
            <span style={{ font: "400 36px/1.05 'Instrument Serif',Georgia,serif", overflowWrap: 'anywhere' }}>{p?.title || p?.file || ''}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14, borderTop: '1px solid rgba(255,255,255,.08)' }}>
            {[...reviews].reverse().map((r) => <div key={`${r.session}-${r.date}`} style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 50, borderBottom: '1px solid rgba(255,255,255,.08)' }}><span style={{ fontSize: 24, width: 42 }}>{RATINGS[r.rating - 1].emoji}</span><span style={{ flex: 1, fontSize: 16 }}>{RATINGS[r.rating - 1].label}</span><span style={{ font: "400 12.5px 'IBM Plex Mono',monospace", color: '#8f8c86' }}>{fmtDate(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>)}
          </div>
          <span style={{ margin: '16px 0 18px', fontSize: 15, color: '#a8a59f' }}>Personal average {face.label} over {reviews.length || list.data?.sessions || 1} review{reviews.length === 1 ? '' : 's'}.</span>
          {err && <div role="alert" style={{ marginBottom: 10, fontSize: 13, color: 'var(--danger)' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 16 }}>
            <button disabled={busy} onClick={() => act('keep')} style={{ flex: 1, height: 50, borderRadius: 999, boxShadow: 'inset 0 0 0 1px rgba(239,237,232,.25)', fontSize: 16 }}>Keep</button>
            <button disabled={busy} onClick={() => setAsking(true)} style={{ flex: 1, height: 50, borderRadius: 999, background: 'var(--danger)', color: '#0d0d0d', fontWeight: 500, fontSize: 16 }}>Delete…</button>
          </div>
          <span style={{ marginTop: 18, fontSize: 15, color: '#8f8c86' }}>Keep hides it here until you rate it again.</span>
        </div>
      )}
      {asking && (
        <Sheet title="Remove this photo from Frames?" sub="Its reviews, tags and composition places go with it. The original file is kept." onClose={() => setAsking(false)}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setAsking(false)} style={{ height: 46, padding: '0 16px', fontSize: 14, color: 'var(--text2)' }}>Cancel</button>
            <button disabled={busy} onClick={() => act('delete')} style={{ ...primaryBtn, height: 46, padding: '0 22px', fontSize: 14.5, background: 'var(--danger)', color: '#0d0d0d' }}>Remove</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
