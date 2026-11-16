import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { Sheet } from '../components/Sheet';
import { Eyebrow, Seg } from './ui';

type Item = { id: number; kind: 'own' | 'want'; name: string; type: string; system: string; serial: string; year: number | null; why: string; link: string; price: number | null; rank: number };
type Data = { blacklisted: { id: number; name: string; types: string[] }[]; own: Item[]; want: Item[]; found: { name: string; type: string; count: number }[]; prefs: { currency?: string; systems?: string[] } };
type Draft = { id: number | 'new'; name: string; price: string; link: string; why: string };

/** The design's gear icons: a camera body, or a lens as two rings. */
function GearIcon({ type }: { type: string }) {
  return type === 'lens'
    ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--text2)" strokeWidth="1.4" aria-hidden style={{ flexShrink: 0 }}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="3" /></svg>
    : <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--text2)" strokeWidth="1.4" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><rect x="2.5" y="6" width="15" height="10" rx="1.5" /><path d="M7 6l1.2-2h3.6L13 6" /><circle cx="10" cy="11" r="2.8" /></svg>;
}
const meta = { font: '400 11.5px var(--mono)', color: 'var(--faint)', textTransform: 'uppercase' } as const;

const money = (n: number | null, cur: string) => (n === null ? 'Unknown' : `${cur}${n.toLocaleString('en-AU', { maximumFractionDigits: 2 })}`);

