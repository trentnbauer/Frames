import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate, type Shoot } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';
import { useStore } from '../store';

type Pending = { count: number; folders: { folder: string; count: number }[]; lastScan: string | null };
type ScanResult = { imported: number; duplicates: number; relinked: number; errors: { file: string; error: string }[]; shootName: string | null };

export function Shoots() {
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<Pending>('/library/pending');
  const { refreshSummary } = useStore();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const run = async () => {
    setBusy(true); setError(null);
    try {
      setResult(await api<ScanResult>('/library/scan', { method: 'POST', body: {} }));
      shoots.reload(); pending.reload(); refreshSummary();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const create = async () => {
    if (!name.trim()) return;
    await api('/shoots', { body: { name } });
    setName(''); setNaming(false); shoots.reload();
  };
  const p = pending.data;
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 28 }}>
        <Title count={shoots.data ? `${shoots.data.length} ${shoots.data.length === 1 ? 'shoot' : 'shoots'}` : undefined}>Photoshoots</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {p?.lastScan && <span className="faint" style={{ fontSize: 12 }}>Last synced {fmtDate(p.lastScan, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
          <button className="pill" onClick={() => setNaming(!naming)}>New photoshoot</button>
          <button className="pill primary" onClick={run} disabled={busy}>{busy ? 'Syncing…' : 'Sync library'}</button>
        </div>
      </div>
      {naming && (
        <form className="form" style={{ marginBottom: 24 }} onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Photoshoot name" aria-label="Photoshoot name" style={{ width: 280 }} />
          <button className="pill primary">Create</button>
        </form>
      )}
      {error && <div className="banner" role="alert"><span className="reason">{error}</span></div>}
      {p && p.count > 0 && !busy && (
        <div className="banner" role="status">
          <span>
            <b>{p.count} new {p.count === 1 ? 'photo' : 'photos'} in your library</b>{' '}
            <span className="muted">· {p.folders.slice(0, 3).map((f) => f.folder).join(', ')} · will be filed as</span> <b>{today}</b> <span className="muted">(rename anytime)</span>
          </span>
          <button className="pill primary" onClick={run}>Import</button>
        </div>
      )}
      {result && (
        <div className="banner" role="status">
          <span>
            Imported <b>{result.imported}</b> {result.imported === 1 ? 'photo' : 'photos'}{result.shootName && <> into <b>{result.shootName}</b></>}.
            {result.duplicates > 0 && <span className="muted"> {result.duplicates} exact {result.duplicates === 1 ? 'duplicate' : 'duplicates'} skipped.</span>}
            {result.relinked > 0 && <span className="muted"> {result.relinked} moved {result.relinked === 1 ? 'file was' : 'files were'} reconnected to existing photos.</span>}
            {result.errors.length > 0 && <span className="reason"> {result.errors.length} could not be read: {result.errors.slice(0, 3).map((e) => e.file.split('/').pop()).join(', ')}.</span>}
          </span>
          <button className="pill" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}
      {(shoots.loading || shoots.error) && <Loading error={shoots.error} />}
      {shoots.data?.length === 0 && <div className="empty">No photoshoots yet. Put photographs in your library folder and press Sync library.</div>}
      <div className="card-grid">
        {shoots.data?.map((s) => (
          <ShootCard key={s.id} s={s} onRenamed={shoots.reload} />
        ))}
      </div>
    </div>
  );
}

function ShootCard({ s, onRenamed }: { s: Shoot; onRenamed: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(s.name);
  const save = async () => {
    setEditing(false);
    if (name.trim() && name !== s.name) { await api(`/shoots/${s.id}`, { method: 'PATCH', body: { name } }); onRenamed(); }
  };
  return (
    <div>
      <Link to={`/library`}>
        <div className="cover">{s.coverId && <Img p={{ id: s.coverId, ar: 2.2 }} style={{ aspectRatio: '2.2', width: '100%', height: '100%' }} />}</div>
      </Link>
      <div className="spread">
        {editing ? (
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && save()} aria-label="Photoshoot name" className="serif" style={{ fontSize: 22, background: 'var(--surface)', border: 0, borderRadius: 6, padding: '2px 6px', width: '100%' }} />
        ) : (
          <h2 className="serif" style={{ fontSize: 22 }}>{s.name} <button className="faint" style={{ fontSize: 12 }} aria-label={`Rename ${s.name}`} onClick={() => setEditing(true)}>rename</button></h2>
        )}
        <span className="muted" style={{ fontSize: 12.5 }}>{s.count}</span>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>{[s.source, s.dates].filter(Boolean).join(' · ')}</div>
      <div className="bar"><i style={{ width: `${s.reviewPct}%` }} /></div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>{s.reviewPct === 100 ? `All ${s.sessions} sessions done` : `Reviews ${s.reviewPct}% done`}</div>
    </div>
  );
}
