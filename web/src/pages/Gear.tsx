import { useState } from 'react';
import { api, useApi } from '../api';
import { Header } from '../components/bits';

type Item = { id: number; kind: 'own' | 'want'; name: string; type: string; system: string; year: number | null; why: string; link: string; price: number | null; rank: number; used?: number };
type Data = { own: Item[]; want: Item[]; found: { name: string; type: string; count: number }[]; prefs: { showWant: boolean; arrange: 'system' | 'type' | 'used' | 'era' }; movedFromSettings: boolean; totals: { want: number; next: number | null } };

const TYPES: [string, string, string][] = [['camera', 'Camera', '◉'], ['lens', 'Lens', '◎'], ['film', 'Film', '▤'], ['light', 'Light & meter', '☼'], ['app', 'App', '▣'], ['other', 'Other', '·']];
const ARRANGE: [Data['prefs']['arrange'], string][] = [['system', 'System'], ['type', 'Type'], ['used', 'Most used'], ['era', 'Era']];
const money = (n: number | null) => (n === null ? '' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));

/** Gear & wishlist: want-to-buy is the hero; what you own sits below as small tiles. Syncs to the portfolio's Gear page. */
export function Gear() {
  const g = useApi<Data>('/gear/items');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [link, setLink] = useState('');
  const [front, setFront] = useState(true);
  const [all, setAll] = useState(false);
  const [err, setErr] = useState('');
  const d = g.data;
  const run = async (fn: () => Promise<unknown>) => { setErr(''); try { await fn(); g.reload(); } catch (e) { setErr((e as Error).message); } };
  const add = () => name.trim() && run(async () => { await api('/gear/items', { body: { kind: 'want', name, price: price || null, link, front } }); setName(''); setPrice(''); setLink(''); });
  const move = (i: number, by: number) => {
    if (!d) return;
    const ids = d.want.map((w) => w.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    run(() => api('/gear/order', { method: 'PUT', body: { ids } }));
  };
  const patch = (id: number, body: object) => run(() => api(`/gear/items/${id}`, { method: 'PATCH', body }));
  const shownWant = d ? (all ? d.want : d.want.slice(0, 6)) : [];
  const own = d ? [...d.own] : [];
  const arrange = d?.prefs.arrange ?? 'system';
  const groups = (() => {
    const by = new Map<string, Item[]>();
    const key = (i: Item) => arrange === 'type' ? (TYPES.find((t) => t[0] === i.type)?.[1] ?? 'Other') : arrange === 'era' ? (i.year ? `${Math.floor(i.year / 10) * 10}s` : 'Undated') : arrange === 'used' ? 'Most used first' : (i.system || (i.type === 'camera' || i.type === 'lens' ? 'Other' : 'Everything else'));
    const list = arrange === 'used' ? own.sort((a, b) => (b.used ?? 0) - (a.used ?? 0)) : own;
    for (const i of list) (by.get(key(i)) ?? by.set(key(i), []).get(key(i))!).push(i);
    // In "System", bodies come before the lenses that fit them.
    if (arrange === 'system') for (const l of by.values()) l.sort((a, b) => Number(b.type === 'camera') - Number(a.type === 'camera'));
    return [...by.entries()];
  })();

  return (
    <div className="page">
      <Header />
      <div className="title-row" style={{ marginBottom: 20 }}><h1 className="title">Gear &amp; wishlist</h1>{d && <span className="count">{d.own.length} owned · {d.want.length} wanted</span>}</div>
      {d?.movedFromSettings && <div className="banner" role="status"><span>Your cameras moved to Gear.</span></div>}
      {err && <div className="banner" role="alert"><span className="reason">{err}</span></div>}

      <section aria-label="Want to buy" className="gear-hero" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 280px', gap: 16, marginBottom: 40 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Want to buy</div>
          <h2 className="serif" style={{ fontSize: 30, marginBottom: 14 }}>What do you want next?</h2>
          <form onSubmit={(e) => { e.preventDefault(); add(); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <input className="field-in" style={{ flex: '2 1 200px', height: 40 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. XF 90mm f/2" aria-label="Name" />
            <input className="field-in" style={{ flex: '0 1 100px', height: 40 }} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Price" inputMode="decimal" aria-label="Price" />
            <input className="field-in" style={{ flex: '1 1 140px', height: 40 }} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link" aria-label="Link" />
            <div className="seg" role="group" aria-label="Where in the list"><button type="button" className={front ? 'on' : ''} onClick={() => setFront(true)}>As #1</button><button type="button" className={!front ? 'on' : ''} onClick={() => setFront(false)}>At the end</button></div>
            <button className="btn primary" disabled={!name.trim()}>Add to list</button>
          </form>
          {d && d.want.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Nothing on the list yet. Add the one thing you would buy tomorrow.</p>}
          <div role="table" style={{ display: 'flex', flexDirection: 'column' }}>
            {shownWant.map((w, i) => (
              <div key={w.id} role="row" style={{ display: 'grid', gridTemplateColumns: '28px minmax(0,1.3fr) minmax(0,1.4fr) 28px 80px auto 28px', gap: 10, alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--hair)' }} className="want-row">
                <span className="mono" style={{ fontSize: 12, color: i === 0 ? 'var(--text)' : 'var(--faint)' }}>#{i + 1}</span>
                <input className="inline" defaultValue={w.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value !== w.name && patch(w.id, { name: e.target.value })} />
                <input className="inline muted" defaultValue={w.why} placeholder="Why?" aria-label="Why" onBlur={(e) => e.target.value !== w.why && patch(w.id, { why: e.target.value })} />
                {w.link ? <a href={w.link} target="_blank" rel="noopener noreferrer" title={w.link} className="muted">↗</a> : <button className="faint" title="Add a link" onClick={() => { const l = window.prompt('Link (https://…)', ''); if (l) patch(w.id, { link: l }); }}>＋</button>}
                <input className="inline" style={{ textAlign: 'right' }} defaultValue={w.price ?? ''} placeholder="Price" inputMode="decimal" aria-label="Price" onBlur={(e) => String(w.price ?? '') !== e.target.value && patch(w.id, { price: e.target.value || null })} />
                <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <button aria-label="Move up" className="faint" onClick={() => move(i, -1)} disabled={i === 0}>▲</button><button aria-label="Move down" className="faint" onClick={() => move(i, 1)} disabled={i === d!.want.length - 1}>▼</button>
                  <button className="btn outline" style={{ height: 30, padding: '0 12px', fontSize: 12.5 }} onClick={() => run(() => api(`/gear/items/${w.id}/bought`, { method: 'POST', body: {} }))}>Bought it</button>
                </span>
                <button aria-label={`Remove ${w.name}`} className="faint" onClick={() => run(() => api(`/gear/items/${w.id}`, { method: 'DELETE' }))}>✕</button>
              </div>
            ))}
          </div>
          {d && d.want.length > 6 && <button className="muted" style={{ marginTop: 10, fontSize: 13 }} onClick={() => setAll(!all)}>{all ? 'Show top 6' : `Show all ${d.want.length}`}</button>}
        </div>
        <aside style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16, alignSelf: 'start' }}>
          <div><div className="eyebrow">Total</div><div className="serif" style={{ fontSize: 34 }}>{money(d?.totals.want ?? 0) || '$0'}</div></div>
          <div><div className="eyebrow">Next up</div><div style={{ fontSize: 14 }}>{d?.want[0] ? <>{d.want[0].name}<span className="muted"> · {money(d.want[0].price) || 'no price'}</span></> : '—'}</div></div>
          <label className="toggle" style={{ cursor: 'pointer' }}><span style={{ fontSize: 13.5 }}>Show on my portfolio</span><button role="switch" aria-checked={!!d?.prefs.showWant} className={'sw' + (d?.prefs.showWant ? ' on' : '')} onClick={() => run(() => api('/gear/prefs', { method: 'PUT', body: { showWant: !d?.prefs.showWant } }))} /></label>
        </aside>
      </section>

      <section aria-label="What I own">
        <div className="spread" style={{ marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 className="serif" style={{ fontSize: 28 }}>What I own</h2>
          <div className="seg" role="tablist" aria-label="Arrange by"><span className="faint" style={{ padding: '6px 8px 6px 12px', fontSize: 12 }}>Arrange by</span>{ARRANGE.map(([k, l]) => <button key={k} role="tab" aria-selected={arrange === k} className={arrange === k ? 'on' : ''} onClick={() => run(() => api('/gear/prefs', { method: 'PUT', body: { arrange: k } }))}>{l}</button>)}</div>
        </div>
        {d && d.found.length > 0 && (
          <div className="chips-row" aria-label="Found in your photos"><span className="eyebrow">Found in your photos</span>{d.found.slice(0, 8).map((f) => <button key={f.name} className="chip sug" onClick={() => run(() => api('/gear/items', { body: { kind: 'own', name: f.name, type: f.type } }))}>＋ {f.name} <span className="faint">{f.count}</span></button>)}</div>
        )}
        {groups.map(([title, items]) => (
          <div key={title} style={{ marginBottom: 28 }}>
            {arrange !== 'used' && <div className="eyebrow" style={{ marginBottom: 10 }}>{title}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 10 }}>
              {items.map((i) => (
                <div key={i.id} style={{ background: 'var(--surface)', borderRadius: 10, padding: '14px 14px 10px', position: 'relative', minHeight: 96 }}>
                  <input className="inline serif" style={{ fontSize: 20 }} defaultValue={i.name} aria-label="Name" onBlur={(e) => e.target.value.trim() && e.target.value !== i.name && patch(i.id, { name: e.target.value })} />
                  <div className="muted" style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{TYPES.find((t) => t[0] === i.type)?.[1]}</span>{i.system && <span>· {i.system}</span>}
                    <span>·</span><input className="inline" style={{ width: 44 }} defaultValue={i.year ?? ''} placeholder="year" inputMode="numeric" aria-label="Year" onBlur={(e) => String(i.year ?? '') !== e.target.value && patch(i.id, { year: e.target.value || null })} />
                    {arrange === 'used' && <span>· {i.used ?? 0} photos</span>}
                  </div>
                  <button title={`${TYPES.find((t) => t[0] === i.type)?.[1]} · click to change type`} aria-label="Change type" className="faint" style={{ position: 'absolute', right: 10, bottom: 8, fontSize: 15 }}
                    onClick={() => patch(i.id, { type: TYPES[(TYPES.findIndex((t) => t[0] === i.type) + 1) % TYPES.length][0] })}>{TYPES.find((t) => t[0] === i.type)?.[2]}</button>
                  <button aria-label={`Remove ${i.name}`} className="faint" style={{ position: 'absolute', right: 10, top: 8, fontSize: 12 }} onClick={() => run(() => api(`/gear/items/${i.id}`, { method: 'DELETE' }))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        ))}
        {d && d.own.length === 0 && <p className="muted">Nothing here yet. Tap a camera above that Frames found in your photos, or buy something from the list.</p>}
      </section>
    </div>
  );
}
