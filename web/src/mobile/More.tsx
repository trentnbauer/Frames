import { useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';
import { BackPill } from './ui';

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
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ fontSize: 15, overflowWrap: 'anywhere' }}>{p.title || p.file}</span><span style={{ fontSize: 13, color: 'var(--muted)' }}>Removed {ago(p.removedAt)}{p.originalAvailable ? '' : ' · original missing'}</span></span>
              <button disabled={busy !== null} onClick={() => restore(p)} style={{ height: 40, padding: '0 18px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>{busy === p.id ? 'Restoring…' : 'Restore'}</button>
            </div>
          ))}
          {photos.data && list.length === 0 && <div style={{ padding: '24px 0', fontSize: 13.5, color: 'var(--muted)' }}>Nothing removed recently.</div>}
        </div>
      </div>
    </div>
  );
}
