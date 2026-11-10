import { useRef, useState } from 'react';
import { api, useApi } from '../api';
import { Header } from '../components/Shell';
import ProtoGear from '../proto/ProtoGear';

type Item = { id: number; kind: 'own' | 'want'; name: string; type: string; system: string; year: number | null; why: string; link: string; price: number | null; rank: number; used?: number };
type Data = { own: Item[]; want: Item[]; found: { name: string; type: string; count: number }[]; prefs: { showWant: boolean; arrange: 'system' | 'type' | 'used' | 'era'; intro?: string; currency?: string } };

const TO_DESIGN: Record<string, string> = { camera: 'Body', lens: 'Lens', film: 'Film', light: 'Light', app: 'App', other: 'Other' };
const TO_API: Record<string, string> = { Body: 'camera', Lens: 'lens', Film: 'film', Light: 'light', App: 'app', Other: 'other' };

/** Gear & wishlist (design: Proto Gear). It follows the portfolio's Gear page. Text edits are saved a moment after you stop typing. */
export function Gear() {
  const g = useApi<Data>('/gear/items');
  const [edits, setEdits] = useState<Record<number, Partial<Item>>>({});
  const timers = useRef<Record<string, number>>({});
  const d = g.data;
  const over = <T extends Item>(i: T): T => ({ ...i, ...(edits[i.id] ?? {}) });
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); } finally { g.reload(); } };
  const typing = (id: number, patch: Partial<Item>) => {
    setEdits((e) => ({ ...e, [id]: { ...(e[id] ?? {}), ...patch } }));
    window.clearTimeout(timers.current[`${id}`]);
    timers.current[`${id}`] = window.setTimeout(async () => { await api(`/gear/items/${id}`, { method: 'PATCH', body: patch }).catch(() => undefined); setEdits((e) => { const { [id]: _drop, ...rest } = e; return rest; }); g.reload(); }, 700);
  };
  const own = (d?.own ?? []).map(over);
  const want = (d?.want ?? []).map(over);
  const bodiesOf = (sys: string) => own.filter((o) => o.system === sys && o.type === 'camera');
  const fitsOf = (w: Item) => { const b = w.system ? bodiesOf(w.system)[0] : undefined; return b ? `Fits your ${b.name}` : ''; };
  const introTimer = useRef<number>(0);
  const [intro, setIntro] = useState<string | null>(null);

  return (
    <div className="page-shell">
      <Header />
      <ProtoGear
        currency={d?.prefs.currency ?? '$'} arrange={d?.prefs.arrange === 'era' ? 'year' : d?.prefs.arrange ?? 'system'} showWish={!!d?.prefs.showWant}
        intro={intro ?? d?.prefs.intro ?? ''} onIntro={(v: string) => { setIntro(v); window.clearTimeout(introTimer.current); introTimer.current = window.setTimeout(async () => { await api('/gear/prefs', { method: 'PUT', body: { intro: v } }); setIntro(null); g.reload(); }, 700); }}
        syncLabel="Synced to your portfolio"
        items={own.map((o) => ({ id: o.id, name: o.name, type: TO_DESIGN[o.type] ?? 'Other', system: o.system || 'Other', year: o.year, used: o.used ?? 0, note: '' }))}
        wish={want.map((w) => ({ id: w.id, name: w.name, price: w.price, url: w.link, why: w.why, fits: fitsOf(w) }))}
        found={(d?.found ?? []).map((f) => ({ name: f.name, type: TO_DESIGN[f.type] ? f.type : 'camera', n: `${f.count.toLocaleString()} photos` }))}
        guessSystem={(w: { name: string }) => { const hit = own.find((o) => o.system && w.name.toLowerCase().includes(o.system.toLowerCase().split(' ')[0])); return hit?.system ?? ''; }}
        guessType={(w: { name: string }) => (/meter/i.test(w.name) ? 'Light' : /\b\d{2,3}mm\b|lens/i.test(w.name) ? 'Lens' : /grip|strap|bag/i.test(w.name) ? 'Other' : 'Body')}
        onPrefs={(p: Record<string, unknown>) => run(() => api('/gear/prefs', { method: 'PUT', body: p }))}
        onAddItem={(i: { name: string; type: string; system?: string }) => run(() => api('/gear/items', { body: { kind: 'own', name: i.name, type: TO_API[i.type] ?? i.type, system: i.system } }))}
        onAddWish={(w: { name: string; price: string | null; link: string; front: boolean }) => run(() => api('/gear/items', { body: { kind: 'want', ...w } }))}
        onItem={(id: number, patch: Record<string, unknown>) => run(() => api(`/gear/items/${id}`, { method: 'PATCH', body: patch.type ? { ...patch, type: TO_API[patch.type as string] ?? patch.type } : patch }))}
        onItemName={(id: number, name: string) => typing(id, { name })}
        onWishText={(id: number, patch: Partial<Item>) => typing(id, patch)}
        onRemoveItem={(id: number) => run(() => api(`/gear/items/${id}`, { method: 'DELETE' }))}
        onOrder={(ids: number[]) => run(() => api('/gear/order', { method: 'PUT', body: { ids } }))}
        onRenameSystem={(from: string, to: string) => run(() => api('/gear/systems/rename', { body: { from, to } }))}
        onBought={(id: number, o: { name: string; type: string; system: string; year: number | null; paid: string | null }) => run(async () => { await api(`/gear/items/${id}/bought`, { body: {} }); await api(`/gear/items/${id}`, { method: 'PATCH', body: { name: o.name, type: TO_API[o.type] ?? 'other', system: o.system, ...(o.year ? { year: o.year } : {}), ...(o.paid ? { price: Number(o.paid) } : {}) } }); })}
      />
    </div>
  );
}
