import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { fmtDate } from '../data';
import { useStore } from '../store';
import { CardFooter, Destructive, EditRow, MeTag, useOne, type One } from '../components/editcard';

type Person = { id: number; name: string; email: string; provider: string; role: 'admin' | 'member'; folder: string; disabled: boolean; invited: boolean; created: string; photos: number; bytes: number };
type Data = { users: Person[]; signups: boolean; libraryRoots: string[] };
const size = (n: number) => (n > 1073741824 ? `${(n / 1073741824).toFixed(1)} GB` : n > 1048576 ? `${Math.round(n / 1048576)} MB` : `${Math.ceil(n / 1024)} KB`);

/** Administrators: who is here, what each person uses, and the people-related requests (add, switch off, delete data). */
export function People() {
  const d = useApi<Data>('/admin/users');
  const one = useOne();
  const { me } = useStore();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  if (!d.data) return <p className="empty">Loading…</p>;
  const act = async (fn: () => Promise<unknown>, ok?: string) => { setMsg(null); try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } d.reload(); };
  const root = d.data.libraryRoots[0] ?? '/library';

  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}
      <p>Everyone has their own library. A member’s photographs are read from <span className="mono">{root}/&lt;their folder&gt;</span>; they can also upload and use cloud sync. {d.data.signups ? 'New people on the allow-list get an account the first time they sign in.' : 'New accounts are switched off (ALLOW_SIGNUPS): only the people added here, and those who already have one, can sign in.'}</p>

      <div className="field">
        <h3>People</h3>
        {d.data.users.map((u) => <Row key={u.id} one={one} u={u} self={u.id === me?.id} root={root} act={act} />)}
      </div>

      <div className="field">
        <h3>Add someone</h3>
        <p>They are also put on the allowed list under Sign-in & access, and their first sign-in with this verified email address claims the account.</p>
        <div className="form">
          <input aria-label="Email address" type="email" style={{ minWidth: 260 }} placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'member')}><option value="member">Member</option><option value="admin">Administrator</option></select>
          <button className="pill primary" disabled={!email.includes('@')} onClick={() => act(async () => { const r = await api<{ allowedList: 'added' | 'already' }>('/admin/users', { body: { email, role } }); const mail = email.trim().toLowerCase(); setEmail(''); setMsg({ ok: true, text: r.allowedList === 'added' ? `Added ${mail}, and put them on the allowed list under Sign-in & access.` : `Added ${mail}. They were already on the allowed list under Sign-in & access.` }); })}>Add</button>
        </div>
      </div>

      <PrivacyEditor />
    </>
  );
}

function Row({ one, u, self, root, act }: { one: One; u: Person; self: boolean; root: string; act: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }) {
  const [folder, setFolder] = useState(u.folder);
  useEffect(() => setFolder(u.folder), [u.folder]);
  const patch = (body: Record<string, unknown>, ok?: string) => act(() => api(`/admin/users/${u.id}`, { method: 'PATCH', body }), ok);
  return (
    <EditRow id={String(u.id)} one={one} title={u.name || u.email} note={`Added ${fmtDate(u.created, { day: 'numeric', month: 'short', year: 'numeric' })}${u.provider ? ` · signs in with ${u.provider}` : ''}.`} summary={(
      <>
        <b>{u.name || u.email}</b>{self && <MeTag />} {u.email && u.name !== u.email && <span className="muted">{u.email}</span>}{' '}
        <span className="faint">{u.role === 'admin' ? 'administrator' : 'member'}{u.invited ? ' · not signed in yet' : ''}{u.disabled ? ' · switched off' : ''}</span>{' '}
        <span className="faint">· {u.photos} photos · {size(u.bytes)}</span>
      </>
    )}>
      <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 520, marginTop: 10 }}>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>The size counts what Frames holds for them, not the photographs in their read-only folder.</p>
        <label>Role{' '}
          <select aria-label={`${u.email || u.name} role`} value={u.role} onChange={(e) => patch({ role: e.target.value }, 'Saved.')}><option value="member">Member</option><option value="admin">Administrator</option></select>
        </label>
        {u.id !== 1 && (
          <label>Folder{' '}
            <span className="mono">{root}/</span>
            <input aria-label={`${u.email || u.name} folder`} value={folder} onChange={(e) => setFolder(e.target.value)} onBlur={() => folder !== u.folder && patch({ folder }, 'Saved. Press Sync in their library to read from the new folder.')} />
          </label>
        )}
      </div>
      <CardFooter>
          {!self && <button className="pill" onClick={() => patch({ disabled: !u.disabled }, u.disabled ? 'Switched on.' : 'Switched off and signed out.')}>{u.disabled ? 'Switch on' : 'Switch off'}</button>}
          <Destructive onClick={() => {
            if (window.prompt(`Delete everything Frames holds for ${u.name || u.email}${u.id === 1 ? ' (the library is emptied, the account stays)' : ' and remove the account'}?\n\nType “delete” to confirm. This cannot be undone.`) === 'delete')
              act(() => api(`/admin/users/${u.id}/data`, { method: 'DELETE', body: { confirm: 'delete' } }), 'Deleted.');
          }}>Delete their data</Destructive>
      </CardFooter>
    </EditRow>
  );
}

function PrivacyEditor() {
  const p = useApi<{ operator: string; contact: string; extra: string }>('/admin/privacy');
  const [f, setF] = useState({ operator: '', contact: '', extra: '' });
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (p.data) setF(p.data); }, [p.data]);
  if (!p.data) return null;
  return (
    <div className="field">
      <h3>Privacy page</h3>
      <p>Everyone can read <a href="/privacy" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>the privacy page</a>, which explains what Frames does with their data. Say who runs this server and how to reach them.</p>
      <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 520 }}>
        <label>Who runs this server <input aria-label="Who runs this server" value={f.operator} placeholder="Your name or organisation" onChange={(e) => { setF({ ...f, operator: e.target.value }); setSaved(false); }} /></label>
        <label>How to reach them <input aria-label="Contact" value={f.contact} placeholder="An email address" onChange={(e) => { setF({ ...f, contact: e.target.value }); setSaved(false); }} /></label>
        <label>Anything else to tell people <textarea aria-label="Anything else" rows={4} value={f.extra} onChange={(e) => { setF({ ...f, extra: e.target.value }); setSaved(false); }} /></label>
        <div><button className="pill" onClick={async () => { await api('/admin/privacy', { method: 'PUT', body: f }); setSaved(true); }}>Save</button>{saved && <span role="status" className="muted" style={{ marginLeft: 12, fontSize: 13 }}>Saved.</span>}</div>
      </div>
    </div>
  );
}
