import { useState } from 'react';
import { api } from '../api';

export function GearBlacklist({ items, onChanged }: { items: { id: number; name: string; types: string[] }[]; onChanged: () => void }) {
  const [name, setName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const act = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await operation(); onChanged(); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const add = () => {
    if (!name.trim() || busy) return;
    void act(async () => { await api('/gear/blacklist', { body: { name: name.trim() } }); setName(''); });
  };
  return <section aria-label="Blacklisted gear" className="gear-blacklist">
    <span className="eyebrow">Blacklisted gear</span>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {items.map((g) => <span className="gear-blacklist-tag" key={g.id} title={g.types.join(', ')}>{g.name}<button type="button" disabled={busy} aria-label={`Remove ${g.name} from blacklist`} onClick={() => void act(() => api(`/gear/blacklist/${g.id}`, { method: 'DELETE' }))}>×</button></span>)}
        <input aria-label="Add blacklisted gear" placeholder="+ Add gear name" value={name} maxLength={120} disabled={busy} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add(); } }} />
        {name.trim() && <button type="button" className="btn outline" disabled={busy} onClick={add}>Add</button>}
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>Matching camera and lens details are cleared from existing and future photos. Original files stay unchanged.</p>
      {error && <span role="alert" style={{ color: 'var(--danger)', fontSize: 12.5 }}>{error}</span>}
    </div>
  </section>;
}
