import { useEffect, useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';
import { CardFooter, Destructive, EditRow, useOne } from '../components/editcard';

type Provider = {
  id: string; type: 'google' | 'github' | 'microsoft' | 'dropbox' | 'oidc' | 'oauth2' | 'cloudflare'; name: string; clientId: string; useCloudApp?: boolean;
  issuer?: string; tenant?: string; authUrl?: string; tokenUrl?: string; userUrl?: string; emailsUrl?: string; teamDomain?: string; aud?: string;
  hasSecret?: boolean; redirectUrl?: string; clientSecret?: string;
};
type Cfg = {
  enabled: boolean; allow: string[]; open: boolean; publicUrl: string; providers: Provider[]; testedBy: { email: string; name: string; provider: string } | null;
  passwordOption: boolean; disabledByEnv: boolean; callbackBase: string; sessions: number;
};

const ext = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{text}</a>;

/** What to do in each service's console, step by step, ending with what to paste into the boxes above. */
function SetupSteps({ p, redirect, appUrl }: { p: Provider; redirect: string; appUrl: string }) {
  const uri = <span className="mono" style={{ userSelect: 'all', wordBreak: 'break-all' }}>{redirect}</span>;
  const steps: Record<Provider['type'], React.ReactNode[]> = {
    google: [
      <>In the {ext('https://console.cloud.google.com/auth/overview', 'Google Cloud console')} make or pick a project (any name, it is free).</>,
      <><b>Google Auth platform, Branding</b> (earlier called OAuth consent screen): app name Frames, your email as support and contact. Under <b>Audience</b> choose <b>External</b>. Frames asks only for <span className="mono">openid</span>, <span className="mono">email</span> and <span className="mono">profile</span>, so there is nothing to add under Data Access.</>,
      <>Still under Audience, press <b>Publish app</b>. Left in <i>Testing</i>, only the test users you add can sign in and Google ends the sign-in every 7 days; with just those three basic scopes, publishing needs no review from Google.</>,
      <>{ext('https://console.cloud.google.com/auth/clients', 'Clients')}, <b>Create client</b>, application type <b>Web application</b>. Under <b>Authorised redirect URIs</b> add exactly: {uri}</>,
      <>Copy the <b>Client ID</b> and the <b>Client secret</b> into the boxes above, press <b>Save providers</b>, then <b>Test sign-in</b>.</>,
    ],
    github: [
      <>Open {ext('https://github.com/settings/developers', 'GitHub, Settings, Developer settings')}, <b>OAuth Apps</b>, <b>New OAuth App</b> (not a GitHub App).</>,
      <>Application name Frames. <b>Homepage URL</b>: {appUrl ? <span className="mono">{appUrl}</span> : 'the address you open Frames at'}. <b>Authorization callback URL</b>: {uri}</>,
      <>Register it, then <b>Generate a new client secret</b> (shown once). Copy the <b>Client ID</b> and the secret into the boxes above, press <b>Save providers</b>, then <b>Test sign-in</b>.</>,
      <>Frames asks for <span className="mono">read:user</span> and <span className="mono">user:email</span> to learn the account’s verified email. An allowed-list entry like <span className="mono">github:12345</span> or an email both work.</>,
    ],
    microsoft: [
      <>Open {ext('https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade', 'Microsoft Entra, App registrations')}, <b>New registration</b>, name Frames.</>,
      <><b>Supported account types</b>: <i>this organizational directory only</i> (the tenant ID below is that directory). <b>Redirect URI</b>: platform <b>Web</b>, {uri}</>,
      <>On the app’s <b>Overview</b> copy the <b>Directory (tenant) ID</b> into <i>Tenant ID</i> and the <b>Application (client) ID</b> into <i>Client ID</i>.</>,
      <><b>Certificates &amp; secrets, New client secret</b>: copy its <b>Value</b> (not the Secret ID) into <i>Client secret</i>. The default permission (<span className="mono">User.Read</span>) is enough.</>,
      <>Press <b>Save providers</b>, then <b>Test sign-in</b>.</>,
    ],
    dropbox: [
      <>Sign-in with Dropbox uses a Dropbox app. If you set one up for Cloud sync, tick <b>Use the app already set up</b> above and only add the redirect address below to it: in the {ext('https://www.dropbox.com/developers/apps', 'Dropbox App Console')}, <b>Settings</b>, <b>Redirect URIs</b>, add {uri}</>,
      <>Otherwise create an app there (<b>Scoped access</b>, <b>Full Dropbox</b> or <b>App folder</b>), tick the permission <span className="mono">account_info.read</span> on the <b>Permissions</b> tab and press <b>Submit</b>, add {uri} as a Redirect URI, and copy the <b>App key</b> and <b>App secret</b> into the boxes above.</>,
      <>Press <b>Save providers</b>, then <b>Test sign-in</b>. Frames asks Dropbox only for the account’s name and verified email; an allowed-list entry can be an email or <span className="mono">dropbox:dbid:…</span>.</>,
    ],
    oidc: [
      <>In your OpenID Connect server (Authentik, Keycloak, Authelia and so on) create a new <b>client / application</b> of the <b>confidential</b> kind (it has a secret) using the <b>authorization code</b> flow.</>,
      <>Redirect URI: {uri}. Scopes: <span className="mono">openid email profile</span>.</>,
      <><i>Issuer address</i> is the address that serves <span className="mono">/.well-known/openid-configuration</span>, without that last part (for Authentik, the application’s own <i>OpenID Configuration Issuer</i>; for Keycloak <span className="mono">https://host/realms/NAME</span>).</>,
      <>Paste the client ID and secret into the boxes above, press <b>Save providers</b>, then <b>Test sign-in</b>. A server on plain <span className="mono">http://</span> needs <span className="mono">OIDC_ALLOW_HTTP=true</span>.</>,
    ],
    oauth2: [
      <>Register an OAuth 2 application with the service. Redirect (callback) address: {uri}. Frames asks for the scopes <span className="mono">profile email</span>.</>,
      <>Fill in the service’s <b>authorize</b>, <b>token</b> and <b>user-info</b> addresses (its developer documentation lists them). The user-info answer must say who the person is and give an email.</>,
      <>Paste the client ID and secret into the boxes above, press <b>Save providers</b>, then <b>Test sign-in</b>.</>,
    ],
    cloudflare: [
      <>Easiest: tick <b>Protect the App URL with Cloudflare Access</b> under Settings, Cloudflare tunnel. Frames then creates the Access application and adds this method for you, with the team domain and audience tag filled in.</>,
      <>By hand: in {ext('https://one.dash.cloudflare.com/', 'Cloudflare Zero Trust')} open <b>Access, Applications</b>, <b>Add an application</b>, <b>Self-hosted</b>, with {appUrl ? <span className="mono">{appUrl}</span> : 'the address you open Frames at'} as its address, and a policy that allows the people on the list below.</>,
      <>The <b>team domain</b> is under <b>Settings, Custom Pages</b> (it looks like <span className="mono">myteam.cloudflareaccess.com</span>). The <b>Application Audience (AUD) tag</b> is on the application’s <b>Overview</b> tab.</>,
      <>There is no redirect address, client ID or secret: Access signs people in before Frames sees them. Save, then open Frames through the Access-protected address and press <b>Test sign-in</b>.</>,
    ],
  };
  const list = steps[p.type];
  if (!list.length) return null;
  return (
    <details style={{ marginTop: 10 }} open={!p.clientId}>
      <summary style={{ cursor: 'pointer', fontSize: 13.5 }}><b>How to set up {p.name || p.type}</b></summary>
      <ol className="muted" style={{ fontSize: 13, margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.7 }}>{list.map((x, i) => <li key={i}>{x}</li>)}</ol>
    </details>
  );
}

const KINDS: { type: Provider['type']; label: string; hint: string }[] = [
  { type: 'google', label: 'Google', hint: 'Sign in with a Google account.' },
  { type: 'github', label: 'GitHub', hint: 'Sign in with a GitHub account.' },
  { type: 'dropbox', label: 'Dropbox', hint: 'Sign in with a Dropbox account.' },
  { type: 'microsoft', label: 'Microsoft', hint: 'Work or school (Entra ID). Needs your tenant ID.' },
  { type: 'oidc', label: 'OpenID Connect server', hint: 'Authentik, Keycloak, Authelia, or any standard OIDC provider.' },
  { type: 'cloudflare', label: 'Cloudflare Access', hint: 'No sign-in screen: people who got through Cloudflare Access are signed in by the email Access vouches for.' },
  { type: 'oauth2', label: 'Other OAuth 2 service', hint: 'Anything that gives out OAuth 2 tokens and a user-info address.' },
];

/** Optional sign-in through OAuth providers. Off until it has been tested, so it can never lock you out. */
export function Access() {
  const cfg = useApi<Cfg>('/auth/config');
  const tunnel = useApi<{ protect: boolean; protectForced: boolean; config: { enabled: boolean }; hostnames: { kind: string }[] }>('/tunnel');
  const { refreshMe, me } = useStore();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [allow, setAllow] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const c = cfg.data;

  useEffect(() => { if (c) { setProviders(c.providers); setAllow(c.allow.join('\n')); setPublicUrl(c.publicUrl); setDirty(false); } }, [c]);
  // Coming back from "Test sign-in" lands on /settings?section=access&access=tested or =notallowed.
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
  const one = useOne();
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
          <EditRow key={p.id} id={p.id} one={one} title={p.name || p.id} note={`How people sign in with ${p.name || 'this provider'}.`}
            summary={<><b>{p.name}</b> <span className="faint mono" style={{ fontSize: 11 }}>{p.id}</span> <span className="muted">{KINDS.find((k) => k.type === p.type)?.label}</span></>}
            right={p.hasSecret !== undefined && ((!dirty && !locked) || locked) ? <a className="t2" style={{ fontSize: 12.5 }} href={`/auth/login/${p.id}?test=1`}>Test sign-in</a> : undefined}>
            <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, maxWidth: 520, marginTop: 10 }}>
              <label>Button label <input disabled={locked} value={p.name} aria-label={`${p.id} label`} onChange={(e) => edit(i, { name: e.target.value })} /></label>
              {p.type === 'cloudflare' && <>
                <label>Team domain <input disabled={locked} value={p.teamDomain ?? ''} placeholder="myteam.cloudflareaccess.com" aria-label={`${p.id} team domain`} onChange={(e) => edit(i, { teamDomain: e.target.value })} /></label>
                <label>Application Audience (AUD) tag <input disabled={locked} value={p.aud ?? ''} placeholder="64 letters and numbers" aria-label={`${p.id} audience`} onChange={(e) => edit(i, { aud: e.target.value })} /></label>
                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>In Cloudflare Zero Trust: <b>Settings, Custom Pages</b> shows the team domain; <b>Access, Applications</b>, your Frames application, <b>Overview</b> shows the AUD tag. Open Frames through that application’s address to use <b>Test sign-in</b>.</p>
              </>}
              {['google', 'microsoft', 'dropbox'].includes(p.type) && (
                <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" disabled={locked} aria-label={`${p.id}: use the app from Cloud services`} checked={!!p.useCloudApp} onChange={(e) => edit(i, { useCloudApp: e.target.checked })} />
                  <span>Use the app already set up under <b>Settings, Cloud storage providers</b> ({p.type === 'google' ? 'Google Drive' : p.type === 'microsoft' ? 'OneDrive' : 'Dropbox'}): the same client ID and secret, so there is nothing to enter here. Add the redirect address below to that app too.</span>
                </label>
              )}
              {p.type !== 'cloudflare' && !p.useCloudApp && <label>Client ID <input disabled={locked} value={p.clientId} aria-label={`${p.id} client ID`} onChange={(e) => edit(i, { clientId: e.target.value })} /></label>}
              {p.type !== 'cloudflare' && !p.useCloudApp && <label>Client secret <input disabled={locked} type="password" autoComplete="off" value={p.clientSecret ?? ''} placeholder={p.hasSecret ? 'Saved. Type to replace' : 'Paste the secret'} aria-label={`${p.id} client secret`} onChange={(e) => edit(i, { clientSecret: e.target.value })} /></label>}
              {p.type === 'oidc' && <label>Issuer address <input disabled={locked} value={p.issuer ?? ''} placeholder="https://auth.example.com/application/o/frames/" aria-label={`${p.id} issuer`} onChange={(e) => edit(i, { issuer: e.target.value })} /></label>}
              {p.type === 'microsoft' && <label>Tenant ID <input disabled={locked} value={p.tenant ?? ''} placeholder="00000000-0000-0000-0000-000000000000" aria-label={`${p.id} tenant`} onChange={(e) => edit(i, { tenant: e.target.value })} /></label>}
              {p.type === 'oauth2' && (['authUrl', 'tokenUrl', 'userUrl', 'emailsUrl'] as const).map((k) => (
                <label key={k}>{{ authUrl: 'Authorize address', tokenUrl: 'Token address', userUrl: 'User-info address', emailsUrl: 'Emails address (optional)' }[k]} <input disabled={locked} value={p[k] ?? ''} aria-label={`${p.id} ${k}`} onChange={(e) => edit(i, { [k]: e.target.value })} /></label>
              ))}
            </div>
            {p.type !== 'cloudflare' && (
              <div className="banner" role="note" style={{ marginTop: 12 }}>
                <span><b>Redirect address</b> (give this to {p.name || 'the provider'} when it asks for a redirect URI or callback URL): <span className="mono" style={{ userSelect: 'all', wordBreak: 'break-all' }}>{p.redirectUrl ?? `${c.callbackBase}/auth/callback/${p.id}`}</span></span>
              </div>
            )}
            <SetupSteps p={p} redirect={p.redirectUrl ?? `${c.callbackBase}/auth/callback/${p.id}`} appUrl={publicUrl || c.callbackBase} />
            <CardFooter>
              <span className="muted" style={{ fontSize: 12.5 }}>{locked ? 'Turn sign-in off to change a provider.' : 'Press Save providers below to keep your changes.'}</span>
              <Destructive disabled={locked} onClick={() => { setProviders(providers.filter((_, j) => j !== i)); setDirty(true); }}>Remove</Destructive>
            </CardFooter>
          </EditRow>
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
        <div role="radiogroup" aria-label="Who is allowed in" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 999, background: 'var(--surface)', marginBottom: 14 }}>
          {([[false, 'Only people on the list'], [true, 'Anyone who signs in']] as const).map(([open, label]) => (
            <button key={label} role="radio" aria-checked={c.open === open} onClick={() => c.open !== open && save({ open }, open ? 'Anyone who signs in with a provider can now use Frames. The list is kept.' : 'Only people on the list can sign in again.')}
              style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, background: c.open === open ? 'var(--text)' : 'transparent', color: c.open === open ? 'var(--bg)' : 'var(--text2)' }}>{label}</button>
          ))}
        </div>
        {c.open && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: 560, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.04)', fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', flex: 'none', marginTop: 7 }} />
            <span>Open to the public: anyone with an account at one of the providers above can sign in, and gets their own empty library. The list is kept, so switching back restores it.{!me?.signups && ' New accounts are switched off on this server (ALLOW_SIGNUPS=false), so only people who already have one can get in.'}</span>
          </div>
        )}
        {c.open && tunnel.data?.protect && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560, marginTop: 10, padding: '14px 16px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px oklch(0.78 0.11 35 / .6)', background: 'oklch(0.78 0.11 35 / .06)', fontSize: 13 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <b style={{ fontWeight: 600, color: 'var(--warn)' }}>Cloudflare Access is still limiting who gets in</b>
              <span style={{ color: 'var(--text2)' }}>The App URL is protected by a Cloudflare Access policy that only lets in the people on the allowed list. Anyone else is stopped by Cloudflare before they reach Frames, so “Anyone who signs in” has no effect until the policy is turned off.</span>
            </span>
            <span style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="pill primary" onClick={async () => { try { await api('/tunnel', { method: 'PUT', body: { protect: false } }); tunnel.reload(); setMsg({ ok: true, text: 'Cloudflare Access protection is off. Frames’ own sign-in now decides who gets in. Share links and portfolios stay public.' }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } }}>Turn off the Cloudflare Access policy</button>
              <a className="t2" href="/settings?section=cloudflare-tunnel" style={{ fontSize: 13 }}>Open Cloudflare tunnel settings</a>
            </span>
          </div>
        )}
        {!c.open && c.enabled && tunnel.data && !tunnel.data.protect && tunnel.data.config.enabled && tunnel.data.hostnames.some((h) => h.kind === 'app') && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560, marginBottom: 14, padding: '14px 16px', borderRadius: 10, boxShadow: 'inset 0 0 0 1px oklch(0.78 0.11 35 / .6)', background: 'oklch(0.78 0.11 35 / .06)', fontSize: 13 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <b style={{ fontWeight: 600, color: 'var(--warn)' }}>No Cloudflare Access policy is in front of Frames</b>
              <span style={{ color: 'var(--text2)' }}>Only Frames’ own sign-in checks this list. Anyone who finds the App URL can still reach the sign-in page. A Cloudflare Access policy stops people who are not on the list before they reach Frames at all: add a Cloudflare API token under Cloudflare tunnel and Frames sets it up.</span>
            </span>
            <a className="t2" href="/settings?section=cloudflare-tunnel" style={{ fontSize: 13 }}>Open Cloudflare tunnel settings</a>
          </div>
        )}
        {!c.open && <>
          <p>One entry per line: an email address (<span className="mono">sam@example.com</span>), a whole domain (<span className="mono">@example.com</span>), or an account id (<span className="mono">github:12345</span>). Email entries only count when the provider says the address is verified.</p>
          <textarea className="area" rows={4} aria-label="Allowed people" style={{ maxWidth: 520 }} value={allow} onChange={(e) => { setAllow(e.target.value); setDirty(true); }} />
          <div style={{ marginTop: 8 }}><button className="pill" onClick={() => save({ allow: allow.split('\n') }, 'List saved.')}>Save list</button></div>
        </>}
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
        <p style={{ margin: 0 }}>Set <span className="mono">AUTH_DISABLE=true</span> on the Frames container and restart it. All sign-in is then switched off until you remove it.{c.passwordOption && ' The shared password also keeps working alongside sign-in.'}</p>
      </div>
    </>
  );
}
