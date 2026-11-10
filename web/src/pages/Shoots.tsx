import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUi } from '../ui';
import { api, useApi } from '../api';
import { fmtDate, type Shoot } from '../data';
import { Header, Img, Loading } from '../components/bits';
import { useStore } from '../store';

type Pending = { count: number; folders: { folder: string; count: number }[]; lastScan: string | null };
type ScanResult = { shootId?: number | null; imported: number; duplicates: number; relinked: number; changed: number; errors: { file: string; error: string }[]; shootName: string | null };
type Suggestion = { shootId: number; shootName: string; groups: { name: string; reason: string; photoIds: number[] }[] };

export function Shoots() {
  const shoots = useApi<Shoot[]>('/shoots');
  const pending = useApi<Pending>('/library/pending');
  const suggestions = useApi<Suggestion[]>('/shoots/suggestions');
  const { refreshSummary, me } = useStore();
  const cloudOnly = !!me?.cloudOnly; // the administrator requires originals to be kept in cloud storage
  const { openNew } = useUi();
  const nav = useNavigate();
  const [box, setBox] = useState<'drop' | 'busy' | 'done' | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const made = useApi<{ photos: { id: number; ar: number }[] }>(box === 'done' && result?.shootId ? `/photos?shoot=${result.shootId}` : null);
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
    setError(null); setUploaded(null); setBox('busy');
    const fd = new FormData();
    for (const f of files) fd.append('file', f);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Upload failed');
      setUploaded(await r.json());
      await sync();
      setBox('done');
    } catch (e) { setError((e as Error).message); setBox(null); }
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
        {shoots.data && <span style={{ fontSize: 13, color: 'var(--muted)' }}>{shoots.data.length} {shoots.data.length === 1 ? 'shoot' : 'shoots'} · {shoots.data.reduce((n, x) => n + x.count, 0).toLocaleString()} photographs</span>}
      </div>
      <input ref={fileInput} type="file" multiple hidden accept=".jpg,.jpeg,.png,.tif,.tiff,.raf,.cr2,.cr3,.nef,.arw,.dng,.orf,.rw2" onChange={(e) => upload(e.target.files)} aria-label="Choose photographs to upload" />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
        style={{ width: '100%', borderRadius: 12, padding: '30px 32px', marginBottom: 36, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', textAlign: 'left', background: 'rgba(255,255,255,.03)', boxShadow: 'inset 0 0 0 1px var(--outline)' }}>
        <div>
          <div style={{ font: "400 30px/1.1 'Instrument Serif',Georgia,serif" }}>Bring in a new shoot</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>{cloudOnly ? <>Originals are kept in cloud storage on this server, so uploads are turned off. Connect a folder under <Link to="/settings?section=cloud-sync" style={{ textDecoration: 'underline' }}>Settings, Cloud sync</Link>, or sync the library folder.</> : 'Drop a whole card or roll here. JPEG, TIFF and RAW. Originals are never changed.'}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--faint)' }}>
            {p?.lastScan ? `Last synced ${fmtDate(p.lastScan, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ` : ''}
            <button onClick={sync} disabled={busy} style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>{busy ? (progress && progress.total ? `Syncing ${progress.done} / ${progress.total}` : 'Syncing…') : 'Sync library'}</button>
          </span>
          <button onClick={() => setNaming(!naming)} style={{ borderRadius: 999, padding: '11px 18px', fontSize: 13, boxShadow: 'inset 0 0 0 1px var(--outline)' }}>New photoshoot</button>
          {cloudOnly
            ? <Link to="/settings?section=cloud-sync" style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '13px 24px', fontSize: 14.5 }}>Connect cloud storage</Link>
            : <button onClick={() => setBox('drop')} disabled={busy} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '13px 24px', fontSize: 14.5 }}>Upload photos</button>}
        </div>
      </div>
      {naming && (
        <form className="form" style={{ marginBottom: 24 }} onSubmit={(e) => { e.preventDefault(); create(); }}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Photoshoot name" aria-label="Photoshoot name" style={{ width: 280 }} />
          <button className="pill primary">Create</button>
        </form>
      )}
      {box && (
        <div onMouseDown={(e) => e.target === e.currentTarget && box !== 'busy' && setBox(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div role="dialog" aria-label="Bring in a shoot" style={{ background: 'var(--surface)', borderRadius: 14, padding: 28, width: 560, maxWidth: '100%', maxHeight: '86vh', overflow: 'auto', boxShadow: '0 0 0 1px var(--hair),0 12px 30px rgba(0,0,0,.5)' }}>
            {box === 'drop' && (
              <>
                <h2 style={{ font: "400 30px 'Instrument Serif',Georgia,serif", margin: '0 0 6px' }}>Bring in a shoot</h2>
                <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 18px' }}>One shoot or roll at a time works best. Frames groups by date and suggests splits.</p>
                <button onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}
                  style={{ width: '100%', aspectRatio: '2', borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--outline)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(255,255,255,.03)' }}>
                  <span style={{ font: "400 24px 'Instrument Serif',Georgia,serif" }}>Drop photographs here</span>
                  <span style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14 }}>Choose files</span>
                  <span style={{ fontSize: 12, color: 'var(--faint)' }}>JPEG · TIFF · RAW</span>
                </button>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 14 }}>Or <button onClick={async () => { setBox('busy'); await sync(); setBox('done'); }} style={{ color: 'var(--text)', textDecoration: 'underline' }}>sync the library folder</button> · {p?.count ?? 0} new {p?.count === 1 ? 'file' : 'files'} found</div>
              </>
            )}
            {box === 'busy' && (
              <>
                <h2 style={{ font: "400 30px 'Instrument Serif',Georgia,serif", margin: '0 0 18px' }}>{progress && progress.total ? `Importing ${progress.total} photographs…` : 'Importing…'}</h2>
                <div style={{ height: 2, background: 'var(--hair)' }}><i style={{ display: 'block', height: '100%', width: progress && progress.total ? `${Math.round((progress.done / progress.total) * 100)}%` : '8%', background: 'var(--text2)' }} /></div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Reading camera data and building previews. Originals are not touched.</div>
              </>
            )}
            {box === 'done' && (
              <>
                <div style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--faint)', marginBottom: 8 }}>{result && result.imported > 0 ? `Imported ${result.imported} ${result.imported === 1 ? 'photograph' : 'photographs'}` : 'Nothing new to import'}</div>
                <div style={{ font: "400 36px/1.1 'Instrument Serif',Georgia,serif", marginBottom: 4 }}>{result?.shootName ?? 'Your library is up to date'}</div>
                {result?.errors && result.errors.length > 0 && <div className="reason" style={{ fontSize: 12.5, marginBottom: 8 }}>{result.errors.length} could not be read: {result.errors.slice(0, 3).map((e) => e.file).join(', ')}.</div>}
                <div style={{ display: 'flex', gap: 4, height: 70, margin: '14px 0 22px', overflow: 'hidden' }}>
                  {(made.data?.photos ?? []).slice(0, 8).map((x) => <Img key={x.id} p={x} style={{ height: '100%', width: 'auto', borderRadius: 2 }} />)}
                </div>
                {result?.shootId ? (
                  <>
                    <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12 }}>What next?</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <button onClick={() => { setBox(null); openNew({ name: result.shootName ?? '', photoIds: (made.data?.photos ?? []).map((x) => x.id) }); }} style={{ textAlign: 'left', background: 'var(--btn-bg)', color: 'var(--btn-fg)', borderRadius: 10, padding: '14px 16px' }}><b style={{ fontWeight: 500 }}>Start a composition from this shoot</b><div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>Choose how many prints and what size</div></button>
                      <button onClick={() => nav(`/shoots/${result.shootId}?share=1`)} style={{ textAlign: 'left', borderRadius: 10, padding: '14px 16px', boxShadow: 'inset 0 0 0 1px var(--outline)' }}><b style={{ fontWeight: 500 }}>Send it for review</b><div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>A link where friends rate the photos</div></button>
                      <button onClick={() => nav('/review')} style={{ textAlign: 'left', borderRadius: 10, padding: '14px 16px', boxShadow: 'inset 0 0 0 1px var(--outline)' }}><b style={{ fontWeight: 500 }}>Review it now</b><div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>Your first session, a week apart from the next</div></button>
                    </div>
                  </>
                ) : <button onClick={() => setBox(null)} style={{ background: 'var(--btn-bg)', color: 'var(--btn-fg)', fontWeight: 500, borderRadius: 999, padding: '11px 20px', fontSize: 14 }}>Close</button>}
              </>
            )}
          </div>
        </div>
      )}
      {error && <div className="banner" role="alert"><span className="reason">{error}</span></div>}
      {p && p.count > 0 && !busy && (
        <div className="banner" role="status">
          <span><b>{p.count} new {p.count === 1 ? 'photo' : 'photos'} in your library</b> <span className="muted">· {p.folders.slice(0, 3).map((f) => f.folder).join(', ')} · will be filed as</span> <b>{today}</b> <span className="muted">(rename anytime)</span></span>
          <button className="pill primary" onClick={sync}>Import</button>
        </div>
      )}
      {uploaded && !box && (
        <div className="banner" role="status">
          <span>Uploaded <b>{uploaded.saved.length}</b> {uploaded.saved.length === 1 ? 'file' : 'files'}.{uploaded.rejected.length > 0 && <span className="reason"> Not added: {uploaded.rejected.map((r) => `${r.file} (${r.reason})`).join(', ')}.</span>}</span>
          <button className="pill" onClick={() => setUploaded(null)}>Dismiss</button>
        </div>
      )}
      {result && !box && (
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
