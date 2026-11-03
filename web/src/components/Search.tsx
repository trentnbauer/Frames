import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';
import { Justified } from './bits';

const SUBJECTS = ['fog', 'water', 'birds', 'dusk', 'architecture', 'coast', 'minimal', 'portrait', 'street', 'night'];

/**
 * AI off: plain filename / metadata / tag search.
 * AI on: the same search, plus recognised subject words shown as removable chips.
 * Semantic parsing ("early morning", "no people") needs the AI pipeline, which is not built yet.
 */
export function Search({ onClose }: { onClose: () => void }) {
  const { settings } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [removed, setRemoved] = useState<string[]>([]);
  const [results, setResults] = useState<PhotoLite[]>([]);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const chips = ai ? words.filter((w) => SUBJECTS.includes(w) && !removed.includes(w)) : [];
  const effective = words.filter((w) => !(ai && removed.includes(w))).join(' ');

  useEffect(() => {
    if (!effective) { setResults([]); return; }
    setBusy(true);
    const t = setTimeout(() => {
      api<{ photos: PhotoLite[] }>(`/photos?q=${encodeURIComponent(effective)}`).then((r) => setResults(r.photos)).catch(() => setResults([])).finally(() => setBusy(false));
    }, 200);
    return () => clearTimeout(t);
  }, [effective]);

  const shoots = new Set(results.map((p) => p.shootId)).size;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel" role="dialog" aria-label="Search">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search filenames, metadata and tags…" aria-label="Search query" />
        <div className="chips">
          {chips.map((c) => (
            <span key={c} className="chip">Subject: {c} <button aria-label={`Remove ${c}`} onClick={() => setRemoved([...removed, c])}>✕</button></span>
          ))}
        </div>
        <div className="spread" style={{ marginBottom: 12, fontSize: 12.5 }}>
          <span className="t2">{busy ? 'Searching…' : `${results.length} photographs · ${shoots} ${shoots === 1 ? 'shoot' : 'shoots'}`}</span>
          <span className="faint">{ai ? 'Filename, metadata and tag search' : 'AI off · filename, metadata and tag search'}</span>
        </div>
        {results.length ? (
          <Justified photos={results.slice(0, 10)} h={110} onPick={(p) => { onClose(); nav(`/photo/${p.id}`); }} />
        ) : (
          <div className="empty">{effective && !busy ? 'Nothing matches.' : 'Type to search.'}</div>
        )}
        <div className="foot"><span>Esc close</span></div>
      </div>
    </div>
  );
}
