import { useEffect, useRef, useState } from 'react';
import { api, useApi } from '../api';
import { useStore } from '../store';
import { Link } from 'react-router-dom';
import { Badge, Eyebrow, PInput, PSelect, PSwitch, SCard, SRow } from '../components/srow';

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
      <>Easiest: choose <b>Invitation only</b> under <b>Who can reach the App URL</b> in Settings, Cloudflare tunnel. Frames then creates the Access application and adds this method for you, with the team domain and audience tag filled in.</>,
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

const METHODS: { type: Provider['type']; label: string; hint: string; abbr: string }[] = [
  { type: 'cloudflare', abbr: 'CF', label: 'Cloudflare Access', hint: 'No sign-in screen: Access vouches for the email.' },
  { type: 'google', abbr: 'G', label: 'Google', hint: 'Sign in with a Google account.' },
  { type: 'github', abbr: 'GH', label: 'GitHub', hint: 'Sign in with a GitHub account.' },
  { type: 'dropbox', abbr: 'DB', label: 'Dropbox', hint: 'Sign in with a Dropbox account.' },
  { type: 'microsoft', abbr: 'MS', label: 'Microsoft', hint: 'Work or school (Entra ID). Needs your tenant ID.' },
  { type: 'oidc', abbr: 'ID', label: 'OpenID Connect', hint: 'Authentik, Keycloak, Authelia or any OIDC server.' },
  { type: 'oauth2', abbr: 'O2', label: 'Other OAuth 2', hint: 'Anything that gives out OAuth 2 tokens.' },
];
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
/** `focus`: a provider type ("google", ...) to open straight away, adding it first when it is not set up yet. */
export function Access({ focus }: { focus?: string } = {}) {
  const cfg = useApi<Cfg>('/auth/config');
  const [openId, setOpenId] = useState<string | null>(null); // before the early return below: hooks always run in the same order
  const tunnel = useApi<{ protect: boolean; protectForced: boolean; config: { enabled: boolean }; hostnames: { kind: string }[] }>('/tunnel');
  const { refreshMe, me } = useStore();
  const inst = useApi<{ signups: boolean; signupsLocked: boolean; defaultRole: 'member' | 'guest'; sessionDays: number; sessionDaysLocked: boolean; shareExpireDays: number; shareDownload: boolean; shareAskName: boolean }>('/admin/instance');
  const save2 = async (v: boolean) => { try { await api('/admin/instance', { method: 'PUT', body: { signups: v } }); inst.reload(); refreshMe(); setMsg({ ok: true, text: v ? 'New people can make an account again.' : 'New accounts are closed. Existing accounts and people you add by email can still sign in.' }); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } };
  const [providers, setProviders] = useState<Provider[]>([]);
  const [allow, setAllow] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const c = cfg.data;

  const focused = useRef(false);
  useEffect(() => {
    if (!c) return;
    setProviders(c.providers); setAllow(c.allow.join('\n')); setPublicUrl(c.publicUrl); setDirty(false);
    if (focus && !focused.current) {
      focused.current = true;
      const have = c.providers.find((p) => p.type === focus);
      let id = have?.id ?? focus, n = 2;
      if (!have) {
        while (c.providers.some((p) => p.id === id)) id = `${focus}-${n++}`;
        setProviders([...c.providers, { id, type: focus as Provider['type'], name: KINDS.find((k) => k.type === focus)?.label ?? focus, clientId: '' }]); setDirty(true);
      }
      setOpenId(id);
      setTimeout(() => document.getElementById(`prov-${have ? id : `new-${focus}`}`)?.scrollIntoView({ block: 'center' }), 150);
    }
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps
  // Coming back from "Test sign-in" lands on /settings?section=access&access=tested or =notallowed.
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('access');
    if (a === 'tested') setMsg({ ok: true, text: 'The test sign-in worked. You can turn sign-in on now.' });
    if (a === 'notallowed') setMsg({ ok: false, text: 'That account signed in, but it is not on the allowed list, so it did not count. Add it below, save, and test again.' });
  }, []);

  if (!c) return <p className="empty">Loading…</p>;
  const locked = c.enabled; // the providers already saved cannot change while sign-in is on (adding a new one is allowed)
  const savedIds = new Set(c.providers.map((p) => p.id));
  const lockedFor = (p: Provider) => locked && savedIds.has(p.id);
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
  const uniqueId = (type: string) => { let id = type, n = 2; const ids = new Set(providers.map((p) => p.id)); while (ids.has(id)) id = `${type}-${n++}`; return id; };
  const toggle = () => save({ enabled: !c.enabled }, c.enabled ? 'Sign-in is off. Everyone who could reach Frames can use it again.' : 'Sign-in is on.');

  return (
    <>
      {c.disabledByEnv && <div className="banner" role="alert"><span className="reason">Sign-in is switched off by the AUTH_DISABLE setting on this server. Remove it and restart to use sign-in.</span></div>}
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}

      <Eyebrow>Sign-in methods · test before turning on</Eyebrow>
      <SCard>
        {!focus && <SRow lead={<Badge>PK</Badge>} title="Passkey" hint="Face ID, Touch ID or a security key. Built in.">
          <Link to="/settings?section=security" className="ghost plain">Configure</Link><span className="ghost" aria-label="Passkey: built in">✓ Built in</span>
        </SRow>}
        {METHODS.filter((k) => !focus || k.type === focus).flatMap((k) => {
          const mine = providers.map((p, i) => ({ p, i })).filter(({ p }) => p.type === k.type);
          const rows = mine.length ? mine : [{ p: null as Provider | null, i: -1 }];
          return rows.map(({ p, i }) => {
            const id = p?.id ?? `new-${k.type}`;
            const isOpen = openId === id;
            const passed = !!p && !!c.testedBy && (c.testedBy.provider === p.id || c.testedBy.provider === p.type);
            return (
              <div key={id} id={`prov-${id}`}>
                <SRow lead={<Badge>{k.abbr}</Badge>} title={<>{p?.name || k.label}{mine.length > 1 && p && <span className="faint mono" style={{ fontSize: 11, marginLeft: 8 }}>{p.id}</span>}</>} hint={k.hint}>
                  <button className="ghost plain" aria-expanded={isOpen} aria-label={`Configure ${p?.name || k.label}`} onClick={() => { if (!p) { add(k.type); setOpenId(uniqueId(k.type)); } else setOpenId(isOpen ? null : id); }}>{isOpen ? 'Close' : 'Configure'}</button>
                  {p && p.hasSecret !== undefined && ((!dirty && !locked) || locked) ? <a className="ghost" href={`/auth/login/${p.id}?test=1`}>{passed ? '✓ Passed' : 'Test'}</a> : <span className="ghost" style={{ opacity: .5 }}>{passed ? '✓ Passed' : 'Test'}</span>}
                </SRow>
                {p && isOpen && i >= 0 && (
                  <div className="sdetail" role="group" aria-label={`Set up ${p.name || p.id}`}>
                <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, maxWidth: 520, marginTop: 10 }}>
              <label>Button label <input disabled={lockedFor(p)} value={p.name} aria-label={`${p.id} label`} onChange={(e) => edit(i, { name: e.target.value })} /></label>
              {p.type === 'cloudflare' && <>
                <label>Team domain <input disabled={lockedFor(p)} value={p.teamDomain ?? ''} placeholder="myteam.cloudflareaccess.com" aria-label={`${p.id} team domain`} onChange={(e) => edit(i, { teamDomain: e.target.value })} /></label>
                <label>Application Audience (AUD) tag <input disabled={lockedFor(p)} value={p.aud ?? ''} placeholder="64 letters and numbers" aria-label={`${p.id} audience`} onChange={(e) => edit(i, { aud: e.target.value })} /></label>
                <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>In Cloudflare Zero Trust: <b>Settings, Custom Pages</b> shows the team domain; <b>Access, Applications</b>, your Frames application, <b>Overview</b> shows the AUD tag. Open Frames through that application’s address to use <b>Test sign-in</b>.</p>
              </>}
              {['google', 'microsoft', 'dropbox'].includes(p.type) && (
                <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <input type="checkbox" disabled={lockedFor(p)} aria-label={`${p.id}: use the app from Storage`} checked={!!p.useCloudApp} onChange={(e) => edit(i, { useCloudApp: e.target.checked })} />
                  <span>Use the app already set up under <b>Settings, Photos & storage</b> ({p.type === 'google' ? 'Google Drive' : p.type === 'microsoft' ? 'OneDrive' : 'Dropbox'}): the same client ID and secret, so there is nothing to enter here. Add the redirect address below to that app too.</span>
                </label>
              )}
              {p.type !== 'cloudflare' && !p.useCloudApp && <label>Client ID <input disabled={lockedFor(p)} value={p.clientId} aria-label={`${p.id} client ID`} onChange={(e) => edit(i, { clientId: e.target.value })} /></label>}
              {p.type !== 'cloudflare' && !p.useCloudApp && <label>Client secret <input disabled={lockedFor(p)} type="password" autoComplete="off" value={p.clientSecret ?? ''} placeholder={p.hasSecret ? 'Saved. Type to replace' : 'Paste the secret'} aria-label={`${p.id} client secret`} onChange={(e) => edit(i, { clientSecret: e.target.value })} /></label>}
              {p.type === 'oidc' && <label>Issuer address <input disabled={lockedFor(p)} value={p.issuer ?? ''} placeholder="https://auth.example.com/application/o/frames/" aria-label={`${p.id} issuer`} onChange={(e) => edit(i, { issuer: e.target.value })} /></label>}
              {p.type === 'microsoft' && <label>Tenant ID <input disabled={lockedFor(p)} value={p.tenant ?? ''} placeholder="00000000-0000-0000-0000-000000000000" aria-label={`${p.id} tenant`} onChange={(e) => edit(i, { tenant: e.target.value })} /></label>}
              {p.type === 'oauth2' && (['authUrl', 'tokenUrl', 'userUrl', 'emailsUrl'] as const).map((k) => (
                <label key={k}>{{ authUrl: 'Authorize address', tokenUrl: 'Token address', userUrl: 'User-info address', emailsUrl: 'Emails address (optional)' }[k]} <input disabled={lockedFor(p)} value={p[k] ?? ''} aria-label={`${p.id} ${k}`} onChange={(e) => edit(i, { [k]: e.target.value })} /></label>
              ))}
            </div>
            {p.type !== 'cloudflare' && (
              <div className="banner" role="note" style={{ marginTop: 12 }}>
                <span><b>Redirect address</b> (give this to {p.name || 'the provider'} when it asks for a redirect URI or callback URL): <span className="mono" style={{ userSelect: 'all', wordBreak: 'break-all' }}>{p.redirectUrl ?? `${c.callbackBase}/auth/callback/${p.id}`}</span></span>
              </div>
            )}
            <SetupSteps p={p} redirect={p.redirectUrl ?? `${c.callbackBase}/auth/callback/${p.id}`} appUrl={publicUrl || c.callbackBase} />
            <div className="sfoot">
              {dirty && <button className="pill primary" onClick={() => save({ providers: providers.map(({ hasSecret, redirectUrl, ...q }) => q) }, 'Providers saved. Now press “Test”.')}>Save providers</button>}
              <span className="muted" style={{ fontSize: 12.5 }}>{lockedFor(p) ? 'Turn sign-in off to change a provider.' : dirty ? 'Save to keep your changes.' : ''}</span>
              <span style={{ marginLeft: 'auto' }}><button className="ghost danger" disabled={lockedFor(p)} onClick={() => { setProviders(providers.filter((_, j) => j !== i)); setDirty(true); }}>Remove</button></span>
            </div>
                  </div>
                )}
              </div>
            );
          });
        })}
      </SCard>

      {!focus && <>
      <Eyebrow>Sessions</Eyebrow>
      <SCard>
        <SRow title="Require sign-in" hint={c.enabled ? 'Only people on the allowed list can use Frames. Share links still work for the people they were sent to.' : c.testedBy ? `Off. Tested with ${c.testedBy.email || c.testedBy.name} (${c.testedBy.provider}): you can turn it on.` : 'Off: anyone who can reach Frames can use it. Set up a method and test it first.'}>
          <PSwitch on={c.enabled} set={() => toggle()} label="Require sign-in" />
        </SRow>
        <SRow title="Allow anyone to sign up" hint="Off: invite only."><PSwitch on={!!inst.data?.signups} disabled={!inst.data || inst.data.signupsLocked} set={(v) => save2(v)} label="Let new people make an account" /></SRow>
        {inst.data?.signupsLocked && <p className="reason" style={{ margin: '0 0 12px', fontSize: 12.5 }}>Switched off by ALLOW_SIGNUPS=false on this server; remove that setting and restart to change it here.</p>}
        <SRow title="New people join as"><PSelect label="Role of new accounts" value={inst.data?.defaultRole ?? 'member'} options={[['member', 'Member'], ['guest', 'Guest only']]} set={async (v) => { await api('/admin/instance', { method: 'PUT', body: { defaultRole: v } }); inst.reload(); }} /></SRow>
        <SRow title="Stay signed in for" hint={inst.data?.sessionDaysLocked ? 'Fixed by SESSION_DAYS on this server.' : undefined}><PSelect label="Stay signed in for" disabled={!inst.data || inst.data.sessionDaysLocked} value={inst.data?.sessionDays ?? 14} options={[[1, '1 day'], [7, '7 days'], [14, '14 days'], [30, '30 days'], [90, '90 days'], [365, '1 year']]} set={async (v) => { await api('/admin/instance', { method: 'PUT', body: { sessionDays: v } }); inst.reload(); }} /></SRow>
        <SRow title="Signed-in sessions" hint={`${c.sessions} active. Signing everyone out makes people sign in again.`}><button className="ghost" onClick={async () => { await api('/auth/sessions/clear', { body: {} }); window.location.assign('/'); }}>Sign everyone out</button></SRow>
      </SCard>

      <Eyebrow>Guest links</Eyebrow>
      <SCard>
        <SRow title="Expire after" hint="For new links. Each link can be changed when you share."><PSelect label="Expire after" value={inst.data?.shareExpireDays ?? 21} options={[[7, '1 week'], [21, '3 weeks'], [30, '30 days'], [90, '90 days'], [0, 'Never']]} set={async (v) => { await api('/admin/instance', { method: 'PUT', body: { shareExpireDays: v } }); inst.reload(); }} /></SRow>
        <SRow title="Guests can download files"><PSwitch on={!!inst.data?.shareDownload} set={async (v) => { await api('/admin/instance', { method: 'PUT', body: { shareDownload: v } }); inst.reload(); }} label="Guests can download files" /></SRow>
        <SRow title="Ask guests for their name" hint="So you know whose ratings are whose."><PSwitch on={inst.data?.shareAskName !== false} set={async (v) => { await api('/admin/instance', { method: 'PUT', body: { shareAskName: v } }); inst.reload(); }} label="Ask guests for their name" /></SRow>
      </SCard>

      <Turnstile />

      <Eyebrow>Who is allowed in</Eyebrow>
      <div className="scard" style={{ padding: '16px 24px' }}>
        <div role="radiogroup" aria-label="Who is allowed in" style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 999, background: 'var(--surface)', marginBottom: 14 }}>
          {([[false, 'Only people on the list'], [true, 'Anyone who signs in']] as const).map(([open, label]) => (
            <button key={label} role="radio" aria-checked={c.open === open} onClick={() => c.open !== open && save({ open }, open ? 'Anyone who signs in with a provider can now use Frames. The list is kept.' : 'Only people on the list can sign in again.')}
              style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, background: c.open === open ? 'var(--text)' : 'transparent', color: c.open === open ? 'var(--bg)' : 'var(--text2)' }}>{label}</button>
          ))}
        </div>
        {c.open && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', maxWidth: 560, padding: '12px 14px', borderRadius: 10, background: 'var(--hover)', fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warn)', flex: 'none', marginTop: 7 }} />
            <span>Open to the public: anyone with an account at one of the providers above can sign in, and gets their own empty library. The list is kept, so switching back restores it.{!me?.signups && ' New accounts are switched off (see the box above), so only people who already have one can get in.'}</span>
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

      <Eyebrow>Address</Eyebrow>
      <SCard>
        <SRow title="Public address" hint={<>Only needed behind a reverse proxy, or to be sure about the redirect address. Include https:// and no path. Currently using <span className="mono">{c.callbackBase}</span>.</>}>
          <PInput label="Public address" value={publicUrl} placeholder="https://photos.example.com" save={(v) => { setPublicUrl(v); void save({ publicUrl: v }, 'Address saved.'); }} />
        </SRow>
        <SRow title="If you get locked out" hint={<>Set <span className="mono">AUTH_DISABLE=true</span> on the Frames container and restart it. All sign-in is then switched off until you remove it.{c.passwordOption && ' The shared password also keeps working alongside sign-in.'}</>} />
      </SCard>
      </>}
    </>
  );
}

