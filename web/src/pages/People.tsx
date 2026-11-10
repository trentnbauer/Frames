import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { useStore } from '../store';
import { Badge, Bar, Eyebrow, gb, initials, PSelect, SCard, SRow } from '../components/srow';

type Person = { id: number; name: string; email: string; provider: string; role: 'admin' | 'member' | 'guest'; folder: string; disabled: boolean; invited: boolean; created: string; photos: number; bytes: number };
type Data = { users: Person[]; signups: boolean; libraryRoots: string[] };
const size = (n: number) => (n > 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n > 1048576 ? `${Math.round(n / 1048576)} MB` : `${Math.ceil(n / 1024)} KB`);

/** Administrators: who is here, what each person uses, and the people-related requests (add, switch off, delete data). */
export function People({ onInvite }: { onInvite?: (open: () => void) => void }) {
  const d = useApi<Data>('/admin/users');
  const sys = useApi<{ dataDisk: { total: number; free: number } }>('/admin/system');
  const { me } = useStore();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin' | 'guest'>('member');
  const [inviting, setInviting] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  useEffect(() => { onInvite?.(() => setInviting((v) => !v)); }, [onInvite]);
  if (!d.data) return <p className="empty">Loading…</p>;
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } d.reload(); };
  const root = d.data.libraryRoots[0] ?? '/library';
  const total = d.data.users.reduce((n, u) => n + u.bytes, 0);
  const patch = (u: Person, body: Record<string, unknown>, ok?: string) => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body }), ok);
  const used = (sys.data?.dataDisk.total ?? 0) - (sys.data?.dataDisk.free ?? 0);

  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      {inviting && (
        <SCard style={{ marginBottom: 12 }}>
          <SRow title="Add someone" hint="They are also put on the allowed list under Sign-in & access, and their first sign-in with this verified email address claims the account.">
            <input aria-label="Email address" type="email" className="pin" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <PSelect label="Role" value={role} set={setRole} options={[['member', 'Member'], ['guest', 'Guest only'], ['admin', 'Admin']]} />
            <button className="pill primary" disabled={!email.includes('@')} onClick={() => act(async () => { const r = await api<{ allowedList: 'added' | 'already' }>('/admin/users', { body: { email, role } }); const mail = email.trim().toLowerCase(); setEmail(''); setInviting(false); setMsg({ ok: true, text: r.allowedList === 'added' ? `Added ${mail}, and put them on the allowed list under Sign-in & access.` : `Added ${mail}. They were already on the allowed list under Sign-in & access.` }); })}>Add</button>
          </SRow>
        </SCard>
      )}
      <Eyebrow>Members</Eyebrow>
      <SCard>
        <SRow title="Storage used" hint={d.data.users.filter((u) => u.bytes > 0).map((u) => `${(u.name || u.email).split(' ')[0]} ${gb(u.bytes)}`).join(' · ') || 'Nothing yet'}>
          <Bar used={sys.data ? used : total} total={sys.data?.dataDisk.total || Math.max(total, 1)} text={sys.data?.dataDisk.total ? `${gb(used)} of ${gb(sys.data.dataDisk.total)}` : gb(total)} />
        </SRow>
        {d.data.users.map((u) => {
          const self = u.id === me?.id;
          const isOpen = openId === u.id;
          return (
            <div key={u.id}>
              <SRow title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}><Badge>{initials(u.name || u.email)}</Badge><span><span style={{ display: 'block' }}>{u.name || u.email}{u.disabled && <span className="faint"> · switched off</span>}</span><span className="muted" style={{ display: 'block', fontSize: 12.5 }}>{u.email}{self ? ' · you' : u.invited ? ' · not signed in yet' : ''}{u.role === 'guest' ? ' · guests store nothing' : ` · ${gb(u.bytes)} · ${u.photos.toLocaleString()} photos`}</span></span></span>}>
                <button className="ghost plain" aria-expanded={isOpen} aria-label={`${isOpen ? 'Close' : 'Manage'} ${u.name || u.email}`} onClick={() => setOpenId(isOpen ? null : u.id)}>{isOpen ? 'Close' : 'Manage'}</button>
                <PSelect label={`${u.email || u.name} role`} value={u.role} disabled={self && u.role === 'admin'} options={[['admin', 'Admin'], ['member', 'Member'], ['guest', 'Guest only']]} set={(v) => patch(u, { role: v }, 'Saved.')} />
              </SRow>
              {isOpen && (
                <div className="sdetail">
                  <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>Added {fmtDate(u.created, { day: 'numeric', month: 'short', year: 'numeric' })}{u.provider ? ` · signs in with ${u.provider}` : ''}. The size counts what Frames holds for them, not the photographs in their read-only folder.</p>
                  {u.id !== 1 && <FolderField u={u} root={root} patch={patch} />}
                  <div className="sfoot">
                    {!self && <button className="ghost" onClick={() => patch(u, { disabled: !u.disabled }, u.disabled ? 'Switched on.' : 'Switched off and signed out.')}>{u.disabled ? 'Switch on' : 'Switch off'}</button>}
                    <span style={{ marginLeft: 'auto' }}><button className="ghost danger" onClick={() => {
                      if (window.prompt(`Delete everything Frames holds for ${u.name || u.email}${u.id === 1 ? ' (the library is emptied, the account stays)' : ' and remove the account'}?\n\nType “delete” to confirm. This cannot be undone.`) === 'delete')
                        act(() => api(`/admin/users/${u.id}/data`, { method: 'DELETE', body: { confirm: 'delete' } }), 'Deleted.');
                    }}>Delete their data</button></span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </SCard>
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>A member’s photographs are read from <span className="mono">{root}/&lt;their folder&gt;</span>; they can also upload and use cloud sync. {d.data.signups ? 'New people on the allow-list get an account the first time they sign in.' : 'New accounts are closed (Sign-in & access): only the people added here, and those who already have one, can sign in.'}</p>

      <PrivacyEditor />
    </>
  );
}

function FolderField({ u, root, patch }: { u: Person; root: string; patch: (u: Person, body: Record<string, unknown>, ok?: string) => Promise<void> }) {
  const [folder, setFolder] = useState(u.folder);
  useEffect(() => setFolder(u.folder), [u.folder]);
  return (
    <label style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>Folder <span className="mono">{root}/</span>
      <input aria-label={`${u.email || u.name} folder`} value={folder} onChange={(e) => setFolder(e.target.value)} onBlur={() => folder !== u.folder && patch(u, { folder }, 'Saved. Press Sync in their library to read from the new folder.')} />
    </label>
  );
}

function PrivacyEditor() {
  const p = useApi<{ operator: string; contact: string; extra: string }>('/admin/privacy');
  const [f, setF] = useState({ operator: '', contact: '', extra: '' });
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (p.data) setF(p.data); }, [p.data]);
  if (!p.data) return null;
  return (
    <>
      <Eyebrow>Privacy page</Eyebrow>
      <SCard>
        <SRow title="Who runs this server" hint={<>Everyone can read <a href="/privacy" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>the privacy page</a>, which explains what Frames does with their data.</>}><input className="pin" aria-label="Who runs this server" value={f.operator} placeholder="Your name or organisation" onChange={(e) => { setF({ ...f, operator: e.target.value }); setSaved(false); }} /></SRow>
        <SRow title="How to reach them"><input className="pin" aria-label="Contact" value={f.contact} placeholder="An email address" onChange={(e) => { setF({ ...f, contact: e.target.value }); setSaved(false); }} /></SRow>
        <SRow title="Anything else to tell people"><textarea aria-label="Anything else" rows={3} style={{ width: 320 }} value={f.extra} onChange={(e) => { setF({ ...f, extra: e.target.value }); setSaved(false); }} /></SRow>
        <SRow title="">{saved && <span role="status" className="muted" style={{ fontSize: 13 }}>Saved.</span>}<button className="ghost" onClick={async () => { await api('/admin/privacy', { method: 'PUT', body: f }); setSaved(true); }}>Save</button></SRow>
      </SCard>
    </>
  );
}
