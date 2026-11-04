import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUi } from '../ui';
import { api, useApi } from '../api';
import { fmtDate, type Shoot } from '../data';
import { Header, Img, Loading } from '../components/bits';
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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 28 }}>
        <h1 style={{ font: "400 48px/1 'Instrument Serif',Georgia,serif", margin: 0 }}>Photoshoots</h1>
        {shoots.data && <span style={{ fontSize: 13, color: '#8f8c86' }}>{shoots.data.length} {shoots.data.length === 1 ? 'shoot' : 'shoots'} · {shoots.data.reduce((n, x) => n + x.count, 0).toLocaleString()} photographs</span>}
      </div>
      <input ref={fileInput} type="file" multiple hidden accept=".jpg,.jpeg,.png,.tif,.tiff,.raf,.cr2,.cr3,.nef,.arw,.dng,.orf,.rw2" onChange={(e) => upload(e.target.files)} aria-label="Choose photographs to upload" />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
        style={{ width: '100%', borderRadius: 12, padding: '30px 32px', marginBottom: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', textAlign: 'left', background: 'rgba(255,255,255,.03)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)' }}>
        <div>
          <div style={{ font: "400 30px/1.1 'Instrument Serif',Georgia,serif" }}>Bring in a new shoot</div>
          <div style={{ fontSize: 13, color: '#a8a59f', marginTop: 6 }}>Drop a whole card or roll here. JPEG, TIFF and RAW. Originals are never changed.</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#6f6c67' }}>
            {p?.lastScan ? `Last synced ${fmtDate(p.lastScan, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` : ''}
            <button onClick={sync} disabled={busy} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{busy ? (progress && progress.total ? `Syncing ${progress.done} / ${progress.total}` : 'Syncing…') : 'Sync library'}</button>
          </span>
          <button onClick={() => setNaming(!naming)} style={{ borderRadius: 999, padding: '11px 18px', fontSize: 13, boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.2)' }}>New photoshoot</button>
          <button onClick={() => fileInput.current?.click()} disabled={busy} style={{ background: '#efede8', color: '#0d0d0d', fontWeight: 500, borderRadius: 999, padding: '13px 24px', fontSize: 14.5 }}>Upload photos</button>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span style={{ font: "400 22px 'Instrument Serif',Georgia,serif" }}>{s.name}</span><span style={{ fontSize: 12.5, color: '#8f8c86' }}>{s.count}</span></div>
        <div style={{ fontSize: 12, color: '#8f8c86', margin: '2px 0 10px' }}>{[s.place, s.dates].filter(Boolean).join(' · ')}</div>
        <div style={{ height: 2, background: 'rgba(255,255,255,.1)' }}><i style={{ display: 'block', height: '100%', background: '#a8a59f', width: `${s.reviewPct}%` }} /></div>
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: '#6f6c67' }}>{s.reviewPct >= 100 ? `All ${s.sessions} sessions done` : `Reviews ${s.reviewPct}% done`}</span>
        <button onClick={() => openNew({ name: s.name, photoIds: (photos.data?.photos ?? []).map((p) => p.id) })} style={{ fontSize: 12.5, color: '#efede8' }}>Compose from this →</button>
      </div>
    </div>
  );
}
