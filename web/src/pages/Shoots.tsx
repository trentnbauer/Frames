import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUi } from '../ui';
import { api, useApi } from '../api';
import { fmtDate, type Shoot } from '../data';
import { Header, Img, Loading } from '../components/bits';
import { useStore } from '../store';
import { AddPhotosButton } from '../components/AddPhotos';

type Pending = { count: number; folders: { folder: string; count: number }[]; lastScan: string | null };
type ScanResult = { shootId?: number | null; imported: number; duplicates: number; relinked: number; changed: number; errors: { file: string; error: string }[]; shootName: string | null };
type Suggestion = { shootId: number; shootName: string; groups: { name: string; reason: string; photoIds: number[] }[] };

export function Shoots() {
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<Pending>('/library/pending');
  const suggestions = useApi<Suggestion[]>('/shoots/suggestions');
  const { refreshSummary, me, summary } = useStore();
  const cloudOnly = !!me?.cloudOnly; // the administrator requires originals to be kept in cloud storage
  const { openNew } = useUi();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [uploaded, setUploaded] = useState<{ saved: string[]; rejected: { file: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = () => { shoots.reload(); pending.reload(); suggestions.reload(); refreshSummary(); };

  const sync = async () => {
    setBusy(true); setError(null); setProgress(null);
    try {
      await api('/library/scan', { method: 'POST', body: {} });
      // The sync runs on the server; poll until it finishes.
      for (;;) {
        const s = await api<{ running: boolean; done: number; total: number; result: ScanResult | null; error: string | null }>('/library/scan/status');
        setProgress({ done: s.done, total: s.total });
        if (!s.running) { if (s.error) throw new Error(s.error); setResult(s.result); break; }
        await new Promise((r) => setTimeout(r, 700));
      }
      refreshAll();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); setProgress(null); }
  };

  const accept = async (g: Suggestion['groups'][number]) => { await api('/shoots', { body: { name: g.name, photoIds: g.photoIds } }); refreshAll(); };
  const p = pending.data;
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 28, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <h1 className="serif" style={{ fontSize: 48, lineHeight: 1 }}>Photoshoots</h1>
          {shoots.data && <span className="muted" style={{ fontSize: 13 }}>{shoots.data.length} {shoots.data.length === 1 ? 'shoot' : 'shoots'} · {shoots.data.reduce((n, x) => n + x.count, 0).toLocaleString()} photographs</span>}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {summary && summary.due > 0 && <Link to="/review" className="btn outline">Start review <span className="mono" style={{ fontSize: 11, background: 'var(--chip)', borderRadius: 999, padding: '1px 7px' }}>{summary.due}</span></Link>}
          <AddPhotosButton onDone={refreshAll} />
        </div>
      </div>
      {cloudOnly && <p className="muted" style={{ fontSize: 13, margin: '-12px 0 24px' }}>Originals are kept in cloud storage on this server, so uploads are turned off. Connect a folder under <Link to="/settings?section=cloud-sync" style={{ textDecoration: 'underline' }}>Settings</Link>.</p>}
      {error && <div className="banner" role="alert"><span className="reason">{error}</span></div>}
      {p && p.count > 0 && !busy && (
        <div className="banner" role="status">
          <span><b>{p.count} new {p.count === 1 ? 'photo' : 'photos'} in your library</b> <span className="muted">· {p.folders.slice(0, 3).map((f) => f.folder).join(', ')} · will be filed as</span> <b>{today}</b> <span className="muted">(rename anytime)</span></span>
          <button className="pill primary" onClick={sync}>Import</button>
        </div>
      )}
      {uploaded && (
        <div className="banner" role="status">
          <span>Uploaded <b>{uploaded.saved.length}</b> {uploaded.saved.length === 1 ? 'file' : 'files'}.{uploaded.rejected.length > 0 && <span className="reason"> Not added: {uploaded.rejected.map((r) => `${r.file} (${r.reason})`).join(', ')}.</span>}</span>
          <button className="pill" onClick={() => setUploaded(null)}>Dismiss</button>
        </div>
      )}
      {result && (
        <div className="banner" role="status">
          <span>
            Imported <b>{result.imported}</b> {result.imported === 1 ? 'photo' : 'photos'}{result.shootName && result.imported > 0 && <> into <b>{result.shootName}</b></>}.
            {result.changed > 0 && <span className="muted"> {result.changed} edited {result.changed === 1 ? 'file was' : 'files were'} refreshed.</span>}
            {result.duplicates > 0 && <span className="muted"> {result.duplicates} exact {result.duplicates === 1 ? 'duplicate' : 'duplicates'} skipped.</span>}
            {result.relinked > 0 && <span className="muted"> {result.relinked} moved {result.relinked === 1 ? 'file was' : 'files were'} reconnected to existing photos.</span>}
            {result.errors.length > 0 && <span className="reason"> {result.errors.length} could not be read: {result.errors.slice(0, 3).map((e) => e.file).join(', ')}.</span>}
          </span>
          <button className="pill" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}
      {(suggestions.data ?? []).map((s) => (
        <div className="banner suggest" key={s.shootId}>
          <span><b>“{s.shootName}” looks like {s.groups.length} separate shoots.</b>
            <span className="sug-list">{s.groups.map((g) => (
              <button key={g.name} className="pill" onClick={() => accept(g)} title={g.reason}>Split off “{g.name}” ({g.photoIds.length})</button>
            ))}</span></span>
        </div>
      ))}
      {(shoots.loading || shoots.error) && <Loading error={shoots.error} />}
      {shoots.data?.length === 0 && <div className="empty">No photoshoots yet. Put photographs in your library folder and press Sync library, or upload some.</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: '28px 24px' }}>{shoots.data?.map((s) => <ShootCard key={s.id} s={s} />)}</div>
    </div>
  );
}

function ShootCard({ s }: { s: Shoot }) {
  const { openNew } = useUi();
  const photos = useApi<{ photos: { id: number }[] }>(`/photos?shoot=${s.id}`);
  return (
    <div>
      <Link to={`/shoots/${s.id}`} style={{ display: 'block', width: '100%', textAlign: 'left' }}>
        <div className="cover" style={{ borderRadius: 6, marginBottom: 12 }}>{s.coverId && <Img p={{ id: s.coverId, ar: 2.2 }} style={{ aspectRatio: '2.2', width: '100%', height: '100%' }} />}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ font: "400 22px 'Instrument Serif',Georgia,serif" }}>{s.name}</span><span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s.count}</span></div>
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 10px' }}>{[s.place, s.dates].filter(Boolean).join(' · ')}</div>
        <div style={{ height: 2, background: 'var(--hair)' }}><i style={{ display: 'block', height: '100%', background: 'var(--text2)', width: `${s.reviewPct}%` }} /></div>
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: 'var(--faint)' }}>{s.reviewPct >= 100 ? `All ${s.sessions} sessions done` : `Reviews ${s.reviewPct}% done`}</span>
        <button onClick={() => openNew({ name: s.name, photoIds: (photos.data?.photos ?? []).map((p) => p.id) })} style={{ fontSize: 12.5, color: 'var(--text)' }}>Compose from this →</button>
      </div>
    </div>
  );
}
