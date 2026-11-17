import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
export const UNDO_SHOWN_MS = 6000;
export function UndoNotice() {
  const [id, setId] = useState<number | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [hold, setHold] = useState(false); // the pointer or keyboard is on it: stay so Undo can be reached
  const { refreshSummary } = useStore();
  useEffect(() => {
    const changed = (event: Event) => {
      setId((event as CustomEvent).detail.id);
      setError('');
    };
    window.addEventListener('frames:undo-available', changed);
    return () => window.removeEventListener('frames:undo-available', changed);
  }, []);
  // Gone after a few seconds; an error stays until dismissed.
  useEffect(() => {
    if (id === null || error || busy || hold) return;
    const t = setTimeout(() => setId(null), UNDO_SHOWN_MS);
    return () => clearTimeout(t);
  }, [id, error, busy, hold]);
  if (id === null) return null;
  return (
    <div className="undo-notice" role="status" onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      <span>{error || 'Changes saved.'}</span>
      <button
        className="btn outline"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/changes/${id}/undo`, { body: {} });
            refreshSummary();
            window.dispatchEvent(new Event('frames:gear-changed'));
            window.dispatchEvent(new Event('frames:metadata-changed'));
            setId(null);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Undo
      </button>
      <button aria-label="Dismiss undo" onClick={() => setId(null)}>
        ×
      </button>
    </div>
  );
}
