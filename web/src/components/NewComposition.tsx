import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import type { Collection, PhotoLite } from '../data';
import { fuzzyNames } from '../fuzzy';
import { useStore } from '../store';
import { WALL_BG, arrange, area, fits, frameOf, fromPreset, GROUPS, metres, newPrintId, PAPER, PRESETS, printsSummary, rectsIn, sizeName, type Mode, type Print } from '../layout';
import type { NewCompositionStart } from '../ui';

const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const label = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 8 } as const;
const ring = 'inset 0 0 0 1px var(--outline)';
const opt = (on: boolean) => ({ background: on ? 'var(--text)' : 'transparent', color: on ? '#0d0d0d' : 'var(--text)', boxShadow: ring });


type Rect = [number, number, number, number];
type Opt = { key: string; label: string; mode: Mode; prints: [string, 'portrait' | 'landscape', string | null][]; /** The picture on the card, in a 100 x 64 box. */ rects: Rect[] };
const row = (k: number): Rect[] => { const g = 1.2, w = Math.min(14, (96 - g * (k - 1)) / k), h = Math.min(w * 1.4, 40), x0 = (100 - (w * k + g * (k - 1))) / 2; return Array.from({ length: k }, (_, i) => [x0 + i * (w + g), (64 - h) / 2, w, h] as Rect); };
/** [label, picture, layout mode, orientation of each print] for 1 to 6 prints, as the design draws them. */
const SHAPES: Record<number, [string, Rect[], Mode, ('portrait' | 'landscape')[]][]> = {
  1: [['Portrait', [[33, 8, 34, 48]], 'row', ['portrait']], ['Landscape', [[22, 12, 56, 40]], 'row', ['landscape']], ['Square', [[30, 12, 40, 40]], 'row', ['portrait']], ['Panorama', [[8, 20, 84, 24]], 'row', ['landscape']]],
  2: [['Side by side', [[22, 10, 26, 44], [52, 10, 26, 44]], 'row', ['portrait', 'portrait']], ['Stacked', [[32, 3, 36, 27], [32, 34, 36, 27]], 'grid', ['landscape', 'landscape']], ['Big and small', [[18, 6, 38, 52], [60, 26, 22, 32]], 'feature', ['portrait', 'portrait']], ['Landscape pair', [[8, 16, 40, 30], [52, 16, 40, 30]], 'row', ['landscape', 'landscape']]],
  3: [['Row', [[12, 14, 22, 36], [39, 14, 22, 36], [66, 14, 22, 36]], 'row', ['portrait', 'portrait', 'portrait']], ['Column', [[36, 2, 28, 18], [36, 23, 28, 18], [36, 44, 28, 18]], 'grid', ['landscape', 'landscape', 'landscape']], ['Feature + 2', [[14, 6, 40, 52], [58, 6, 26, 24], [58, 34, 26, 24]], 'feature', ['landscape', 'portrait', 'portrait']], ['Centre feature', [[8, 18, 22, 28], [34, 6, 32, 52], [70, 18, 22, 28]], 'feature', ['portrait', 'portrait', 'portrait']]],
  4: [['Grid 2 × 2', [[28, 2, 20, 28], [52, 2, 20, 28], [28, 34, 20, 28], [52, 34, 20, 28]], 'grid', ['portrait', 'portrait', 'portrait', 'portrait']], ['Row', [[6, 16, 20, 32], [29, 16, 20, 32], [52, 16, 20, 32], [75, 16, 20, 32]], 'row', ['portrait', 'portrait', 'portrait', 'portrait']], ['Feature + 3', [[14, 4, 40, 56], [58, 4, 26, 17], [58, 23.5, 26, 17], [58, 43, 26, 17]], 'feature', ['portrait', 'landscape', 'landscape', 'landscape']], ['Landscape grid', [[18, 6, 30, 24], [52, 6, 30, 24], [18, 34, 30, 24], [52, 34, 30, 24]], 'grid', ['landscape', 'landscape', 'landscape', 'landscape']]],
  5: [['Feature + 4', [[30, 8, 40, 48], [8, 8, 18, 22], [8, 34, 18, 22], [74, 8, 18, 22], [74, 34, 18, 22]], 'feature', ['portrait', 'portrait', 'portrait', 'portrait', 'portrait']], ['3 over 2', [[14, 2, 22, 28], [39, 2, 22, 28], [64, 2, 22, 28], [26, 34, 22, 28], [52, 34, 22, 28]], 'grid', ['portrait', 'portrait', 'portrait', 'portrait', 'portrait']], ['Row', [[4, 18, 16, 28], [23, 18, 16, 28], [42, 18, 16, 28], [61, 18, 16, 28], [80, 18, 16, 28]], 'row', ['portrait', 'portrait', 'portrait', 'portrait', 'portrait']], ['Cross', [[40, 2, 20, 18], [40, 23, 20, 18], [40, 44, 20, 18], [16, 23, 20, 18], [64, 23, 20, 18]], 'grid', ['landscape', 'landscape', 'landscape', 'landscape', 'landscape']]],
  6: [['Grid 3 × 2', [[18, 2, 20, 28], [40, 2, 20, 28], [62, 2, 20, 28], [18, 34, 20, 28], [40, 34, 20, 28], [62, 34, 20, 28]], 'grid', ['portrait', 'portrait', 'portrait', 'portrait', 'portrait', 'portrait']], ['Grid 2 × 3', [[26, 2, 23, 18], [51, 2, 23, 18], [26, 23, 23, 18], [51, 23, 23, 18], [26, 44, 23, 18], [51, 44, 23, 18]], 'grid', ['landscape', 'landscape', 'landscape', 'landscape', 'landscape', 'landscape']], ['Row', [[3, 20, 13, 24], [19.5, 20, 13, 24], [36, 20, 13, 24], [52.5, 20, 13, 24], [69, 20, 13, 24], [85.5, 20, 13, 24]], 'row', ['portrait', 'portrait', 'portrait', 'portrait', 'portrait', 'portrait']], ['Salon', [[6, 4, 26, 34], [36, 4, 26, 18], [66, 4, 28, 26], [6, 42, 26, 20], [36, 26, 26, 36], [66, 34, 28, 28]], 'feature', ['landscape', 'landscape', 'landscape', 'landscape', 'landscape', 'landscape']]],
};
/**
 * The layouts offered for a number of prints, named and drawn as in the design. 1 to 6 prints get four options each; 7 to 12 get a row only.
 * The wall is built in the nearest layout mode (row, grid or feature) and can be rearranged by hand in the editor.
 */
