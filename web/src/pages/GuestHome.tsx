import { Link } from 'react-router-dom';
import { useApi } from '../api';

/** What a guest sees after signing in: the shared links they have opened, and nothing else (they have no library). */
export function GuestHome() {
  const d = useApi<{ links: { token: string; label: string; kind: string; seen: string }[] }>('/guest/links');
  const signOut = async () => { await fetch('/auth/logout', { method: 'POST' }); window.location.assign('/'); };
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '64px 24px' }}>
      <h1 style={{ font: '400 44px Georgia, serif', margin: '0 0 8px' }}>Shared with you</h1>
      <p className="muted">You have a guest account. Open the link someone sent you and it is kept here, so you can come back to review it or suggest changes.</p>
      {!d.data ? <p className="empty">Loading…</p> : d.data.links.length === 0 ? <p className="empty">Nothing yet. Open a share link you were sent while you are signed in.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '24px 0' }}>
          {d.data.links.map((l) => <li key={l.token} style={{ padding: '12px 0', borderBottom: '1px solid var(--hair)' }}><Link to={`/s/${l.token}`}>{l.label || (l.kind === 'shoot' ? 'A photoshoot' : 'A composition')}</Link> <span className="faint">· {l.kind === 'shoot' ? 'photoshoot' : 'composition'}</span></li>)}
        </ul>
      )}
      <button className="pill" onClick={signOut}>Sign out</button>
    </main>
  );
}
