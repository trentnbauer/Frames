import { confirmAction } from '../components/dialogs';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { Modal } from '../components/Modal';
type Entry = {
  id: number;
  name: string;
  link: string;
  estimated: number | null;
  paid: number | null;
  currency: string;
  date: string;
  note: string;
  restored: boolean;
};
export function WishlistHistory() {
  const [kind, setKind] = useState('bought'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [edit, setEdit] = useState<Entry | null>(null),
    [paid, setPaid] = useState(''),
    [date, setDate] = useState(''),
    [note, setNote] = useState('');
  const data = useApi<{ kind: string; counts: Record<string, number>; entries: Entry[] }>(`/gear/history?kind=${kind}`);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      data.reload();
      window.dispatchEvent(new Event('frames:gear-changed'));
      setEdit(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-shell">
      <h1 className="serif">Wishlist history</h1>
      <div className="workflow-shortcuts">
        <Link to="/gear">Active wishlist →</Link>
        {['bought', 'declined'].map((value) => (
          <button className={'btn ' + (kind === value ? 'primary' : 'outline')} key={value} onClick={() => setKind(value)}>
            {value === 'bought' ? 'Bought' : "Didn't buy"} · {data.data?.counts[value] ?? 0}
          </button>
        ))}
      </div>
      {error && !edit && (
        <p role="alert" className="reason">
          {error}
        </p>
      )}
      {data.error && <p role="alert">{data.error}</p>}
      <div className="workflow-list">
        {(data.data?.kind === kind ? data.data.entries : []).map((entry) => (
          <div className="workflow-row" key={entry.id}>
            <div className="grow">
              <strong>{entry.name}</strong>
              <small>
                Estimated {entry.estimated === null ? 'not set' : `${entry.currency}${entry.estimated}`} ·{' '}
                {kind === 'bought' ? `Paid ${entry.paid === null ? 'not set' : `${entry.currency}${entry.paid}`} · ` : ''}
                {new Date(entry.date).toLocaleDateString()}
                {entry.restored ? ' · Restored' : ''}
              </small>
              {entry.note && <p>{entry.note}</p>}
              {/^[hH][tT][tT][pP][sS]?:\/\//.test(entry.link) && (
                <a href={entry.link} target="_blank" rel="noopener noreferrer">
                  View listing →
                </a>
              )}
            </div>
            {kind === 'bought' && (
              <button
                className="btn outline"
                disabled={busy}
                onClick={() => {
                  setEdit(entry);
                  setPaid(entry.paid === null ? '' : String(entry.paid));
                  setDate(entry.date.slice(0, 10));
                  setNote(entry.note);
                }}
              >
                Edit purchase
              </button>
            )}
            <button
              className="btn outline"
              disabled={busy || entry.restored}
              onClick={() => void run(() => api(`/gear/history/${entry.id}/restore`, { body: {} }))}
            >
              Restore wish
            </button>
            <button
              className="btn"
              disabled={busy || entry.restored}
              onClick={async () => {
                if ((await confirmAction('Undo this decision? A purchase can be undone only if its owned gear is unchanged and unused.')))
                  void run(() => api(`/gear/history/${entry.id}/undo`, { body: {} }));
              }}
            >
              Undo decision
            </button>
          </div>
        ))}
      </div>
      {edit && (
        <Modal
          title="Edit purchase"
          sub="The original estimate and currency remain recorded."
          onClose={() => !busy && setEdit(null)}
          foot={
            <>
              <button className="btn" disabled={busy} onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy || !date}
                onClick={() =>
                  void run(async () => {
                    const amount = paid.trim() ? Number(paid) : null;
                    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new Error('Enter a valid paid amount.');
                    await api(`/gear/history/${edit.id}`, {
                      method: 'PATCH',
                      body: { paid: amount, date: new Date(`${date}T12:00:00`).toISOString(), note },
                    });
                  })
                }
              >
                Save
              </button>
            </>
          }
        >
          <div className="form">
            <label>
              Paid ({edit.currency})
              <input className="field-in" inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} />
            </label>
            <label>
              Purchased
              <input className="field-in" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              Note
              <textarea className="field-in" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
            {error && <p role="alert">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
