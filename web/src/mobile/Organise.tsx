import { useState } from 'react';
import { api, imgUrl, useApi } from '../api';
import { BackPill, Eyebrow } from './ui';

type Batch = { id: number; name: string; count: number; days: number; importedAt: string; covers: number[]; done: boolean };

/** Organise uploads on a phone: each new batch, a name to give it, split by day, and Add shoot. */
export function MobileOrganise() {
  const data = useApi<{ batches: Batch[]; left: number }>('/home/batches');
  const [names, setNames] = useState<Record<number, string>>({});
  const [splits, setSplits] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const batches = data.data?.batches ?? [];
  const left = batches.filter((b) => !done[b.id] && !b.done).length;
  const add = async (b: Batch) => {
    setBusy(b.id); setErr('');
    try {
      const nm = (names[b.id] ?? '').trim() || b.name;
      if ((names[b.id] ?? '').trim()) await api(`/shoots/${b.id}`, { method: 'PATCH', body: { name: names[b.id].trim() } });
      if (splits[b.id]) await api(`/shoots/${b.id}/split-by-day`, { body: { name: nm } });
      await api(`/home/batches/${b.id}/done`, { body: { on: true } });
      setDone((x) => ({ ...x, [b.id]: true }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const undo = async (b: Batch) => { try { await api(`/home/batches/${b.id}/done`, { body: { on: false } }); setDone((x) => ({ ...x, [b.id]: false })); data.reload(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="ppage" data-screen-label="Organise uploads">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ paddingTop: 4 }}><BackPill /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><h1 style={{ font: '400 40px/1 var(--serif)', margin: 0 }}>Organise uploads</h1><span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--text2)' }}>New photos arrive in batches. Name each one to turn it into a shoot.</span></div>
        <Eyebrow>{left ? `${left} BATCH${left > 1 ? 'ES' : ''} LEFT` : 'ALL SORTED ✓'}</Eyebrow>
        {err && <div role="alert" className="reason">{err}</div>}
        {batches.map((b) => {
          const isDone = !!done[b.id] || b.done, sp = !!splits[b.id], nm = (names[b.id] ?? '').trim() || b.name;
          return (
            <div key={b.id} style={{ padding: 14, borderRadius: 14, background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {!isDone ? (
                <>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>{b.covers.slice(0, 3).map((id) => <i key={id} style={{ width: 36, height: 46, borderRadius: 2, background: `url(${imgUrl(id, 'thumb')}) center/cover var(--hair)` }} />)}</span>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <input value={names[b.id] ?? ''} onChange={(e) => setNames((x) => ({ ...x, [b.id]: e.target.value }))} placeholder={b.name} aria-label="Shoot name" style={{ width: '100%', height: 36, boxSizing: 'border-box', border: 0, outline: 'none', borderRadius: 8, padding: '0 10px', background: 'var(--page)', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', fontSize: 15 }} />
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{b.count} photo{b.count === 1 ? '' : 's'} · {b.days} day{b.days === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {b.days > 1 && <button onClick={() => setSplits((x) => ({ ...x, [b.id]: !sp }))} aria-pressed={sp} style={{ height: 40, padding: '0 14px', borderRadius: 999, background: sp ? 'var(--chip)' : 'transparent', color: sp ? 'var(--text)' : 'var(--text2)', boxShadow: sp ? 'none' : 'inset 0 0 0 1px var(--outline)', fontSize: 13 }}>{sp ? `✓ Split into ${b.days} shoots` : `Split by day (${b.days})`}</button>}
                    <span style={{ flex: 1 }} />
                    <button disabled={busy !== null} onClick={() => add(b)} style={{ height: 40, padding: '0 16px', borderRadius: 999, background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, fontSize: 13.5 }}>{busy === b.id ? 'Adding…' : sp ? `Add ${b.days} shoots` : 'Add shoot'}</button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 13.5, color: 'var(--text2)' }}><span>{sp ? `✓ Added “${nm}” as ${b.days} shoots` : `✓ Added “${nm}”`}</span><button onClick={() => undo(b)} style={{ height: 32, color: 'var(--text)' }}>Undo</button></div>
              )}
            </div>
          );
        })}
        {data.data && batches.length === 0 && <div style={{ padding: '8px 0', fontSize: 13.5, color: 'var(--muted)' }}>Nothing to organise. Photos from a cloud account arrive here in batches.</div>}
        <div style={{ padding: 14, borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--hair)', fontSize: 12.5, lineHeight: 1.5, color: 'var(--muted)' }}>To move single photographs between shoots, select them in Library and choose Move. Larger reorganising is easier in the full app.</div>
      </div>
    </div>
  );
}
