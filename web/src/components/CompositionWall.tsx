import { useEffect, useRef, useState } from 'react';
import { imgUrl } from '../api';
import {
  arrange, area, cap, cellOf, dims, FRAMES, fits, frameOf, GROUPS, MATS, mouldOf, nextUp, or, PAD, PAPER, pxOf, rectsIn, shoppingList, sizeName,
  type Crop, type Frame2D, type Mode, type Print,
} from '../layout';

const serif = "'Instrument Serif',Georgia,serif";
const mono = "'IBM Plex Mono',monospace";
const eyebrow = { fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)' } as const;
const opt = (on: boolean) => ({ background: on ? 'var(--text)' : 'transparent', color: on ? '#0d0d0d' : 'var(--text)', boxShadow: 'inset 0 0 0 1px var(--outline)' });
const pct = (v: number) => `${v}%`;
export type Pic = { id: number; title: string; w: number; h: number; ar: number };

/** The wall, drawn to scale: each print at its size, with its frame and mount, and the photographs in it. */
export function Wall({ prints, mode, editing, sel, photos, over, locked, share, compact, fill, warn, stage, onSelect, onEdit, onMoved, onOver, onDropPhoto }: {
  prints: Print[]; mode: Mode; editing: boolean; sel: number; photos: Map<number, Pic>; over: number | null; locked: boolean;
  /** A share link's token, when the pictures are served through it (a guest's page). */
  share?: string;
  /** Short labels under the prints ("1 · A3"), for a narrow screen. */
  compact?: boolean;
  /** Use the whole width there is (a phone), only held back so that a tall wall is not taller than the screen. */
  fill?: boolean;
  /** Print index -> a short warning drawn in its label ("294 PPI"). */
  warn?: Record<number, string>;
  /** A picture of a room to hang the prints on: its size in mm of wall, and where the picture is. The prints are drawn where they are in mm, on it. */
  stage?: { w: number; h: number; url: string };
  onSelect: (i: number) => void; onEdit: (i: number) => void; onMoved: (prints: Print[]) => void;
  onOver: (i: number | null) => void; onDropPhoto: (i: number, pid: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [frozen, setFrozen] = useState<Frame2D | null>(null); // the wall's frame while a print is being dragged, so it does not rescale under the pointer
  const [live, setLive] = useState<Print[] | null>(null);
  const drag = useRef<{ i: number; sx: number; sy: number; ox: number; oy: number; k: number; moved: boolean; prints: Print[] } | null>(null);
  const shown = live ?? prints;
  const frameFor = (ps: Print[]): Frame2D => (stage ? { ...frameOf(ps, 0), x0: 0, y0: 0, pad: 0, W: stage.w, H: stage.h } : frameOf(ps, PAD));
  const f = frozen ?? frameFor(shown);
  const rects = rectsIn(shown, f);

  useEffect(() => () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function onMove(ev: PointerEvent) {
    const d = drag.current; if (!d) return;
    const dx = ev.clientX - d.sx, dy = ev.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    const snap = (v: number) => Math.round(v / 10) * 10;
    d.prints = d.prints.map((p, i) => (i === d.i ? { ...p, x: snap(d.ox + dx * d.k), y: snap(d.oy + dy * d.k) } : p));
    setLive(d.prints);
  }
  function onUp() {
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
    const d = drag.current; drag.current = null;
    setFrozen(null); setLive(null);
    if (d?.moved) onMoved(d.prints);
  }
  const down = (i: number, e: React.PointerEvent) => {
    onSelect(i);
    if (!editing || locked || e.button !== 0 || !ref.current) return;
    const rect = ref.current.getBoundingClientRect(), fr = frameFor(prints);
    drag.current = { i, sx: e.clientX, sy: e.clientY, ox: prints[i].x, oy: prints[i].y, k: fr.W / rect.width, moved: false, prints };
    setFrozen(fr);
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  const cell = (100 / f.W) * 100, cellH = (100 / f.H) * 100;
  return (
    <div ref={ref} style={{ position: 'relative', width: fill ? `min(100%, calc(76vh * ${f.W / f.H}))` : `min(100%, calc(${stage ? 560 : 430}px * ${f.W / f.H}))`, aspectRatio: String(f.W / f.H), ...(stage ? { backgroundImage: `url(${stage.url})`, backgroundSize: '100% 100%' } : { backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)', backgroundSize: `${cell}% ${cellH}%`, backgroundPosition: `${((f.pad - f.x0) / f.W) * 100}% ${((f.pad - f.y0) / f.H) * 100}%` }) }} data-mode={mode}>
      {shown.map((p, i) => {
        const [W, H] = dims(p), on = editing && i === sel, isOver = over === i;
        const [pw, phh] = or(p.size, p.orientation), fm = mouldOf(p);
        const [fw, fh] = p.frame ? or(p.frame.size, p.orientation) : [pw, phh];
        const held = [p.photoId, p.stack ? p.photoId2 : null];
        const cells = p.stack ? 2 : 1;
        const empty = held.slice(0, cells).every((x) => x === null);
        const label = compact ? `${i + 1} · ${sizeName(p.size)}` : `${i + 1} · ${sizeName(p.size)} ${p.orientation}${p.stack ? ' · two stacked' : ''} · ${p.frame ? (p.frame.size === p.size ? 'framed' : `in ${sizeName(p.frame.size)} frame`) : 'poster'}`;
        return (
          <div key={p.id} data-print={i + 1}
            onPointerDown={(e) => down(i, e)} onDragOver={(e) => { if (!locked) { e.preventDefault(); onOver(i); } }} onDragLeave={() => onOver(null)}
            onDrop={(e) => { e.preventDefault(); onOver(null); const pid = Number(e.dataTransfer.getData('text/plain')); if (pid && !locked) onDropPhoto(i, pid); }}
            style={{ position: 'absolute', ...rects[i], background: p.frame && p.frame.color !== 'none' ? FRAMES[p.frame.color] : 'transparent', boxShadow: p.frame || !empty ? '0 6px 18px rgba(0,0,0,.45)' : 'none', outline: isOver ? '2px dashed #efede8' : on ? '2px solid #efede8' : 'none', outlineOffset: 4, cursor: editing && !locked ? 'grab' : 'default', touchAction: editing && !locked ? 'none' : 'auto', userSelect: 'none' }}>
            {p.frame && <div style={{ position: 'absolute', left: pct((fm / W) * 100), top: pct((fm / H) * 100), width: pct((fw / W) * 100), height: pct((fh / H) * 100), background: MATS[p.frame.mat], boxShadow: 'inset 0 1px 3px rgba(0,0,0,.35)' }} />}
            <div style={{ position: 'absolute', left: pct(((fm + (fw - pw) / 2) / W) * 100), top: pct(((fm + (fh - phh) / 2) / H) * 100), width: pct((pw / W) * 100), height: pct((phh / H) * 100), background: empty ? '#1e1e1d' : '#f4f2ec', boxShadow: empty ? 'inset 0 0 0 1px var(--outline)' : 'none', display: 'flex', flexDirection: p.orientation === 'portrait' ? 'column' : 'row', gap: p.stack ? '1.2%' : 0 }}>
              {held.slice(0, cells).map((pid, k) => {
                const ph = pid !== null ? photos.get(pid) : undefined;
                return (
                  <div key={k} style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {ph ? <span style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><img src={imgUrl(ph.id, 'preview', share)} alt={ph.title} draggable={false} style={{ width: '100%', height: '100%', ...cropStyle(k === 0 ? p.crop : undefined), display: 'block' }} /></span>
                      : <span style={{ fontSize: 12, color: 'var(--faint)', textAlign: 'center', padding: '0 8px' }}>{p.stack ? `Print ${i + 1} · ${p.orientation === 'portrait' ? (k === 0 ? 'top' : 'bottom') : (k === 0 ? 'left' : 'right')}` : `Print ${i + 1}`}</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ position: 'absolute', left: 0, top: 'calc(100% + 8px)', whiteSpace: 'nowrap', font: `400 10.5px ${mono}`, color: on ? 'var(--text)' : 'var(--muted)' }}>{label}{warn?.[i] && <span style={{ color: 'oklch(0.78 0.11 35)' }}> · ⚠ {warn[i]}</span>}</div>
            {editing && !locked && <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onEdit(i); }} aria-label="Edit print" style={{ position: 'absolute', top: 6, right: 6, zIndex: 1, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 500, background: 'rgba(13,13,13,.78)', color: 'var(--text)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)', cursor: 'pointer' }}>Edit</button>}
          </div>
        );
      })}
    </div>
  );
}

/** A photograph fills its print (the edges beyond the paper are cut off); a crop zooms in on a chosen point. Only how it looks here. */
export const cropStyle = (c?: Crop) => ({ objectFit: 'cover' as const, ...(c ? { transform: `scale(${c.zoom})`, transformOrigin: `${c.fx * 100}% ${c.fy * 100}%` } : {}) });

/** Zoom in on the photograph and drag it around, to see how the print would look cropped. */
function CropBox({ photoId, print: sp, onChange }: { photoId: number; print: Print; onChange: (fn: (q: Print) => void) => void }) {
  const [pw, ph] = or(sp.size, sp.orientation);
  const c = sp.crop ?? { zoom: 1, fx: 0.5, fy: 0.5 };
  const W = 220, H = Math.round((W * ph) / pw);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const set = (fn: (cur: Crop) => Crop) => onChange((q) => { const n = fn(q.crop ?? { zoom: 1, fx: 0.5, fy: 0.5 }); if (n.zoom <= 1.005) delete q.crop; else q.crop = n; });
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || c.zoom <= 1) return;
    // Dragging the picture by a distance moves the window over it by that distance / zoom; the origin moves by that over (zoom - 1).
    const k = c.zoom - 1;
    const fx = Math.min(1, Math.max(0, d.fx - (e.clientX - d.x) / (W * k))), fy = Math.min(1, Math.max(0, d.fy - (e.clientY - d.y) / (H * k)));
    set((cur) => ({ ...cur, fx, fy }));
  };
  return (
    <div>
      <div style={{ ...eyebrow, marginBottom: 8 }}>Crop (only to see how it looks)</div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div aria-label="Crop preview" onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, fx: c.fx, fy: c.fy }; (e.target as Element).setPointerCapture?.(e.pointerId); }} onPointerMove={move} onPointerUp={() => { drag.current = null; }}
          style={{ width: W, height: H, overflow: 'hidden', background: '#000', borderRadius: 4, cursor: c.zoom > 1 ? 'grab' : 'default', touchAction: 'none', position: 'relative' }}>
          <img src={imgUrl(photoId, 'preview')} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none', ...cropStyle(sp.crop) }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: 'var(--text2)', flex: 1, minWidth: 140 }}>
          <label>Zoom {Math.round(c.zoom * 100)}%<input type="range" aria-label="Zoom" min={100} max={400} step={5} value={Math.round(c.zoom * 100)} onChange={(e) => set((cur) => ({ ...cur, zoom: Number(e.target.value) / 100 }))} style={{ width: '100%' }} /></label>
          <span>{c.zoom > 1 ? 'Drag the picture to move it.' : 'Filled to the print. Zoom in to crop.'}</span>
          {sp.crop && <button onClick={() => set(() => ({ zoom: 1, fx: 0.5, fy: 0.5 }))} style={{ textAlign: 'left', textDecoration: 'underline', color: 'var(--text2)' }}>Reset to fill</button>}
        </div>
      </div>
    </div>
  );
}

/** A print's own settings: size, which way round, one photograph or two, poster or framed (and the frame). */
export function PrintModal({ prints, index, count, ppi = 300, photoId, onChange, onApplyAll, onDelete, onClose }: {
  prints: Print[]; index: number; count: number; ppi?: number; /** The photograph in this print, so its crop can be shown and set. */ photoId?: number | null;
  onChange: (fn: (q: Print) => void) => void; onApplyAll: () => void; onDelete: () => void; onClose: () => void;
}) {
  const sp = prints[index];
  if (!sp) return null;
  const [nw, nh] = sp.orientation === 'portrait' ? pxOf(sp.size, ppi) : [...pxOf(sp.size, ppi)].reverse();
  const [pw, ph] = or(sp.size, sp.orientation), fr = sp.frame;
  const [fw, fh] = fr ? or(fr.size, sp.orientation) : [pw, ph];
  const sx = Math.round((fw - pw) / 2), sy = Math.round((fh - ph) / 2);
  const [cw, ch] = cellOf(sp);
  const sw = (hex: string, on: boolean, label: string, pick: () => void) => <button key={label} onClick={pick} title={label} aria-label={label} aria-pressed={on} style={{ width: 24, height: 24, borderRadius: '50%', background: hex, boxShadow: on ? '0 0 0 2px #0d0d0d, 0 0 0 4px #efede8' : 'inset 0 0 0 1px rgba(255,255,255,.18)' }} />;
  const group = (t: string, children: React.ReactNode) => <div><div style={{ ...eyebrow, marginBottom: 8 }}>{t}</div>{children}</div>;
  return (
    <div className="sheet-root" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="sheet" role="dialog" aria-label="Print settings" style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: 480, maxWidth: '100%', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 0 0 1px var(--hair),0 12px 30px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <div style={eyebrow}>Print {index + 1} of {count}</div>
            <button onClick={onClose} aria-label="Close" style={{ fontSize: 13, color: 'var(--text2)' }}>✕</button>
          </div>
          <h2 style={{ font: `400 30px/1.1 ${serif}`, margin: 0 }}>{sizeName(sp.size)} {sp.orientation}</h2>
        </div>
        {group('Print size', (
          <>
            {GROUPS.map(([g, ks]) => <div key={g} style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 6 }}>{ks.map((k) => <button key={k} aria-pressed={sp.size === k} onClick={() => onChange((q) => { q.size = k; if (q.frame && !fits(q.frame.size, k)) q.frame.size = nextUp(k); })} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12.5, ...opt(sp.size === k) }}>{k}</button>)}</div>)}
            <div style={{ font: `400 11.5px ${mono}`, color: 'var(--muted)', marginTop: 4 }}>{pw} × {ph} mm · needs {nw} × {nh} px at {ppi} PPI</div>
          </>
        ))}
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {group('Orientation', <div style={{ display: 'flex', gap: 6 }}>{(['portrait', 'landscape'] as const).map((o) => <button key={o} aria-pressed={sp.orientation === o} onClick={() => onChange((q) => { q.orientation = o; })} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, ...opt(sp.orientation === o) }}>{o === 'portrait' ? 'Portrait' : 'Landscape'}</button>)}</div>)}
          {group('Photographs', <div style={{ display: 'flex', gap: 6 }}>{[false, true].map((st) => <button key={String(st)} aria-pressed={sp.stack === st} onClick={() => onChange((q) => { q.stack = st; if (!st) q.photoId2 = null; })} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, ...opt(sp.stack === st) }}>{st ? 'Two stacked' : 'One'}</button>)}</div>)}
        </div>
        {sp.stack && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: -10 }}>{sp.orientation === 'portrait' ? 'Two landscape photographs, one above the other.' : 'Two portrait photographs, side by side.'} Each fills {Math.round(cw)} × {Math.round(ch)} mm. The originals are exported as they are, never joined.</div>}
        {photoId != null && !sp.stack && <CropBox photoId={photoId} print={sp} onChange={onChange} />}
        {group('Hang as', <div style={{ display: 'flex', gap: 6 }}>{(['poster', 'framed'] as const).map((k) => { const on = k === 'framed' ? !!fr : !fr; return <button key={k} aria-pressed={on} onClick={() => onChange((q) => { q.frame = k === 'framed' ? q.frame || { size: nextUp(q.size), mat: 'white', color: 'black' } : null; })} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, ...opt(on) }}>{cap(k)}</button>; })}</div>)}
        {fr && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, borderTop: '1px solid var(--hair)', paddingTop: 18 }}>
            <div>
              <div style={{ ...eyebrow, marginBottom: 8 }}>Frame size</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{Object.keys(PAPER).filter((k) => fits(k, sp.size)).sort((a, b) => area(a) - area(b)).map((k) => <button key={k} aria-pressed={fr.size === k} onClick={() => onChange((q) => { q.frame!.size = k; })} style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12.5, ...opt(fr.size === k) }}>{k === sp.size ? `${k} · no border` : k}</button>)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{sx || sy ? `Border ${sx} mm left and right · ${sy} mm top and bottom` : 'No border: the print fills the frame'}</div>
            </div>
            <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
              {group('Frame', <div style={{ display: 'flex', gap: 10 }}>{Object.entries(FRAMES).map(([k, c]) => sw(c, fr.color === k, cap(k), () => onChange((q) => { q.frame!.color = k; })))}</div>)}
              {fr.size !== sp.size && group('Border', <div style={{ display: 'flex', gap: 10 }}>{Object.entries(MATS).map(([k, c]) => sw(c, fr.mat === k, cap(k), () => onChange((q) => { q.frame!.mat = k; })))}</div>)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>{cap(fr.color)} frame{fr.size !== sp.size ? `, ${fr.mat} border` : ''}</span>
              <button onClick={onApplyAll} style={{ color: 'var(--text2)', textDecoration: 'underline', textUnderlineOffset: 3 }}>Use on every print</button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTop: '1px solid var(--hair)', paddingTop: 18 }}>
          <button onClick={onDelete} disabled={count <= 1} style={{ fontSize: 13, color: 'var(--muted)' }}>Delete this print</button>
          <button onClick={onClose} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14 }}>Done</button>
        </div>
      </div>
    </div>
  );
}

