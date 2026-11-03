import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PHOTOS } from '../data';
import { useStore } from '../store';
import { Justified } from './bits';

const SUBJECTS = ['fog', 'water', 'birds', 'dusk', 'architecture', 'coast', 'minimal'];
const STOP = new Set(['and', 'the', 'of', 'at', 'in', 'a', 'with', 'photos', 'of']);

export function Search({ onClose }: { onClose: () => void }) {
  const { settings } = useStore();
  const ai = settings.ai !== 'off';
  const nav = useNavigate();
  const [q, setQ] = useState(ai ? 'fog over water, early morning, no people' : '');
  const [removed, setRemoved] = useState<string[]>([]);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);

  // AI on: loosely parse the query into chips. AI off: plain filename/metadata matching only.
  const chips = useMemo(() => {
    if (!ai) return [];
    const words = q.toLowerCase().split(/[^a-z0-9:]+/).filter(Boolean);
    const out: { key: string; text: string }[] = [];
    const subj = words.filter((w) => SUBJECTS.includes(w));
    if (subj.length) out.push({ key: 'subject', text: `Subject: ${subj.join(', ')}` });
    if (/early morning|dawn|sunrise/.test(q.toLowerCase())) out.push({ key: 'time', text: 'Time: 05:00–08:00' });
    if (/no people|without people/.test(q.toLowerCase())) out.push({ key: 'exclude', text: 'Exclude: people' });
    return out.filter((c) => !removed.includes(c.key));
  }, [q, ai, removed]);

  const results = useMemo(() => {
    const words = q.toLowerCase().split(/[^a-z0-9._]+/).filter((w) => w && !STOP.has(w));
    if (!words.length) return [];
    const subj = ai ? chips.find((c) => c.key === 'subject')?.text.slice(9).split(', ') : null;
    return PHOTOS.filter((p) => {
      if (ai && subj) return p.tags.some((t) => t.accepted && subj.includes(t.name)) || subj.some((s) => p.title.toLowerCase().includes(s));
      const hay = `${p.file} ${p.title} ${p.camera} ${p.lens} ${p.tags.map((t) => t.name).join(' ')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [q, ai, chips]);

  const shoots = new Set(results.map((p) => p.shootId)).size;
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel" role="dialog" aria-label="Search">
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} placeholder={ai ? 'Search or ask…' : 'Search filenames and metadata…'} aria-label="Search query" />
        <div className="chips">
          {chips.map((c) => (
            <span key={c.key} className="chip">{c.text} <button aria-label={`Remove ${c.text}`} onClick={() => setRemoved([...removed, c.key])}>✕</button></span>
          ))}
          {['Shoot', 'Colour', 'Rating', 'Location'].map((f) => (
            <span key={f} className="chip sug">+ {f}</span>
          ))}
        </div>
        <div className="spread" style={{ marginBottom: 12, fontSize: 12.5 }}>
          <span className="t2">{results.length} photographs · {shoots} {shoots === 1 ? 'shoot' : 'shoots'}</span>
          <span className="faint">{ai ? `Semantic search · ${settings.ai === 'local' ? 'local model' : 'external provider'}` : 'AI off · filename and metadata search'}</span>
        </div>
        {results.length ? (
          <Justified photos={results.slice(0, 10)} h={110} onPick={(p) => { onClose(); nav(`/photo/${p.id}`); }} />
        ) : (
          <div className="empty">{q ? 'Nothing matches.' : 'Type to search.'}</div>
        )}
        <div className="foot"><span>↵ open results</span><span>⌥↵ save as collection</span><span>Tab filters</span><span>Esc close</span></div>
      </div>
    </div>
  );
}
