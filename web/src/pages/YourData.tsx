import { useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';

/** What Frames holds about you, and how to have it all deleted. */
export function YourData() {
  const { me } = useStore();
  const [word, setWord] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const owner = !!me?.owner;
  const del = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api<{ accountRemoved: boolean }>('/me/data', { method: 'DELETE', body: { confirm: 'delete' } });
      window.location.assign(r.accountRemoved ? '/' : '/settings');
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <>
      <div className="field">
        <h3>What is kept</h3>
        <p>Your account details from your sign-in provider, one sign-in cookie, and your own library: photographs you uploaded or synced, previews, tags, reviews, compositions, share links and settings. Nobody else who signs in can see it. <a href="/privacy" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Read the privacy page</a> for the full picture, including who can see what and where information is sent.</p>
        {me?.user && <p className="muted">Signed in as {me.user.name || me.user.email}{me.user.folder ? `. Your library folder is ${me.user.folder}.` : '.'}</p>}
      </div>
      <div className="field">
        <h3>Back up my data</h3>
        <p>Download a copy of your own library’s database: your reviews, tags, compositions, share links and settings. Your photographs are not in it, and neither are keys, secrets or sign-in sessions.</p>
        <a className="pill primary" href="/api/backup" download>Download my backup</a>
      </div>
      <Previews />
      <Removed />
      <div className="field">
        <h3>Delete my data</h3>
        <p>This erases everything Frames holds for you: your {owner ? 'library, previews, compositions, share links and settings (your account stays, because it is the first administrator)' : 'account, uploaded and synced photographs, previews, compositions, share links, settings and saved connections, and signs you out'}. It cannot be undone. Photographs in a read-only library folder on the server are not Frames’ to delete: ask the person who runs this server. Backups made earlier disappear within a week.</p>
        <div className="form">
          <input aria-label="Type delete to confirm" placeholder="Type delete to confirm" value={word} onChange={(e) => setWord(e.target.value)} />
          <button className="pill" disabled={word !== 'delete' || busy} onClick={del}>{busy ? 'Deleting…' : 'Delete my data'}</button>
        </div>
        {err && <p className="reason" role="alert">{err}</p>}
      </div>
    </>
  );
}

/** Thumbnails, previews and colour analysis are made from your originals and kept separately: this rebuilds the ones that are missing or damaged. */
function Previews() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const rebuild = async (all: boolean) => {
    setBusy(true); setMsg('');
    try {
      await api(`/library/rebuild${all ? '?all=1' : ''}`, { method: 'POST', body: {} });
      for (;;) {
        const r = await api<{ running: boolean; done: number; total: number; result: { checked: number; rebuilt: number } | null }>('/library/rebuild/status');
        setMsg(`Working… ${r.done}/${r.total}`);
        if (!r.running) { setMsg(r.result ? `Checked ${r.result.checked}, rebuilt ${r.result.rebuilt}.` : 'Done.'); break; }
        await new Promise((x) => setTimeout(x, 700));
      }
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="field">
      <h3>Previews</h3>
      <p>Thumbnails, previews and colour analysis are made from your originals and kept separately. If any are missing or damaged, rebuild them.</p>
      <button className="pill" disabled={busy} onClick={() => rebuild(false)}>Rebuild missing</button>{' '}
      <button className="pill" disabled={busy} onClick={() => rebuild(true)}>Rebuild all</button>
      {msg && <span role="status" className="muted" style={{ marginLeft: 12, fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

/** Photographs taken out of Frames are remembered so a scan does not import them again. This forgets that. */
function Removed() {
  const r = useApi<{ count: number }>('/removed');
  const [msg, setMsg] = useState('');
  if (!r.data || r.data.count === 0) return null;
  return (
    <div className="field">
      <h3>Photos taken out of Frames</h3>
      <p>{r.data.count} {r.data.count === 1 ? 'photograph was' : 'photographs were'} taken out of Frames, so a scan does not bring {r.data.count === 1 ? 'it' : 'them'} back. Bring them back and the next scan imports whichever files are still in your library folders (reviews and tags are not restored, and copies Frames deleted are gone).</p>
      <button className="pill" onClick={async () => { const x = await api<{ cleared: number }>('/removed/restore', { body: {} }); setMsg(`Done. Press Sync in your library, or wait for the next scan.`); void x; r.reload(); }}>Bring them back</button>
      {msg && <span role="status" className="muted" style={{ marginLeft: 12, fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
