import { createContext, useContext, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../api';
import type { PhotoLite, Shoot } from '../data';
import { Header, Justified, Loading, Title } from '../components/bits';
import { useStore } from '../store';

const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'brown', 'black', 'white', 'grey'];
const RATING_OPTS = [['4+', '4 or better on average'], ['3+', '3 or better on average'], ['under', 'Under 3 on average']];

// All filters live in the address, so a view can be bookmarked or linked to, and several can be combined.
const multi = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);

export function Library() {
  const [sp, setSp] = useSearchParams();
  const { settings } = useStore();
  const ai = !!settings && settings.ai !== 'off';
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState(sp.get('q') ?? '');

  const shoots = useApi<Shoot[]>('/shoots');
  const subjects = useApi<{ name: string; n: number }[]>('/tags?kind=subject');
  const tags = useApi<{ name: string; n: number }[]>('/tags?kind=tag');

  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const toggle = (k: string, v: string) => { const cur = multi(sp.get(k)); set(k, (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',')); };
  const clear = () => { setText(''); setSp({}, { replace: true }); setOpen(null); };

  const list = useApi<{ total: number; count: number; photos: PhotoLite[]; semantic: boolean }>(`/photos?${sp.toString()}`);
  const similarTo = sp.get('similarTo');
  const flat = !!(sp.get('q') || similarTo || sp.get('semantic'));
  const groups = useMemo(() => {
    if (!list.data || !shoots.data || flat) return [];
    const newest = sp.get('order') !== 'oldest';
    const order = newest ? shoots.data : [...shoots.data].reverse();
    return order.map((s) => ({ s, photos: list.data!.photos.filter((p) => p.shootId === s.id) })).filter((g) => g.photos.length);
  }, [list.data, shoots.data, flat, sp]);
  const count = list.data?.count ?? 0;

  // What is currently filtering, as removable chips.
  const chips: { label: string; remove: () => void }[] = [];
  if (sp.get('shoot')) chips.push({ label: `Photoshoot: ${shoots.data?.find((s) => String(s.id) === sp.get('shoot'))?.name ?? '…'}`, remove: () => set('shoot', null) });
  for (const s of multi(sp.get('subject'))) chips.push({ label: `Subject: ${s}`, remove: () => toggle('subject', s) });
  for (const s of multi(sp.get('tag'))) chips.push({ label: `Tag: ${s}`, remove: () => toggle('tag', s) });
  for (const s of multi(sp.get('colour'))) chips.push({ label: `Colour: ${s}`, remove: () => toggle('colour', s) });
  if (sp.get('rating')) chips.push({ label: `Rating: ${RATING_OPTS.find((r) => r[0] === sp.get('rating'))?.[1] ?? ''}`, remove: () => set('rating', null) });
  if (sp.get('from') || sp.get('to')) chips.push({ label: `Date: ${sp.get('from') ?? '…'} to ${sp.get('to') ?? '…'}`, remove: () => { set('from', null); set('to', null); } });
  if (sp.get('place')) chips.push({ label: `Place: ${sp.get('place')}`, remove: () => set('place', null) });
  if (sp.get('gps')) chips.push({ label: 'Has location', remove: () => set('gps', null) });
  if (sp.get('review') === 'excluded') chips.push({ label: 'Left out of review', remove: () => set('review', null) });
  if (similarTo) chips.push({ label: `Similar to photo ${similarTo}`, remove: () => set('similarTo', null) });

  return (
    <MenuState.Provider value={{ open, setOpen }}>
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end' }}>
        <Title count={list.data ? `${count.toLocaleString()} ${count === 1 ? 'photograph' : 'photographs'}${count !== list.data.total ? ` of ${list.data.total.toLocaleString()}` : ''}` : undefined}>Library</Title>
        <div className="filters" style={{ marginBottom: 28 }}>
          <Menu id="shoot" label="Photoshoot">
            {(shoots.data ?? []).map((s) => <Item key={s.id} on={sp.get('shoot') === String(s.id)} onClick={() => { set('shoot', String(s.id)); setOpen(null); }}>{s.name}</Item>)}
          </Menu>
          <Menu id="subject" label="Subject">
            {(subjects.data ?? []).length === 0 && <span className="faint menu-note">None yet</span>}
            {(subjects.data ?? []).map((t) => <Item key={t.name} on={multi(sp.get('subject')).includes(t.name)} onClick={() => toggle('subject', t.name)}>{t.name} <span className="faint">{t.n}</span></Item>)}
          </Menu>
          <Menu id="tag" label="Tag">
            {(tags.data ?? []).length === 0 && <span className="faint menu-note">None yet</span>}
            {(tags.data ?? []).map((t) => <Item key={t.name} on={multi(sp.get('tag')).includes(t.name)} onClick={() => toggle('tag', t.name)}>{t.name} <span className="faint">{t.n}</span></Item>)}
          </Menu>
          <Menu id="rating" label="Rating">
            {RATING_OPTS.map(([v, l]) => <Item key={v} on={sp.get('rating') === v} onClick={() => { set('rating', v); setOpen(null); }}>{l}</Item>)}
          </Menu>
          <Menu id="colour" label="Colour">
            <div className="colour-grid">{COLOURS.map((c) => <button key={c} aria-label={c} title={c} aria-pressed={multi(sp.get('colour')).includes(c)} className={'cdot c-' + c + (multi(sp.get('colour')).includes(c) ? ' on' : '')} onClick={() => toggle('colour', c)} />)}</div>
          </Menu>
          <Menu id="date" label="Date">
            <label className="menu-field">From <input type="date" value={sp.get('from') ?? ''} onChange={(e) => set('from', e.target.value || null)} /></label>
            <label className="menu-field">To <input type="date" value={sp.get('to') ?? ''} onChange={(e) => set('to', e.target.value || null)} /></label>
          </Menu>
          <Menu id="place" label="Location">
            <label className="menu-field">Place <input value={sp.get('place') ?? ''} placeholder="e.g. Fremantle" onChange={(e) => set('place', e.target.value || null)} /></label>
            <Item on={!!sp.get('gps')} onClick={() => set('gps', sp.get('gps') ? null : '1')}>Only photos with GPS</Item>
          </Menu>
          <span className="sep" />
          <button onClick={() => set('order', sp.get('order') === 'oldest' ? null : 'oldest')}>{sp.get('order') === 'oldest' ? 'Oldest first' : 'Newest first'}</button>
        </div>
      </div>

      <form className="searchrow" onSubmit={(e) => { e.preventDefault(); set('q', text.trim() || null); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={ai ? 'Search filenames, places, tags… or describe a photo' : 'Search filenames, places, tags and metadata'} aria-label="Search the library" />
        {ai && <label className="check"><input type="checkbox" checked={sp.get('semantic') === '1'} onChange={(e) => set('semantic', e.target.checked ? '1' : null)} /> Search by meaning</label>}
        <button className="pill">Search</button>
      </form>
      {(chips.length > 0 || sp.get('q')) && (
        <div className="chips-row">
          {sp.get('q') && <span className="chip">“{sp.get('q')}” <button aria-label="Clear search" onClick={() => { setText(''); set('q', null); }}>✕</button></span>}
          {chips.map((c) => <span key={c.label} className="chip">{c.label} <button aria-label={`Remove ${c.label}`} onClick={c.remove}>✕</button></span>)}
          <button className="t2" style={{ fontSize: 12.5 }} onClick={clear}>Clear all</button>
        </div>
      )}
      {sp.get('semantic') === '1' && list.data && !list.data.semantic && sp.get('q') && <div className="muted" role="status" style={{ marginBottom: 14, fontSize: 13 }}>The AI provider could not be reached, so this is a plain text search.</div>}

      {(list.loading || list.error) && <Loading error={list.error} />}
      {list.data && count === 0 && <div className="empty">{chips.length || sp.get('q') ? 'No photographs match.' : <>No photographs yet. Add some on the <Link to="/shoots" className="t2" style={{ textDecoration: 'underline' }}>Photoshoots</Link> page.</>}</div>}
      {flat && list.data && count > 0 && <Justified photos={list.data.photos} captions={similarTo || sp.get('semantic') ? (p) => `${Math.round((p.similarity ?? 0) * 100)}% match` : undefined} />}
      {groups.map(({ s, photos }) => (
        <section className="group" key={s.id}>
          <h2><Link to={`/shoots/${s.id}`}>{s.name}</Link></h2>
          <div className="meta">{[s.place, s.dates === s.name ? '' : s.dates, photos.length].filter(Boolean).join(' · ')}</div>
          <Justified photos={photos} />
        </section>
      ))}
    </div>
    </MenuState.Provider>
  );
}

// Defined here, not inside Library, so React keeps the same menu (and the focus in its inputs) between keystrokes.
const MenuState = createContext<{ open: string | null; setOpen: (v: string | null) => void }>({ open: null, setOpen: () => {} });
function Menu({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { open, setOpen } = useContext(MenuState);
  return (
    <span style={{ position: 'relative' }}>
      <button aria-haspopup="menu" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>{label}</button>
      {open === id && <div className="menu" role="menu" style={{ right: 0 }}>{children}</div>}
    </span>
  );
}
function Item({ on, onClick, children }: { on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button role="menuitem" className={on ? 'on' : ''} onClick={onClick}>{children}</button>;
}
