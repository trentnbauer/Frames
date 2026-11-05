import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { fuzzyNames } from '../fuzzy';
import { useStore } from '../store';
import { WALL_BG, arrange, area, fits, frameOf, fromPreset, GROUPS, metres, newPrintId, PAPER, PRESETS, printsSummary, rectsIn, sizeName, type Mode, type Print } from '../layout';
import type { NewCompositionStart } from '../ui';

const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const label = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: '#6f6c67', marginBottom: 8 } as const;
const ring = 'inset 0 0 0 1px rgba(255,255,255,.2)';
const opt = (on: boolean) => ({ background: on ? '#efede8' : 'transparent', color: on ? '#0d0d0d' : '#efede8', boxShadow: ring });

type Kind = 'subject' | 'tag' | 'colour';
type Item = { name: string; n?: number };

/** A box to type in: it suggests the names that contain what is typed, and a chosen name becomes a chip. */
function PickField({ kind, title, items, chosen, fromName, onAdd, onRemove }: { kind: Kind; title: string; items: Item[]; chosen: string[]; fromName: string[]; onAdd: (n: string) => void; onRemove: (n: string) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const q = text.trim().toLowerCase();
  const hits = (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items).filter((i) => !chosen.includes(i.name)).slice(0, 8);
  const add = (n: string) => { onAdd(n); setText(''); setOpen(false); };
  if (items.length === 0 && chosen.length === 0) return null;
  return (
    <div style={{ marginBottom: 16, position: 'relative' }}>
      <div style={label}>{title}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: '#0d0d0d', borderRadius: 8, padding: '6px 8px', boxShadow: ring }}>
        {chosen.map((n) => (
          <span key={n} title={fromName.includes(n) ? 'Matched from the name' : undefined} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 12.5, background: '#efede8', color: '#0d0d0d' }}>
            {fromName.includes(n) && <span aria-hidden style={{ fontSize: 10 }}>✦</span>}{n}
            <button aria-label={`Remove ${kind} ${n}`} onClick={() => onRemove(n)} style={{ color: '#6f6c67' }}>✕</button>
          </span>
        ))}
        <input value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits[0]) add(hits[0].name); } if (e.key === 'Backspace' && !text && chosen.length) onRemove(chosen[chosen.length - 1]); }}
          placeholder={chosen.length ? '' : `Search ${kind}s…`} aria-label={`Search ${kind}s`}
          style={{ flex: 1, minWidth: 120, background: 'none', border: 0, outline: 'none', fontSize: 13, padding: '4px 2px' }} />
      </div>
      {open && hits.length > 0 && (
        <div role="listbox" aria-label={`${title} suggestions`} style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 5, marginTop: 4, background: '#1e1e1d', borderRadius: 8, boxShadow: '0 0 0 1px rgba(255,255,255,.1),0 12px 30px rgba(0,0,0,.5)', maxHeight: 220, overflow: 'auto' }}>
          {hits.map((i) => <button key={i.name} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); add(i.name); }} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13 }}><span>{i.name}</span>{i.n !== undefined && <span style={{ color: '#6f6c67' }}>{i.n}</span>}</button>)}
        </div>
      )}
    </div>
  );
}

/**
 * "+ Composition": a name, how many prints and what size, and optionally subjects, tags and colours to look for. The name is matched
 * against them as you type ("Birds at the Beach" picks the bird and beach ones; you can take any away). Photographs that have any of the
 * chosen ones go in as the first candidates; otherwise they are added afterwards (or come with it, from a search, a shoot or a selection).
 */
