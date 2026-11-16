import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';
import { JustifiedGrid, PickedBar, isDue, serif, useShoots, useToast } from './parts';

/** To do: photographs in no shoot, as one list to choose from and move into a new or existing shoot together. */
export function OrphanTodo() {
  const nav = useNavigate();
  const { refreshSummary } = useStore();
  const list = useApi<{ photos: PhotoLite[] }>('/photos?orphaned=1');
  const shoots = useShoots();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toast = useToast();
  const photos = list.data?.photos ?? [];
  const flip = (id: number) => setPicked((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const every = photos.length > 0 && photos.every((p) => picked.has(p.id));
  return (
    <div className="page-shell" data-screen-label="Put photographs in a shoot" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div><button onClick={() => nav('/todo')} style={{ display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 12px', borderRadius: 999, color: 'var(--text2)', fontSize: 13.5, background: 'var(--hover)' }}>← To do</button></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ font: `400 44px/1 ${serif}`, margin: 0 }}>Put photographs in a shoot</h1>
          <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{photos.length} {photos.length === 1 ? 'photograph is' : 'photographs are'} in no shoot yet. Choose some, then move them into a new or existing shoot.</span>
        </div>
        {photos.length > 0 && <button onClick={() => setPicked(every ? new Set() : new Set(photos.map((p) => p.id)))} style={{ fontSize: 13.5, color: 'var(--text2)' }}>{every ? 'Clear all' : 'Select all'}</button>}
      </div>
      <JustifiedGrid photos={photos} selecting picked={picked} due={isDue} onClick={(p) => flip(p.id)} />
      {list.data && photos.length === 0 && <div style={{ padding: 32, borderRadius: 12, background: 'var(--surface)', color: 'var(--muted)', fontSize: 14 }}>Every photograph is in a shoot.</div>}
      <PickedBar ids={[...picked]} photos={photos} shoots={shoots.data ?? []} onClear={() => setPicked(new Set())} onChanged={() => { list.reload(); shoots.reload(); refreshSummary(); }} say={toast.say} />
      {toast.node}
    </div>
  );
}
