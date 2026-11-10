import { Badge, Eyebrow, SCard, SRow } from '../components/srow';
import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { CardFooter, Destructive, EditRow, useOne, type One } from '../components/editcard';

type Folder = { id: string; name: string };
type Result = { downloaded: number; skipped: number; changedRemotely: number; errors: string[]; error: string | null; bytes: number; shrunk?: number; freed?: number };
type Conn = { id: string; provider: string; account: string; folderId: string | null; folderName: string; folders?: Folder[]; intervalMin: number; enabled: boolean; lastSync: string | null; lastResult: Result | null; needsReconnect: boolean; shrink?: boolean };
type Prov = { id: string; label: string; console: string; configured: boolean; clientId?: string; hasSecret?: boolean };
type Data = { shrinkEnforced: boolean; redirectUri: string; providers: Prov[]; connections: Conn[]; progress: { running: boolean; connId: string | null; downloaded: number; current: string } };

const ROOT: Record<string, string> = { google: 'root', dropbox: '', onedrive: 'root' };
const EVERY = [[0, 'Only when I press Sync'], [15, 'Every 15 minutes'], [60, 'Every hour'], [360, 'Every 6 hours'], [1440, 'Every day']] as const;
const mb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

/** Copy photographs from Google Drive, Dropbox or OneDrive into Frames. One way, and nothing is ever deleted here. */
export function CloudSettings() {
  const d = useApi<Data>('/cloud');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('cloud');
    if (m) setMsg(m === 'connected' ? { ok: true, text: 'Connected. Choose a folder to sync.' } : { ok: false, text: m });
  }, []);
  const one = useOne();
  // A connection with no folder yet opens its card, so the next step is in front of you.
  const fresh = d.data?.connections.find((c) => (c.folders ?? []).length === 0 && !c.needsReconnect)?.id;
  useEffect(() => { if (fresh) one.set(fresh); }, [fresh]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = d.data?.progress.running;
  useEffect(() => { if (!running) return; const t = setInterval(d.reload, 1500); return () => clearInterval(t); }, [running]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data) return <p className="empty">Loading…</p>;
  const { providers, connections, progress } = d.data;
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } d.reload(); };

  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      <p>Frames copies photographs from a cloud folder into its own storage, then adds them like any other photo. It only ever <b>reads</b> from your cloud account, never deletes anything (here or there) and never overwrites a photo it already has.</p>

      <div className="field">
        <h3>Your connected folders</h3>
        {connections.length === 0 && <p className="muted">Nothing connected yet. Connect an account below.</p>}
        {connections.map((c) => <Connection key={c.id} enforced={d.data!.shrinkEnforced} one={one} c={c} p={providers.find((p) => p.id === c.provider)!} progress={progress} act={act} />)}
      </div>

      <div className="field">
        <h3>Connect an account</h3>
        <p>Sign in to your own cloud accounts, as many as you like, including several of the same service (two Dropbox accounts, say): each has its own folder. You are asked which account every time. The services are set up once for the whole server by an administrator, under Settings, Cloud storage providers.</p>
        {providers.map((p) => (
          <div className="row" key={p.id}>
            <span><b>{p.label}</b> <span className="faint">{p.configured ? (connections.filter((c) => c.provider === p.id).length ? `${connections.filter((c) => c.provider === p.id).length} connected` : '') : 'not set up on this server yet: ask an administrator'}</span></span>
            <button className="pill primary" disabled={!p.configured} onClick={() => act(async () => { const r = await api<{ url: string }>(`/cloud/connect/${p.id}`, { body: {} }); window.location.assign(r.url); })}>{connections.some((c) => c.provider === p.id) ? 'Connect another account' : 'Connect an account'}</button>
          </div>
        ))}
      </div>
    </>
  );
}

const link = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{text}</a>;

