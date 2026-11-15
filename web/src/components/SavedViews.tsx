import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, useApi } from '../api';
import { Modal } from './Modal';
type View = { id: number; name: string; filters: string };
export function SavedViews({ children }: { children?: ReactNode }) {
  const data = useApi<View[]>('/views'),
    [sp, setSp] = useSearchParams();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [modal, setModal] = useState<'new' | 'rename' | null>(null),
    [name, setName] = useState('');
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const selected = data.data?.find((view) => view.id === selectedId);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      data.reload();
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="workflow-shortcuts">
      <label>
        Saved views{' '}
        <select
          aria-label="Saved Library view"
          value={selected?.id ?? ''}
          onChange={(event) => {
            const view = data.data?.find((item) => item.id === Number(event.target.value));
            setSelectedId(view?.id ?? null);
            setSp(view?.filters ?? '');
          }}
        >
          <option value="">Current filters</option>
          {data.data?.map((view) => (
            <option value={view.id} key={view.id}>
              {view.name}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => {
          setName('');
          setModal('new');
        }}
      >
        Save current view
      </button>
      {selected && (
        <>
          <button
            disabled={busy}
            onClick={() => void run(() => api(`/views/${selected.id}`, { method: 'PATCH', body: { filters: sp.toString() } }))}
          >
            Update filters
          </button>
          <button
            onClick={() => {
              setName(selected.name);
              setModal('rename');
            }}
          >
            Rename view
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete saved view ${selected.name}?`))
                void run(async () => {
                  await api(`/views/${selected.id}`, { method: 'DELETE' });
                  setSelectedId(null);
                });
            }}
          >
            Delete view
          </button>
        </>
      )}
      {children}
      {(error || data.error) && !modal && <span role="alert">{error || data.error}</span>}
      {modal && (
        <Modal
          title={modal === 'rename' ? 'Rename Library view' : 'Save Library view'}
          sub="New matching photographs join this view automatically."
          onClose={() => !busy && setModal(null)}
          foot={
            <>
              <button className="btn" onClick={() => setModal(null)} disabled={busy}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy || !name.trim()}
                onClick={() =>
                  void run(async () => {
                    if (modal === 'rename' && selected) await api(`/views/${selected.id}`, { method: 'PATCH', body: { name } });
                    else {
                      const result = await api<View>('/views', { body: { name, filters: sp.toString() } });
                      setSelectedId(result.id);
                    }
                  })
                }
              >
                Save view
              </button>
            </>
          }
        >
          <label>
            View name
            <input className="field-in" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
          </label>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
