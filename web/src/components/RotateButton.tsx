import { useState } from 'react';
import { api, imageChanged } from '../api';

/** Turns a photograph that came in the wrong way round, a quarter turn clockwise. Only its previews change; the original file is never touched. */
export function RotateButton({ id, onDone, style }: { id: number; onDone: () => void; style?: React.CSSProperties }) {
  const [busy, setBusy] = useState(false);
  const turn = async () => {
    if (busy) return;
    setBusy(true);
    try { await api(`/photos/${id}/rotate`, { body: { by: 90 } }); imageChanged(id); onDone(); } catch (e) { window.alert((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <button type="button" onClick={turn} disabled={busy} aria-label="Rotate a quarter turn clockwise" title="Rotate (the original file is not changed)"
      style={{ width: 32, height: 32, borderRadius: '50%', display: 'inline-grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px var(--outline)', color: 'var(--text)', background: 'var(--surface)', flex: 'none', opacity: busy ? 0.5 : 1, ...style }}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" /></svg>
    </button>
  );
}
