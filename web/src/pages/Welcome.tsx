import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import { Header } from '../components/bits';
import type { PhotoLite } from '../data';

const STEPS: [string, string, string[]][] = [
  ['Bring your photos in', 'Frames starts with your photos. Bring in a shoot from this computer or a cloud folder, and it sorts them for you.', ['Upload from this computer, or connect Google Drive, iCloud or Dropbox', 'New photos are grouped into shoots by day, ready to name', 'Your originals are only ever read, never changed']],
  ['Shoots and compositions', 'A shoot is a day out or a roll of film. A composition is a wall of prints you’re planning to hang.', ['Each composition has prints, sizes, frames and mats', 'Frames ranks candidate photos to fill each print', 'Export sends the originals with print notes to your lab']],
  ['Rate a little, often', 'Each photo comes back a few times over weeks, so the score that settles is honest.', ['A review is about 12 photos and takes a few minutes', 'Your past ratings stay hidden while you rate', 'Settled scores rank compositions and fill your portfolio']],
  ['Ask other people', 'Share a composition with a link and let friends weigh in before you print.', ['Guests don’t need an account', 'They rate photos and suggest swaps; you approve or deny', 'Their scores stay separate from yours']],
];

/** A short tour for someone new. Informational only: no in-page links, and no bottom bar. Skip sits on the first page only. */
export function Welcome() {
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const photos = useApi<{ photos: PhotoLite[] }>('/photos?limit=8');
  // Shown once: it counts as seen as soon as it opens, so it never comes back half-done.
  useEffect(() => { void api('/welcome', { method: 'PUT', body: { done: true } }).catch(() => undefined); }, []);
  const finish = async () => { await api('/welcome', { method: 'PUT', body: { done: true } }).catch(() => undefined); nav('/', { replace: true }); };
  const [title, lead, facts] = STEPS[i];
  const last = i === STEPS.length - 1;
  const pic = photos.data?.photos[(i * 2) % Math.max(1, photos.data.photos.length)];
  return (
    <div className="page welcome">
      <Header />
      <div className="welcome-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 520px', gap: 208, alignItems: 'center', minHeight: 'calc(100vh - 200px)' }}>
        <div style={{ maxWidth: 600 }}>
          <div className="eyebrow" style={{ marginBottom: 16 }}>Welcome to Frames · {i + 1} of {STEPS.length}</div>
          <h1 className="serif" style={{ fontSize: 64, lineHeight: 1.02, margin: '0 0 24px' }}>{title}</h1>
          <p className="t2" style={{ fontSize: 17, lineHeight: 1.5, margin: '0 0 24px' }}>{lead}</p>
          <div style={{ borderTop: '1px solid var(--hair)' }}>
            {facts.map((f, k) => (
              <div key={f} style={{ display: 'flex', gap: 20, alignItems: 'baseline', padding: '12px 0', borderBottom: '1px solid var(--hair)', fontSize: 15 }}>
                <span className="mono faint" style={{ fontSize: 11 }}>0{k + 1}</span><span>{f}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, margin: '28px 0 22px' }} role="tablist" aria-label="Steps">
            {STEPS.map((_, k) => <button key={k} role="tab" aria-selected={k === i} aria-label={`Step ${k + 1}`} onClick={() => setI(k)} style={{ width: 8, height: 8, borderRadius: '50%', background: k === i ? 'var(--text)' : 'var(--outline)' }} />)}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {i > 0 ? <button className="btn outline lg" onClick={() => setI(i - 1)}>Back</button> : <button className="btn outline lg" onClick={finish}>Skip</button>}
            {last ? <button className="btn primary lg" onClick={finish}>Start using Frames</button> : <button className="btn primary lg" onClick={() => setI(i + 1)}>Next</button>}
          </div>
        </div>
        <div style={{ aspectRatio: '520 / 600', borderRadius: 14, overflow: 'hidden', background: 'var(--surface)' }}>
          {pic ? <img src={imgUrl(pic.id, 'preview')} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, var(--raised), var(--surface))' }} />}
        </div>
      </div>
    </div>
  );
}
