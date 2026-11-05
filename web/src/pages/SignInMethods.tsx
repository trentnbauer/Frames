import { useStore } from '../store';
import { api, useApi } from '../api';

/** Who you are signed in as, and with what, and other accounts that can sign in as you. */
export function SignInMethods() {
  const { me } = useStore();
  const linked = useApi<{ identities: { id: number; provider: string; email: string; primary: boolean }[]; providers: { id: string; type: string }[] }>(me?.user ? '/me/identities' : null);
  const result = new URLSearchParams(window.location.search).get('linked');
  const said: Record<string, string> = { ok: 'Added. You can now sign in with that account too.', same: 'That account was already yours.', taken: 'That account already belongs to someone else, so it was not added.', notallowed: 'That account is not allowed to use this Frames, so it was not added. Ask the administrator.' };
  const list = linked.data?.identities ?? [];
  const mine = new Set(list.map((i) => i.provider));
  const more = (linked.data?.providers ?? []).filter((p) => !mine.has(p.id));
  return (
    <div className="field">
      <h3>Signed in as</h3>
      {me?.user
        ? <>
            <div className="row"><span><b>{me.user.name || me.user.email}</b> <span className="muted">{me.user.email}</span></span><span className="faint">signed in with {me.user.provider} · {me.role === 'admin' ? 'administrator' : 'member'}</span></div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Your library folder is <span className="mono">{me.user.folder || 'the main folder'}</span>. The administrator decides which ways of signing in are offered, under Sign-in &amp; access.</p>
            <h3 style={{ marginTop: 20 }}>Ways to sign in as you</h3>
            {result && said[result] && <p role="status" className={result === 'ok' || result === 'same' ? 'muted' : 'reason'} style={{ fontSize: 13 }}>{said[result]}</p>}
            {list.map((i) => (
              <div className="row" key={`${i.provider}-${i.id}`}>
                <span><b>{i.provider}</b> <span className="muted">{i.email}</span></span>
                {i.primary ? <span className="faint">the one you started with</span> : <button className="t2" onClick={async () => { if (window.confirm(`Stop signing in with ${i.provider}?\n\nYou can still sign in with your other accounts, and your library is not touched.`)) { await api(`/me/identities/${i.id}`, { method: 'DELETE' }); linked.reload(); } }}>Remove</button>}
              </div>
            ))}
            {more.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {more.map((p) => <a key={p.id} className="pill" href={`/auth/link/${p.id}`}>Add {p.id}</a>)}
              </div>
            )}
            <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Add another account and you reach this same library whichever you sign in with. An account that already has its own library cannot be added.</p>
          </>
        : <p className="muted">Sign-in is off on this server, so there is no account to show: everyone who can reach Frames uses it as its owner.</p>}
    </div>
  );
}
