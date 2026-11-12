import { useEffect, useRef, useState } from 'react';

/** Save the title on Enter or blur; Escape restores the saved title. */
export function EditableCompositionName({ name, onSave }: { name: string; onSave: (name: string) => Promise<void> }) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const cancel = useRef(false);
  useEffect(() => { setValue(name); }, [name]);
  const save = async () => {
    if (cancel.current) { cancel.current = false; return; }
    const next = value.trim();
    if (!next) { setValue(name); return; }
    if (next === name || busy) return;
    setBusy(true); setError('');
    try { await onSave(next); setValue(next); } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <div style={{ minWidth: 0 }}>
    <input aria-label="Composition name" title="Rename composition" value={value} maxLength={120} disabled={busy}
      onChange={(e) => { setValue(e.target.value); setError(''); }} onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel.current = true; setValue(name); setError(''); e.currentTarget.blur(); }
      }} style={{ font: "400 40px/1 'Instrument Serif',Georgia,serif", color: 'var(--text)', background: 'transparent', border: 0, borderBottom: '1px solid var(--outline)', width: `${Math.max(7, value.length + 1)}ch`, maxWidth: '100%', padding: '0 0 4px' }} />
    {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13 }}>{error}</div>}
  </div>;
}
