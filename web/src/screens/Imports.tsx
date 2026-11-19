import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
type Run = { id: string; source: string; status: string; startedAt: string; files: number };
type Detail = {
  id: string;
  source: string;
  status: string;
  counts: Record<string, number>;
  missingDetails: number;
  blacklistCleared: number;
  aiQueued: number;
  files: { id: number; file: string; status: string; photoId: number | null; error: string; retryable: boolean }[];
};
/** Import statuses as people read them: upload-failed becomes Upload failed. */
export const statusName = (status: string) => { const t = status.replace(/[-_]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : status; };

/** Import history. On its own page, or (embedded) as the Imports tab of Stats. */
export function Imports({ embedded }: { embedded?: boolean } = {}) {
  const runs = useApi<Run[]>('/imports'),
    [selected, setSelected] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState('');
  const id = selected || runs.data?.[0]?.id,
    detail = useApi<Detail>(id ? `/imports/${id}` : null);
  const retry = async (fileId?: number) => {
    setBusy(true);
    setError('');
    try {
      const response = await api<{ retried: number; failed: number }>(`/imports/${id}/retry`, { body: fileId ? { fileId } : {} });
      setResult(`${response.retried} retried · ${response.failed} still need attention`);
      detail.reload();
      runs.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const d = detail.data?.id === id ? detail.data : null;
  return (
    <div className={embedded ? undefined : 'page-shell'} style={embedded ? { display: 'flex', flexDirection: 'column', gap: 16 } : undefined}>
      {embedded ? <h2 className="serif" style={{ fontSize: 32, fontWeight: 400, margin: 0 }}>Import history</h2> : <h1 className="serif">Import history</h1>}
      <p className="muted">Uploads, library imports and their per-file outcomes. Retry failed files without reimporting successful ones.</p>
      <label>
        Import batch
        <select
          className="field-in"
          value={id ?? ''}
          disabled={busy}
          onChange={(event) => {
            setSelected(event.target.value);
            setResult('');
          }}
        >
          {runs.data?.map((run) => (
            <option value={run.id} key={run.id}>
              {new Date(run.startedAt).toLocaleString('en-AU')} · {run.source} · {run.files} files · {statusName(run.status).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      {runs.data?.length === 0 && <p>No imports recorded yet. Your next upload or scan will appear here.</p>}
      {(error || runs.error || detail.error) && (
        <p role="alert" className="reason">
          {error || runs.error || detail.error}
        </p>
      )}
      {result && <p role="status">{result}</p>}
      {d && (
        <>
          <div className="workflow-metrics">
            {Object.entries(d.counts).map(([status, count]) => (
              <div key={status}>
                <strong>{count}</strong>
                <small>{statusName(status)}</small>
              </div>
            ))}
          </div>
          <div className="workflow-shortcuts">
            <Link to="/todo">{d.missingDetails} missing camera/lens details →</Link>
            <span>{d.blacklistCleared} imported photos have cleared metadata</span>
            <span>{d.aiQueued} have analysis pending or unavailable</span>
            <button className="btn primary" disabled={busy || !d.files.some((file) => file.retryable)} onClick={() => void retry()}>
              Retry unfinished files
            </button>
          </div>
          <div className="workflow-list">
            {d.files.map((file) => (
              <div className="workflow-row" key={file.id}>
                <div className="grow">
                  <strong>{file.file}</strong>
                  <small>
                    {statusName(file.status)}
                    {file.error ? ` · ${file.error}` : ''}
                  </small>
                </div>
                {file.photoId && <Link to={`/photo/${file.photoId}`}>Open photo →</Link>}
                {file.retryable && (
                  <button className="btn outline" disabled={busy} onClick={() => void retry(file.id)}>
                    Retry
                  </button>
                )}
                {file.status === 'upload-failed' && <Link to="/shoots?upload=1">Upload again →</Link>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
