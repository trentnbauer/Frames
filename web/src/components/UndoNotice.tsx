import { useEffect, useState } from 'react';
import { api } from '../api';
import { useStore } from '../store';
export function UndoNotice() {
  const [id, setId] = useState<number | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const { refreshSummary } = useStore();
  useEffect(() => {
    const changed = (event: Event) => {
      setId((event as CustomEvent).detail.id);
      setError('');
    };
    window.addEventListener('frames:undo-available', changed);
    return () => window.removeEventListener('frames:undo-available', changed);
  }, []);
  if (id === null) return null;
  return (
    <div className="undo-notice" role="status">
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
