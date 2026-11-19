import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, useApi } from '../api';
import { reviewUrl } from '../reviewScope';
import { Modal } from '../components/Modal';
import { useStore } from '../store';
type Photo = { id: number; title: string; file: string; due: string | null; shoot: string; reviews: number };
type Data = { status:string;offset:number; counts: Record<string, number>; sessions: number; intervals: string[]; photos: Photo[] };
export function ReviewSchedule() {
  const [status, setStatus] = useState('due'),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<number[]>([]),
    [date, setDate] = useState(''),
    [changing, setChanging] = useState<number[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const data = useApi<Data>(`/review/schedule?status=${status}&offset=${page * 100}`),
    nav = useNavigate(),
    { refreshSummary } = useStore();
  return (
    <div className="page-shell">
      <h1 className="serif">Review schedule</h1>
      <p className="muted">
        Dates follow your review intervals: {data.data?.intervals.join(' → ')}. Previous scores stay hidden while rating.
      </p>
      <div className="workflow-shortcuts">
        {['due', 'upcoming', 'complete', 'excluded'].map((key) => (
          <button
            key={key}
            className={'btn ' + (status === key ? 'primary' : 'outline')}
            onClick={() => {
              setStatus(key);
              setPage(0);
              setSelected([]);
            }}
          >
            {({ due: 'Due now', upcoming: 'Upcoming', complete: 'Completed', excluded: 'Excluded' } as Record<string, string>)[key]} ·{' '}
            {data.data?.counts[key] ?? 0}
          </button>
        ))}
      </div>
      <div className="workflow-shortcuts">
        <button className="btn outline" disabled={!selected.length} onClick={() => nav(reviewUrl(selected))}>
          Review selected now
        </button>
        <button
          className="btn outline"
          disabled={!selected.length || status === 'excluded'}
          onClick={() => {
            setDate('');
            setChanging(selected);
          }}
        >
          Change selected dates
        </button>
      </div>
      <div className="workflow-shortcuts">
        <button
          className="btn"
          disabled={page === 0}
          onClick={() => {
            setPage((value) => value - 1);
            setSelected([]);
          }}
        >
          Previous page
        </button>
        <span>Page {page + 1}</span>
        <button
          className="btn"
          disabled={(page + 1) * 100 >= (data.data?.counts[status] ?? 0)}
          onClick={() => {
            setPage((value) => value + 1);
            setSelected([]);
          }}
        >
          Next page
        </button>
      </div>
      {data.error && <p role="alert">{data.error}</p>}
      <div className="workflow-list">
        {(data.data?.status===status&&data.data.offset===page*100?data.data.photos:[]).map((photo) => (
          <div className="workflow-row" key={photo.id}>
            <input
              type="checkbox"
              aria-label={`Select ${photo.title}`}
              checked={selected.includes(photo.id)}
              onChange={(event) => setSelected((ids) => (event.target.checked ? [...ids, photo.id] : ids.filter((id) => id !== photo.id)))}
            />
            <div className="grow">
              <Link to={`/photo/${photo.id}`}>{photo.title || photo.file}</Link>
              <small>
                {photo.shoot} · {photo.reviews} of {data.data?.sessions ?? 0} sessions ·{' '}
                {photo.due ? new Date(photo.due).toLocaleString('en-AU') : 'No further review scheduled'}
              </small>
            </div>
            <button className="btn outline" disabled={status === 'excluded'} onClick={() => nav(reviewUrl([photo.id]))}>
              Review now
            </button>
            <button
              className="btn"
              disabled={status === 'excluded'}
              onClick={() => {
                setDate('');
                setChanging([photo.id]);
              }}
            >
              Change date
            </button>
          </div>
        ))}
      </div>
      {changing && (
        <Modal
          title="Change review date"
          sub="The chosen date starts at midnight in your local timezone."
          onClose={() => !busy && setChanging(null)}
          foot={
            <>
              <button className="btn" disabled={busy} onClick={() => setChanging(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy || !date}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await api('/review/reschedule', { body: { ids: changing, due: new Date(`${date}T00:00:00`).toISOString() } });
                    data.reload();
                    refreshSummary();
                    setChanging(null);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save date
              </button>
            </>
          }
        >
          <label>
            Next review
            <input className="field-in" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
    </div>
  );
}
