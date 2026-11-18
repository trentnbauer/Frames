import { createContext, useContext, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import type { Shoot } from '../data';

const REVIEW_OPTIONS = [['', 'All review states'], ['due', 'Due now'], ['unrated', 'Unrated'], ['waiting', 'Waiting for next review'], ['complete', 'Review complete'], ['excluded', 'Left out of review']];
const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const RATING_OPTS = [['4+', '4 or better on average'], ['3+', '3 or better on average'], ['under', 'Under 3 on average']];
const multi = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

// Defined at module level so React keeps the same menu (and the focus in its inputs) between keystrokes.
const MenuState = createContext<{ open: string | null; setOpen: (v: string | null) => void }>({ open: null, setOpen: () => undefined });
function Menu({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { open, setOpen } = useContext(MenuState);
  return (
    <span style={{ position: 'relative' }}>
      <button aria-haspopup="menu" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>{label}</button>
      {open === id && <div className="menu" role="menu" style={{ right: 0 }}>{children}</div>}
    </span>
  );
}
const Item = ({ on, onClick, children }: { on?: boolean; onClick: () => void; children: React.ReactNode }) => <button role="menuitem" className={on ? 'on' : ''} onClick={onClick}>{children}</button>;

/** The Library's filters (all in the address, read by GET /photos): the menus to set them and the active ones as removable chips. */
export function useLibraryFilters(shoots: Shoot[]) {
  const [sp, setSp] = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const tags = useApi<{ name: string; n: number }[]>(filtersOpen ? '/tags?kind=tag' : null);
  const gear = useApi<{ cameras: { name: string; n: number }[]; lenses: { name: string; n: number }[] }>(filtersOpen ? '/gear' : null);
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  // "None" for a camera, lens or place, and a chosen one, rule each other out: one change to the address, not two.
  const none = (k: string) => { const n = new URLSearchParams(sp); const cur = multi(n.get('missing')); const on = !cur.includes(k); n.delete(k); const next = on ? [...cur, k] : cur.filter((x) => x !== k); if (next.length) n.set('missing', next.join(',')); else n.delete('missing'); setSp(n, { replace: true }); setOpen(null); };
  const pick = (k: string, v: string) => { const n = new URLSearchParams(sp); if (n.get(k) === v) n.delete(k); else n.set(k, v); const rest = multi(n.get('missing')).filter((x) => x !== k); if (rest.length) n.set('missing', rest.join(',')); else n.delete('missing'); setSp(n, { replace: true }); setOpen(null); };
  const toggle = (k: string, v: string) => { const cur = multi(sp.get(k)); set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',')); };
  const shootById = new Map(shoots.map((s) => [s.id, s]));
  const shoots_ = { data: shoots };
  // What is currently filtering, as removable chips.
  const chips: { label: string; remove: () => void }[] = [];
  if (sp.get('q')) chips.push({ label: `“${sp.get('q')}”`, remove: () => set('q', null) });
  if (sp.get('shoot')) chips.push({ label: `Shoot: ${shootById.get(Number(sp.get('shoot')))?.name ?? '…'}`, remove: () => set('shoot', null) });
  for (const k of multi(sp.get('missing'))) chips.push({ label: `No ${k}`, remove: () => toggle('missing', k) });
  for (const s of multi(sp.get('tag'))) chips.push({ label: `Tag: ${s}`, remove: () => toggle('tag', s) });
  for (const s of multi(sp.get('colour'))) chips.push({ label: `Colour: ${s}`, remove: () => toggle('colour', s) });
  if (sp.get('rating')) chips.push({ label: `Score ${sp.get('rating')}`, remove: () => set('rating', null) });
  if (sp.get('from') || sp.get('to')) chips.push({ label: `Date: ${sp.get('from') ?? '…'} to ${sp.get('to') ?? '…'}`, remove: () => { set('from', null); set('to', null); } });
  if (sp.get('camera')) chips.push({ label: `Camera: ${sp.get('camera')}`, remove: () => set('camera', null) });
  if (sp.get('lens')) chips.push({ label: `Lens: ${sp.get('lens')}`, remove: () => set('lens', null) });
  if (sp.get('file')) chips.push({ label: `File name: ${sp.get('file')}`, remove: () => set('file', null) });
  if (sp.get('place')) chips.push({ label: `Place: ${sp.get('place')}`, remove: () => set('place', null) });
  if (sp.get('gps')) chips.push({ label: 'Has location', remove: () => set('gps', null) });
  for (const k of ['shape', 'light', 'contrast'] as const) if (sp.get(k)) chips.push({ label: `${k[0].toUpperCase()}${k.slice(1)}: ${sp.get(k)}`, remove: () => set(k, null) });
  if (sp.get('exclude')) chips.push({ label: `Without: ${sp.get('exclude')}`, remove: () => set('exclude', null) });
  if (sp.get('time')) chips.push({ label: `Time: ${sp.get('time')}`, remove: () => set('time', null) });
  if (sp.get('review')) chips.push({ label: `Review: ${REVIEW_OPTIONS.find(([key]) => key === sp.get('review'))?.[1] ?? sp.get('review')}`, remove: () => set('review', null) });
  if (sp.get('similarTo')) chips.push({ label: `Similar to photo ${sp.get('similarTo')}`, remove: () => set('similarTo', null) });

  const filtersPanel = filtersOpen ? (
    <MenuState.Provider value={{ open, setOpen }}>
      <div className="filters" style={{ marginBottom: 16 }}>
        <Menu id="shoot" label="Shoot">{(shoots_.data ?? []).map((s) => <Item key={s.id} on={sp.get('shoot') === String(s.id)} onClick={() => { set('shoot', String(s.id)); setOpen(null); }}>{s.name}</Item>)}</Menu>
        <Menu id="tag" label="Tag">
          {(tags.data ?? []).length === 0 && <span className="faint menu-note">None yet</span>}
          {(tags.data ?? []).map((t) => <Item key={t.name} on={multi(sp.get('tag')).includes(t.name)} onClick={() => toggle('tag', t.name)}>{t.name} <span className="faint">{t.n}</span></Item>)}
        </Menu>
        <Menu id="rating" label="Score">{RATING_OPTS.map(([v, l]) => <Item key={v} on={sp.get('rating') === v} onClick={() => { set('rating', v); setOpen(null); }}>{l}</Item>)}</Menu>
        <Menu id="review" label="Review">{REVIEW_OPTIONS.map(([key, label]) => <Item key={key} on={(sp.get('review') ?? '') === key} onClick={() => { set('review', key || null); setOpen(null); }}>{label}</Item>)}</Menu>
        <Menu id="colour" label="Colour"><div className="colour-grid">{COLOURS.map((c) => <button key={c} aria-label={c} title={c} aria-pressed={multi(sp.get('colour')).includes(c)} className={'cdot c-' + c + (multi(sp.get('colour')).includes(c) ? ' on' : '')} onClick={() => toggle('colour', c)} />)}</div></Menu>
        <Menu id="look" label="Shape & light">
          {([['shape', 'portrait'], ['shape', 'landscape'], ['shape', 'square'], ['light', 'dark'], ['light', 'mid'], ['light', 'bright'], ['contrast', 'low'], ['contrast', 'medium'], ['contrast', 'high']] as const).map(([k, v]) => (
            <Item key={k + v} on={sp.get(k) === v} onClick={() => set(k, sp.get(k) === v ? null : v)}>{k === 'shape' ? v : k === 'light' ? `${v === 'mid' ? 'mid-tone' : v} light` : `${v} contrast`}</Item>
          ))}
        </Menu>
        <Menu id="date" label="Date">
          <label className="menu-field">From <input type="date" value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value || null)} /></label>
          <label className="menu-field">To <input type="date" value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value || null)} /></label>
        </Menu>
        <Menu id="camera" label="Camera">
          <Item on={multi(sp.get('missing')).includes('camera')} onClick={() => none('camera')}>None <span className="faint">no camera recorded</span></Item>
          {(gear.data?.cameras ?? []).map((c) => <Item key={c.name} on={sp.get('camera') === c.name} onClick={() => pick('camera', c.name)}>{c.name} <span className="faint">{c.n}</span></Item>)}
        </Menu>
        <Menu id="lens" label="Lens">
          <Item on={multi(sp.get('missing')).includes('lens')} onClick={() => none('lens')}>None <span className="faint">no lens recorded</span></Item>
          {(gear.data?.lenses ?? []).map((c) => <Item key={c.name} on={sp.get('lens') === c.name} onClick={() => pick('lens', c.name)}>{c.name} <span className="faint">{c.n}</span></Item>)}
        </Menu>
        <Menu id="file" label="File name">
          <label className="menu-field">Contains <input value={sp.get('file') ?? ''} placeholder="e.g. R01 or IMG_20" onChange={(e) => set('file', e.target.value || null)} /></label>
        </Menu>
        <Menu id="place" label="Location">
          <label className="menu-field">Place <input value={sp.get('place') ?? ''} placeholder="e.g. Fremantle" onChange={(e) => set('place', e.target.value || null)} /></label>
          <Item on={!!sp.get('gps')} onClick={() => set('gps', sp.get('gps') ? null : '1')}>Only photos with GPS</Item>
          <Item on={multi(sp.get('missing')).includes('place')} onClick={() => none('place')}>None <span className="faint">no place or GPS</span></Item>
        </Menu>
      </div>
    </MenuState.Provider>
  ) : null;

  const clear = () => { const n = new URLSearchParams(); for (const k of ['view']) if (sp.get(k)) n.set(k, sp.get(k)!); setSp(n, { replace: true }); setOpen(null); };
  return { chips, panel: filtersPanel, filtersOpen, setFiltersOpen, clear };
}