/** What to buy for a finished composition: frames with their mount boards, posters, and the prints to order. */
export function ShoppingList({ prints, ppi = 300 }: { prints: Print[]; ppi?: number }) {
  const list = shoppingList(prints, ppi);
  const [copied, setCopied] = useState(false);
  const copy = () => { try { void navigator.clipboard.writeText(list.text); } catch { /* the clipboard needs https */ } setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const row = { padding: '9px 0', borderBottom: '1px solid var(--hair)', fontSize: 13 } as const;
  return (
    <section aria-label="Shopping list" style={{ background: 'var(--hover)', borderRadius: 12, padding: '18px 22px', marginBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, marginBottom: 6 }}>
        <h2 style={{ font: `400 24px/1 ${serif}`, margin: 0 }}>To buy</h2>
        <button onClick={copy} style={{ borderRadius: 999, padding: '7px 14px', fontSize: 13, boxShadow: 'inset 0 0 0 1px var(--outline)' }}>{copied ? 'Copied ✓' : 'Copy list'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: '8px 40px' }}>
        <div>
          <div style={{ ...eyebrow, margin: '12px 0 4px' }}>Frames</div>
          {list.frames.map((f) => (
            <div key={f.title + f.detail} style={{ ...row, display: 'grid', gridTemplateColumns: '32px 14px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
              <span style={{ font: `400 12px ${mono}`, color: 'var(--text2)' }}>{f.qty}</span>
              <span style={{ width: 14, height: 14, borderRadius: 3, marginTop: 2, background: f.swatch, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.18)' }} />
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><span>{f.title}</span><span style={{ font: `400 11.5px ${mono}`, color: 'var(--muted)' }}>{f.size}</span></div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{f.detail}</div>
              </div>
            </div>
          ))}
          {list.frames.length === 0 && <div style={{ fontSize: 13, color: 'var(--muted)', padding: '9px 0' }}>None. Every print hangs as a poster.</div>}
          {list.posters > 0 && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>{list.posters} {list.posters === 1 ? 'print hangs' : 'prints hang'} as a poster, with no frame.</div>}
        </div>
        <div>
          <div style={{ ...eyebrow, margin: '12px 0 4px' }}>Prints to order</div>
          {list.printsList.map((p) => (
            <div key={p.title} style={{ ...row, display: 'grid', gridTemplateColumns: '32px minmax(0,1fr)', gap: 10, alignItems: 'start' }}>
              <span style={{ font: `400 12px ${mono}`, color: 'var(--text2)' }}>{p.qty}</span>
              <div><div>{p.title}</div><div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{p.detail}</div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export { arrange };