export function NewComposition({ start, onClose }: { start: NewCompositionStart; onClose: () => void }) {
  const nav = useNavigate();
  const { settings } = useStore();
  const aiOn = !!settings && settings.ai !== 'off';
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');
  const [name, setName] = useState(start.name ?? '');
  const [preset, setPreset] = useState<string>('triptych');
  const [mode, setMode] = useState<Mode>('row');
  const [prints, setPrints] = useState<Print[]>(() => fromPreset(PRESETS[2]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const subjects = useApi<{ name: string; n: number }[]>('/tags?kind=subject');
  const tags = useApi<{ name: string; n: number }[]>('/tags?kind=tag');
  const known: Record<Kind, Item[]> = { subject: subjects.data ?? [], tag: tags.data ?? [], colour: COLOURS.map((name) => ({ name })) };
  const [manual, setManual] = useState<Record<Kind, string[]>>({ subject: [], tag: [], colour: [] });
  const [dismissed, setDismissed] = useState<string[]>([]); // names matched from the title that were taken away again
  // What the title points to, less what has been taken away.
  const auto = useMemo(() => {
    const out = {} as Record<Kind, string[]>;
    // Photographs handed over (opened from one photograph, a photoshoot, a search...) are the whole starting set: a name that happens to match
    // a subject, tag or colour must not pull in every photograph that has it. Matching from the name is for compositions started from nothing.
    const given = (start.photoIds?.length ?? 0) > 0;
    for (const k of ['subject', 'tag', 'colour'] as Kind[]) out[k] = given ? [] : fuzzyNames(name, known[k].map((i) => i.name)).filter((n) => !dismissed.includes(`${k}:${n}`));
    return out;
  }, [name, dismissed.join('|'), subjects.data, tags.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const chosen = (k: Kind) => [...new Set([...auto[k], ...manual[k]])];
  const add = (k: Kind, n: string) => { setManual((m) => ({ ...m, [k]: [...m[k], n] })); setDismissed((d) => d.filter((x) => x !== `${k}:${n}`)); };
  const remove = (k: Kind, n: string) => { setManual((m) => ({ ...m, [k]: m[k].filter((x) => x !== n) })); setDismissed((d) => [...d, `${k}:${n}`]); };

  // The AI reads the name and picks from the subjects, tags and colours the library already has.
  const askAi = async () => {
    if (!name.trim() || aiBusy) return;
    setAiBusy(true); setAiMsg('');
    try {
      const r = await api<{ ai: boolean; picks: Record<Kind, string[]> | null }>('/ai/suggest-filters', { body: { name } });
      if (!r.picks) { setAiMsg(r.ai ? 'The AI could not answer just now. Try again.' : 'AI is off. Turn it on in Settings, Your AI.'); return; }
      let n = 0;
      for (const k of ['subject', 'tag', 'colour'] as Kind[]) {
        const picked = r.picks[`${k}s` as unknown as Kind] ?? [];
        for (const nm of picked) if (!chosen(k).includes(nm)) { add(k, nm); n++; }
      }
      setAiMsg(n ? `The AI added ${n}. Take any away with ✕.` : 'The AI found nothing more that fits.');
    } catch (e) { setAiMsg((e as Error).message); } finally { setAiBusy(false); }
  };
  const laid = arrange(prints, mode), wall = frameOf(laid, 0);
  // Changing a print by hand makes the layout "custom"; a grid needs three prints or more.
  const custom = (fn: (q: Print[]) => void) => { const q = prints.map((p) => ({ ...p, frame: p.frame ? { ...p.frame } : null })); fn(q); setPreset('custom'); setPrints(q); if (mode === 'free' || (mode === 'grid' && q.length < 3)) setMode('row'); };
  const [found, setFound] = useState<number[]>([]);
  const [looking, setLooking] = useState(false);
  const queries = [...chosen('subject').map((n) => `subject=${encodeURIComponent(n)}`), ...chosen('tag').map((n) => `tag=${encodeURIComponent(n)}`), ...chosen('colour').map((n) => `colour=${encodeURIComponent(n)}`)];
  // The photographs that have any of the chosen subjects, tags or colours.
  useEffect(() => {
    if (!queries.length) { setFound([]); setLooking(false); return; }
    let live = true; setLooking(true);
    const t = setTimeout(() => {
      Promise.all(queries.map((q) => api<{ photos: PhotoLite[] }>(`/photos?${q}`)))
        .then((rs) => { if (live) { setFound([...new Set(rs.flatMap((r) => r.photos.map((p) => p.id)))]); setLooking(false); } })
        .catch(() => { if (live) setLooking(false); });
    }, 250); // wait for the typing to settle
    return () => { live = false; clearTimeout(t); };
  }, [queries.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const ids = [...new Set([...(start.photoIds ?? []), ...found])];

  const create = async () => {
    if (busy) return;
    setBusy(true); setErr('');
    let created: Collection | null = null;
    try {
      await api<Collection>('/collections', { body: { name: name.trim() || 'Untitled composition', photoIds: ids, layout: { mode, prints: arrange(prints, mode) } } }).then((c) => { created = c; });
      onClose(); nav(`/collections/${created!.id}${ids.length ? '' : '?add=1'}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-label="New composition" style={{ background: '#161615', borderRadius: 14, padding: 28, width: 560, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 0 0 1px rgba(255,255,255,.08),0 12px 30px rgba(0,0,0,.5)' }}>
        <h2 style={{ font: "400 30px 'Instrument Serif',serif", margin: '0 0 18px' }}>New composition</h2>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, for example: Birds at the beach" aria-label="Composition name"
          style={{ width: '100%', background: '#0d0d0d', border: 0, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxShadow: ring, outline: 'none', marginBottom: 20 }} />
        <div style={label}>Layout</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 6, marginBottom: 18 }}>
          {PRESETS.map((pr) => {
            const laid = arrange(fromPreset(pr), pr.mode), f = frameOf(laid, 0), on = preset === pr.key;
            return (
              <button key={pr.key} aria-pressed={on} onClick={() => { setPreset(pr.key); setMode(pr.mode); setPrints(fromPreset(pr)); }} style={{ borderRadius: 8, padding: '10px 6px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, fontSize: 12, ...opt(on) }}>
                <span style={{ position: 'relative', display: 'block', width: `min(100%, ${Math.round((34 * f.W) / f.H)}px)`, aspectRatio: String(f.W / f.H), maxHeight: 34 }}>
                  {rectsIn(laid, f).map((r, i) => <i key={i} style={{ position: 'absolute', ...r, background: on ? '#0d0d0d' : '#a8a59f' }} />)}
                </span>
                {pr.label}
              </button>
            );
          })}
        </div>
        <div style={label}>Prints</div>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 10 }}>
          {prints.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,.08)', flexWrap: 'wrap' }}>
              <span style={{ font: "italic 400 20px/1 'Instrument Serif',Georgia,serif", width: 18 }}>{i + 1}</span>
              <select aria-label="Print size" value={p.size} onChange={(e) => custom((q) => { q[i].size = e.target.value; if (q[i].frame && !fits(q[i].frame!.size, e.target.value)) q[i].frame = { ...q[i].frame!, size: e.target.value }; })}>
                {GROUPS.map(([g, ks]) => <optgroup key={g} label={g}>{ks.map((k) => <option key={k} value={k}>{sizeName(k)}</option>)}</optgroup>)}
              </select>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['portrait', 'landscape'] as const).map((o) => <button key={o} aria-pressed={p.orientation === o} onClick={() => custom((q) => { q[i].orientation = o; })} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12.5, ...opt(p.orientation === o) }}>{o === 'portrait' ? 'Portrait' : 'Landscape'}</button>)}
              </div>
              <select aria-label="Frame" value={p.frame ? p.frame.size : 'poster'} style={{ marginLeft: 'auto' }}
                onChange={(e) => custom((q) => { const v = e.target.value; q[i].frame = v === 'poster' ? null : { mat: 'white', color: 'black', ...(q[i].frame || {}), size: v }; })}>
                <option value="poster">Poster</option>
                {Object.keys(PAPER).filter((k) => fits(k, p.size)).sort((a, b) => area(a) - area(b)).map((k) => <option key={k} value={k}>{k === p.size ? 'Framed, no border' : `In ${sizeName(k)} frame`}</option>)}
              </select>
              <button aria-label="Remove print" onClick={() => prints.length > 1 && custom((q) => { q.splice(i, 1); })} style={{ color: '#6f6c67', fontSize: 12, width: 16 }}>✕</button>
            </div>
          ))}
        </div>
        {prints.length < 6 && <button onClick={() => custom((q) => { const last = q[q.length - 1]; q.push({ ...last, id: newPrintId(), photoId: null, photoId2: null, frame: last.frame ? { ...last.frame } : null }); })} style={{ fontSize: 13, color: '#a8a59f', marginBottom: 14 }}>+ Add a print</button>}
        <div style={{ background: WALL_BG, borderRadius: 8, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, marginBottom: 20, position: 'relative' }} aria-label="Layout preview">
          <div style={{ position: 'relative', width: `min(100%, ${Math.round((98 * wall.W) / wall.H)}px)`, aspectRatio: String(wall.W / wall.H) }}>
            {rectsIn(laid, wall).map((r, i) => <i key={i} style={{ position: 'absolute', ...r, background: '#efede8', opacity: 0.85 }} />)}
          </div>
          <span style={{ position: 'absolute', right: 10, bottom: 8, font: "400 11px 'IBM Plex Mono',monospace", color: '#6f6c67' }}>{metres(wall.w)} × {metres(wall.h)} m</span>
        </div>
        {aiOn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '-8px 0 16px', flexWrap: 'wrap' }}>
            <button onClick={askAi} disabled={!name.trim() || aiBusy} style={{ borderRadius: 999, padding: '7px 14px', fontSize: 13, boxShadow: ring, opacity: name.trim() ? 1 : 0.5 }}>{aiBusy ? 'Asking the AI…' : '✨ Find with AI'}</button>
            <span style={{ fontSize: 12.5, color: '#8f8c86' }} role="status">{aiMsg || 'Reads the name and picks subjects, tags and colours you already have.'}</span>
          </div>
        )}
        <PickField kind="subject" title="Subjects to look for (optional)" items={known.subject} chosen={chosen('subject')} fromName={auto.subject} onAdd={(n) => add('subject', n)} onRemove={(n) => remove('subject', n)} />
        <PickField kind="tag" title="Tags to look for (optional)" items={known.tag} chosen={chosen('tag')} fromName={auto.tag} onAdd={(n) => add('tag', n)} onRemove={(n) => remove('tag', n)} />
        <PickField kind="colour" title="Colours to look for (optional)" items={known.colour} chosen={chosen('colour')} fromName={auto.colour} onAdd={(n) => add('colour', n)} onRemove={(n) => remove('colour', n)} />
        {(auto.subject.length + auto.tag.length + auto.colour.length) > 0 && <p style={{ fontSize: 12, color: '#8f8c86', margin: '-6px 0 16px' }}>✦ matched from the name. Take any away with ✕.</p>}
        {err && <p className="reason" role="alert">{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: '#8f8c86' }}>{looking ? 'Looking…' : ids.length ? `${ids.length} candidates for ${printsSummary(prints)}` : `${prints.length} ${prints.length === 1 ? 'print' : 'prints'} · ${prints.filter((p) => p.frame).length} framed. You add the photographs next.`}</span>
          <button onClick={create} disabled={busy} style={{ background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14 }}>Create and rank</button>
        </div>
      </div>
    </div>
  );
}
