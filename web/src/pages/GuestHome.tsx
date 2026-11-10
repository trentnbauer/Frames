import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { imgUrl, useApi } from '../api';

type L = { token: string; label: string; kind: string; seen: string; from?: string };

/** The first photograph of a shared link, for the little picture beside it. Links that cannot be opened just get a plain tile. */
function Thumb({ token }: { token: string }) {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/s/${token}`).then((r) => (r.ok ? r.json() : null)).then((j: { photos?: { id: number }[] } | null) => { if (live && j?.photos?.[0]) setId(j.photos[0].id); }).catch(() => undefined);
    return () => { live = false; };
  }, [token]);
  return <i style={{ width: 44, height: 32, borderRadius: 3, background: 'var(--chip)', flex: 'none', overflow: 'hidden', display: 'block' }}>{id !== null && <img src={imgUrl(id, 'thumb', token)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}</i>;
}

/** What a guest sees after signing in: the shared links they have opened, and nothing else (they have no library). */
export function GuestHome() {
  const d = useApi<{ links: L[] }>('/guest/links');
  const signOut = async () => { await fetch('/auth/logout', { method: 'POST' }); window.location.assign('/'); };
  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '96px 24px 64px' }}>
      <h1 className="serif" style={{ fontSize: 44, lineHeight: 1, margin: '0 0 8px', fontWeight: 400 }}>Shared with you</h1>
      <p style={{ color: 'var(--text2)', margin: 0 }}>You have a guest account. Open the link someone sent you and it is kept here, so you can come back to review it or suggest changes.</p>
      {!d.data ? <p className="empty">Loading…</p> : d.data.links.length === 0 ? <p className="empty">Nothing yet. Open a share link you were sent while you are signed in.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', margin: '24px 0' }}>
          {d.data.links.map((l) => (
            <Link key={l.token} to={`/s/${l.token}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--hair)' }}>
              <Thumb token={l.token} />
              <span style={{ flex: 1 }}>{l.label || (l.kind === 'shoot' ? 'A photoshoot' : 'A composition')} <span className="faint">· {l.kind === 'shoot' ? 'shoot' : 'composition'}</span></span>
              {l.from && <span className="muted" style={{ fontSize: 12.5 }}>from {l.from}</span>}
            </Link>
          ))}
        </div>
      )}
      <button className="btn outline" onClick={signOut}>Sign out</button>
    </main>
  );
}
