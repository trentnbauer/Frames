import { useEffect, useRef, useState } from 'react';
import { imgUrl } from '../api';
import type { Shoot } from '../data';

/**
 * Move photographs to a shoot, in one view for new and existing shoots (the design): the name field is also the search,
 * tick one shoot and Add, or just Create. "No shoot" takes the photographs out of their shoots.
 * The caller does the work and closes the window; this only chooses.
 */
export function MoveToShoot({ count, shoots, canOrphan, busy, error, phone, onAdd, onCreate, onOrphan, onClose }: {
  count: number; shoots: Shoot[]; canOrphan: boolean; busy: boolean; error?: string; phone?: boolean;
  onAdd: (s: Shoot) => void; onCreate: (name: string) => void; onOrphan: () => void; onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (phone) return; const t = window.setTimeout(() => field.current?.focus(), 0); return () => window.clearTimeout(t); }, [phone]); // after the dialog has taken focus itself
  const [sel, setSel] = useState<number | null>(null);
  const name = q.trim();
  const recent = [...shoots].sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? '') || b.id - a.id);
  const shown = name ? recent.filter((s) => s.name.toLowerCase().includes(name.toLowerCase())) : recent;
  const chosen = shoots.find((s) => s.id === sel) ?? null;
  const label = name ? (shown.length ? `${shown.length} matching ${shown.length === 1 ? 'shoot' : 'shoots'}` : 'No shoot matches') : 'Recent shoots';
  const photos = `${count} ${count === 1 ? 'photograph' : 'photographs'}`;
  const hit = (s: string) => {
    const at = name ? s.toLowerCase().indexOf(name.toLowerCase()) : -1;
    return at < 0 ? s : <>{s.slice(0, at)}<b style={{ fontWeight: 500, background: 'var(--chip)', borderRadius: 3 }}>{s.slice(at, at + name.length)}</b>{s.slice(at + name.length)}</>;
  };
  const enter = () => { if (busy) return; if (chosen) onAdd(chosen); else if (name) onCreate(name); };
  const addBtn = chosen ? <button className="btn primary" disabled={busy} onClick={() => onAdd(chosen)}>{phone ? `Add to ${chosen.name}` : 'Add'}</button> : null;
  const createBtn = name ? <button className={'btn' + (shown.length === 0 || phone ? ' primary' : ' outline')} disabled={busy} onClick={() => onCreate(name)}>{phone ? `Create “${name}”` : 'Create'}</button> : null;
  const noShoot = canOrphan && !chosen ? <button className="btn" disabled={busy} onClick={onOrphan} style={{ color: 'var(--text2)' }}>No shoot</button> : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, height: phone ? 48 : 44, padding: '0 16px', borderRadius: 999, background: 'var(--surface)', boxShadow: `inset 0 0 0 1px ${name ? 'var(--text)' : 'var(--outline)'}` }}>
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden style={{ color: 'var(--muted)', flexShrink: 0 }}><circle cx="7" cy="7" r="4.6" /><path d="m10.4 10.4 3.4 3.4" /></svg>
        <input ref={field} value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} onKeyDown={(e) => { if (e.key === 'Enter') enter(); }} placeholder="Find a shoot, or type a name for a new one" aria-label="Shoot name" style={{ flex: 1, minWidth: 0, background: 'none', border: 0, outline: 'none', color: 'var(--text)', font: `400 ${phone ? 16 : 15}px var(--sans, inherit)` }} />
      </label>
      <span style={{ font: '500 11px var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 4px 0' }}>{shown.length === 0 && !name ? 'No shoots yet: type a name above to make one' : label}</span>
      <div role="group" aria-label="Shoots" style={{ display: 'flex', flexDirection: 'column', maxHeight: phone ? 280 : 300, overflowY: 'auto' }}>
        {shown.map((s) => (
          <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 8px', borderRadius: 10, cursor: 'pointer', background: sel === s.id ? 'var(--hover)' : undefined }}>
            <input type="checkbox" checked={sel === s.id} onChange={() => setSel(sel === s.id ? null : s.id)} style={{ width: phone ? 22 : 18, height: phone ? 22 : 18, flexShrink: 0 }} />
            <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, background: s.coverId ? `url(${imgUrl(s.coverId, 'thumb')}) center/cover var(--surface)` : 'var(--surface)' }} />
            <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 15, overflowWrap: 'anywhere' }}>{hit(s.name)}</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>{[s.place, s.dates].filter(Boolean).join(' · ')}</span></span>
            <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s.count}</span>
          </label>
        ))}
        {name && (
          <button disabled={busy} onClick={() => onCreate(name)} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 8px', borderTop: shown.length ? '1px solid var(--hair)' : undefined, borderRadius: 10, textAlign: 'left', background: shown.length === 0 ? 'var(--hover)' : undefined }}>
            <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, boxShadow: 'inset 0 0 0 1px var(--outline)', display: 'grid', placeItems: 'center', fontSize: 22, color: 'var(--muted)', marginLeft: phone ? 36 : 32 }}>+</span>
            <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontWeight: 500, overflowWrap: 'anywhere' }}>Create “{name}”</span><span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>New shoot, with the {photos} in it</span></span>
            {!phone && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Enter ↵</span>}
          </button>
        )}
      </div>
      {error && <div role="alert" className="reason">{error}</div>}
      {phone ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 6 }}>
          {addBtn ?? createBtn}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>{noShoot ?? <span />}<button className="btn" onClick={onClose} style={{ color: 'var(--text2)' }}>Cancel</button></div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 6, borderTop: '1px solid var(--hair)' }}>
          {chosen ? <span style={{ fontSize: 13, color: 'var(--muted)' }}>{photos} → {chosen.name}</span> : noShoot}
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          {name && !chosen && shown.length > 0 && <button className="btn primary" disabled style={{ opacity: 0.4 }}>Add</button>}
          {addBtn ?? (!name ? <button className="btn primary" disabled style={{ opacity: 0.4 }}>Add</button> : null)}
          {!chosen && createBtn}
        </div>
      )}
    </div>
  );
}
