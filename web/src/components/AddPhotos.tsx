import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import type { Shoot } from '../data';
import { Img } from './bits';
import { SmallerCopyNote } from './SmallerCopyNote';
import { useStore } from '../store';
import { Modal, Spinner } from './Modal';

export type Status = { smtpHealthy: boolean; storage: { local: boolean; cloud: boolean }; cloudProviders: string[]; admin: boolean };
type Conn = { id: string; provider: string; account: string; folderId: unknown; enabled: boolean; needsReconnect?: boolean };
type ScanResult = { shootId?: number | null; imported: number; duplicates: number; shootName: string | null };

/** "9 Nov 2026": the name a shoot gets when the name is left blank. */
export const todayName = () => new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const dayName = (t: number) => new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export function useStatus() { return useApi<Status>('/config/status'); }

/** The Add photos button: visible always, disabled with a note when no storage is set up. */
export function AddPhotosButton({ onDone, big }: { onDone?: () => void; big?: boolean }) {
  const st = useStatus();
  const [open, setOpen] = useState(false);
  const none = !!st.data && !st.data.storage.local && !st.data.storage.cloud;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
      <button className={'btn primary' + (big ? ' lg' : '')} disabled={none} onClick={() => setOpen(true)}>Add photos</button>
      {none && <span className="faint" style={{ fontSize: 12.5 }}>Ask an admin to enable storage</span>}
      {open && <AddPhotosModal onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone?.(); }} />}
    </span>
  );
}

/**
 * Add photos: a source tab for each source that is set up, then the shoot's name first (new or existing; blank = today's date).
 * A split by day makes one shoot per day ("9 Nov 2026 · Fri"). Cloud: tick services, Sync now, then Add N photos.
 */