export function optionsFor(n: number): Opt[] {
  const shapes = SHAPES[n];
  if (!shapes) return [{ key: `row${n}`, label: 'Row', mode: 'row', prints: Array.from({ length: n }, () => ['A5', 'portrait', 'A4'] as [string, 'portrait' | 'landscape', string | null]), rects: row(n) }];
  return shapes.map(([label, rects, mode, orient], i) => ({ key: `s${n}-${i}`, label, mode, rects, prints: orient.map((o, k) => [mode === 'feature' && k === 0 ? 'A2' : n <= 2 ? 'A3' : 'A4', o, mode === 'feature' && k === 0 ? 'A2' : 'A3'] as [string, 'portrait' | 'landscape', string | null]) }));
}

/** The next larger frame size for a print (the frame the design shows around it). */
const FRAME_FOR: Record<string, string> = { A5: 'A4', A4: 'A3', A3: 'A2', A2: 'A1', A1: 'A1' };

/**
 * The wall exactly as the card draws it: each rectangle becomes the standard size closest to it (its longer side in the same scale),
 * in the right orientation, hung at the rectangle's place. Rows of seven or more have no picture and keep the plain row.
 */
export function wallFromRects(rects: Rect[]): Print[] {
  const longest = Math.max(...rects.map(([, , w, h]) => Math.max(w, h)));
  const k = 420 / longest; // the biggest print is about A3-A2 sized
  const SIZES: [string, number][] = [['A5', 210], ['A4', 297], ['A3', 420], ['A2', 594], ['A1', 841]];
  return rects.map(([x, y, w, h]) => {
    const long = Math.max(w, h) * k;
    const size = SIZES.reduce((best, c) => (Math.abs(c[1] - long) < Math.abs(best[1] - long) ? c : best))[0];
    return { id: newPrintId(), size, orientation: h >= w ? 'portrait' : 'landscape', frame: { size: FRAME_FOR[size], mat: 'white', color: 'black' }, photoId: null, photoId2: null, stack: false, x: Math.round(x * k), y: Math.round(y * k) } as Print;
  });
}

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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg)', borderRadius: 8, padding: '6px 8px', boxShadow: ring }}>
        {chosen.map((n) => (
          <span key={n} title={fromName.includes(n) ? 'Matched from the name' : undefined} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '4px 10px', borderRadius: 999, fontSize: 12.5, background: 'var(--btn-bg)', color: 'var(--btn-fg)' }}>
            {fromName.includes(n) && <span aria-hidden style={{ fontSize: 10 }}>✦</span>}{n}
            <button aria-label={`Remove ${kind} ${n}`} onClick={() => onRemove(n)} style={{ color: 'var(--faint)' }}>✕</button>
          </span>
        ))}
        <input value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (hits[0]) add(hits[0].name); } if (e.key === 'Backspace' && !text && chosen.length) onRemove(chosen[chosen.length - 1]); }}
          placeholder={chosen.length ? '' : `Search ${kind}s…`} aria-label={`Search ${kind}s`}
          style={{ flex: 1, minWidth: 120, background: 'none', border: 0, outline: 'none', fontSize: 13, padding: '4px 2px' }} />
      </div>
      {open && hits.length > 0 && (
        <div role="listbox" aria-label={`${title} suggestions`} style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 5, marginTop: 4, background: 'var(--raised2)', borderRadius: 8, boxShadow: '0 0 0 1px var(--hair),0 12px 30px rgba(0,0,0,.5)', maxHeight: 220, overflow: 'auto' }}>
          {hits.map((i) => <button key={i.name} role="option" aria-selected={false} onMouseDown={(e) => { e.preventDefault(); add(i.name); }} style={{ display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13 }}><span>{i.name}</span>{i.n !== undefined && <span style={{ color: 'var(--faint)' }}>{i.n}</span>}</button>)}
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
  const [count, setCount] = useState(3);
  const [preset, setPreset] = useState<string>('row-p3');
  const [mode, setMode] = useState<Mode>('free');
  const [prints, setPrints] = useState<Print[]>(() => wallFromRects(optionsFor(3)[0].rects));
  const choose = (o: Opt) => { setPreset(o.key); if (SHAPES[o.prints.length]) { setMode('free'); setPrints(wallFromRects(o.rects)); } else { setMode(o.mode); setPrints(fromPreset(o as never)); } };
  const setN = (n: number) => { const c = Math.max(1, Math.min(12, n)); setCount(c); choose(optionsFor(c)[0]); };
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
  const laid = mode === 'free' ? prints : arrange(prints, mode), wall = frameOf(laid, 0);
  // Changing a print by hand makes the layout "custom"; a grid needs three prints or more.
  const custom = (fn: (q: Print[]) => void) => { const q = prints.map((p) => ({ ...p, frame: p.frame ? { ...p.frame } : null })); fn(q); setPreset('custom'); setPrints(q); setCount(q.length); if (mode === 'free' || (mode === 'grid' && q.length < 3)) setMode('row'); };
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
      await api<Collection>('/collections', { body: { name: name.trim() || 'Untitled composition', photoIds: ids, layout: { mode, prints: mode === 'free' ? prints : arrange(prints, mode) } } }).then((c) => { created = c; });
      onClose(); nav(`/collections/${created!.id}${ids.length ? '' : '?add=1'}`);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="mscrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label="New composition" style={{ width: 640, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="mbody" style={{ gap: 0 }}>
        <div className="mhead" style={{ marginBottom: 18 }}><div className="mtitle">New composition</div><button className="xbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, for example: Birds at the beach" aria-label="Composition name"
          style={{ width: '100%', background: 'var(--bg)', border: 0, borderRadius: 8, padding: '10px 12px', fontSize: 14, boxShadow: ring, outline: 'none', marginBottom: 20 }} />
        <div className="spread" style={{ alignItems: 'center', marginBottom: 18 }}><div><div style={{ ...label, marginBottom: 2 }}>Prints</div><div className="muted" style={{ fontSize: 13 }}>You can add or remove prints later</div></div>
        <div className="stepper" role="group" aria-label="Number of prints">
          <button aria-label="Fewer prints" disabled={count <= 1} onClick={() => setN(count - 1)}>−</button><b aria-live="polite">{count}</b><button aria-label="More prints" disabled={count >= 12} onClick={() => setN(count + 1)}>+</button>
        </div></div>
        <div style={label}>Layout</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, optionsFor(count).length)},minmax(0,1fr))`, gap: 6, marginBottom: 18 }}>
          {optionsFor(count).map((pr) => {
            const on = preset === pr.key;
            return (
              <button key={pr.key} aria-pressed={on} onClick={() => choose(pr)} style={{ borderRadius: 10, padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 8, fontSize: 13, background: on ? 'var(--btn-bg)' : 'transparent', color: on ? 'var(--btn-fg)' : 'var(--text)', boxShadow: on ? 'none' : ring }}>
                <span style={{ position: 'relative', display: 'block', aspectRatio: '100 / 64', borderRadius: 6, background: on ? 'rgba(0,0,0,.08)' : 'var(--bg)' }}>
                  {pr.rects.map(([x, y, w, h], i) => <i key={i} style={{ position: 'absolute', left: `${x}%`, top: `${(y / 64) * 100}%`, width: `${w}%`, height: `${(h / 64) * 100}%`, background: on ? 'var(--btn-fg)' : 'var(--faint)' }} />)}
                </span>
                {pr.label}
              </button>
            );
          })}
        </div>
        <div className="spread"><div style={label}>Sizes</div><span className="faint" style={{ fontSize: 12 }}>Click a size to change it</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 10 }}>
          {prints.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--hair)', flexWrap: 'wrap' }}>
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
              <button aria-label="Remove print" onClick={() => prints.length > 1 && custom((q) => { q.splice(i, 1); })} style={{ color: 'var(--faint)', fontSize: 12, width: 16 }}>✕</button>
            </div>
          ))}
        </div>
        {prints.length < 12 && <button onClick={() => custom((q) => { const last = q[q.length - 1]; q.push({ ...last, id: newPrintId(), photoId: null, photoId2: null, frame: last.frame ? { ...last.frame } : null }); })} style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 14 }}>+ Add a print</button>}
        <div style={{ background: WALL_BG, borderRadius: 8, height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, marginBottom: 20, position: 'relative' }} aria-label="Layout preview">
          <div style={{ position: 'relative', width: `min(100%, ${Math.round((98 * wall.W) / wall.H)}px)`, aspectRatio: String(wall.W / wall.H) }}>
            {rectsIn(laid, wall).map((r, i) => <i key={i} style={{ position: 'absolute', ...r, background: 'var(--btn-bg)', opacity: 0.85 }} />)}
          </div>
          <span style={{ position: 'absolute', right: 10, bottom: 8, font: "400 11px 'IBM Plex Mono',monospace", color: 'var(--faint)' }}>{metres(wall.w)} × {metres(wall.h)} m</span>
        </div>
        {aiOn && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '-8px 0 16px', flexWrap: 'wrap' }}>
            <button onClick={askAi} disabled={!name.trim() || aiBusy} style={{ borderRadius: 999, padding: '7px 14px', fontSize: 13, boxShadow: ring, opacity: name.trim() ? 1 : 0.5 }}>{aiBusy ? 'Asking the AI…' : '✨ Find with AI'}</button>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }} role="status">{aiMsg || 'Reads the name and picks subjects, tags and colours you already have.'}</span>
          </div>
        )}
        <PickField kind="subject" title="Subjects to look for (optional)" items={known.subject} chosen={chosen('subject')} fromName={auto.subject} onAdd={(n) => add('subject', n)} onRemove={(n) => remove('subject', n)} />
        <PickField kind="tag" title="Tags to look for (optional)" items={known.tag} chosen={chosen('tag')} fromName={auto.tag} onAdd={(n) => add('tag', n)} onRemove={(n) => remove('tag', n)} />
        <PickField kind="colour" title="Colours to look for (optional)" items={known.colour} chosen={chosen('colour')} fromName={auto.colour} onAdd={(n) => add('colour', n)} onRemove={(n) => remove('colour', n)} />
        {(auto.subject.length + auto.tag.length + auto.colour.length) > 0 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: '-6px 0 16px' }}>✦ matched from the name. Take any away with ✕.</p>}
        {err && <p className="reason" role="alert">{err}</p>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{looking ? 'Looking…' : ids.length ? `${ids.length} candidates for ${printsSummary(prints)}` : `${prints.length} ${prints.length === 1 ? 'print' : 'prints'} · ${prints.filter((p) => p.frame).length} framed. You add the photographs next.`}</span>
          <button onClick={create} disabled={busy} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14 }}>Create and rank</button>
        </div>
        </div>
      </div>
    </div>
  );
}
