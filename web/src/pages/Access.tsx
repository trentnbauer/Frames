import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';

type Provider = {
  id: string; type: 'google' | 'github' | 'microsoft' | 'oidc' | 'oauth2'; name: string; clientId: string;
  issuer?: string; tenant?: string; authUrl?: string; tokenUrl?: string; userUrl?: string; emailsUrl?: string;
  hasSecret?: boolean; redirectUrl?: string; clientSecret?: string;
};
type Cfg = {
  enabled: boolean; allow: string[]; publicUrl: string; providers: Provider[]; testedBy: { email: string; name: string; provider: string } | null;
  passwordOption: boolean; disabledByEnv: boolean; callbackBase: string; sessions: number;
};

const KINDS: { type: Provider['type']; label: string; hint: string }[] = [
  { type: 'google', label: 'Google', hint: 'Sign in with a Google account.' },
  { type: 'github', label: 'GitHub', hint: 'Sign in with a GitHub account.' },
  { type: 'microsoft', label: 'Microsoft', hint: 'Work or school (Entra ID). Needs your tenant ID.' },
  { type: 'oidc', label: 'OpenID Connect server', hint: 'Authentik, Keycloak, Authelia, or any standard OIDC provider.' },
  { type: 'oauth2', label: 'Other OAuth 2 service', hint: 'Anything that gives out OAuth 2 tokens and a user-info address.' },
];