/** Exactly what to choose in each service's console. Frames signs you in with OAuth (authorization code with PKCE) and only reads. */
function Steps({ p }: { p: Prov }) {
  return (
    <ol className="muted" style={{ fontSize: 13, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
      {p.id === 'google' && <>
        <li>In {link(p.console, 'Google Cloud console')}, make or pick a project. Under <b>APIs &amp; Services, Library</b>, enable the <b>Google Drive API</b>.</li>
        <li><b>OAuth consent screen</b> (Google Auth platform): user type <b>External</b>, add yourself as a <b>test user</b>. Add the scope <span className="mono">.../auth/drive.readonly</span> (“See and download all your Google Drive files”). While the app is in <i>Testing</i>, Google ends the connection every 7 days; press <b>Publish app</b> to avoid that (you can ignore the unverified-app warning for your own app).</li>
        <li><b>Credentials, Create credentials, OAuth client ID</b>, application type <b>Web application</b> (not a service account, not an API key). Under <b>Authorised redirect URIs</b> add the return address above exactly.</li>
        <li>Copy the <b>client ID</b> and <b>client secret</b> into the boxes above, then press Save.</li>
      </>}
      {p.id === 'dropbox' && <>
        <li>In the {link(p.console, 'Dropbox App Console')} press <b>Create app</b>, choose <b>Scoped access</b> and <b>Full Dropbox</b> (or <i>App folder</i> to limit it to one folder), and name it.</li>
        <li>On the <b>Permissions</b> tab tick <span className="mono">files.metadata.read</span>, <span className="mono">files.content.read</span> and <span className="mono">account_info.read</span>, then press <b>Submit</b>. Nothing that writes is needed.</li>
        <li>On the <b>Settings</b> tab add the return address above under <b>Redirect URIs</b>. Leave <i>Allow public clients (Implicit Grant &amp; PKCE)</i> as it is.</li>
        <li>Copy the <b>App key</b> (the client ID) and <b>App secret</b> into the boxes above, then press Save.</li>
      </>}
      {p.id === 'onedrive' && <>
        <li>In {link(p.console, 'Microsoft Entra, App registrations')} press <b>New registration</b>. Supported account types: <b>Personal Microsoft accounts only</b> for OneDrive, or the option that includes personal accounts if you also use work accounts.</li>
        <li><b>Redirect URI</b>: platform <b>Web</b>, and the return address above.</li>
        <li><b>API permissions, Add a permission, Microsoft Graph, Delegated</b>: <span className="mono">Files.Read</span>, <span className="mono">User.Read</span> and <span className="mono">offline_access</span>. They need no admin consent.</li>
        <li><b>Certificates &amp; secrets, New client secret</b>: copy its <b>Value</b> (shown once). The <b>Application (client) ID</b> on the Overview page is the client ID.</li>
      </>}
    </ol>
  );
}

/** Administrators: the app registration for each service, once for the whole server. People then only connect their own account. */
export function CloudServices() {
  const d = useApi<Data>('/cloud');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  if (!d.data) return <p className="empty">Loading…</p>;
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } d.reload(); };
  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      <Eyebrow>Cloud providers</Eyebrow>
      <SCard>
        {d.data.providers.map((p) => <Service key={p.id} p={p} act={act} />)}
        <SRow title="Redirect URL" hint={<>Paste this into each provider’s app settings: <span className="mono" style={{ userSelect: 'all' }}>{d.data.redirectUri}</span>. Frames has no shared account with these services, so you register a small app of your own with each one (free); every person then signs in to their own account under Settings, Cloud sync.</>}>
          <button className="ghost plain" onClick={() => { void navigator.clipboard?.writeText(d.data!.redirectUri); setCopied(true); }}>{copied ? 'Copied' : 'Copy →'}</button>
        </SRow>
      </SCard>
    </>
  );
}

const ABBR: Record<string, string> = { google: 'GD', dropbox: 'DB', onedrive: 'OD' };

