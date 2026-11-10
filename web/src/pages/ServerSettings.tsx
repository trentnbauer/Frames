import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { Bar, Eyebrow, gb, PSelect, PSeg, PStepper, PSwitch, SCard, SRow } from '../components/srow';
import { CloudServices } from './CloudSettings';
import { EnvExport } from './EnvExport';

type RestoreInfo = { dir: string; archives: { name: string; bytes: number; at: string }[]; pending: { at: string; parts: string[] } | null; canRestart: boolean };

/** Restoring the people and libraries from a server backup. It is checked and put aside, and applied when Frames next starts. */
function Restore() {
  const r = useApi<RestoreInfo>('/admin/restore');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const s3list = useApi<{ name: string; bytes: number }[]>('/admin/backup/remote?from=s3');
  const cloudlist = useApi<{ name: string; bytes: number }[]>('/admin/backup/remote?from=cloud');
  const done = (x: { parts: string[]; people: number }) => { setMsg({ ok: true, text: `Checked: ${x.people} ${x.people === 1 ? 'person' : 'people'} and ${x.parts.length - 1} ${x.parts.length === 2 ? 'library' : 'libraries'}. It is applied the next time Frames starts.` }); r.reload(); };
  const run = async (fn: () => Promise<{ parts: string[]; people: number }>) => { setMsg(null); setBusy(true); try { done(await fn()); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); };
  const upload = async (f: File) => {
    const body = new FormData(); body.append('file', f);
    const res = await fetch('/api/admin/restore/upload', { method: 'POST', body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? 'That did not work.');
    return j;
  };
  const restart = async () => { setMsg(null); try { await api('/admin/restart', { method: 'POST' }); setMsg({ ok: true, text: 'Restarting. Reload this page in a few seconds and sign in again.' }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } };
  return (
    <div className="field">
      <h3>Restore</h3>
      <p>Put the people and libraries from a server backup back: reviews, tags, compositions and each person’s own settings. The server’s own settings (sign-in providers, the tunnel, shared AIs and keys) are <b>not</b> in a backup and <b>not</b> changed: they come from your env file (Settings, Updates & system) or what is set here now. Photographs are not touched. Everyone is signed out and signs in again, and the databases being replaced are kept in <span className="mono">backups/before-restore-…</span> in the data folder.</p>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      {r.data?.pending && (
        <div className="banner" role="status" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>A restore is ready ({r.data.pending.parts.length - 1} {r.data.pending.parts.length === 2 ? 'library' : 'libraries'}). Frames applies it when it next starts.</span>
          {r.data.canRestart && <button className="pill primary" onClick={() => { if (window.confirm('Restart Frames now and apply the restore? Everyone is signed out.')) void restart(); }}>Restart Frames now</button>}
          <button className="pill" onClick={async () => { await api('/admin/restore', { method: 'DELETE' }); setMsg(null); r.reload(); }}>Cancel the restore</button>
        </div>
      )}
      <div className="form">
        <input ref={file} type="file" accept=".tar,application/x-tar" aria-label="Choose a server backup file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void run(() => upload(f)); }} />
        <button className="pill" disabled={busy} onClick={() => file.current?.click()}>Restore from a file…</button>
      </div>
      <p className="muted" style={{ fontSize: 12.5 }}>A file you downloaded above. Or put it in <span className="mono">{r.data?.dir ?? 'the backups folder'}</span> and pick it here:</p>
      {r.data?.archives.length === 0 && <p className="muted">No server backups in that folder yet. One is made a day (the last seven kept).</p>}
      {([['s3', 'In your S3 bucket', s3list], ['cloud', 'In your cloud account', cloudlist]] as const).map(([from, label, l]) => (
        <div key={from}>
          {l.data && l.data.length > 0 && <p className="muted" style={{ fontSize: 12.5 }}>{label}:</p>}
          {l.data?.map((a) => (
            <div className="row" key={`${from}-${a.name}`}>
              <span><span className="mono">{a.name}</span> <span className="faint">{(a.bytes / 1e6).toFixed(1)} MB</span></span>
              <button className="pill" disabled={busy} onClick={() => { if (window.confirm(`Restore from ${a.name} (${label.toLowerCase()})? It is downloaded and checked first, and applied the next time Frames starts.`)) void run(async () => { const x = await api<{ parts: string[]; people: number }>('/admin/backup/remote/restore', { body: { from, name: a.name } }); r.reload(); return x; }); }}>Restore</button>
            </div>
          ))}
        </div>
      ))}
      {r.data?.archives.map((a) => (
        <div className="row" key={a.name}>
          <span><span className="mono">{a.name}</span> <span className="faint">{(a.bytes / 1e6).toFixed(1)} MB</span></span>
          <button className="pill" disabled={busy} onClick={() => { if (window.confirm(`Restore from ${a.name}? It is checked first and applied the next time Frames starts.`)) void run(() => api('/admin/restore', { body: { name: a.name } })); }}>Restore this</button>
        </div>
      ))}
    </div>
  );
}

type S3State = { configured: boolean; endpoint: string; region: string; bucket: string; prefix: string; accessKeyId: string; hasSecret: boolean; status: { at: string; ok: boolean; message: string } | null };

/** Copy the daily whole-server archive to S3 or an S3-compatible service. The secret key is write-only: it is never shown again. */
function S3Backup() {
  const st = useApi<S3State>('/admin/backup/s3');
  const [f, setF] = useState({ endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretAccessKey: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (st.data) setF((x) => ({ ...x, endpoint: st.data!.endpoint, region: st.data!.region, bucket: st.data!.bucket, prefix: st.data!.prefix, accessKeyId: st.data!.accessKeyId })); }, [st.data?.endpoint, st.data?.bucket]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<string>) => { setMsg(null); setBusy(true); try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); st.reload(); };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <SCard>
        <SRow title="Back up to S3" hint="Copy the daily whole-server archive to Amazon S3, or a service that speaks the same language (MinIO, Backblaze B2, Wasabi). Use a key that may only write to this bucket. The secret key is stored on this server, never shown again, and left out of backups."><span className="ghost" role="status">{st.data?.configured ? '✓ Set up' : 'Not set up'}</span></SRow>
        <SRow title="Endpoint" sub><input className="pin" value={f.endpoint} onChange={set('endpoint')} placeholder="https://s3.us-east-1.amazonaws.com" aria-label="S3 endpoint" /></SRow>
        <SRow title="Region" sub><input className="pin" value={f.region} onChange={set('region')} placeholder="us-east-1" aria-label="S3 region" /></SRow>
        <SRow title="Bucket" sub><input className="pin" value={f.bucket} onChange={set('bucket')} aria-label="S3 bucket" /></SRow>
        <SRow title="Folder in the bucket" hint="Optional." sub><input className="pin" value={f.prefix} onChange={set('prefix')} placeholder="frames" aria-label="S3 folder" /></SRow>
        <SRow title="Access key" sub><input className="pin" value={f.accessKeyId} onChange={set('accessKeyId')} autoComplete="off" aria-label="S3 access key" /></SRow>
        <SRow title="Secret key" sub><input className="pin" type="password" value={f.secretAccessKey} onChange={set('secretAccessKey')} autoComplete="off" placeholder={st.data?.hasSecret ? 'Saved. Type to replace' : ''} aria-label="S3 secret key" /></SRow>
        <SRow title="" sub>
        <button className="pill primary" disabled={busy} onClick={() => void act(async () => { await api('/admin/backup/s3', { method: 'PUT', body: f }); setF((x) => ({ ...x, secretAccessKey: '' })); return 'Saved.'; })}>Save</button>
        {st.data?.configured && <button className="ghost" disabled={busy} onClick={() => void act(async () => { const r = await api<{ uploaded: string[] }>('/admin/backup/sync', { body: {} }); return r.uploaded.length ? `Uploaded ${r.uploaded.join(', ')}.` : 'Already up to date.'; })}>Back up now</button>}
        {st.data?.configured && <button className="ghost" disabled={busy} onClick={() => { if (window.confirm('Stop backing up to S3? Copies already in the bucket stay there.')) void act(async () => { await api('/admin/backup/s3', { method: 'DELETE' }); setF({ endpoint: '', region: '', bucket: '', prefix: '', accessKeyId: '', secretAccessKey: '' }); return 'S3 backups are off.'; }); }}>Turn off</button>}
        </SRow>
      </SCard>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      {st.data?.status && <p className="muted" style={{ fontSize: 12.5 }}>Last attempt {fmtDate(st.data.status.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: {st.data.status.ok ? st.data.status.message : <span className="reason">{st.data.status.message}</span>}</p>}
      <p className="muted" style={{ fontSize: 12.5 }}>Backups in the bucket are listed under Restore below. Not tested against the real services.</p>
    </>
  );
}

type CloudBackupState = { connected: boolean; provider: string; account: string; status: { at: string; ok: boolean; message: string } | null };
const PROVIDER_NAMES: Record<string, string> = { dropbox: 'Dropbox', google: 'Google Drive', onedrive: 'OneDrive' };

/** Copy the daily archive to the administrator's own Dropbox, Google Drive or OneDrive, in a folder called Frames backups. */
function CloudBackup() {
  const st = useApi<CloudBackupState>('/admin/backup/cloud');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(() => { const b = new URLSearchParams(window.location.search).get('backup'); return b ? { ok: b === 'connected', text: b === 'connected' ? 'Connected.' : b } : null; });
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<string>) => { setMsg(null); setBusy(true); try { setMsg({ ok: true, text: await fn() }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); st.reload(); };
  const connect = (p: string) => act(async () => { const r = await api<{ url: string }>(`/admin/backup/cloud/connect/${p}`, { body: {} }); window.location.href = r.url; return 'Opening the sign-in…'; });
  return (
    <div className="field">
      <h3>Back up to Dropbox, Google Drive or OneDrive</h3>
      <p>Copy the daily whole-server archive to your own cloud account, into a folder called <span className="mono">Frames backups</span> that Frames makes. The last seven are kept. This is a separate sign-in for backups, with permission to write to that folder only where the service allows it (the connections used to read photographs never get write access). The service must first be set up under Settings, Photos & storage, and its app registration must allow writing files.</p>
      {st.data?.connected ? (
        <div className="form">
          <span>Connected to {PROVIDER_NAMES[st.data.provider] ?? st.data.provider}{st.data.account ? `, ${st.data.account}` : ''}.</span>
          <button className="pill" disabled={busy} onClick={() => void act(async () => { const r = await api<{ uploaded: string[] }>('/admin/backup/sync', { body: {} }); return r.uploaded.length ? `Uploaded ${r.uploaded.join(', ')}.` : 'Already up to date.'; })}>Back up now</button>
          <button className="pill" disabled={busy} onClick={() => { if (window.confirm('Stop backing up to this account? Copies already there stay there.')) void act(async () => { await api('/admin/backup/cloud', { method: 'DELETE' }); return 'Disconnected.'; }); }}>Disconnect</button>
        </div>
      ) : (
        <div className="form">{Object.entries(PROVIDER_NAMES).map(([id, label]) => <button key={id} className="pill" disabled={busy} onClick={() => void connect(id)}>Connect {label}</button>)}</div>
      )}
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      {st.data?.status && <p className="muted" style={{ fontSize: 12.5 }}>Last attempt {fmtDate(st.data.status.at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}: {st.data.status.ok ? st.data.status.message : <span className="reason">{st.data.status.message}</span>}</p>}
      <p className="muted" style={{ fontSize: 12.5 }}>Not tested against the real services. A backup over 140 MB is refused for Dropbox: use S3 for archives that big.</p>
    </div>
  );
}


type Inst = { allowOriginals: boolean; cloudOnly: boolean; shrinkCopies: 'choice' | 'always'; backupAuto: boolean; backupEveryDays: 1 | 7; backupKeep: number; cacheLimitGb: number; previewPx: number; workers: number; logLevel: 'errors' | 'warnings' | 'info'; updateChannel: 'stable' | 'beta'; cloudWho: 'admins' | 'members'; cloudMinSyncMin: number; cloudQuotaGb: number; membersSeeShoots: boolean; aiMonthlyLimit: number; aiMembersOwn: boolean; aiSharedFirst: boolean; heavyJobs: 'always' | 'idle'; crashReports: boolean; crashHost: string };
type SysInfo = { version: string; image: string; libraryDisk: { path: string; total: number; free: number }; dataDisk: { path: string; total: number; free: number }; cache: { path: string; bytes: number }; checks: { name: string; ok: boolean }[]; libraries: number };

/** Settings, Server, Photos & storage: where originals live, the XMP sidecar choice, the originals rules and the cloud services members can use. */
export function PhotosStorage() {
  const info = useApi<{ internalDir: string; libraries: { path: string; exists: boolean; lastScan: string | null }[] }>('/settings');
  const inst = useApi<Inst>('/admin/instance');
  const sys = useApi<SysInfo>('/admin/system');
  const xmp = useApi<{ location: 'next' | 'folder' }>('/admin/xmp-location');
  const orig = useApi<{ allow: boolean }>('/admin/cloud-originals');
  const put = (body: Record<string, unknown>) => api('/admin/instance', { method: 'PUT', body }).then(inst.reload).catch(() => undefined);
  const libs = info.data?.libraries.filter((l) => l.path !== info.data?.internalDir) ?? [];
  const d = sys.data?.libraryDisk;
  return (
    <>
      <SCard>
        <SRow title="Library folders" hint="Set with LIBRARY_DIRS (see the README). Read-only: originals are never changed.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>{libs.length === 0 ? <span className="muted" style={{ fontSize: 13 }}>None set</span> : libs.map((l) => <span key={l.path} className="mono" style={{ fontSize: 12.5, overflowWrap: 'anywhere', textAlign: 'right' }} title={l.exists ? undefined : 'folder not found'}>{l.path}{!l.exists && ' · not found'}</span>)}</div>
        </SRow>
        {d && d.total > 0 && <SRow title="Disk" hint={d.path}><Bar used={d.total - d.free} total={d.total} text={`${gb(d.total - d.free)} of ${gb(d.total)}`} /></SRow>}
        <SRow title="Uploads and cloud copies" hint="Photos uploaded from Photoshoots and copied from the cloud are kept in Frames’ own data folder.">
          <Link to="/shoots" className="ghost plain">Photoshoots →</Link>
        </SRow>
      </SCard>

      <Eyebrow>XMP sidecars</Eyebrow>
      <SCard>
        <SRow title="Where sidecar files go" hint="For everyone on this server. Next to photo is what Lightroom and Capture One expect.">
          {xmp.data && <PSeg label="Where sidecar files go" value={xmp.data.location} options={[['next', 'Next to photo'], ['folder', 'Frames folder']]} set={(v) => api('/admin/xmp-location', { method: 'PUT', body: { location: v } }).then(xmp.reload).catch(() => undefined)} />}
        </SRow>
      </SCard>

      <Eyebrow>Originals</Eyebrow>
      <SCard>
        <SRow title="Allow original downloads on portfolios" hint="When on, a person can let portfolio visitors download the original file, which can hold camera data and the place a photo was taken."><PSwitch label="Let portfolios offer original files" on={!!inst.data?.allowOriginals} set={(v) => put({ allowOriginals: v })} /></SRow>
        <SRow title="Allow original resolution from the cloud" hint="Off: everyone’s cloud imports are saved as 4096 px copies to save disk space."><PSwitch label="Allow original resolution from the cloud" on={!!orig.data?.allow} set={(v) => api('/admin/cloud-originals', { method: 'PUT', body: { allow: v } }).then(orig.reload)} /></SRow>
        <SRow title="Keep originals in cloud storage only" hint="Nobody can upload to Frames; every cloud photo is kept as a smaller copy and the original stays in the cloud. Deleting a photo from the cloud deletes its only full-size original."><PSwitch label="Keep originals in cloud storage only" on={!!inst.data?.cloudOnly} set={(v) => {
          if (v && !window.confirm('Require originals to be kept in cloud storage?\n\nNobody will be able to upload photographs to Frames, and every cloud photograph will be kept only as a smaller copy here, with the full-size original left in the cloud.\n\nPhotographs already in Frames are not touched. IMPORTANT: anyone who deletes a photo from their cloud storage deletes its only full-size original.')) return;
          void put({ cloudOnly: v });
        }} /></SRow>
        <SRow title="Always keep only a smaller copy of cloud photos" hint={inst.data?.cloudOnly ? 'Required while originals are kept in cloud storage only.' : 'Off: each person chooses, per connected folder. On: required for everyone (JPEG, quality 80).'}>
          <PSwitch label="Always keep only a smaller copy of cloud photos" on={inst.data?.shrinkCopies === 'always' || !!inst.data?.cloudOnly} disabled={!!inst.data?.cloudOnly} set={(v) => {
            if (v && !window.confirm('Require a smaller copy of every cloud photo, for everyone?\n\nFrames will keep only a JPEG at quality 80 of each photograph from every connected cloud folder, and leave the full-size originals in the cloud. Copies already held are made smaller on the next sync.\n\nIMPORTANT: anyone who deletes a photo from their cloud storage deletes its only full-size original.')) return;
            void put({ shrinkCopies: v ? 'always' : 'choice' });
          }} />
        </SRow>
      </SCard>

      <CloudServices />

      <Eyebrow>Cloud rules</Eyebrow>
      <SCard>
        <SRow title="Who can connect cloud storage" hint="Guests never can."><PSelect label="Who can connect cloud storage" value={inst.data?.cloudWho ?? 'members'} options={[['admins', 'Admins only'], ['members', 'Admins and members']]} set={(v) => put({ cloudWho: v })} /></SRow>
        <SRow title="Fastest sync allowed" hint="Members can’t set a connection to check more often than this."><PSelect label="Fastest sync allowed" value={inst.data?.cloudMinSyncMin ?? 15} options={[[15, 'Every 15 min'], [30, 'Every 30 min'], [60, 'Every hour'], [360, 'Every 6 hours'], [1440, 'Every day']]} set={(v) => put({ cloudMinSyncMin: v })} /></SRow>
        <SRow title="Storage per person from the cloud" hint="A sync stops when someone’s cloud copies reach this. Nothing already copied is removed."><PSelect label="Storage per person from the cloud" value={inst.data?.cloudQuotaGb ?? 0} options={[[0, 'No limit'], [50, '50 GB'], [100, '100 GB'], [200, '200 GB'], [500, '500 GB']]} set={(v) => put({ cloudQuotaGb: v })} /></SRow>
        <SRow title="Read-only" hint="Frames only copies from cloud storage. It never deletes, moves or changes files there." />
      </SCard>
    </>
  );
}

/** Settings, Server, Backup: the schedule, what has been made so far, and the ways to copy it off the server or restore it. */
export function BackupSection({ registerAction }: { registerAction?: (a: React.ReactNode) => void }) {
  const inst = useApi<Inst>('/admin/instance');
  const list = useApi<RestoreInfo>('/admin/restore');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const put = (body: Record<string, unknown>) => api('/admin/instance', { method: 'PUT', body }).then(inst.reload).catch(() => undefined);
  const now = async () => { setBusy(true); setMsg(null); try { const r = await api<{ already: boolean }>('/admin/backup/now', { body: {} }); setMsg({ ok: true, text: r.already ? 'A backup was already made today.' : 'Backed up.' }); list.reload(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } setBusy(false); };
  const restore = async (name: string) => {
    if (!window.confirm(`Restore from ${name}? It is checked first and applied the next time Frames starts. Everyone is signed out.`)) return;
    try { const r = await api<{ parts: string[]; people: number }>('/admin/restore', { body: { name } }); setMsg({ ok: true, text: `Checked: ${r.people} ${r.people === 1 ? 'person' : 'people'} and ${r.parts.length - 1} ${r.parts.length === 2 ? 'library' : 'libraries'}. It is applied the next time Frames starts.` }); list.reload(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  useEffect(() => { registerAction?.(<button className="pill primary" disabled={busy} onClick={now}>Back up now</button>); }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      <SCard>
        <SRow title="Back up automatically" hint="Each person’s library and the people list, in the backups folder. Photographs are not in it."><PSwitch label="Back up automatically" on={inst.data?.backupAuto !== false} set={(v) => put({ backupAuto: v })} /></SRow>
        <SRow title="Every" sub><PSelect label="Back up every" value={inst.data?.backupEveryDays ?? 1} options={[[1, 'Day'], [7, 'Week']]} set={(v) => put({ backupEveryDays: v })} /></SRow>
        <SRow title="Keep the last" sub><PStepper label="backups kept" value={inst.data?.backupKeep ?? 7} min={1} max={60} set={(n) => put({ backupKeep: n })} /></SRow>
        <SRow title="Save to" hint="The backups folder on this server. Copy it off the server below." sub><span className="ghost" aria-label="Saved to the backups folder">This server</span></SRow>
      </SCard>

      <Eyebrow>History</Eyebrow>
      <SCard>
        {list.data?.archives.length === 0 && <SRow title="Nothing yet" hint="The first is made shortly after start-up, or press Back up now." />}
        {list.data?.archives.slice(0, 14).map((a) => (
          <SRow key={a.name} title={fmtDate(a.at, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} hint={`${(a.bytes / 1e6).toFixed(1)} MB · ${a.name}`}>
            <button className="ghost" onClick={() => void restore(a.name)}>Restore…</button>
          </SRow>
        ))}
        <SRow title="Download a backup" hint="One archive with everyone’s libraries, made now. Each person can also download their own under Settings, Your data."><a className="ghost" href="/api/admin/backup" download>Download</a></SRow>
      </SCard>

      <Eyebrow>Copy off this server</Eyebrow>
      <S3Backup />
      <CloudBackup />
      <Restore />
    </>
  );
}

/** Settings, Server, Storage & processing: the thumbnail cache and the maintenance jobs. */
export function StorageProcessing() {
  const sys = useApi<SysInfo>('/admin/system');
  const scan = useApi<{ running: boolean; done?: number; total?: number }>('/library/scan/status');
  const rb = useApi<{ running: boolean; done: number; total: number; result: null | { checked: number; rebuilt: number } }>('/library/rebuild/status');
  const [msg, setMsg] = useState('');
  const run = async (path: string, ok: string) => { setMsg(''); try { await api(path, { body: {} }); setMsg(ok); scan.reload(); rb.reload(); } catch (e) { setMsg((e as Error).message); } };
  const inst = useApi<Inst>('/admin/instance');
  const put = (body: Record<string, unknown>) => api('/admin/instance', { method: 'PUT', body }).then(() => { inst.reload(); sys.reload(); }).catch(() => undefined);
  const c = sys.data?.cache;
  const limit = (inst.data?.cacheLimitGb ?? 0) * 1073741824;
  return (
    <>
      <Eyebrow>Cache</Eyebrow>
      <SCard>
        <SRow title="Cache folder" hint="Thumbnails and previews. Safe to delete; they rebuild."><span className="mono" style={{ fontSize: 12.5, overflowWrap: 'anywhere', textAlign: 'right' }}>{c?.path ?? '…'}</span></SRow>
        <SRow title="Cache size" hint={`${sys.data?.libraries ?? 0} ${sys.data?.libraries === 1 ? 'library' : 'libraries'}`}>{c && limit > 0 ? <Bar used={c.bytes} total={limit} text={`${gb(c.bytes)} of ${gb(limit)} limit`} /> : <span style={{ fontSize: 13.5 }}>{c ? gb(c.bytes) : '…'}</span>}</SRow>
        <SRow title="Cache limit" hint="When the cache is over this, the previews opened longest ago are deleted. They are made again when opened."><PSelect label="Cache limit" value={inst.data?.cacheLimitGb ?? 0} options={[[0, 'No limit'], [10, '10 GB'], [25, '25 GB'], [50, '50 GB'], [100, '100 GB'], [250, '250 GB']]} set={(v) => put({ cacheLimitGb: v })} /></SRow>
        <SRow title="Preview size" hint="What you see on the Photo page and in Review. Applies to previews made from now on; Rebuild thumbnails remakes the rest."><PSelect label="Preview size" value={inst.data?.previewPx ?? 2400} options={[[1600, '1600 px'], [2400, '2400 px'], [3072, '3072 px'], [4096, '4096 px']]} set={(v) => put({ previewPx: v })} /></SRow>
        {sys.data && sys.data.dataDisk.total > 0 && <SRow title="Disk" hint={sys.data.dataDisk.path}><Bar used={sys.data.dataDisk.total - sys.data.dataDisk.free} total={sys.data.dataDisk.total} text={`${gb(sys.data.dataDisk.total - sys.data.dataDisk.free)} of ${gb(sys.data.dataDisk.total)}`} /></SRow>}
      </SCard>

      <Eyebrow>Processing</Eyebrow>
      <SCard>
        <SRow title="Background workers" hint="How many photographs are processed at once. More is faster, but uses more CPU while you work."><PSelect label="Background workers" value={inst.data?.workers ?? 0} options={[[0, 'Automatic'], ...[1, 2, 3, 4, 6, 8].map((n) => [n, String(n)] as [number, string])]} set={(v) => put({ workers: v })} /></SRow>
        <SRow title="Heavy jobs run" hint="AI tagging and remaking previews after a check. When idle, they wait until nobody has used Frames for five minutes. Rescan and Rebuild always run when you press them."><PSelect label="Heavy jobs run" value={inst.data?.heavyJobs ?? 'always'} options={[['always', 'Always'], ['idle', 'When idle']]} set={(v) => put({ heavyJobs: v })} /></SRow>
      </SCard>

      <Eyebrow>Jobs</Eyebrow>
      <SCard>
        <SRow title="Rescan library folder" hint={scan.data?.running ? 'Scanning…' : 'Finds new, moved and deleted files in your own library.'}><button className="ghost" disabled={!!scan.data?.running} onClick={() => void run('/library/scan', 'Scan started.')}>Rescan</button></SRow>
        <SRow title="Rebuild thumbnails" hint={rb.data?.running ? `Rebuilding… ${rb.data.done} of ${rb.data.total}` : rb.data?.result ? `Last time: checked ${rb.data.result.checked}, rebuilt ${rb.data.result.rebuilt}.` : 'Rebuilds every thumbnail and preview in your own library.'}><button className="ghost" disabled={!!rb.data?.running} onClick={() => void run('/library/rebuild?all=1', 'Rebuilding.')}>Rebuild</button></SRow>
      </SCard>
      {msg && <p role="status" className="muted" style={{ fontSize: 12.5 }}>{msg}</p>}
    </>
  );
}

/** Settings, Server, Updates & system: the version, health checks, the env file and restart. */
export function UpdatesSystem() {
  const sys = useApi<SysInfo>('/admin/system');
  const inst = useApi<Inst>('/admin/instance');
  const logs = useApi<{ bytes: number }>('/admin/logs/info');
  const put = (body: Record<string, unknown>) => api('/admin/instance', { method: 'PUT', body }).then(() => { inst.reload(); rel.reload(); }).catch(() => undefined);
  const rel = useApi<{ current: string; releases: { name: string }[]; source: string }>('/releases');
  const [checked, setChecked] = useState(false);
  const [msg, setMsg] = useState('');
  const bad = sys.data?.checks.filter((c) => !c.ok) ?? [];
  const newer = rel.data?.releases[0];
  const restart = async () => {
    if (!window.confirm('Restart Frames now? Signed-in people stay signed in; the page is unavailable for about 20 seconds.')) return;
    try { await api('/admin/restart', { method: 'POST' }); setMsg('Restarting. Reload this page in a few seconds.'); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <>
      <Eyebrow>Updates</Eyebrow>
      <SCard>
        <SRow title="Version" hint={`${sys.data ? (sys.data.version === 'dev' ? 'development build' : `v${sys.data.version.replace(/^v/, '')}`) : '…'} · ${sys.data?.image ?? ''}${checked ? (newer ? ` · latest release: ${newer.name}` : rel.data?.source === 'none' ? ' · could not reach GitHub' : ' · up to date') : ''}`}>
          <button className="ghost" onClick={() => { rel.reload(); setChecked(true); }}>Check now</button>
        </SRow>
        <SRow title="Update channel" hint="Beta also offers pre-releases."><PSeg label="Update channel" value={inst.data?.updateChannel ?? 'stable'} options={[['stable', 'Stable'], ['beta', 'Beta']]} set={(v) => put({ updateChannel: v })} /></SRow>
        <SRow title="What’s new" hint="Release notes from GitHub, shown to admins after an update."><Link to="/settings?section=about" className="ghost plain">About Frames →</Link></SRow>
      </SCard>

      <Eyebrow>Logs & health</Eyebrow>
      <SCard>
        <SRow title="Health" hint={sys.data ? (bad.length ? `Needs attention: ${bad.map((c) => c.name).join(', ')}` : `All good · ${sys.data.checks.map((c) => c.name).join(', ')}`) : 'Checking…'}><button className="ghost" onClick={() => sys.reload()}>Run checks</button></SRow>
        <SRow title="Log level" hint="What the server keeps in its log. Errors only is the quietest."><PSelect label="Log level" value={inst.data?.logLevel ?? 'info'} options={[['errors', 'Errors'], ['warnings', 'Warnings'], ['info', 'Everything']]} set={(v) => put({ logLevel: v })} /></SRow>
        <SRow title="Send anonymous crash reports" hint={inst.data?.crashHost ? `When Frames stops on an error, it sends the version, the error and where it happened (no photos, names, emails or folder paths) to ${inst.data.crashHost}. Off unless you turn it on.` : 'Off. Nothing can be sent until the person running the server sets CRASH_REPORT_URL to a place that takes reports.'}><PSwitch label="Send anonymous crash reports" on={!!inst.data?.crashReports} disabled={!inst.data?.crashHost} set={(v) => put({ crashReports: v })} /></SRow>
        <SRow title="Logs" hint={`Last 7 days · ${logs.data ? (logs.data.bytes > 1048576 ? `${(logs.data.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(logs.data.bytes / 1024))} KB`) : '…'}`}><a className="ghost" href="/api/admin/logs" download="frames.log">Download</a></SRow>
      </SCard>

      <Eyebrow>Advanced</Eyebrow>
      <SCard>
        <SRow title="Restart Frames" hint="Takes about 20 seconds. Signed-in people stay signed in."><button className="ghost" onClick={() => void restart()}>Restart</button></SRow>
      </SCard>
      {msg && <p role="status" className="muted" style={{ fontSize: 12.5 }}>{msg}</p>}

      <Eyebrow>Environment file</Eyebrow>
      <EnvExport />
    </>
  );
}
