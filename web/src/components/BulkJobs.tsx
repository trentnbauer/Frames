import { useState } from 'react';
import { api, useApi } from '../api';
import { Modal } from './Modal';
type Job = { id: string; cursor: number; total: number; status: string; createdAt: string };
export async function finishBulkJob(id: string, progress: (value: string) => void) {
  for (;;) {
    const result = await api<{ cursor: number; total: number; status: string }>(`/photos/bulk-jobs/${id}/advance`, { body: {} });
    progress(`${result.cursor} of ${result.total} processed`);
    if (result.status === 'complete') return;
  }
}
export function BulkJobs() {
  const jobs = useApi<Job[]>('/photos/bulk-jobs'),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(''),
    [error, setError] = useState('');
  const pending = jobs.data?.filter((job) => job.status === 'pending') ?? [];
  return (
    <>
      <button
        onClick={() => {
          jobs.reload();
          setOpen(true);
        }}
      >
        Bulk edit history{pending.length ? ` · ${pending.length} unfinished` : ''}
      </button>
      {open && (
        <Modal
          title="Bulk edit history"
          sub="Resume an interrupted edit. Conflicts stop before overwriting newer edits; completed chunks remain available in Undo changes."
          onClose={() => !busy && setOpen(false)}
          foot={
            <button className="btn primary" disabled={busy} onClick={() => setOpen(false)}>
              Done
            </button>
          }
        >
          {status && <p role="status">{status}</p>}
          {(error || jobs.error) && <p role="alert">{error || jobs.error}</p>}
          {jobs.data?.map((job) => (
            <div className="workflow-row" key={job.id}>
              <div className="grow">
                <strong>
                  {job.cursor} of {job.total} processed
                </strong>
                <small>
                  {new Date(job.createdAt).toLocaleString()} · {job.status}
                </small>
              </div>
              {job.status === 'pending' && (
                <button
                  className="btn outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      await finishBulkJob(job.id, setStatus);
                      window.dispatchEvent(new Event('frames:metadata-changed'));
                      jobs.reload();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Resume
                </button>
              )}
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