/** Optional sign-in through OAuth providers. Off until it has been tested, so it can never lock you out. */
export function Access() {
  const cfg = useApi<Cfg>('/auth/config');
  const { refreshMe } = useStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [allow, setAllow] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const c = cfg.data;

  useEffect(() => { if (c) { setProviders(c.providers); setAllow(c.allow.join('\n')); setPublicUrl(c.publicUrl); setDirty(false); } }, [c]);
  // Coming back from "Test sign-in" lands on /settings?access=tested or =notallowed.
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('access');
    if (a === 'tested') setMsg({ ok: true, text: 'The test sign-in worked. You can turn sign-in on now.' });
    if (a === 'notallowed') setMsg({ ok: false, text: 'That account signed in, but it is not on the allowed list, so it did not count. Add it below, save, and test again.' });
  }, []);

  if (!c) return <p className="empty">Loading…</p>;
  const locked = c.enabled; // providers cannot change while sign-in is on
  const save = async (body: Record<string, unknown>, ok = 'Saved.') => {
    setMsg(null);
    try { await api('/auth/config', { method: 'PUT', body }); cfg.reload(); refreshMe(); setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const edit = (i: number, patch: Partial<Provider>) => { setProviders(providers.map((p, j) => (j === i ? { ...p, ...patch } : p))); setDirty(true); };
  const add = (type: Provider['type']) => {
    let id: string = type, n = 2;
    while (providers.some((p) => p.id === id)) id = `${type}-${n++}`;
    setProviders([...providers, { id, type, name: KINDS.find((k) => k.type === type)!.label, clientId: '' }]);
    setDirty(true);
  };
  const toggle = () => save({ enabled: !c.enabled }, c.enabled ? 'Sign-in is off. Everyone who could reach Frames can use it again.' : 'Sign-in is on.');

  return (
    <>
      {c.disabledByEnv && <div className="banner" role="alert"><span className="reason">Sign-in is switched off by the AUTH_DISABLE setting on this server. Remove it and restart to use sign-in.</span></div>}
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}

      <div className="field toggle">
        <div>
          <h3 style={{ fontSize: 19 }}>Require sign-in</h3>
          <p style={{ margin: 0 }}>
            {c.enabled ? 'Only people on the allowed list can use Frames. Share links still work for the people they were sent to.' : 'Off: anyone who can reach Frames can use it. Set up a provider, test it, then turn this on.'}
          </p>
          {!c.enabled && <p style={{ margin: '6px 0 0' }}>{c.testedBy ? <>Tested with <b>{c.testedBy.email || c.testedBy.name}</b> ({c.testedBy.provider}).</> : <span className="muted">Not tested yet: save a provider and the list, then press “Test sign-in”.</span>}</p>}
        </div>
        <button className={'sw' + (c.enabled ? ' on' : '')} role="switch" aria-checked={c.enabled} aria-label="Require sign-in" onClick={toggle} />
      </div>

      <div className="field">
        <h3>Providers</h3>
        <p>Add the ways people can sign in. Each one needs a client ID and secret from the provider. Register the address shown under it with the provider.</p>
        {locked && <p className="reason">Sign-in is on, so providers are locked. Turn sign-in off to change one, then test it and turn it on again.</p>}
        {providers.length === 0 && <p className="muted">No providers yet.</p>}
        {providers.map((p, i) => (
          <div className="provider" key={p.id}>
            <div className="spread"><b>{p.name} <span className="faint mono" style={{ fontSize: 11 }}>{p.id}</span></b>
              <span className="t2" style={{ display: 'flex', gap: 14, fontSize: 12.5 }}>
                {!dirty && p.hasSecret !== undefined && !locked && <a href={`/auth/login/${p.id}?test=1`}>Test sign-in</a>}
                {locked && p.hasSecret !== undefined && <a href={`/auth/login/${p.id}?test=1`}>Test sign-in</a>}
                <button disabled={locked} onClick={() => { setProviders(providers.filter((_, j) => j !== i)); setDirty(true); }}>Remove</button>
              </span>
            </div>
            <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, maxWidth: 520, marginTop: 10 }}>
              <label>Button label <input disabled={locked} value={p.name} aria-label={`${p.id} label`} onChange={(e) => edit(i, { name: e.target.value })} /></label>
              <label>Client ID <input disabled={locked} value={p.clientId} aria-label={`${p.id} client ID`} onChange={(e) => edit(i, { clientId: e.target.value })} /></label>
              <label>Client secret <input disabled={locked} type="password" autoComplete="off" value={p.clientSecret ?? ''} placeholder={p.hasSecret ? 'Saved. Type to replace' : 'Paste the secret'} aria-label={`${p.id} client secret`} onChange={(e) => edit(i, { clientSecret: e.target.value })} /></label>
              {p.type === 'oidc' && <label>Issuer address <input disabled={locked} value={p.issuer ?? ''} placeholder="https://auth.example.com/application/o/frames/" aria-label={`${p.id} issuer`} onChange={(e) => edit(i, { issuer: e.target.value })} /></label>}
              {p.type === 'microsoft' && <label>Tenant ID <input disabled={locked} value={p.tenant ?? ''} placeholder="00000000-0000-0000-0000-000000000000" aria-label={`${p.id} tenant`} onChange={(e) => edit(i, { tenant: e.target.value })} /></label>}
              {p.type === 'oauth2' && (['authUrl', 'tokenUrl', 'userUrl', 'emailsUrl'] as const).map((k) => (
                <label key={k}>{{ authUrl: 'Authorize address', tokenUrl: 'Token address', userUrl: 'User-info address', emailsUrl: 'Emails address (optional)' }[k]} <input disabled={locked} value={p[k] ?? ''} aria-label={`${p.id} ${k}`} onChange={(e) => edit(i, { [k]: e.target.value })} /></label>
              ))}
            </div>
            {p.redirectUrl && <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>Register this redirect address with the provider: <span className="mono" style={{ userSelect: 'all' }}>{p.redirectUrl}</span></p>}
          </div>
        ))}
        {!locked && (
          <div style={{ marginTop: 12 }}>
            <select aria-label="Add a provider" value="" onChange={(e) => e.target.value && add(e.target.value as Provider['type'])}>
              <option value="">Add a provider…</option>
              {KINDS.map((k) => <option key={k.type} value={k.type}>{k.label}</option>)}
            </select>
            {dirty && <button className="pill primary" style={{ marginLeft: 12 }} onClick={() => save({ providers: providers.map(({ hasSecret, redirectUrl, ...p }) => p) }, 'Providers saved. Now press “Test sign-in”.')}>Save providers</button>}
          </div>
        )}
      </div>

      <div className="field">
        <h3>Who is allowed in</h3>
        <p>One entry per line: an email address (<span className="mono">sam@example.com</span>), a whole domain (<span className="mono">@example.com</span>), or an account id (<span className="mono">github:12345</span>). Email entries only count if the provider has verified the address. Everyone on the list has the same access.</p>
        <textarea className="area" rows={4} aria-label="Allowed people" style={{ maxWidth: 520 }} value={allow} onChange={(e) => { setAllow(e.target.value); setDirty(true); }} />
        <div style={{ marginTop: 8 }}><button className="pill" onClick={() => save({ allow: allow.split('\n') }, 'List saved.')}>Save list</button></div>
      </div>

      <div className="field">
        <h3>Public address</h3>
        <p>Only needed behind a reverse proxy, or to be sure about the redirect address above. Include https:// and no path. Currently using <span className="mono">{c.callbackBase}</span>.</p>
        <div className="form"><input aria-label="Public address" style={{ minWidth: 320 }} value={publicUrl} placeholder="https://photos.example.com" onChange={(e) => setPublicUrl(e.target.value)} /><button className="pill" onClick={() => save({ publicUrl }, 'Address saved.')}>Save address</button></div>
      </div>

      <div className="field">
        <h3>Signed-in sessions</h3>
        <p>{c.sessions} active. Signing everyone out makes people sign in again.</p>
        <button className="pill" onClick={async () => { await api('/auth/sessions/clear', { body: {} }); window.location.assign('/'); }}>Sign everyone out</button>
      </div>

      <div className="field">
        <h3>If you get locked out</h3>
        <p style={{ margin: 0 }}>Set <span className="mono">AUTH_DISABLE=1</span> on the Frames container and restart it. All sign-in is then switched off until you remove it.{c.passwordOption && ' The shared password also keeps working alongside sign-in.'}</p>
      </div>
    </>
  );
}
