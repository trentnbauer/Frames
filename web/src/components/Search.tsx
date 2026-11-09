import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';
import { Justified } from './bits';
import { AddToComposition } from './AddToComposition';
import { useUi } from '../ui';

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
  const { openNew } = useUi();
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
  const places = useApi<{ name: string; n: number }[]>('/places');
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
  // A place already in use is offered like a tag: "gee" suggests "Geelong".
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const placeHits = words.length ? (places.data ?? []).filter((p) => words.every((w) => p.name.toLowerCase().includes(w))).slice(0, 6) : [];
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
  const ids = picked.size ? [...picked] : results.map((p) => p.id);
  const ring = 'inset 0 0 0 1px rgba(255,255,255,.2)';
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(13,13,13,.7)', zIndex: 40, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', padding: '20px 20px 90px' }}>
      <div role="dialog" aria-label="Search" style={{ width: 860, maxWidth: '100%', maxHeight: 'calc(100vh - 140px)', overflow: 'auto', borderRadius: 22, background: '#1a1a19', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)', padding: '26px 30px 18px' }}>
        <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setParsed(null); setRemoved([]); }} onKeyDown={(e) => { if (e.key === 'Enter') openAll(); }}
          placeholder={ai ? 'Describe what you are looking for…' : 'Search filenames, metadata, places and tags…'} aria-label="Search query"
          style={{ width: '100%', background: 'none', border: 0, outline: 'none', font: "400 30px/1.2 'Instrument Serif',Georgia,serif", marginBottom: 14, padding: 0 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {live.map((c) => <span key={c.key} style={{ display: 'inline-flex', gap: 6, padding: '5px 11px', borderRadius: 999, fontSize: 12.5, background: 'rgba(255,255,255,.08)' }}>{c.label} <button aria-label={`Remove ${c.label}`} onClick={() => setRemoved([...removed, c.key])} style={{ color: '#8f8c86' }}>✕</button></span>)}
        </div>
        {placeHits.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }} aria-label="Places">
            {placeHits.map((p) => <button key={p.name} onClick={() => { onClose(); nav(`/library?place=${encodeURIComponent(p.name)}`); }} style={{ padding: '5px 11px', borderRadius: 999, fontSize: 12.5, background: 'rgba(255,255,255,.08)' }}>Place: {p.name}</button>)}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 12.5 }}>
          <span style={{ color: '#a8a59f' }}>{busy ? 'Searching…' : `${count} ${count === 1 ? 'photograph' : 'photographs'} · ${shoots} ${shoots === 1 ? 'shoot' : 'shoots'}`}</span>
          {results.length > 0 && <button style={{ color: '#a8a59f' }} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setPicked(new Set()); setNote(''); }}>{selecting ? 'Done selecting' : 'Select'}</button>}
          <span style={{ color: '#6f6c67' }}>{ai ? (semantic ? 'Ranked by meaning' : 'AI on · text match') : 'AI off · filename, metadata, place and tag search'}</span>
        </div>
        {results.length ? <Justified photos={results.slice(0, 10)} h={110} {...(selecting ? { picked, onTick: (p: PhotoLite) => setPicked((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }) } : { onPick: (p: PhotoLite) => { onClose(); nav(`/photo/${p.id}`); } })} /> : <div className="empty">{q.trim() && !busy ? 'Nothing matches.' : 'Start typing to search.'}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button disabled={ids.length === 0} onClick={() => { onClose(); openNew({ name: (parsed?.text || q).trim().replace(/^./, (c) => c.toUpperCase()) || 'From search', photoIds: ids }); }} style={{ background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14, opacity: ids.length ? 1 : 0.5 }}>Create composition from {ids.length} {picked.size ? 'selected' : ids.length === 1 ? 'result' : 'results'}</button>
          <span style={{ borderRadius: 999, boxShadow: ring }}><AddToComposition up label="Add to a composition…" ids={ids} onDone={(m) => { setNote(m); setPicked(new Set()); }} /></span>
          {note && <span className="muted" role="status" style={{ fontSize: 12.5 }}>{note}</span>}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6f6c67', display: 'flex', gap: 20 }}><span>↵ open in Library</span><span>Esc close</span></span>
        </div>
      </div>
    </div>
  );
}
