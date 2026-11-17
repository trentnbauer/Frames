import { confirmAction } from '../components/dialogs';
import { SegSlider } from '../components/SegSlider';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { useStore } from '../store';
import { usePhoneWidth } from '../usePhoneWidth';
import { MobileRemoved } from '../mobile/More';
type Recovery = {
  id: number;
  title: string;
  file: string;
  removedAt: string;
  expiresAt: string;
  originalAvailable: boolean;
  reviews: number;
};
type Change = { id: number; label: string; createdAt: string; undoneAt: string | null };
export function Activity() {
  return usePhoneWidth() ? <MobileRemoved /> : <DesktopActivity />;
}

function DesktopActivity() {
  const [tab, setTab] = useState('removed'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const retention = useApi<{ days: number }>('/recovery/settings'),
    [days, setDays] = useState('');
  const photos = useApi<Recovery[]>('/recovery'),
    changes = useApi<Change[]>('/changes');
  const nav = useNavigate();
  const { refreshSummary } = useStore();
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      photos.reload();
      changes.reload();
      refreshSummary();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-shell">
      <h1 className="serif">Recently removed & changes</h1>
      <p className="muted">Recover metadata and ratings during your recovery period. Original files stay unchanged.</p>
      <div className="workflow-shortcuts">
        <label>
          Recovery days
          <input
            className="field-in"
            type="number"
            aria-label="Recovery days"
            min={1}
            max={365}
            value={days || String(retention.data?.days ?? 30)}
            onChange={(event) => setDays(event.target.value)}
          />
        </label>
        <button
          className="btn outline"
          disabled={busy || !days}
          onClick={async () => {
            if ((await confirmAction('Update recovery retention? Entries older than this period will expire. Original files stay unchanged.')))
              void run(async () => {
                await api('/recovery/settings', { method: 'PUT', body: { days: Number(days) } });
                retention.reload();
              });
          }}
        >
          Save recovery period
        </button>
        <small className="muted">Change history is available for 30 days.</small>
      </div>
      <div className="seg"><SegSlider />
        <button className={tab === 'removed' ? 'on' : ''} onClick={() => setTab('removed')}>
          Removed photos
        </button>
        <button className={tab === 'changes' ? 'on' : ''} onClick={() => setTab('changes')}>
          Undo changes
        </button>
      </div>
      {error && (
        <p role="alert" className="reason">
          {error}
        </p>
      )}
      {tab === 'removed' ? (
        <div className="workflow-list">
          {(photos.data ?? []).map((photo) => (
            <div className="workflow-row" key={photo.id}>
              <img src={`/api/recovery/${photo.id}/thumb`} alt="" />
              <div className="grow">
                <strong>{photo.title || photo.file}</strong>
                <small>
                  {photo.reviews} reviews · {Math.max(0, Math.ceil((Date.parse(photo.expiresAt) - Date.now()) / 86400000))} days left ·{' '}
                  {photo.originalAvailable ? 'Original available' : 'Original disconnected'}
                </small>
              </div>
              <button
                className="btn outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await api<{ id: number; missing: boolean; previewReady: boolean }>(`/recovery/${photo.id}/restore`, {
                      body: {},
                    });
                    nav(`/photo/${result.id}`);
                  })
                }
              >
                Restore
              </button>
            </div>
          ))}
          {photos.data?.length === 0 && <p className="muted">No photos removed in the last 30 days.</p>}
          {photos.error && <p role="alert">{photos.error}</p>}
        </div>
      ) : (
        <div className="workflow-list">
          {(changes.data ?? []).map((change) => (
            <div className="workflow-row" key={change.id}>
              <div className="grow">
                <strong>{change.label}</strong>
                <small>
                  {new Date(change.createdAt).toLocaleString()}
                  {change.undoneAt ? ' · Undone' : ''}
                </small>
              </div>
              <button
                className="btn outline"
                disabled={busy || !!change.undoneAt}
                onClick={() => void run(() => api(`/changes/${change.id}/undo`, { body: {} }))}
              >
                Undo
              </button>
            </div>
          ))}
          {changes.error && <p role="alert">{changes.error}</p>}
        </div>
      )}
      <p>
        <Link to="/library">Back to Library →</Link>
      </p>
    </div>
  );
}