function Service({ p, act }: { p: Prov; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [id, setId] = useState(p.clientId ?? '');
  const [secret, setSecret] = useState('');
  const [open, setOpen] = useState(false);
  return (
    <div>
      <SRow lead={<Badge>{ABBR[p.id] ?? p.label.slice(0, 2).toUpperCase()}</Badge>} title={p.label} hint={p.configured ? 'Your app is set up: people can connect.' : 'Not set up yet.'}>
        <button className="ghost plain" aria-expanded={open} aria-label={`${open ? 'Close' : 'Configure'} ${p.label}`} onClick={() => setOpen(!open)}>{open ? 'Close' : 'Configure'}</button>
        <span className="ghost" style={{ opacity: p.configured ? 1 : .6 }}>{p.configured ? '✓ Ready' : 'Not set up'}</span>
      </SRow>
      {open && (
        <div className="sdetail" role="group" aria-label={`Set up ${p.label}`}>
          <SRow title={`${p.label} client ID`} sub><input className="pin" aria-label={`${p.label} client ID`} value={id} onChange={(e) => setId(e.target.value)} /></SRow>
          <SRow title={`${p.label} client secret`} hint="Kept on this server only, never shown again and left out of backups." sub><input className="pin" type="password" autoComplete="off" aria-label={`${p.label} client secret`} value={secret} placeholder={p.hasSecret ? 'Saved. Type to replace' : 'Paste the secret'} onChange={(e) => setSecret(e.target.value)} /></SRow>
          <Steps p={p} />
          <div className="sfoot"><button className="pill primary" onClick={() => act(async () => { await api(`/cloud/client/${p.id}`, { method: 'PUT', body: { clientId: id, ...(secret ? { clientSecret: secret } : {}) } }); setSecret(''); }, 'Saved.')}>Save changes</button></div>
        </div>
      )}
    </div>
  );
}

function Connection({ enforced, one, c, p, progress, act }: { enforced: boolean; one: One; c: Conn; p: Prov; progress: Data['progress']; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [picking, setPicking] = useState(false);
  const chosen = c.folders ?? [];
  const busy = progress.running && progress.connId === c.id;
  const r = c.lastResult;
  const put = (body: Record<string, unknown>) => act(() => api(`/cloud/${c.id}`, { method: 'PUT', body }));
  return (
    <EditRow id={c.id} one={one} title={`${p.label}${c.account ? ` (${c.account})` : ''}`} note="Frames only ever reads from this account." summary={(
      <>
        <b>{p.label}</b> {c.account && <span className="muted">{c.account}</span>}{' '}
        <span className={c.needsReconnect ? 'reason' : 'faint'}>
          {c.needsReconnect ? 'needs to be reconnected' : busy ? `copying… ${progress.downloaded} so far` : chosen.length === 0 ? 'choose folders' : chosen.length === 1 ? (chosen[0].name || 'whole account') : `${chosen.length} folders`}
        </span>
      </>
    )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <b>Folders to copy</b>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            {chosen.length === 0 && <span className="muted" style={{ fontSize: 13 }}>None yet. Frames won't copy anything until you choose at least one.</span>}
            {chosen.map((f) => (
              <span key={f.id} className="chip" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 10px', borderRadius: 999, background: 'var(--hair)', fontSize: 13 }}>
                {f.name || 'Everything in this account'}
                <button className="t2" aria-label={`Stop copying ${f.name || 'the whole account'}`} onClick={() => put({ folders: chosen.filter((x) => x.id !== f.id) })}>×</button>
              </span>
            ))}
          </div>
          <button className="t2" onClick={() => setPicking(!picking)}>{picking ? 'Close' : chosen.length ? 'Add or change folders' : 'Choose folders'}</button>
          {picking && <FolderBrowser c={c} chosen={chosen} onDone={(list) => { setPicking(false); if (JSON.stringify(list) !== JSON.stringify(chosen)) put({ folders: list }); }} />}
        </div>
        <label>Copy new photos{' '}
          <select aria-label="How often" value={c.intervalMin} onChange={(e) => put({ intervalMin: Number(e.target.value) })}>
            {EVERY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="muted" style={{ fontSize: 13 }}><input type="checkbox" checked={c.enabled} disabled={chosen.length === 0 || c.needsReconnect} onChange={(e) => put({ enabled: e.target.checked })} /> Keep these folders up to date automatically</label>
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--hover)', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" aria-label={`Keep only a smaller copy of each photo from ${p.label}`} checked={!!c.shrink || enforced} disabled={enforced} onChange={(e) => {
              if (e.target.checked && !window.confirm(`Keep only a smaller copy of each photo in Frames?\n\nThe full-size original stays in ${p.label}, and is fetched from there when you export it.\n\nIMPORTANT: if you delete a photo from ${p.label}, its full-size original is gone for good. Frames will only have the smaller copy.\n\nThis also replaces the full-size copies Frames already holds from this account, the next time it syncs.`)) return;
              put({ shrink: e.target.checked });
            }} />
            <span><b>Keep only a smaller copy of each photo here</b>{enforced && <span className="muted"> (required by your administrator for everyone)</span>}, and leave the full-size original in {p.label}. The copy is a JPEG at quality 80 with the same pixels and camera data, which uses about a third to a half of the space. When you export a composition, Frames fetches each original from {p.label}, one photo at a time, so exports are always full size.</span>
          </label>
          <span role="alert" style={{ color: 'var(--warn)' }}><b>Do not delete these photos from {p.label}.</b> Deleting a photo there deletes its only full-size original: Frames would be left with just the smaller copy. Disconnecting this account also stops originals being fetched until you connect it again.</span>
          {(c.shrink || enforced) && r?.shrunk ? <span className="muted">Last sync: {r.shrunk} {r.shrunk === 1 ? 'photo' : 'photos'} made smaller, {mb(r.freed ?? 0)} freed.</span> : null}
        </div>
        {r && (
          <p className="muted" style={{ margin: 0, fontSize: 13 }} role="status">
            {c.lastSync && `Last copied ${fmtDate(c.lastSync, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: `}
            {r.error ? <span className="reason">{r.error}</span> : `${r.downloaded} new (${mb(r.bytes)}), ${r.skipped} already here`}
            {r.changedRemotely > 0 && `, ${r.changedRemotely} edited online (the copy you have is kept)`}
            {r.errors.length > 0 && <span className="reason"> · {r.errors.length} could not be copied: {r.errors[0]}</span>}
          </p>
        )}
      </div>
      <CardFooter>
        {c.needsReconnect
          ? <button className="pill primary" onClick={() => act(async () => { const x = await api<{ url: string }>(`/cloud/connect/${c.provider}`, { body: {} }); window.location.assign(x.url); })}>Reconnect</button>
          : <button className="pill primary" disabled={chosen.length === 0 || progress.running} onClick={() => act(() => api(`/cloud/${c.id}/sync`, { body: {} }))}>{busy ? 'Copying…' : 'Sync now'}</button>}
        <Destructive onClick={() => { if (window.confirm(c.shrink ? `Disconnect this account?\n\nPhotos already copied stay in Frames, but the ones kept as a smaller copy can only be exported at full size again once you connect this account again.` : 'Disconnect this account? Photos already copied stay in Frames.')) act(() => api(`/cloud/${c.id}`, { method: 'DELETE' }), 'Disconnected. The photos already copied stay.'); }}>Disconnect</Destructive>
      </CardFooter>
    </EditRow>
  );
}

function FolderBrowser({ c, chosen, onDone }: { c: Conn; chosen: Folder[]; onDone: (list: Folder[]) => void }) {
  const [sel, setSel] = useState<Folder[]>(chosen);
  const [trail, setTrail] = useState<Folder[]>([]);
  const here = trail[trail.length - 1];
  const root = ROOT[c.provider];
  const list = useApi<Folder[]>(`/cloud/${c.id}/folders${here ? `?parent=${encodeURIComponent(here.id)}` : ''}`);
  const has = (id: string) => sel.some((x) => x.id === id);
  const toggle = (f: Folder) => setSel(has(f.id) ? sel.filter((x) => x.id !== f.id) : [...sel, f]);
  const inherited = has(root) || trail.some((t) => has(t.id)); // a folder above is chosen, so everything in here already is
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px solid var(--hover)' };
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12, marginTop: 8 }}>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
        {trail.length > 0 && <button className="t2" aria-label="Back" onClick={() => setTrail(trail.slice(0, -1))}>‹</button>}{' '}
        {['Your account', ...trail.map((t) => t.name)].join(' / ')}
      </p>
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {trail.length === 0 && (
          <label style={row}><input type="checkbox" checked={has(root)} onChange={() => toggle({ id: root, name: '' })} /> <b>Everything in this account</b></label>
        )}
        {list.error && <p className="reason">{list.error}</p>}
        {!list.data && !list.error && <p className="muted">Loading…</p>}
        {list.data?.length === 0 && <p className="muted">No folders in here.</p>}
        {list.data?.map((f) => {
          const off = inherited && !has(f.id);
          return (
            <div key={f.id} style={{ ...row, opacity: off ? 0.55 : 1 }}>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1 }}>
                <input type="checkbox" checked={has(f.id) || off} disabled={off} onChange={() => toggle(f)} /> {f.name}
                {off && <span className="faint" style={{ fontSize: 12 }}>included by a folder above</span>}
              </label>
              <button className="t2" aria-label={`Open ${f.name}`} onClick={() => setTrail([...trail, f])}>Open ›</button>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: 13, flex: 1 }}>{sel.length} {sel.length === 1 ? 'folder' : 'folders'} chosen · subfolders are included</span>
        <button className="pill primary" onClick={() => onDone(sel)}>Done</button>
      </div>
    </div>
  );
}