export function AddPhotosModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { me } = useStore();
  const st = useStatus();
  const shoots = useApi<Shoot[]>('/shoots');
  const cloud = useApi<{ connections: Conn[] }>('/cloud');
  const conns = (cloud.data?.connections ?? []).filter((c) => c.folderId !== null && c.enabled && !c.needsReconnect);
  const local = !!st.data?.storage.local;
  const hasCloud = conns.length > 0;
  const [tab, setTab] = useState<'upload' | 'cloud'>('upload');
  const source = !st.data ? tab : local && hasCloud ? tab : local ? 'upload' : 'cloud';
  const [target, setTarget] = useState<'new' | number>('new');
  const [name, setName] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [split, setSplit] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<'pick' | 'working' | 'review'>('pick');
  const [res, setRes] = useState<ScanResult | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const days = new Set(files.map((f) => dayName(f.lastModified)));
  const suggested = files.length ? (days.size === 1 ? [...days][0] : `${[...days][0]} – ${[...days].pop()}`) : '';
  const finalName = name.trim() || suggested || todayName();

  const waitScan = async () => {
    await api('/library/scan', { method: 'POST', body: {} });
    for (;;) {
      const s = await api<{ running: boolean; result: ScanResult | null; error: string | null }>('/library/scan/status');
      if (!s.running) { if (s.error) throw new Error(s.error); return s.result; }
      await new Promise((r) => setTimeout(r, 600));
    }
  };

  /** Puts what just came in where the person asked: named, joined to an existing shoot, and split by day. */
  const place = async (r: ScanResult) => {
    if (!r.shootId || r.imported === 0) return;
    if (target !== 'new') {
      const ids = (await api<{ photos: { id: number }[] }>(`/photos?shoot=${r.shootId}`)).photos.map((p) => p.id);
      await api(`/shoots/${target}/move`, { body: { photoIds: ids } });
      return;
    }
    await api(`/shoots/${r.shootId}`, { method: 'PATCH', body: { name: finalName } });
    if (split) await api(`/shoots/${r.shootId}/split-by-day`, { body: { name: finalName } }).catch(() => undefined); // all from one day: nothing to split
  };

  const upload = async () => {
    setErr(''); setPhase('working'); setMsg(`Uploading ${files.length} file${files.length === 1 ? '' : 's'}…`);
    try {
      const fd = new FormData();
      for (const f of files) fd.append('file', f);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Upload failed');
      setMsg('Reading camera data and building previews…');
      const out = await waitScan();
      if (out) await place(out);
      setRes(out);
      setPhase('review');
    } catch (e) { setErr((e as Error).message); setPhase('pick'); }
  };

  const sync = async () => {
    setErr(''); setPhase('working'); setMsg('Syncing from the cloud…');
    try {
      for (const c of conns.filter((c) => ticked[c.id])) await api(`/cloud/${c.id}/sync?wait=1`, { method: 'POST', body: {} });
      setMsg('Reading camera data and building previews…');
      const out = await waitScan();
      setRes(out);
      setPhase('review');
    } catch (e) { setErr((e as Error).message); setPhase('pick'); }
  };

  const finish = async () => {
    try { if (source === 'cloud' && res) await place(res); onDone(); } catch (e) { setErr((e as Error).message); }
  };

  const ready = source === 'upload' ? files.length > 0 : conns.some((c) => ticked[c.id]);
  const shootsList = shoots.data ?? [];

  return (
    <Modal title="Add photos" sub={source === 'upload' && me?.storeOriginalQuality === false ? 'Uploaded photos are kept as smaller copies.' : 'Originals are never changed.'} width={600} onClose={phase === 'working' ? () => undefined : onClose}
      foot={phase === 'pick'
        ? <><span className="grow">{err ? <span className="reason" style={{ margin: 0 }}>{err}</span> : ''}</span><button className="btn" onClick={onClose}>Cancel</button>
            {source === 'upload' ? <button className="btn primary" disabled={!ready} onClick={upload}>{files.length ? `Add ${files.length} photo${files.length === 1 ? '' : 's'}` : 'Add photos'}</button>
              : <button className="btn primary" disabled={!ready} onClick={sync}>Sync now</button>}</>
        : phase === 'review' ? <><span className="grow" /><button className="btn primary" onClick={finish} disabled={source === 'cloud' && !res?.imported ? false : false}>{source === 'cloud' && res?.imported ? `Add ${res.imported} photo${res.imported === 1 ? '' : 's'}` : 'Done'}</button></> : undefined}>
      {phase === 'pick' && (
        <>
          {local && hasCloud && (
            <div className="seg" role="tablist">
              <button role="tab" aria-selected={source === 'upload'} className={source === 'upload' ? 'on' : ''} onClick={() => setTab('upload')}>Upload from this computer</button>
              <button role="tab" aria-selected={source === 'cloud'} className={source === 'cloud' ? 'on' : ''} onClick={() => setTab('cloud')}>Sync from the cloud</button>
            </div>
          )}
          {st.data && !local && !hasCloud && <p className="muted">Nothing to add from yet. {st.data.admin ? <>Turn on storage in <Link to="/settings?section=storage">Settings</Link>.</> : 'Ask an admin to enable storage.'}</p>}
          {source === 'upload' && local && me?.storeOriginalQuality === false && <SmallerCopyNote />}
          {(local || hasCloud) && (
            <>
              <div>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Photoshoot</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={String(target)} onChange={(e) => setTarget(e.target.value === 'new' ? 'new' : Number(e.target.value))} aria-label="New or existing photoshoot" style={{ flex: 'none', maxWidth: 200 }}>
                    <option value="new">New photoshoot</option>
                    {shootsList.length > 0 && <optgroup label="Existing">{shootsList.slice(0, 80).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
                  </select>
                  {target === 'new' && <input className="field-in" style={{ height: 40 }} value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested ? `${suggested}` : `Name (blank = ${todayName()})`} aria-label="Photoshoot name" />}
                </div>
                {target === 'new' && files.length > 0 && !name.trim() && <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>Named from the dates of your files: {suggested}. You can change it.</div>}
              </div>
              {source === 'upload' ? (
                <>
                  <input ref={input} type="file" multiple hidden accept=".jpg,.jpeg,.png,.tif,.tiff,.raf,.cr2,.cr3,.nef,.arw,.dng,.orf,.rw2" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} aria-label="Choose photographs" />
                  <button onClick={() => input.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFiles(Array.from(e.dataTransfer.files)); }}
                    style={{ width: '100%', minHeight: 140, borderRadius: 10, boxShadow: 'inset 0 0 0 1px var(--outline)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 }}>
                    <span className="serif" style={{ fontSize: 24 }}>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} ready` : 'Drop photographs here'}</span>
                    <span className="btn outline">{files.length ? 'Choose different files' : 'Choose files'}</span>
                    <span className="faint" style={{ fontSize: 12 }}>JPEG · TIFF · RAW</span>
                  </button>
                  {files.length > 0 && days.size > 1 && target === 'new' && (
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
                      <span>Split by day <span className="muted">· {days.size} shoots: “{finalName} · {new Date(files[0].lastModified).toLocaleDateString('en-AU', { weekday: 'short' })}”, …</span></span>
                    </label>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div className="eyebrow" style={{ marginBottom: 6 }}>Services</div>
                  {conns.map((c) => (
                    <label key={c.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--hair)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!ticked[c.id]} onChange={(e) => setTicked((t) => ({ ...t, [c.id]: e.target.checked }))} />
                      <span style={{ flex: 1 }}>{({ google: 'Google Drive', dropbox: 'Dropbox', onedrive: 'OneDrive' } as Record<string, string>)[c.provider] ?? c.provider}</span>
                      <span className="faint" style={{ fontSize: 12.5 }}>{c.account}</span>
                    </label>
                  ))}
                  <p className="faint" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Frames only copies photos in. Nothing in your cloud account is ever changed or deleted.</p>
                </div>
              )}
            </>
          )}
        </>
      )}
      {phase === 'working' && <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '28px 0', fontSize: 14 }}><Spinner size={18} />{msg}</div>}
      {phase === 'review' && <Review res={res} cloud={source === 'cloud'} name={finalName} />}
    </Modal>
  );
}

function Review({ res, cloud, name }: { res: ScanResult | null; cloud: boolean; name: string }) {
  const made = useApi<{ photos: { id: number; ar: number }[] }>(res?.shootId && res.imported ? `/photos?shoot=${res.shootId}` : null);
  if (!res || res.imported === 0) return <p style={{ margin: '12px 0' }}>{res && res.duplicates > 0 ? `Nothing new: ${res.duplicates} photo${res.duplicates === 1 ? ' was' : 's were'} already in Frames.` : 'Your library is up to date.'}</p>;
  return (
    <>
      <div className="eyebrow">{cloud ? 'Synced' : 'Added'} {res.imported} new photo{res.imported === 1 ? '' : 's'}{res.duplicates ? ` · ${res.duplicates} duplicate${res.duplicates === 1 ? '' : 's'} skipped` : ''}</div>
      <div className="serif" style={{ fontSize: 34, lineHeight: 1.1 }}>{cloud ? 'New from the cloud' : name}</div>
      <div style={{ display: 'flex', gap: 4, height: 70, overflow: 'hidden' }}>{(made.data?.photos ?? []).slice(0, 8).map((x) => <Img key={x.id} p={x} style={{ height: '100%', width: 'auto', borderRadius: 2 }} />)}</div>
    </>
  );
}
