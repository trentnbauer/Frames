import { useEffect, useRef, useState } from 'react';
import { api, openPortfolio } from '../api';
import { confirmAction } from './dialogs';
import { FilmDefaults } from './FilmDefaults';
import { FoundGearItem } from './FoundGearItem';
import { GearBlacklist } from './GearBlacklist';
import { GearMore } from './GearMore';
import { Modal } from './Modal';
import { SegSlider } from './SegSlider';
import { Kbd, useShortcuts } from './shortcuts';

export type GearItem = { id: number; kind: 'own' | 'want'; name: string; type: string; system: string; serial: string; year: number | null; why: string; link: string; price: number | null; rank: number; used?: number };
export type GearData = { blacklisted: { id: number; name: string; types: string[] }[]; hidden?: { key: string; name: string }[]; own: GearItem[]; want: GearItem[]; found: { name: string; type: string; count: number }[]; prefs: { showWant: boolean; arrange: 'system' | 'type' | 'used' | 'era'; intro?: string; systems?: string[]; currency?: string } };

const TYPE_LABEL: Record<string, string> = { camera: 'Camera', lens: 'Lens', film: 'Film', light: 'Light meter', app: 'App', other: 'Other' };
const TYPES = Object.keys(TYPE_LABEL);
const ARRANGE: ['system' | 'type' | 'used' | 'era', string][] = [['system', 'System'], ['type', 'Type'], ['used', 'Most used'], ['era', 'Era']];
const CURRENCIES = ['$', '€', '£', '¥', '₹', 'kr', 'CHF'];
const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const money = (n: number, cur: string) => `${cur}${n.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`;
const label13 = { fontSize: 13, color: 'var(--text2)' } as const;

/** "1 body · 2 lenses" and so on, for what is in one group. */
function metaOf(items: GearItem[]) {
  const n = (t: string) => items.filter((i) => i.type === t).length;
  return [[n('camera'), 'body', 'bodies'], [n('lens'), 'lens', 'lenses'], [n('film'), 'film'], [n('light'), 'light meter'], [n('app'), 'app'], [n('other'), 'other item']]
    .filter((p) => p[0] as number > 0).map((p) => plural(p[0] as number, p[1] as string, p[2] as string | undefined)).join(' · ');
}

function groupsOf(own: GearItem[], arrange: GearData['prefs']['arrange'], systems: string[]) {
  const bodiesFirst = (list: GearItem[]) => [...list].sort((a, b) => Number(b.type === 'camera') - Number(a.type === 'camera'));
  if (arrange === 'type') return ['camera', 'lens', 'film', 'light', 'app', 'other'].map((t) => ({ key: t, title: ({ camera: 'Bodies', lens: 'Lenses', film: 'Film', light: 'Light meters', app: 'Apps', other: 'Other' } as Record<string, string>)[t], items: own.filter((i) => i.type === t) })).filter((g) => g.items.length);
  if (arrange === 'used') return [{ key: 'used', title: 'Most used', items: [...own].sort((a, b) => (b.used ?? 0) - (a.used ?? 0)) }].filter((g) => g.items.length);
  if (arrange === 'era') {
    const decade = (i: GearItem) => (i.year ? `${Math.floor(i.year / 10) * 10}s` : 'Year not set');
    const keys = [...new Set(own.map(decade))].sort((a, b) => (a === 'Year not set' ? 1 : b === 'Year not set' ? -1 : a.localeCompare(b)));
    return keys.map((k) => ({ key: k, title: k, items: bodiesFirst(own.filter((i) => decade(i) === k)) }));
  }
  const names = [...new Set([...systems, ...own.map((i) => i.system)])].filter(Boolean);
  const out = names.map((s) => ({ key: s, title: s, items: bodiesFirst(own.filter((i) => i.system === s)) }));
  const loose = own.filter((i) => !i.system);
  return loose.length ? [...out, { key: '', title: 'Unassigned', items: bodiesFirst(loose) }] : out;
}