type TsInfo = { enabled: boolean; siteKey: string; signin: boolean; shares: boolean; hasSecret: boolean; disabledByEnv: boolean };

/** Cloudflare Turnstile: a check that a person, not a script, is using the sign-in page or opening a share link. */
function Turnstile() {
  const t = useApi<TsInfo>('/admin/turnstile');
  const [site, setSite] = useState('');
  const [secret, setSecret] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (t.data) setSite(t.data.siteKey); }, [t.data?.siteKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!t.data) return null;
  const d = t.data;
  const save = async (body: Record<string, unknown>, ok: string) => { setMsg(null); try { await api('/admin/turnstile', { method: 'PUT', body }); setSecret(''); setMsg({ ok: true, text: ok }); t.reload(); } catch (e) { setMsg({ ok: false, text: (e as Error).message }); } };
  return (
    <>
      <Eyebrow>Bot check · Cloudflare Turnstile</Eyebrow>
      <SCard>
        {d.disabledByEnv && <p className="reason" style={{ margin: '14px 0 0', fontSize: 12.5 }}>Switched off by TURNSTILE_DISABLE=true on this server. Remove that setting and restart to use it.</p>}
        {msg && <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'muted' : 'reason'} style={{ margin: '14px 0 0', fontSize: 12.5 }}>{msg.text}</p>}
        <SRow title="Use the bot check" hint="Ask people to pass a short check, run by Cloudflare, before they sign in or open a share link."><PSwitch on={d.enabled} label="Use the bot check" set={(v) => save({ enabled: v, siteKey: site, secret }, v ? 'The bot check is on.' : 'The bot check is off.')} /></SRow>
        <SRow title="Site key" sub><input className="pin" aria-label="Turnstile site key" value={site} onChange={(e) => setSite(e.target.value)} placeholder="0x4AAAAAAA…" /></SRow>
        <SRow title="Secret key" hint="Never shown again." sub><input className="pin" aria-label="Turnstile secret key" type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={d.hasSecret ? 'Saved. Type to replace' : '0x4AAAAAAA…'} /><button className="ghost" onClick={() => save({ siteKey: site, secret }, 'Keys saved.')} disabled={!site.trim() && !secret.trim()}>Save keys</button></SRow>
        {d.enabled && <SRow title="On the sign-in page" sub><PSwitch on={d.signin} label="Check on the sign-in page" set={(v) => save({ signin: v }, 'Saved.')} /></SRow>}
        {d.enabled && <SRow title="On share links" hint="A signed-in person is not asked." sub><PSwitch on={d.shares} label="Check on share links" set={(v) => save({ shares: v }, 'Saved.')} /></SRow>}
      </SCard>
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>If Cloudflare cannot be reached, or does not accept the secret key, people are let through rather than locked out. A wrong site key cannot be detected: if the check stops showing, start Frames with TURNSTILE_DISABLE=true and correct the keys.</p>
    </>
  );
}
