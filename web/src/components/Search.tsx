import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import type { PhotoLite } from '../data';
import { useStore } from '../store';
import { Justified } from './bits';
import { AddToComposition } from './AddToComposition';
import type { Collection, Shoot } from '../data';
import { imgUrl } from '../api';
import { useUi } from '../ui';

type Parsed = { text: string; subjects: string[]; exclude: string[]; colours: string[]; time: { from: string; to: string } | null };
type Chip = { key: string; label: string };
type Meta = { chips: { key: string; kind: string; label: string; param: string; value: string }[]; files: { id: number; file: string; camera: string; date: string }[] };

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
  const shootList = useApi<Shoot[]>('/shoots');
  const compList = useApi<Collection[]>('/collections');
  const [sel, setSel] = useState(0);
  const [meta, setMeta] = useState<Meta>({ chips: [], files: [] });
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
  const metaLive = meta.chips.filter((c) => !removed.includes(c.key));

  const params = (metaNow: Meta['chips'] = metaLive) => {
    const p = new URLSearchParams();
    const text = parsed?.text || q;
    if (text.trim() && metaNow.length === 0) p.set('q', text.trim());
    for (const c of metaNow) p.set(c.param, c.value);
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
    if (!q.trim()) { setResults([]); setParsed(null); setCount(0); setMeta({ chips: [], files: [] }); return; }
    setBusy(true);
    const t = setTimeout(async () => {
      try {
        const mm = await api<Meta>(`/search/meta?q=${encodeURIComponent(q)}`).catch(() => ({ chips: [], files: [] } as Meta));
        setMeta(mm);
        let pr = parsed;
        if (ai && !parsed) {
          pr = (await api<{ parsed: Parsed | null }>('/search/parse', { body: { q } }).catch(() => ({ parsed: null }))).parsed;
          setParsed(pr);
        }
        const p = params(mm.chips.filter((c) => !removed.includes(c.key)));
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
  // Shoots and compositions whose name has every word typed. Up and down move through them, Enter opens.
  type Hit = { key: string; name: string; kind: string; to: string; cover: number | null };
  const hits: Hit[] = (words.length ? [
    ...(shootList.data ?? []).filter((x) => words.every((w) => x.name.toLowerCase().includes(w))).map((x) => ({ key: `s${x.id}`, name: x.name, kind: `Shoot · ${x.count}`, to: `/shoots/${x.id}`, cover: x.coverId })),
    ...(compList.data ?? []).filter((x) => words.every((w) => x.name.toLowerCase().includes(w))).map((x) => ({ key: `c${x.id}`, name: x.name, kind: `Composition · ${x.layout.prints.length} × ${x.layout.prints[0]?.size ?? ''}`, to: `/collections/${x.id}`, cover: x.chosenIds[0] ?? x.photoIds[0] ?? null })),
  ] : []).slice(0, 5);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && hits.length) { e.preventDefault(); setSel((i) => (i + 1) % hits.length); }
      if (e.key === 'ArrowUp' && hits.length) { e.preventDefault(); setSel((i) => (i + hits.length - 1) % hits.length); }
      if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); if (hits[sel]) { onClose(); nav(hits[sel].to); } else if (results.length) openAll(); }
    };
    window.addEventListener('keydown', f, true);
    return () => window.removeEventListener('keydown', f, true);
  });
  return (
    <div className="mscrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ paddingTop: 120 }}>
      <div className="modal" role="dialog" aria-label="Search" style={{ width: 860, maxHeight: 'calc(100vh - 160px)', overflow: 'auto' }}>
        <div style={{ padding: '22px 24px 16px' }}>
          <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setParsed(null); setRemoved([]); }}
            placeholder={ai ? 'Describe what you are looking for…' : 'Search filenames, metadata, places and tags…'} aria-label="Search query"
            style={{ width: '100%', background: 'none', border: 0, outline: 'none', font: "400 28px/1.2 var(--serif)", padding: 0, marginBottom: 12, color: 'var(--text)' }} />
          {(live.length > 0 || metaLive.length > 0) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="muted" style={{ fontSize: 13 }}>Understood as</span>
              {metaLive.map((c) => <span key={c.key} className="chip">{c.label} <button aria-label={`Remove ${c.label}`} onClick={() => setRemoved((r) => [...r, c.key])}>✕</button></span>)}
              {live.map((c) => <span key={c.key} className="chip">{c.label} <button aria-label={`Remove ${c.label}`} onClick={() => setRemoved((r) => [...r, c.key])}>✕</button></span>)}
            </div>
          )}
        </div>
        {(hits.length > 0 || meta.files.length > 0 || results.length > 0 || (!busy && q.trim())) && (
          <div style={{ borderTop: '1px solid var(--hair)', padding: '16px 24px 8px' }}>
            {hits.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Shoots &amp; compositions</div>
                {hits.map((h, i) => (
                  <button key={h.key} className="mi" style={{ height: 44, padding: '0 10px', background: i === sel ? 'var(--chip)' : undefined, gap: 12, justifyContent: 'flex-start' }} onMouseEnter={() => setSel(i)} onClick={() => { onClose(); nav(h.to); }}>
                    {h.cover ? <img src={imgUrl(h.cover, 'thumb')} alt="" width={40} height={28} style={{ objectFit: 'cover', borderRadius: 3 }} /> : <i style={{ width: 40, height: 28, background: 'var(--surface)', borderRadius: 3 }} />}
                    <span style={{ flex: 1, textAlign: 'left', color: 'var(--text)' }}>{h.name}</span><span className="meta">{h.kind}{i === sel ? '  ↵' : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {meta.files.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div className="eyebrow" style={{ marginBottom: 6 }}>Files</div>
                {meta.files.slice(0, 6).map((f) => <button key={f.id} className="mi" style={{ height: 32 }} onClick={() => { onClose(); nav(`/photo/${f.id}`); }}><span className="mono" style={{ fontSize: 12.5 }}>{f.file}</span><span className="meta">{[f.camera, f.date].filter(Boolean).join(' · ')}</span></button>)}
              </div>
            )}
            {!busy && q.trim() && results.length === 0 && meta.files.length === 0 && hits.length === 0 && <p className="muted" style={{ margin: '4px 0 14px', fontSize: 13.5 }}>Nothing matches. Try fewer words, or remove a filter.</p>}
            {results.length > 0 && (
              <>
                <div className="spread" style={{ marginBottom: 8 }}>
                  <span className="eyebrow">{busy ? 'Searching…' : `Photos · ${count} from ${shoots} shoot${shoots === 1 ? '' : 's'}`}</span>
                  <span style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                    <button className="muted" style={{ fontSize: 12.5 }} aria-pressed={selecting} onClick={() => { setSelecting(!selecting); setPicked(new Set()); setNote(''); }}>{selecting ? 'Done selecting' : 'Select'}</button>
                    <button className="muted" style={{ fontSize: 12.5 }} onClick={openAll}>See all in Library →</button>
                  </span>
                </div>
                <Justified photos={results.slice(0, 10)} h={110} {...(selecting ? { picked, onTick: (p: PhotoLite) => setPicked((x) => { const n = new Set(x); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; }) } : { onPick: (p: PhotoLite) => { onClose(); nav(`/photo/${p.id}`); } })} />
              </>
            )}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '12px 16px 12px 24px', borderTop: '1px solid var(--hair)', background: 'var(--modal-foot)', flexWrap: 'wrap' }}>
          <span className="faint" style={{ fontSize: 12, flex: 1, display: 'flex', gap: 18, flexWrap: 'wrap' }}>{note ? <span role="status">{note}</span> : <><span>Try “x-t5 f/1.2” or “DSCF”</span><span>↑↓ move</span><span>↵ open</span><span>Esc close</span></>}</span>
          <AddToComposition up label="Add to composition…" ids={ids} onDone={(m) => { setNote(m); setPicked(new Set()); }} />
          <button className="btn primary" disabled={results.length === 0} onClick={openAll}>Pick from these {picked.size || count}</button>
        </div>
      </div>
    </div>
  );
}