/** The Gear tab: owned gear by system with what was found in your photos, and the wishlist with Edit, reorder, Bought it and Didn’t buy it. */
export function MobileGear() {
  const g = useApi<Data>('/gear/items');
  const [sp, setSp] = useSearchParams();
  const view = sp.get('view') === 'wish' ? 'wish' : 'owned';
  const [open, setOpen] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { const f = () => g.reload(); window.addEventListener('frames:gear-changed', f); return () => window.removeEventListener('frames:gear-changed', f); }, [g.reload]);
  const d = g.data;
  const cur = d?.prefs.currency ?? '$';
  const want = [...(d?.want ?? [])].sort((a, b) => a.rank - b.rank);
  const own = d?.own ?? [];
  const run = async (fn: () => Promise<unknown>) => { if (busy) return; setBusy(true); setErr(''); try { await fn(); g.reload(); window.dispatchEvent(new Event('frames:gear-changed')); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const bySystem = new Map<string, Item[]>();
  for (const o of own) bySystem.set(o.system || 'Unassigned', [...(bySystem.get(o.system || 'Unassigned') ?? []), o]);
  const total = want.reduce((n, w) => n + (w.price ?? 0), 0);
  const move = (id: number, by: number) => run(async () => { const ids = want.map((w) => w.id); const i = ids.indexOf(id), j = i + by; if (j < 0 || j >= ids.length) return; ids.splice(i, 1); ids.splice(j, 0, id); await api('/gear/order', { method: 'PUT', body: { ids } }); });
  const save = () => { if (!draft || !draft.name.trim()) return; const price = draft.price.trim() === '' ? null : Number(draft.price); if (price !== null && !Number.isFinite(price)) { setErr('The price must be a number.'); return; } const body = { name: draft.name.trim(), price, link: draft.link.trim(), why: draft.why.trim() }; void run(async () => { await api(draft.id === 'new' ? '/gear/items' : `/gear/items/${draft.id}`, { method: draft.id === 'new' ? 'POST' : 'PATCH', body: draft.id === 'new' ? { ...body, kind: 'want' } : body }); setDraft(null); }); };
  return (
    <div className="pscreen ptab headless" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h1 style={{ font: '400 44px/1 var(--serif)', margin: 0 }}>Gear</h1>
        <button onClick={() => { setErr(''); setDraft({ id: 'new', name: '', price: '', link: '', why: '' }); }} style={{ height: 40, padding: '0 16px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 14 }}>+ Wishlist</button>
      </div>
      <Seg label="Gear view" value={view} options={[['owned', 'Owned'], ['wish', `Wishlist${want.length ? ` · ${want.length}` : ''}`]]} onPick={(v) => { const n = new URLSearchParams(sp); if (v === 'wish') n.set('view', 'wish'); else n.delete('view'); setSp(n, { replace: true }); }} />
      {err && !draft && <div role="alert" className="reason">{err}</div>}

      {view === 'owned' && d && <>
        {d.found.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', borderRadius: 12, background: 'var(--surface)' }}>
            <Eyebrow>FOUND IN YOUR PHOTOS</Eyebrow>
            {d.found.map((f) => (
              <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><GearIcon type={f.type} /><span style={{ flex: 1, fontSize: 15, overflowWrap: 'anywhere' }}>{f.name}</span><span style={meta}>{f.count.toLocaleString()} photos</span></div>
                <div style={{ display: 'flex', gap: 8, paddingLeft: 32 }}>
                  <button disabled={busy} onClick={() => run(() => api('/gear/items', { body: { kind: 'own', name: f.name, type: f.type } }))} style={{ height: 40, padding: '0 16px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13.5 }}>Add to gear</button>
                  <button disabled={busy} onClick={() => run(() => api('/gear/blacklist', { body: { name: f.name } }))} style={{ height: 40, padding: '0 12px', fontSize: 13.5, color: 'var(--text2)' }}>Blacklist</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {[...bySystem].map(([name, items]) => (
          <div key={name} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingBottom: 8 }}><span style={{ font: '400 26px/1 var(--serif)' }}>{name}</span><span style={meta}>{items.length} {items.length === 1 ? 'item' : 'items'}</span></div>
            {items.map((i) => <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 54, borderTop: '1px solid var(--hair)' }}><GearIcon type={i.type} /><span style={{ flex: 1, fontSize: 15, overflowWrap: 'anywhere' }}>{i.name}</span><span style={meta}>{i.year ?? ''}</span></div>)}
          </div>
        ))}
        {own.length === 0 && d.found.length === 0 && <div style={{ padding: '24px 0', fontSize: 13.5, color: 'var(--muted)' }}>No gear yet. Cameras and lenses found in your photos appear here to add.</div>}
        {d.blacklisted.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Eyebrow>BLACKLISTED GEAR</Eyebrow>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{d.blacklisted.map((b) => <span key={b.id} style={{ height: 32, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '0 4px 0 12px', borderRadius: 999, background: 'var(--chip)', fontSize: 13 }}>{b.name}<button aria-label={`Remove ${b.name} from blocked gear`} onClick={() => run(() => api(`/gear/blacklist/${b.id}`, { method: 'DELETE' }))} style={{ width: 28, height: 28, display: 'grid', placeItems: 'center', color: 'var(--muted)' }}>×</button></span>)}</div>
          </div>
        )}
      </>}

      {view === 'wish' && d && <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><Eyebrow>{want.length} {want.length === 1 ? 'ITEM' : 'ITEMS'}</Eyebrow><span style={{ font: '400 12px var(--mono)', color: 'var(--text2)' }}>{cur}{total.toLocaleString('en-AU', { maximumFractionDigits: 2 })}{want.some((w) => w.price === null) ? ` + ${want.filter((w) => w.price === null).length} unknown` : ''}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: -10 }}>
          {want.map((w, i) => (
            <div key={w.id} style={{ borderTop: '1px solid var(--hair)' }}>
              <button onClick={() => setOpen(open === w.id ? null : w.id)} aria-expanded={open === w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', height: 56, textAlign: 'left' }}>
                <span style={{ font: '400 11.5px var(--mono)', color: 'var(--faint)', width: 14 }}>{i + 1}</span>
                <GearIcon type="lens" />
                <span style={{ flex: 1, minWidth: 0, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.name}</span>
                <span style={{ font: '400 12.5px var(--mono)', color: w.price === null ? 'var(--faint)' : 'var(--text2)' }}>{money(w.price, cur)}</span>
                <span style={{ color: 'var(--faint)', width: 12, textAlign: 'center' }}>{open === w.id ? '−' : '+'}</span>
              </button>
              {open === w.id && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '0 0 18px 26px' }}>
                  <span style={{ fontSize: 15, lineHeight: 1.35, overflowWrap: 'anywhere' }}>{w.name}</span>
                  {w.why && <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text2)' }}>{w.why}</span>}
                  {w.link ? <a href={w.link} target="_blank" rel="noopener noreferrer" style={{ font: '400 12px var(--mono)', color: 'var(--faint)', overflowWrap: 'anywhere' }}>{w.link}</a> : <span style={{ font: '400 12px var(--mono)', color: 'var(--faint)' }}>No link</span>}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button onClick={() => { setErr(''); setDraft({ id: w.id, name: w.name, price: w.price === null ? '' : String(w.price), link: w.link, why: w.why }); }} style={{ height: 40, padding: '0 14px', borderRadius: 999, boxShadow: 'inset 0 0 0 1px var(--outline)', fontSize: 13.5 }}>Edit</button>
                    <button disabled={busy || i === 0} onClick={() => move(w.id, -1)} aria-label="Move up" style={{ width: 40, height: 40, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 13, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                    <button disabled={busy || i === want.length - 1} onClick={() => move(w.id, 1)} aria-label="Move down" style={{ width: 40, height: 40, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 13, opacity: i === want.length - 1 ? 0.4 : 1 }}>↓</button>
                    <button disabled={busy} onClick={() => run(async () => { await api(`/gear/items/${w.id}/bought`, { body: { name: w.name, type: w.type, system: w.system, ...(w.price !== null ? { price: w.price } : { price: null }) } }); setOpen(null); })} style={{ height: 40, padding: '0 14px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontSize: 13.5, fontWeight: 500 }}>Bought it</button>
                    <button disabled={busy} onClick={() => run(async () => { await api(`/gear/items/${w.id}?kind=want`, { method: 'DELETE' }); setOpen(null); })} style={{ height: 40, padding: '0 10px', fontSize: 13.5, color: 'var(--text2)' }}>Didn’t buy it</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {want.length === 0 && <div style={{ padding: '24px 0', fontSize: 13.5, color: 'var(--muted)', borderTop: '1px solid var(--hair)' }}>Nothing on your wishlist yet. Tap + Wishlist to add the next thing you want.</div>}
        </div>
      </>}
      {!d && <p className="muted">{g.error || 'Loading…'}</p>}

      {draft && (
        <Sheet title={draft.id === 'new' ? 'Add to wishlist' : 'Edit wishlist item'} onClose={() => setDraft(null)}>
          {[['Name', 'name', 'Camera, lens or accessory'], [`Estimated price (${cur})`, 'price', 'Estimated price (leave blank if unknown)'], ['Listing URL', 'link', 'Listing URL (optional)'], ['Notes', 'why', 'Notes (optional)']].filter(([, k]) => draft.id !== 'new' || k === 'name' || k === 'price').map(([label, k, ph]) => (
            <input key={k} aria-label={label} placeholder={ph || label} inputMode={k === 'price' ? 'decimal' : undefined} value={draft[k as 'name']} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} style={{ height: 50, border: 0, outline: 'none', borderRadius: 12, padding: '0 14px', background: 'var(--surface)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 16 }} />
          ))}
          {err && <div role="alert" style={{ fontSize: 13, color: 'var(--danger)' }}>{err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setDraft(null)} style={{ height: 46, padding: '0 16px', fontSize: 14, color: 'var(--text2)' }}>Cancel</button>
            <button disabled={busy || !draft.name.trim()} onClick={save} style={{ height: 46, padding: '0 22px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 14.5, opacity: draft.name.trim() ? 1 : 0.4 }}>{draft.id === 'new' ? 'Add' : 'Save changes'}</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
