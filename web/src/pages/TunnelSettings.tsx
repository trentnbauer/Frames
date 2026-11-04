import { useEffect, useState } from 'react';
import { api, useApi } from '../api';

type Host = { hostname: string; kind: 'portfolio' | 'app'; who: string };
type Data = {
  config: { enabled: boolean; portfolios: boolean; env: boolean };
  appUrl: string; hostnames: Host[]; hasToken: boolean; signInOn: boolean; appOpen: boolean; service: string;
  allow: string[]; protect: boolean; protectApplied: boolean; accessPeople: number; accountId: string; hasApiToken: boolean; apiReady: boolean; error: string | null; accessNote: string | null; orgNote: string | null; appliedAt: string | null;
  status: { state: 'stopped' | 'starting' | 'connected' | 'error'; error: string | null; since: string | null; restarts: number };
  accessApps: { name: string; decision: 'allow' | 'bypass'; addresses: string[]; who: string[] }[];
  managedByEnv: boolean; access: { appHost: string; emails: string[]; publicPaths: string[]; error: string | null } | null;
};

const LABEL = { stopped: 'Stopped', starting: 'Connecting…', connected: 'Connected', error: 'Problem' } as const;
const link = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{text}</a>;

/** Reach Frames from outside through a Cloudflare tunnel you made in the Cloudflare dashboard, with no open ports. */
export function TunnelSettings() {
  const d = useApi<Data>('/tunnel');
  const logs = useApi<{ lines: string[] }>('/tunnel/logs');
  const [appUrl, setAppUrl] = useState('');
  const [allow, setAllow] = useState('');
  const [account, setAccount] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  useEffect(() => { if (d.data) { setAllow(d.data.allow.join('\n')); setAppUrl(d.data.appUrl); setAccount(d.data.accountId); } }, [d.data?.appUrl, d.data?.accountId, d.data?.allow.join('\n')]); // eslint-disable-line react-hooks/exhaustive-deps
  // Keep the status fresh while this page is open.
  useEffect(() => { const t = setInterval(() => { d.reload(); if (showLogs) logs.reload(); }, 3000); return () => clearInterval(t); }, [showLogs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data) return <p className="empty">Loading…</p>;
  const t = d.data;
  const toggleLogs = (v: boolean) => { setShowLogs(v); logs.reload(); };
  if (t.managedByEnv) return <FromEnvironment d={t} logs={logs.data?.lines ?? []} showLogs={showLogs} setShowLogs={toggleLogs} />;

  const save = async (body: Record<string, unknown>, ok = 'Saved.') => {
    setMsg(null);
    try { await api('/tunnel', { method: 'PUT', body }); d.reload(); setMsg({ ok: true, text: ok }); return true; }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
  };
  // Why Access protection is ticked but not in place, in plain words.
  const protectProblem = t.protect && !t.protectApplied ? (t.accessPeople === 0 ? 'Nobody is on the allowed list, so Cloudflare Access would let no one in. Add an email or a whole domain under Settings, Sign-in & access, and Frames sets it up.' : t.error || t.accessNote || 'Not set up yet: Frames applies it when you save, and again a few minutes after a problem.') : null;
  const run = () => (t.config.enabled ? api('/tunnel/stop', { body: {} }) : api('/tunnel/start', { body: {} })).then(() => d.reload()).catch((e: Error) => setMsg({ ok: false, text: e.message }));

  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}

      <div className="field toggle">
        <div>
          <h3 style={{ fontSize: 19 }}>Run the tunnel</h3>
          <p style={{ margin: 0 }}>
            <b className={t.status.state === 'error' ? 'reason' : ''}>{LABEL[t.status.state]}</b>
            {t.status.state === 'connected' && ' — Frames can be reached through Cloudflare.'}
            {t.status.error && <span className="reason"> {t.status.error}</span>}
            {t.status.restarts > 0 && t.status.state !== 'connected' && <span className="muted"> (retry {t.status.restarts})</span>}
          </p>
        </div>
        <button className={'sw' + (t.config.enabled ? ' on' : '')} role="switch" aria-checked={t.config.enabled} aria-label="Run the tunnel" onClick={run} />
      </div>

      <div className="field">
        <h3>1. Let Frames use your Cloudflare account</h3>
        <p>Frames makes the tunnel, its routes and the DNS records itself, and keeps them right when an address changes. It needs your account ID and an API token.</p>
        <ol className="muted" style={{ fontSize: 13.5, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>{link('https://dash.cloudflare.com/profile/api-tokens', 'Create an API token')} (Custom token) with the permissions below, then copy it.</li>
          <li>Your <b>account ID</b> is on the right of the {link('https://dash.cloudflare.com/', 'dashboard')}’s home page for your domain, and in its address after <span className="mono">dash.cloudflare.com/</span>.</li>
        </ol>
        <TokenSheet />
        <div className="form" style={{ marginTop: 12, maxWidth: 560 }}>
          <input aria-label="Account ID" value={account} placeholder="Account ID (32 letters and numbers)" onChange={(e) => setAccount(e.target.value)} />
          <input type="password" autoComplete="off" aria-label="API token" value={apiToken} placeholder={t.hasApiToken ? 'Saved. Type to replace' : 'Paste the API token'} onChange={(e) => setApiToken(e.target.value)} />
          <button className="pill" disabled={account === t.accountId && !apiToken} onClick={async () => { if (await save({ accountId: account, ...(apiToken ? { apiToken } : {}) }, 'Saved. Frames is setting up Cloudflare.')) setApiToken(''); }}>Save</button>
          {t.hasApiToken && <button className="t2" onClick={() => save({ clearApiToken: true, enabled: false }, 'API token removed.')}>Remove it</button>}
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>The token is kept on this server only, never shown again, and left out of backups.</p>
        {t.error && <p className="reason" role="alert" style={{ marginTop: 10 }}>{t.error}</p>}
        {t.orgNote && <p className="muted" role="status" style={{ marginTop: 10, fontSize: 12.5 }}>{t.orgNote}</p>}
        {t.accessNote && <p className="muted" role="status" style={{ marginTop: 10, fontSize: 12.5 }}>{t.accessNote}</p>}
        {!t.error && t.appliedAt && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Cloudflare is set up and matches the addresses below ({new Date(t.appliedAt).toLocaleString()}).</p>}
      </div>

      <div className="field">
        <h3>2. Addresses</h3>
        <p>The App URL is the address you open Frames at from outside. It is the same <b>public address</b> as under Settings, Sign-in & access. Each person sets their own portfolio address under Settings, Portfolio.</p>
        <div className="form" style={{ maxWidth: 560 }}>
          <label>Frames: App URL <input aria-label="App URL" style={{ minWidth: 300 }} value={appUrl} placeholder="https://frames.example.com" onChange={(e) => setAppUrl(e.target.value)} /></label>
          <button className="pill" disabled={appUrl === t.appUrl} onClick={() => save({ appUrl }, 'App URL saved. It is the public address everywhere in Settings now.')}>Save</button>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14 }}>
          <input type="checkbox" aria-label="Portfolios" checked={t.config.portfolios} onChange={(e) => save({ portfolios: e.target.checked })} />
          <span><b>Portfolios</b>: also serve each person’s portfolio through this tunnel. A portfolio address shows only that person’s public portfolio, nothing else.</span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14 }}>
          <input type="checkbox" aria-label="Protect with Cloudflare Access" checked={t.protect} onChange={(e) => save({ protect: e.target.checked })} />
          <span><b>Protect the App URL with Cloudflare Access</b>: Frames sets up the Access login for you, lets in the {t.accessPeople} {t.accessPeople === 1 ? 'entry' : 'entries'} on the allowed list under Settings, Sign-in & access (emails and whole domains), adds <i>Cloudflare Access</i> as a sign-in method and leaves the share links and portfolio public. Needs the API token to have <i>Access: Apps and Policies, Edit</i> and, to add the sign-in method, <i>Access: Organizations, Identity Providers, and Groups, Read</i>. After it is set up, use <b>Test sign-in</b> under Settings, Sign-in & access (through the App URL) and turn on <b>Require sign-in</b> to sign people in from their Access login.</span>
        </label>
        <div style={{ marginTop: 14 }}>
          <label>Who is allowed in (one per line: an email, or a whole domain like @family.com)
            <textarea className="area" rows={3} aria-label="Allowed people" style={{ maxWidth: 520, display: 'block', marginTop: 4 }} value={allow} onChange={(e) => setAllow(e.target.value)} />
          </label>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 8px' }}>The same list as under Settings, Sign-in & access: it is who Cloudflare Access lets in, and who may sign in to Frames.</p>
          <button className="pill" disabled={allow.trim() === t.allow.join('\n')} onClick={() => save({ allow }, 'Allowed list saved.')}>Save the list</button>
        </div>
        {protectProblem && <p className="reason" role="alert" style={{ margin: '8px 0 0 26px', fontSize: 13 }}>{protectProblem}</p>}
        {t.appOpen && <div className="banner" role="status" style={{ marginTop: 14 }}><span>Frames’ own sign-in is off, so anyone who can reach the App URL can use Frames. That is fine if you protect it in Cloudflare (Access, an IP rule); if not, turn on sign-in under Access.</span></div>}
      </div>

      <div className="field">
        <h3>3. What Frames sets up</h3>
        {t.hostnames.length === 0
          ? <p className="muted">Enter the App URL above (and tick Portfolios, once people have set a portfolio address) to see the addresses.</p>
          : (
            <>
              <p>Each address gets a route to this server (<span className="mono">{t.service}</span>) and a proxied DNS record, made and updated by Frames. There is nothing to add in Cloudflare yourself.</p>
              {t.hostnames.map((h) => {
                const login = t.accessApps.find((a) => a.decision === 'allow' && a.addresses.includes(h.hostname));
                const open = t.accessApps.some((a) => a.decision === 'bypass' && a.addresses.some((x) => x === h.hostname || x.startsWith(h.hostname + '/')));
                const policy = h.kind === 'app'
                  ? (login ? `Access: login, allow ${login.who.join(', ') || 'no one'}${open ? '; share links and portfolio public' : ''}` : open ? 'Access: share links and portfolio public, the rest not behind Access' : 'no Access policy')
                  : (open ? 'Access: public, no login' : 'no Access policy');
                const dest = h.kind === 'app' ? t.service.replace(/^https?:\/\//, '') : `portfolio${h.who ? `: ${h.who}` : ''} (only the public portfolio)`;
                return (
                  <div className="row" key={h.hostname} style={{ display: 'block' }}>
                    <span className="mono" style={{ userSelect: 'all' }}>{h.hostname}</span>
                    <span className="faint"> {'>>'} {policy} {'>>'} </span>
                    <span className="mono">{dest}</span>
                  </div>
                );
              })}
              <h4 style={{ margin: '16px 0 4px' }}>Cloudflare Access</h4>
              {protectProblem && <p className="reason" style={{ fontSize: 13, margin: '0 0 6px' }}>Protection is switched on but not in place: {protectProblem}</p>}
              {t.accessNote && <p className="muted" style={{ fontSize: 12.5, margin: '0 0 6px' }}>{t.accessNote}</p>}
              {t.orgNote && <p className="reason" style={{ fontSize: 12.5, margin: '0 0 6px' }}>{t.orgNote}</p>}
              {t.accessApps.length === 0
                ? <p className="muted" style={{ fontSize: 13 }}>{t.protect ? 'No Access applications are set up yet.' : t.hasApiToken ? 'No Access applications yet. Tick “Protect the App URL with Cloudflare Access” above to put a login in front of the app.' : 'Frames sets these up once the API token is saved.'}</p>
                : t.accessApps.map((a) => (
                  <div className="row" key={a.name} style={{ display: 'block' }}>
                    <div><b>{a.name}</b> <span className="faint">{a.decision === 'allow' ? 'login required' : 'public, no login'}</span></div>
                    <div className="mono" style={{ fontSize: 12, userSelect: 'all', wordBreak: 'break-all' }}>{a.addresses.join('  ')}</div>
                    {a.decision === 'allow' && <div className="muted" style={{ fontSize: 12.5 }}>Policy: allow {a.who.length ? a.who.join(', ') : 'no one'}</div>}
                    {a.decision === 'bypass' && <div className="muted" style={{ fontSize: 12.5 }}>Policy: bypass (everyone), so share links and portfolios work without a login. A more specific path wins over a login covering the whole address.</div>}
                  </div>
                ))}
            </>
          )}
      </div>

      <div className="field">
        <button className="t2" onClick={() => toggleLogs(!showLogs)}>{showLogs ? 'Hide' : 'Show'} the tunnel log</button>
        {showLogs && <pre className="mono" style={{ fontSize: 11.5, background: 'var(--surface)', borderRadius: 8, padding: 12, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{logs.data?.lines.length ? logs.data.lines.join('\n') : 'Nothing logged yet.'}</pre>}
      </div>
    </>
  );
}

/** What to pick on Cloudflare's "Create token" screen, laid out the way that screen shows it. */
function TokenSheet() {
  const box = { border: '1px solid var(--line, #3a3a3a)', borderRadius: 10, overflow: 'hidden', marginTop: 12, maxWidth: 560 } as const;
  const head = { padding: '8px 12px', fontWeight: 600, fontSize: 13, background: 'var(--surface, #1a1a1a)' } as const;
  const row = { display: 'grid', gridTemplateColumns: '90px 1fr 70px', gap: 8, padding: '8px 12px', borderTop: '1px solid var(--line, #3a3a3a)', fontSize: 13 } as const;
  const cell = { border: '1px solid var(--line, #3a3a3a)', borderRadius: 8, padding: '4px 10px' } as const;
  const perms: [string, string, string, string][] = [
    ['Account', 'Cloudflare Tunnel', 'Edit', 'always'],
    ['Zone', 'DNS', 'Edit', 'always'],
    ['Account', 'Access: Apps and Policies', 'Edit', 'for Cloudflare Access (the protection box and the public share links)'],
    ['Account', 'Access: Organizations, Identity Providers, and Groups', 'Read', 'for Cloudflare Access sign-in (it finds your team domain)'],
  ];
  return (
    <div role="group" aria-label="API token settings" style={{ maxWidth: 560 }}>
      <div style={box}>
        <div style={head}>Permissions</div>
        {perms.map(([scope, what, level, why]) => (
          <div key={what} style={{ borderTop: '1px solid var(--line, #3a3a3a)' }}>
            <div style={{ ...row, borderTop: 0 }}><span style={cell}>{scope}</span><span style={cell}>{what}</span><span style={cell}>{level}</span></div>
            <div className="muted" style={{ fontSize: 12, padding: '0 12px 8px' }}>{why}</div>
          </div>
        ))}
      </div>
      <div style={box}>
        <div style={head}>Account Resources</div>
        <div style={{ ...row, gridTemplateColumns: '90px 1fr', borderTop: 0 }}><span style={cell}>Include</span><span style={cell}>All accounts (or just yours)</span></div>
      </div>
      <div style={box}>
        <div style={head}>Zone Resources</div>
        <div style={{ ...row, gridTemplateColumns: '90px 130px 1fr', borderTop: 0 }}><span style={cell}>Include</span><span style={cell}>Specific zone</span><span style={cell}>each domain you use: the App URL’s and any portfolio address’s</span></div>
      </div>
    </div>
  );
}

/** A tunnel set up from environment variables (compose file): nothing to edit here, but everything to see. */
function FromEnvironment({ d, logs, showLogs, setShowLogs }: { d: Data; logs: string[]; showLogs: boolean; setShowLogs: (v: boolean) => void }) {
  const { status: st, hostnames, access } = d;
  return (
    <>
      <div className="banner"><span>This tunnel is set up by environment variables (<span className="mono">CLOUDFLARE_API_TOKEN</span>, <span className="mono">APP_HOSTNAME</span>, <span className="mono">ACCESS_EMAILS</span>, <span className="mono">PORTFOLIO_HOSTNAME</span>). To change it, edit them in your compose file and restart Frames.</span></div>
      <div className="field">
        <h3 style={{ fontSize: 19 }}>Status</h3>
        <p style={{ margin: 0 }}>
          <b className={st.state === 'error' ? 'reason' : ''}>{LABEL[st.state]}</b>
          {st.state === 'connected' && ' — Frames can be reached through Cloudflare.'}
          {st.error && <span className="reason"> {st.error}</span>}
        </p>
        {access?.error && <p className="reason" role="alert">{access.error}</p>}
      </div>
      <div className="field">
        <h3>What is reachable</h3>
        {hostnames.length === 0 && <p className="muted">Nothing yet.</p>}
        {hostnames.map((h) => (
          <div className="row" key={h.hostname}>
            <span><span className="mono">{h.hostname}</span> <span className="muted">{h.kind === 'app' ? 'the app' : 'the portfolio only'}</span></span>
            <span className="faint">{h.kind === 'app' ? `Cloudflare Access: ${access?.emails.join(', ') || 'no one'}` : 'public'}</span>
          </div>
        ))}
        {access && access.appHost && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>On the app address, these need no login so that share links and the portfolio work for everyone: <span className="mono">{access.publicPaths.join('  ')}</span>. Everything else needs a valid Cloudflare Access login, and Frames checks it itself.</p>
        )}
      </div>
      <div className="field">
        <button className="t2" onClick={() => setShowLogs(!showLogs)}>{showLogs ? 'Hide' : 'Show'} the tunnel log</button>
        {showLogs && <pre className="mono" style={{ fontSize: 11.5, background: 'var(--surface)', borderRadius: 8, padding: 12, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{logs.length ? logs.join('\n') : 'Nothing logged yet.'}</pre>}
      </div>
    </>
  );
}
