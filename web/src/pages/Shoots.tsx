import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate, type Shoot } from '../data';
import { Header, Img, Loading, Title } from '../components/bits';
import { useStore } from '../store';

type Pending = { count: number; folders: { folder: string; count: number }[]; lastScan: string | null };
type ScanResult = { imported: number; duplicates: number; relinked: number; changed: number; errors: { file: string; error: string }[]; shootName: string | null };
type Suggestion = { shootId: number; shootName: string; groups: { name: string; reason: string; photoIds: number[] }[] };

export function Shoots() {
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<Pending>('/library/pending');
  const suggestions = useApi<Suggestion[]>('/shoots/suggestions');
  const { refreshSummary } = useStore();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [uploaded, setUploaded] = useState<{ saved: string[]; rejected: { file: string; reason: string }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

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

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null); setUploaded(null);
    const fd = new FormData();
    for (const f of files) fd.append('file', f);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Upload failed');
      setUploaded(await r.json());
      await sync();
    } catch (e) { setError((e as Error).message); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const create = async () => { if (name.trim()) { await api('/shoots', { body: { name } }); setName(''); setNaming(false); shoots.reload(); } };
  const accept = async (g: Suggestion['groups'][number]) => { await api('/shoots', { body: { name: g.name, photoIds: g.photoIds } }); refreshAll(); };
  const p = pending.data;
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="page">
      <Header />
      <div className="spread" style={{ alignItems: 'flex-end', marginBottom: 28 }}>
        <Title count={shoots.data ? `${shoots.data.length} ${shoots.data.length === 1 ? 'shoot' : 'shoots'}` : undefined}>Photoshoots</Title>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {p?.lastScan && <span className="faint" style={{ fontSize: 12 }}>Last synced {fmtDate(p.lastScan, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
          <input ref={fileInput} type="file" multiple hidden accept=".jpg,.jpeg,.png,.tif,.tiff,.raf,.cr2,.cr3,.nef,.arw,.dng,.orf,.rw2" onChange={(e) => upload(e.target.files)} aria-label="Choose photographs to upload" />
          <button className="pill" onClick={() => fileInput.current?.click()} disabled={busy}>Upload photos</button>
          <button className="pill" onClick={() => setNaming(!naming)}>New photoshoot</button>
          <button className="pill primary" onClick={sync} disabled={busy}>{busy ? (progress && progress.total ? `Syncing ${progress.done} / ${progress.total}` : 'Syncing…') : 'Sync library'}</button>
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
      <div className="card-grid">{shoots.data?.map((s) => <ShootCard key={s.id} s={s} />)}</div>
    </div>
  );
}

function ShootCard({ s }: { s: Shoot }) {
  return (
    <Link to={`/shoots/${s.id}`}>
      <div className="cover">{s.coverId && <Img p={{ id: s.coverId, ar: 2.2 }} style={{ aspectRatio: '2.2', width: '100%', height: '100%' }} />}</div>
      <div className="spread"><h2 className="serif" style={{ fontSize: 22 }}>{s.name}</h2><span className="muted" style={{ fontSize: 12.5 }}>{s.count}</span></div>
      <div className="muted" style={{ fontSize: 12, margin: '2px 0 10px' }}>{[s.place, s.source, s.dates].filter(Boolean).join(' · ')}</div>
      <div className="bar"><i style={{ width: `${s.reviewPct}%` }} /></div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>{s.reviewPct === 100 ? `All ${s.sessions} sessions done` : `Reviews ${s.reviewPct}% done`}</div>
    </Link>
  );
}