/** Outline chips that choose one value; the chosen one is filled. */
function Chips({ options, value, onPick, label }: { options: [string, string][]; value: string; onPick: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {options.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onPick(k)} style={{ height: 32, padding: '0 14px', borderRadius: 999, fontSize: 13.5, background: value === k ? 'var(--btn-bg)' : 'transparent', color: value === k ? 'var(--btn-fg)' : 'var(--text2)', boxShadow: value === k ? 'none' : 'inset 0 0 0 1px var(--outline)', fontWeight: value === k ? 500 : 400 }}>{l}</button>)}
    </div>
  );
}

/** Gear & wishlist: the wishlist with its add card, then what you own as tiles in groups. */
export function GearPage({ data, reload, blocklisting, blocklistError, onBlocklistFound }: { data: GearData | undefined; reload: () => Promise<void>; blocklisting: string | null; blocklistError: string; onBlocklistFound: (name: string) => void }) {
  const d = data;
  const own = d?.own ?? [], want = d?.want ?? [];
  const cur = d?.prefs.currency ?? '$';
  const arrange = d?.prefs.arrange ?? 'system';
  const systems = d?.prefs.systems ?? [];
  const [err, setErr] = useState('');
  const run = async (job: () => Promise<unknown>) => { setErr(''); try { await job(); await reload(); window.dispatchEvent(new Event('frames:gear-changed')); } catch (e) { setErr((e as Error).message); } };
  const prefs = (body: Record<string, unknown>) => run(() => api('/gear/prefs', { method: 'PUT', body }));

  // ---- wishlist: the add card
  const [add, setAdd] = useState({ name: '', link: '', price: '', front: true });
  const addWish = () => run(async () => {
    const price = add.price.trim() ? Number(add.price.replace(/[^0-9.]/g, '')) : null;
    if (!add.name.trim()) throw new Error('Give the item a name.');
    if (price !== null && (!Number.isFinite(price) || price < 0 || price >= 1e8)) throw new Error('Enter a valid price, or leave it blank.');
    const link = add.link.trim();
    if (link) { try { const u = new URL(link); if (!['https:', 'http:'].includes(u.protocol)) throw new Error(); } catch { throw new Error('Enter a full http:// or https:// listing URL.'); } }
    await api('/gear/items', { body: { kind: 'want', name: add.name.trim(), price, link, front: add.front } });
    setAdd({ ...add, name: '', link: '', price: '' });
  });
  const total = want.reduce((n, w) => n + (w.price ?? 0), 0);
  const [drag, setDrag] = useState<number | null>(null);
  const reorder = (id: number, to: number) => run(async () => { const ids = want.map((w) => w.id); const at = ids.indexOf(id); if (at < 0) return; ids.splice(at, 1); ids.splice(to, 0, id); await api('/gear/order', { method: 'PUT', body: { ids } }); });

  // ---- one wishlist item being edited
  const [wish, setWish] = useState<{ item: GearItem; name: string; price: string; link: string; why: string } | null>(null);
  const saveWish = () => wish && run(async () => {
    const price = wish.price.trim() ? Number(wish.price) : null;
    if (!wish.name.trim()) throw new Error('Give the item a name.');
    if (price !== null && (!Number.isFinite(price) || price < 0 || price >= 1e8)) throw new Error('Enter a valid price, or leave it blank.');
    await api(`/gear/items/${wish.item.id}`, { method: 'PATCH', body: { name: wish.name.trim(), price, link: wish.link.trim(), why: wish.why.trim() } });
    setWish(null);
  });
  const dropWish = async (item: GearItem) => { if (await confirmAction(`Remove ${item.name} from your wishlist without adding it to owned gear?`, { confirm: 'Remove from wishlist', danger: true })) { setWish(null); await run(() => api(`/gear/items/${item.id}?kind=want`, { method: 'DELETE' })); } };

  // ---- "Bought it": where does it go
  const [bought, setBought] = useState<{ item: GearItem; name: string; type: string; system: string; newSystem: boolean; paid: string; year: string } | null>(null);
  const guessType = (n: string) => (/meter/i.test(n) ? 'light' : /\b\d{2,3}mm\b|lens/i.test(n) ? 'lens' : /grip|strap|bag|sling/i.test(n) ? 'other' : 'camera');
  const guessSystem = (n: string) => own.find((o) => o.system && n.toLowerCase().includes(o.system.toLowerCase().split(' ')[0]))?.system ?? '';
  const startBought = (item: GearItem) => setBought({ item, name: item.name, type: guessType(item.name), system: guessSystem(item.name), newSystem: false, paid: item.price === null ? '' : String(item.price), year: '' });
  const finishBought = () => bought && run(async () => {
    const y = bought.year.trim() ? Number(bought.year) : null;
    if (y !== null && (!Number.isInteger(y) || y <= 1800 || y >= 2200)) throw new Error('Enter a valid year, such as 1977.');
    await api(`/gear/items/${bought.item.id}/bought`, { body: { name: bought.name.trim(), type: bought.type, system: bought.system.trim(), ...(y ? { year: y } : {}), price: bought.paid.trim() ? Number(bought.paid) : null } });
    setBought(null);
  });

  // ---- one owned item: details save as you type; a new one is added with a button
  const [tile, setTile] = useState<{ id: number | 'new'; name: string; type: string; system: string; year: string; serial: string } | null>(null);
  const saveTimer = useRef(0);
  const [tileNote, setTileNote] = useState('Saves as you type');
  const patchTile = (next: NonNullable<typeof tile>) => {
    setTile(next);
    if (next.id === 'new') return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const y = next.year.trim() ? Number(next.year) : null;
      if (!next.name.trim()) { setTileNote('Give it a name'); return; }
      if (y !== null && (!Number.isInteger(y) || y <= 1800 || y >= 2200)) { setTileNote('Enter a valid year, such as 1977'); return; }
      try { await api(`/gear/items/${next.id}`, { method: 'PATCH', body: { name: next.name.trim(), type: next.type, system: next.system, year: y, serial: next.serial.trim() } }); setTileNote('Saved'); await reload(); } catch (e) { setTileNote((e as Error).message); }
    }, 700);
  };
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);
  const openTile = (item: GearItem | null, system = '') => { setTileNote('Saves as you type'); setTile(item ? { id: item.id, name: item.name, type: item.type, system: item.system, year: item.year ? String(item.year) : '', serial: item.serial ?? '' } : { id: 'new', name: '', type: 'camera', system, year: '', serial: '' }); };
  const addTile = () => tile && run(async () => {
    const y = tile.year.trim() ? Number(tile.year) : null;
    if (!tile.name.trim()) throw new Error('Give it a name.');
    if (y !== null && (!Number.isInteger(y) || y <= 1800 || y >= 2200)) throw new Error('Enter a valid year, such as 1977.');
    await api('/gear/items', { body: { kind: 'own', name: tile.name.trim(), type: tile.type, system: tile.system, ...(y ? { year: y } : {}), serial: tile.serial.trim() } });
    setTile(null);
  });
  const removeOwned = async (item: GearItem) => { if (await confirmAction(`Remove “${item.name}” from your gear?`, { title: `Remove “${item.name}” from your gear?`, confirm: 'Remove from gear', danger: true })) { setTile(null); await run(() => api(`/gear/items/${item.id}`, { method: 'DELETE' })); } };

  const blacklistFound = async (name: string) => { if (await confirmAction(`Blacklist ${name}?\n\nIt is cleared from the camera details of your photos, now and when new ones arrive. Original files are not changed.`, { confirm: 'Blacklist', danger: true })) onBlocklistFound(name); };

  // ---- systems
  const [sys, setSys] = useState<{ mode: 'new' | 'rename'; from: string; name: string } | null>(null);
  const saveSys = () => sys && run(async () => { const name = sys.name.trim(); if (!name) throw new Error('Give the system a name.'); await api(sys.mode === 'new' ? '/gear/systems' : '/gear/systems/rename', { body: sys.mode === 'new' ? { name } : { from: sys.from, to: name } }); setSys(null); });
  useEffect(() => { const open = () => setSys({ mode: 'new', from: '', name: '' }); window.addEventListener('frames:new-gear-system', open); return () => window.removeEventListener('frames:new-gear-system', open); }, []);
  useShortcuts([{ key: 'n', label: 'New system', run: () => setSys({ mode: 'new', from: '', name: '' }), off: arrange !== 'system' }]);

  const [intro, setIntro] = useState<string | null>(null);
  const introTimer = useRef(0);
  const groups = groupsOf(own, arrange, systems);
  const sysOptions = [...new Set([...systems, ...own.map((o) => o.system)])].filter(Boolean);
  const field = { width: '100%' } as const;
  const rows = want.map((w, i) => (
    <div key={w.id} draggable onDragStart={(e) => { setDrag(w.id); e.dataTransfer.setData('text/plain', String(w.id)); }} onDragOver={(e) => { if (drag !== null) e.preventDefault(); }} onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== w.id) void reorder(drag, i); setDrag(null); }} onDragEnd={() => setDrag(null)}
      style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, borderTop: '1px solid var(--hair)' }}>
      <span aria-hidden title="Drag to change priority" style={{ color: 'var(--faint)', cursor: 'grab', fontSize: 12, letterSpacing: '-2px', width: 14 }}>⋮⋮</span>
      <button onClick={() => setWish({ item: w, name: w.name, price: w.price === null ? '' : String(w.price), link: w.link, why: w.why })} style={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 16, overflowWrap: 'anywhere' }}>{w.name}</button>
      <span className="mono" style={{ fontSize: 13, color: w.price === null ? 'var(--faint)' : 'var(--text2)' }}>{w.price === null ? 'Price not set' : money(w.price, cur)}</span>
      {w.link ? <a href={w.link} target="_blank" rel="noopener noreferrer" aria-label={`Open the listing for ${w.name}`} style={{ color: 'var(--text2)', width: 20, textAlign: 'center' }}>↗</a> : <span style={{ width: 20 }} />}
      <button className="btn outline" onClick={() => startBought(w)}>Bought it</button>
    </div>
  ));

  return (
    <div className="page-shell">
      {(err || blocklistError) && <p role="alert" className="reason">{err || blocklistError}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 40, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}><h1 className="serif" style={{ fontSize: 48, lineHeight: 1, margin: 0, fontWeight: 400 }}>Gear</h1><span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{want.length} wanted · {own.length} owned</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><button className="btn outline" onClick={() => void openPortfolio()}>View on portfolio ↗</button><GearMore /></div>
      </div>

      <h2 className="serif" style={{ fontSize: 34, lineHeight: 1, fontWeight: 400, margin: '0 0 16px' }}>Wishlist</h2>
      <form onSubmit={(e) => { e.preventDefault(); void addWish(); }} style={{ background: 'var(--surface)', borderRadius: 16, padding: 16, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, marginBottom: 20 }}>
        <input className="field-in" style={field} value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="Name" aria-label="Name" maxLength={120} />
        <input className="field-in" style={field} value={add.link} onChange={(e) => setAdd({ ...add, link: e.target.value })} placeholder="Paste a listing link" aria-label="Listing link" />
        <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
          <input className="field-in" style={{ width: 130 }} value={add.price} onChange={(e) => setAdd({ ...add, price: e.target.value })} placeholder="Price" aria-label="Price" inputMode="decimal" />
          <div className="seg" role="group" aria-label="Where it goes in the list" style={{ alignSelf: 'center' }}><SegSlider />
            <button type="button" className={add.front ? 'on' : ''} onClick={() => setAdd({ ...add, front: true })}>Add at top</button>
            <button type="button" className={add.front ? '' : 'on'} onClick={() => setAdd({ ...add, front: false })}>Bottom</button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn primary" type="submit" disabled={!add.name.trim()}>Add to list</button>
        </div>
      </form>
      {want.length === 0 && <p className="muted" style={{ fontSize: 13.5, margin: '0 0 8px' }}>Nothing on your wishlist yet. Add a camera, lens or tool above.</p>}
      <div style={{ borderBottom: want.length ? '1px solid var(--hair)' : 'none' }}>{rows}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '12px 0 20px', flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>{plural(want.length, 'item')} · {money(total, cur)}</span>
        <span style={{ flex: 1 }} />
        <label style={{ ...label13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Currency<select className="field-in" style={{ width: 'auto', height: 32 }} aria-label="Wishlist currency" value={cur} onChange={(e) => void prefs({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
        <label style={{ ...label13, display: 'inline-flex', alignItems: 'center', gap: 8 }}>Show on my portfolio <button role="switch" aria-label="Show wishlist on my portfolio" aria-checked={!!d?.prefs.showWant} className={'sw' + (d?.prefs.showWant ? ' on' : '')} onClick={() => void prefs({ showWant: !d?.prefs.showWant })} /></label>
      </div>

      {(d?.found.length ?? 0) > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 14, border: '1.5px dashed var(--outline)', marginBottom: 32, flexWrap: 'wrap' }}>
          <span className="eyebrow">Found in your photos</span>
          <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {d!.found.map((f) => <FoundGearItem key={f.name} name={f.name} count={`${f.count.toLocaleString()} ${f.count === 1 ? 'photo' : 'photos'}`} busy={!!blocklisting} onAdd={() => void run(() => api('/gear/items', { body: { kind: 'own', name: f.name, type: f.type } }))} onHide={() => void run(() => api('/gear/hide', { body: { name: f.name } }))} onBlocklist={() => void blacklistFound(f.name)} />)}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, margin: '36px 0 14px', flexWrap: 'wrap' }}>
        <h2 className="serif" style={{ fontSize: 34, lineHeight: 1, fontWeight: 400, margin: 0 }}>What I own</h2>
        <div className="seg" role="group" aria-label="Arrange what I own" style={{ alignSelf: 'center' }}><SegSlider />
          {ARRANGE.map(([k, l]) => <button key={k} type="button" className={arrange === k ? 'on' : ''} onClick={() => void prefs({ arrange: k })}>{l}</button>)}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text2)', marginBottom: 28 }}>
        <i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }} />Synced to your portfolio
        <input value={intro ?? d?.prefs.intro ?? ''} onChange={(e) => { const v = e.target.value; setIntro(v); window.clearTimeout(introTimer.current); introTimer.current = window.setTimeout(async () => { await api('/gear/prefs', { method: 'PUT', body: { intro: v } }); setIntro(null); await reload(); }, 700); }} placeholder="A line about your kit, shown on your portfolio" aria-label="A line about your kit" maxLength={300} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontSize: 14, marginLeft: 12 }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {groups.map((g) => (
          <section key={g.key || 'none'} aria-label={g.title}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 12 }}>
              <h3 className="serif" style={{ fontSize: 28, lineHeight: 1, fontWeight: 400, margin: 0 }}>{g.title}</h3>
              <span style={{ fontSize: 13.5, color: 'var(--muted)' }}>{metaOf(g.items) || 'Nothing here yet'}</span>
              {arrange === 'system' && g.key && <button onClick={() => setSys({ mode: 'rename', from: g.key, name: g.key })} style={{ fontSize: 12.5, color: 'var(--faint)' }}>Rename</button>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 12 }}>
              {g.items.map((i) => (
                <div key={i.id} style={{ position: 'relative', background: 'var(--surface)', borderRadius: 12, minHeight: 72 }}>
                  <button onClick={() => openTile(i)} aria-label={`${TYPE_LABEL[i.type] ?? 'Gear'}: ${i.name}. Open its details`} style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%', height: '100%', textAlign: 'left', padding: '12px 14px 14px' }}>
                    <span style={{ ...label13, color: 'var(--muted)' }}>{TYPE_LABEL[i.type] ?? 'Other'}</span>
                    <span style={{ fontSize: 17, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{i.name}</span>
                  </button>
                  <button onClick={() => void removeOwned(i)} aria-label={`Remove ${i.name} from your gear`} style={{ position: 'absolute', top: 6, right: 6, width: 28, height: 28, display: 'grid', placeItems: 'center', color: 'var(--faint)', fontSize: 14 }}>✕</button>
                </div>
              ))}
              {arrange === 'system' && <button onClick={() => openTile(null, g.key)} style={{ minHeight: 72, borderRadius: 12, boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text2)', fontSize: 15 }}>+ Add</button>}
            </div>
          </section>
        ))}
        {own.length === 0 && arrange !== 'system' && <p className="muted" style={{ fontSize: 13.5 }}>Nothing owned yet. Switch to System to add gear.</p>}
      </div>
      {arrange === 'system' && <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 0' }}><button className="btn outline" onClick={() => setSys({ mode: 'new', from: '', name: '' })}>+ New system</button><Kbd k="N" /></div>}

      <div style={{ marginTop: 48, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(d?.hidden?.length ?? 0) > 0 && (
          <section aria-label="Hidden from Found" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--text2)' }}>
            <span className="eyebrow">Hidden from Found</span>
            {d!.hidden!.map((h) => <span key={h.key} className="gear-blacklist-tag">{h.name}<button type="button" aria-label={`Show ${h.name} in Found again`} onClick={() => void run(() => api(`/gear/hide/${h.key}`, { method: 'DELETE' }))}>×</button></span>)}
          </section>
        )}
        <FilmDefaults />
        <GearBlacklist items={d?.blacklisted ?? []} onChanged={() => window.dispatchEvent(new Event('frames:gear-changed'))} />
      </div>

      {tile && (
        <Modal width={520} onClose={() => setTile(null)}
          title={tile.id === 'new' ? 'Add gear' : <><span style={{ display: 'block', font: "400 13.5px var(--sans, inherit)", color: 'var(--text2)', marginBottom: 6 }}>{[TYPE_LABEL[tile.type], tile.system].filter(Boolean).join(' · ')}</span>{tile.name || 'Gear'}</>}
          sub={tile.id === 'new' ? (tile.system ? `To ${tile.system}` : undefined) : ((own.find((o) => o.id === tile.id)?.used ?? 0) > 0 ? `In ${own.find((o) => o.id === tile.id)!.used} of your photos · from camera data` : undefined)}
          foot={tile.id === 'new'
            ? <><span className="grow" /><button className="btn" onClick={() => setTile(null)}>Cancel</button><button className="btn primary" disabled={!tile.name.trim()} onClick={() => void addTile()}>Add to gear</button></>
            : <><button className="btn" style={{ color: 'var(--danger)', padding: 0 }} onClick={() => { const it = own.find((o) => o.id === tile.id); if (it) void removeOwned(it); }}>Remove from gear</button><span className="grow" style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--muted)' }}>{tileNote}</span><button className="btn primary" onClick={() => setTile(null)}>Done</button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label className="form" style={label13}>Name<input className="field-in" autoFocus value={tile.name} maxLength={120} onChange={(e) => patchTile({ ...tile, name: e.target.value })} /></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><span style={label13}>Type</span><Chips label="Type" options={TYPES.map((t) => [t, TYPE_LABEL[t]])} value={tile.type} onPick={(t) => patchTile({ ...tile, type: t })} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="form" style={label13}>System<select className="field-in" value={tile.system} onChange={(e) => patchTile({ ...tile, system: e.target.value })}><option value="">Unassigned</option>{sysOptions.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              <label className="form" style={label13}>Year made<input className="field-in" inputMode="numeric" value={tile.year} onChange={(e) => patchTile({ ...tile, year: e.target.value })} /></label>
            </div>
            <label className="form" style={label13}>Serial number<input className="field-in" value={tile.serial} maxLength={80} onChange={(e) => patchTile({ ...tile, serial: e.target.value })} /></label>
          </div>
        </Modal>
      )}

      {wish && (
        <Modal width={520} onClose={() => setWish(null)} title="Edit wishlist item" sub={fitsText(wish.item, own)}
          foot={<><button className="btn" style={{ color: 'var(--danger)', padding: 0 }} onClick={() => void dropWish(wish.item)}>Don’t want it</button><span className="grow" /><button className="btn" onClick={() => setWish(null)}>Cancel</button><button className="btn primary" onClick={() => void saveWish()}>Save</button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="form" style={label13}>Name<input className="field-in" autoFocus value={wish.name} maxLength={120} onChange={(e) => setWish({ ...wish, name: e.target.value })} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
              <label className="form" style={label13}>Estimated price ({cur})<input className="field-in" inputMode="decimal" value={wish.price} placeholder="Not set" onChange={(e) => setWish({ ...wish, price: e.target.value })} /></label>
              <label className="form" style={label13}>Listing URL<input className="field-in" value={wish.link} placeholder="https://" onChange={(e) => setWish({ ...wish, link: e.target.value })} /></label>
            </div>
            <label className="form" style={label13}>Notes<textarea className="field-in" rows={3} value={wish.why} maxLength={500} onChange={(e) => setWish({ ...wish, why: e.target.value })} /></label>
          </div>
        </Modal>
      )}

      {bought && (
        <Modal width={520} onClose={() => setBought(null)} title="Add to your gear" sub={bought.item.name}
          foot={<><span className="grow" /><button className="btn" onClick={() => setBought(null)}>Cancel</button><button className="btn primary" disabled={!bought.name.trim()} onClick={() => void finishBought()}>Add to gear</button></>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <label className="form" style={label13}>Name<input className="field-in" value={bought.name} maxLength={120} onChange={(e) => setBought({ ...bought, name: e.target.value })} /></label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={label13}>Type</span>
              <div className="seg" role="group" aria-label="Type" style={{ flexWrap: 'wrap', alignSelf: 'stretch' }}><SegSlider />{[['camera', 'Body'], ['lens', 'Lens'], ['other', 'Accessory']].map(([k, l]) => <button key={k} type="button" className={bought.type === k ? 'on' : ''} onClick={() => setBought({ ...bought, type: k })}>{l}</button>)}</div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span style={label13}>System</span>
              <div className="seg" role="group" aria-label="System" style={{ flexWrap: 'wrap', alignSelf: 'stretch' }}><SegSlider />{sysOptions.map((s) => <button key={s} type="button" className={!bought.newSystem && bought.system === s ? 'on' : ''} onClick={() => setBought({ ...bought, system: s, newSystem: false })}>{s}</button>)}<button type="button" className={bought.newSystem ? 'on' : ''} onClick={() => setBought({ ...bought, system: '', newSystem: true })}>New system…</button></div>
              {bought.newSystem && <input className="field-in" value={bought.system} placeholder="e.g. Mamiya 7, Nikon F" onChange={(e) => setBought({ ...bought, system: e.target.value })} />}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label className="form" style={label13}>Price paid<input className="field-in" inputMode="decimal" value={bought.paid} placeholder={cur} onChange={(e) => setBought({ ...bought, paid: e.target.value })} /></label>
              <label className="form" style={label13}>Year made<input className="field-in" inputMode="numeric" value={bought.year} placeholder="Optional" onChange={(e) => setBought({ ...bought, year: e.target.value })} /></label>
            </div>
          </div>
        </Modal>
      )}

      {sys && (
        <Modal width={420} onClose={() => setSys(null)} title={sys.mode === 'new' ? 'New system' : 'Rename system'}
          foot={<><span className="grow" /><button className="btn" onClick={() => setSys(null)}>Cancel</button><button className="btn primary" disabled={!sys.name.trim()} onClick={() => void saveSys()}>{sys.mode === 'new' ? 'Create' : 'Save'}</button></>}>
          <label className="form" style={label13}>System name<input className="field-in" autoFocus maxLength={60} value={sys.name} placeholder="e.g. Mamiya 7, Nikon F" onChange={(e) => setSys({ ...sys, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && sys.name.trim()) void saveSys(); }} /></label>
        </Modal>
      )}
    </div>
  );
}

const fitsText = (w: GearItem, own: GearItem[]) => { const b = w.system ? own.find((o) => o.system === w.system && o.type === 'camera') : undefined; return b ? `Fits your ${b.name}` : undefined; };
