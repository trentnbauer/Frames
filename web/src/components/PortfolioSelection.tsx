import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { PhotoLite } from '../data';

/** The manual portfolio selection belongs in portfolio settings, rather than among planned walls. */
export function PortfolioSelection({ onChanged }: { onChanged: () => void }) {
  const marks = useApi<{ hand: number[] }>('/portfolio/marks');
  const library = useApi<{ photos: PhotoLite[] }>('/photos');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const selected = new Set(marks.data?.hand ?? []);
  const photos = (library.data?.photos ?? []).filter((p) => selected.has(p.id));
  return <>
    {(error || marks.error || library.error) && <p role="alert" className="reason">{error || marks.error || library.error}</p>}
    {(marks.loading || library.loading) ? <p className="muted">Loading…</p> : !photos.length ? <p className="muted">No photographs added by hand. Add them from a photo’s page or the Library.</p> : <div style={{ maxHeight: '55vh', overflow: 'auto' }}>{photos.map((p) => <div key={p.id} className="row" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Link to={`/photo/${p.id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}><img src={imgUrl(p.id, 'thumb')} alt="" style={{ width: 64, height: 48, objectFit: 'contain' }} /><span>{p.title || p.file}</span></Link>
      <button className="btn outline" disabled={busy !== null} aria-label={`Remove ${p.title || p.file} from portfolio`} onClick={async () => {
        setBusy(p.id); setError('');
        try { await api(`/portfolio/photos/${p.id}`, { body: { on: false } }); marks.reload(); onChanged(); }
        catch (e) { setError((e as Error).message); } finally { setBusy(null); }
      }}>Remove</button>
    </div>)}</div>}
  </>;
}
