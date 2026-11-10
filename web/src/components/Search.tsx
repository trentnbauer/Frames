import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, imgUrl, useApi } from '../api';
import type { Collection, PhotoLite, Shoot } from '../data';
import { useStore } from '../store';
import { CompPicker } from '../screens/CompPicker';
import ProtoSearch from '../proto/ProtoSearch';

type Parsed = { text: string; subjects: string[]; exclude: string[]; colours: string[]; time: { from: string; to: string } | null };
type Meta = { chips: { key: string; kind: string; label: string; param: string; value: string }[]; files: { id: number; file: string; camera: string; date: string }[] };

/**
 * Search (⌘K), from the design. AI off: filename, metadata, tag and place search. AI on: the same, ranked by meaning, and the sentence is split into
 * removable chips ("fog over water, early morning, no people" becomes a subject, a time of day and an exclusion).
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
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Meta>({ chips: [], files: [] });
  const shootList = useApi<Shoot[]>('/shoots');
  const compList = useApi<Collection[]>('/collections');
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onClose]);

  const understood: { key: string; label: string }[] = [];
  if (parsed) {
    if (parsed.subjects.length) understood.push({ key: 'subjects', label: `Subject: ${parsed.subjects.join(', ')}` });
    if (parsed.exclude.length) understood.push({ key: 'exclude', label: `Exclude: ${parsed.exclude.join(', ')}` });
    if (parsed.time) understood.push({ key: 'time', label: `Time: ${parsed.time.from}–${parsed.time.to}` });
    if (parsed.colours.length) understood.push({ key: 'colours', label: `Colour: ${parsed.colours.join(', ')}` });
  }
  const live = understood.filter((c) => !removed.includes(c.key));
  const metaLive = meta.chips.filter((c) => !removed.includes(c.key));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);

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
        if (ai && !parsed) { pr = (await api<{ parsed: Parsed | null }>('/search/parse', { body: { q } }).catch(() => ({ parsed: null }))).parsed; setParsed(pr); }
        const r = await api<{ photos: PhotoLite[]; count: number; semantic: boolean }>(`/photos?${params(mm.chips.filter((c) => !removed.includes(c.key)))}`);
        setResults(r.photos); setCount(r.count);
      } catch { setResults([]); setCount(0); } finally { setBusy(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [q, removed.join(','), parsed ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const hits = (words.length ? [
    ...(shootList.data ?? []).filter((x) => words.every((w) => x.name.toLowerCase().includes(w))).map((x) => ({ key: `s${x.id}`, name: x.name, meta: `Shoot · ${x.count}`, to: `/shoots/${x.id}`, src: x.coverId ? imgUrl(x.coverId, 'thumb') : '' })),
    ...(compList.data ?? []).filter((x) => words.every((w) => x.name.toLowerCase().includes(w))).map((x) => { const cover = x.chosenIds[0] ?? x.photoIds[0]; return { key: `c${x.id}`, name: x.name, meta: `Composition · ${x.layout.prints.length} × ${x.layout.prints[0]?.size ?? ''}`, to: `/collections/${x.id}`, src: cover ? imgUrl(cover, 'thumb') : '' }; }),
  ] : []).slice(0, 5);
  const openAll = () => { onClose(); nav(`/library?${params()}`); };
  const tip = (p: PhotoLite) => [p.file, p.camera, p.lens, p.aperture ? `f/${p.aperture}` : '', p.shutter, p.iso ? `ISO ${p.iso}` : ''].filter(Boolean).join(' · ');

  return (
    <ProtoSearch
      q={q} onQ={(v: string) => { setQ(v); setRemoved([]); setParsed(null); }} busy={busy}
      chips={[...metaLive.map((c) => ({ label: c.label, remove: () => setRemoved([...removed, c.key]) })), ...live.map((c) => ({ label: c.label, remove: () => setRemoved([...removed, c.key]) }))]}
      files={meta.files.map((f) => ({ name: f.file, meta: [f.camera, f.date].filter(Boolean).join(' · '), src: imgUrl(f.id, 'thumb'), go: () => { onClose(); nav(`/photo/${f.id}`); } }))}
      hits={hits} onOpenHit={(h: { to: string }) => { onClose(); nav(h.to); }}
      photos={results.map((p) => ({ id: p.id, src: imgUrl(p.id, 'thumb'), ar: p.ar, flex: `${p.ar} ${p.ar} ${Math.round(p.ar * 110)}px`, tip: tip(p), go: () => { onClose(); nav(`/photo/${p.id}`); } }))}
      count={count} shootCount={new Set(results.map((p) => p.shootId)).size}
      onOpenAll={openAll} onClose={onClose}
      renderCompPicker={(ids: number[], close: () => void, done: (m: string) => void) => <CompPicker ids={ids} from="From your search" onClose={close} onDone={done} />}
    />
  );
}
