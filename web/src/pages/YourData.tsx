import { useState } from 'react';
import { api } from '../api';
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
        <p>Your account details from your sign-in provider, one sign-in cookie, and your own library: photographs you uploaded or synced, previews, tags, reviews, collections, share links and settings. Nobody else who signs in can see it. <a href="/privacy" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Read the privacy page</a> for the full picture, including who can see what and where information is sent.</p>
        {me?.user && <p className="muted">Signed in as {me.user.name || me.user.email}{me.user.folder ? `. Your library folder is ${me.user.folder}.` : '.'}</p>}
      </div>
      <div className="field">
        <h3>Delete my data</h3>
        <p>This erases everything Frames holds for you: your {owner ? 'library, previews, collections, share links and settings (your account stays, because it is the first administrator)' : 'account, uploaded and synced photographs, previews, collections, share links, settings and saved connections, and signs you out'}. It cannot be undone. Photographs in a read-only library folder on the server are not Frames’ to delete: ask the person who runs this server. Backups made earlier disappear within a week.</p>
        <div className="form">
          <input aria-label="Type delete to confirm" placeholder="Type delete to confirm" value={word} onChange={(e) => setWord(e.target.value)} />
          <button className="pill" disabled={word !== 'delete' || busy} onClick={del}>{busy ? 'Deleting…' : 'Delete my data'}</button>
        </div>
        {err && <p className="reason" role="alert">{err}</p>}
      </div>
    </>
  );
}
