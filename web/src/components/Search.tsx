import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';
import { Justified } from './bits';
import { AddToComposition } from './AddToComposition';

type Parsed = { text: string; subjects: string[]; exclude: string[]; colours: string[]; time: { from: string; to: string } | null };
type Chip = { key: string; label: string };

/**
 * AI off: filename, metadata, tag and place search.
 * AI on: the same, ranked by meaning, and the sentence is split into removable chips
 * ("fog over water, early morning, no people" becomes a subject, a time of day and an exclusion).
 */
export function Search({ onClose }: { onClose: () => void }) {
  const { settings } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [results, setResults] = useState<PhotoLite[]>([]);
  const [count, setCount] = useState(0);
  const [semantic, setSemantic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onClose]);

  const chips: Chip[] = [];
  if (parsed) {
    if (parsed.subjects.length) chips.push({ key: 'subjects', label: `Subject: ${parsed.subjects.join(', ')}` });
    if (parsed.exclude.length) chips.push({ key: 'exclude', label: `Exclude: ${parsed.exclude.join(', ')}` });
    if (parsed.time) chips.push({ key: 'time', label: `Time: ${parsed.time.from}–${parsed.time.to}` });
    if (parsed.colours.length) chips.push({ key: 'colours', label: `Colour: ${parsed.colours.join(', ')}` });
  }
  const live = chips.filter((c) => !removed.includes(c.key));

  const params = () => {
    const p = new URLSearchParams();
    const text = parsed?.text || q;
    if (text.trim()) p.set('q', text.trim());
    if (parsed) {
      if (!removed.includes('subjects') && parsed.subjects.length) p.set('subject', parsed.subjects.join(','));
      if (!removed.includes('exclude') && parsed.exclude.length) p.set('exclude', parsed.exclude.join(','));
      if (!removed.includes('time') && parsed.time) p.set('time', `${parsed.time.from}-${parsed.time.to}`);
      if (!removed.includes('colours') && parsed.colours.length) p.set('colour', parsed.colours.join(','));
    }
    if (ai && q.trim()) p.set('semantic', '1');
    return p;
  };

  // Debounced: understand the sentence, then search.
  useEffect(() => {
    if (!q.trim()) { setResults([]); setParsed(null); setCount(0); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        let pr = parsed;
        if (ai && !parsed) {
          pr = (await api<{ parsed: Parsed | null }>('/search/parse', { body: { q } }).catch(() => ({ parsed: null }))).parsed;
          setParsed(pr);
        }
        const p = params();
        // Subject chips narrow the search; the sentence itself still ranks by meaning.
        const r = await api<{ photos: PhotoLite[]; count: number; semantic: boolean }>(`/photos?${p}`);
        setResults(r.photos); setCount(r.count); setSemantic(r.semantic);
      } catch { setResults([]); setCount(0); } finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, removed.join(','), parsed ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const shoots = new Set(results.map((p) => p.shootId)).size;
  const openAll = () => { onClose(); nav(`/library?${params()}`); };
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="panel" role="dialog" aria-label="Search">
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setParsed(null); setRemoved([]); }} onKeyDown={(e) => { if (e.key === 'Enter') openAll(); }}
          placeholder={ai ? 'Describe what you are looking for…' : 'Search filenames, metadata, places and tags…'} aria-label="Search query" />
        <div className="chips">
          {live.map((c) => <span key={c.key} className="chip">{c.label} <button aria-label={`Remove ${c.label}`} onClick={() => setRemoved([...removed, c.key])}>✕</button></span>)}
        </div>
        <div className="spread" style={{ marginBottom: 12, fontSize: 12.5 }}>
          <span className="t2">{busy ? 'Searching…' : `${count} ${count === 1 ? 'photograph' : 'photographs'} · ${shoots} ${shoots === 1 ? 'shoot' : 'shoots'}`}</span>
          {results.length > 0 && <button className="t2" aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setPicked(new Set()); setNote(''); }}>{selecting ? 'Done selecting' : 'Select'}</button>}
          <span className="faint">{ai ? (semantic ? 'Ranked by meaning' : 'AI on · text match') : 'AI off · filename, metadata, place and tag search'}</span>
        </div>
        {results.length ? <Justified photos={results.slice(0, 10)} h={110} {...(selecting ? { picked, onTick: (p: PhotoLite) => setPicked((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }) } : { onPick: (p: PhotoLite) => { onClose(); nav(`/photo/${p.id}`); } })} /> : <div className="empty">{q.trim() && !busy ? 'Nothing matches.' : 'Type to search.'}</div>}
        {selecting && (
          <div className="selbar" style={{ position: 'static' }}>
            <span>{picked.size} selected</span>
            <button className="t2" onClick={() => setPicked(new Set(results.slice(0, 10).map((p) => p.id)))}>Select the {Math.min(10, results.length)} shown</button>
            <AddToComposition up ids={[...picked]} onDone={(m) => { setNote(m); setPicked(new Set()); }} />
            {note && <span className="muted" role="status">{note}</span>}
          </div>
        )}
        <div className="foot"><span>↵ open all results in Library</span><span>Esc close</span></div>
      </div>
    </div>
  );
}
