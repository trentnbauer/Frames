import { useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from './Modal';
type Data = {
  aliases: { id: number; gearId: number; type: string; name: string; canonical: string }[];
  owned: { id: number; name: string; type: string }[];
};
export function GearAliases() {
  const [open, setOpen] = useState(false),
    [gearId, setGearId] = useState(''),
    [name, setName] = useState(''),
    [count, setCount] = useState<number | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const data = useApi<Data>(open ? '/gear/aliases' : null);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      data.reload();
      window.dispatchEvent(new Event('frames:gear-changed'));
      window.dispatchEvent(new Event('frames:metadata-changed'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="btn outline" onClick={() => setOpen(true)}>
        Gear name aliases
      </button>
      {open && (
        <Modal
          title="Gear name aliases"
          sub="Match metadata names to owned equipment. Raw EXIF stays unchanged."
          onClose={() => !busy && setOpen(false)}
        >
          <div className="form">
            <label>
              Owned equipment
              <select
                className="field-in"
                aria-label="Alias owned equipment"
                value={gearId}
                disabled={busy}
                onChange={(event) => {
                  setGearId(event.target.value);
                  setCount(null);
                }}
              >
                <option value="">Choose an owned camera or lens</option>
                {data.data?.owned.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Metadata name
              <input
                className="field-in"
                maxLength={120}
                value={name}
                disabled={busy}
                onChange={(event) => {
                  setName(event.target.value);
                  setCount(null);
                }}
              />
            </label>
            <button
              className="btn outline"
              disabled={busy || !gearId || !name.trim()}
              onClick={() =>
                void run(async () => {
                  const preview = await api<{ affected: number }>('/gear/aliases/preview', { body: { gearId: Number(gearId), name } });
                  setCount(preview.affected);
                })
              }
            >
              Preview matches
            </button>
            {count !== null && (
              <>
                <p>{count} existing photographs match. Future imports use this alias too.</p>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await api('/gear/aliases', { body: { gearId: Number(gearId), name } });
                      setName('');
                      setCount(null);
                    })
                  }
                >
                  Save alias
                </button>
              </>
            )}
            {error && (
              <p role="alert" className="reason">
                {error}
              </p>
            )}
            {data.error && <p role="alert">{data.error}</p>}
            {data.data?.aliases.map((alias) => (
              <div className="spread" key={alias.id}>
                <span>
                  {alias.name} → {alias.canonical}
                </span>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => void run(() => api(`/gear/aliases/${alias.id}`, { method: 'DELETE' }))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
