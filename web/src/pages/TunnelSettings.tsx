import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useApi } from '../api';
import { Eyebrow, PSwitch, SCard, SRow } from '../components/srow';

type Host = { hostname: string; kind: 'portfolio' | 'app'; who: string };
type Data = {
  config: { enabled: boolean; portfolios: boolean; env: boolean };
  appUrl: string; hostnames: Host[]; hasToken: boolean; signInOn: boolean; appOpen: boolean; service: string;
  allow: string[]; open: boolean; protect: boolean; protectForced: boolean; protectApplied: boolean; accessPeople: number; accountId: string; hasApiToken: boolean; apiReady: boolean; error: string | null; accessNote: string | null; orgNote: string | null; appliedAt: string | null;
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
  const [help, setHelp] = useState<boolean | null>(null); // null: open while the account ID or the token is missing, folded once both are in
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

      <SCard>
        <SRow title="Run the tunnel" hint={<><b className={t.status.state === 'error' ? 'reason' : ''} style={{ fontWeight: 500 }}>{LABEL[t.status.state]}</b>{t.status.state === 'connected' && ' — Frames can be reached through Cloudflare.'}{t.status.error && <span className="reason"> {t.status.error}</span>}{t.status.restarts > 0 && t.status.state !== 'connected' && <span className="muted"> (retry {t.status.restarts})</span>}</>}>
          <PSwitch on={t.config.enabled} set={() => void run()} label="Run the tunnel" />
        </SRow>
      </SCard>

      <Eyebrow>1 · Let Frames use your Cloudflare account</Eyebrow>
      <SCard>
        {(() => {
          const filled = !!t.accountId && t.hasApiToken;
          const helpOpen = help ?? !filled;
          return (
            <>
              <SRow title="Frames makes the tunnel, its routes and the DNS records itself" hint="And keeps them right when an address changes. It needs your account ID and an API token.">
                <button className="ghost plain" aria-expanded={helpOpen} onClick={() => setHelp(!helpOpen)}>{helpOpen ? 'Hide the steps' : 'How to get them ↗'}</button>
              </SRow>
              {helpOpen && (
                <div className="sdetail">
                  <ol className="muted" style={{ fontSize: 13.5, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                    <li>{link('https://dash.cloudflare.com/profile/api-tokens', 'Create an API token')} (Custom token) with the permissions below, then copy it.</li>
                    <li>Your <b>account ID</b> is on the right of the {link('https://dash.cloudflare.com/', 'dashboard')}’s home page for your domain, and in its address after <span className="mono">dash.cloudflare.com/</span>.</li>
                  </ol>
                  <TokenSheet />
                </div>
              )}
            </>
          );
        })()}
        <SRow title="Account ID" hint={<>On the right of the Cloudflare dashboard home page, and in its address after <span className="mono">dash.cloudflare.com/</span>.</>}><input className="pin" aria-label="Account ID" value={account} placeholder="32 letters and numbers" onChange={(e) => setAccount(e.target.value)} /></SRow>
        <SRow title="API token" hint="Kept on this server only, never shown again, and left out of backups."><input className="pin" type="password" autoComplete="off" aria-label="API token" value={apiToken} placeholder={t.hasApiToken ? 'Saved. Type to replace' : 'Paste the API token'} onChange={(e) => setApiToken(e.target.value)} /></SRow>
        <SRow title={t.error ? 'Cloudflare is not set up' : t.appliedAt ? 'Cloudflare is set up' : 'Not set up yet'} hint={t.error ? <span className="reason" role="alert">{t.error}</span> : t.appliedAt ? `Matches the addresses below · ${new Date(t.appliedAt).toLocaleString()}` : 'Save the account ID and token and Frames sets it up.'}>
          {t.hasApiToken && <button className="ghost plain" onClick={() => save({ clearApiToken: true, enabled: false }, 'API token removed.')}>Remove the token</button>}
          <button className="ghost" disabled={account === t.accountId && !apiToken} onClick={async () => { if (await save({ accountId: account, ...(apiToken ? { apiToken } : {}) }, 'Saved. Frames is setting up Cloudflare.')) setApiToken(''); }}>Save</button>
        </SRow>
      </SCard>
      {t.orgNote && <p className="muted" role="status" style={{ fontSize: 12.5 }}>{t.orgNote}</p>}
      {t.accessNote && <p className="muted" role="status" style={{ fontSize: 12.5 }}>{t.accessNote}</p>}

      <Eyebrow>2 · Addresses</Eyebrow>
      <SCard>
        <SRow title="App URL" hint={<>The address you open Frames at from outside. Same as the public address under <a href="/settings?section=access" style={{ textDecoration: 'underline' }}>Sign-in & access</a>.</>}><span className="mono" aria-label="App URL" style={{ fontSize: 13 }}>{t.appUrl || 'Not set yet'}</span></SRow>
        <SRow title="Portfolios" hint="Also serve each person’s portfolio through this tunnel. A portfolio address shows only that person’s public portfolio."><PSwitch on={t.config.portfolios} set={(v) => void save({ portfolios: v })} label="Portfolios" /></SRow>
        <SRow title="Who can reach the App URL" hint={t.protect ? <>Members: Cloudflare Access checks everyone against the {t.accessPeople} {t.accessPeople === 1 ? 'entry' : 'entries'} on your allowed list before Frames even loads.</> : 'Anyone: Cloudflare lets everyone through; Frames’ own sign-in still applies if it is on.'}>
          <div className="seg" role="radiogroup" aria-label="Who can reach the App URL">
            {([[true, 'Invitation only', 'Members'], [false, 'Open to everyone', 'Anyone']] as const).map(([on, name, short]) => (
              <button key={name} role="radio" aria-checked={t.protect === on} aria-label={name} className={t.protect === on ? 'on' : ''} disabled={t.protectForced && !on} onClick={() => t.protect !== on && void save({ protect: on })}>{short}</button>
            ))}
          </div>
        </SRow>
        {t.protectForced && <p className="muted" style={{ margin: '0 0 14px', fontSize: 12.5 }}>Invitation only is required while only people on the allowed list can sign in. Set Sign-in & access to “Anyone who signs in” to choose yourself. <a href="/settings?section=access" style={{ textDecoration: 'underline' }}>Change who is allowed in</a></p>}
        {!t.open && (
          <SRow title="Members" hint={t.allow.length ? t.allow.join(', ') : 'Nobody on the allowed list yet.'} sub>
            <Link to="/settings?section=people" className="ghost plain">Open Members →</Link>
          </SRow>
        )}
      </SCard>
      <p className="muted" style={{ fontSize: 12.5, maxWidth: 640, margin: '4px 0 0' }}>Either way, share links and portfolios stay public. Invitation only also adds <i>Cloudflare Access</i> as a sign-in method; choosing Open to everyone leaves the Access application in Cloudflare with a public (bypass) policy rather than deleting it. Needs the API token to have <i>Access: Apps and Policies, Edit</i> and, to add the sign-in method, <i>Access: Organizations, Identity Providers, and Groups, Read</i>. After Invitation only is set up, use <b>Test</b> under Settings, Sign-in & access (through the App URL) and turn on <b>Require sign-in</b> to sign people in from their Access login.</p>
      {!t.open && (
        <div style={{ marginTop: 12 }}>
          <label className="muted" style={{ fontSize: 12.5 }}>Who is allowed in (one per line: an email, or a whole domain like @family.com)
            <textarea className="area" rows={3} aria-label="Allowed people" style={{ maxWidth: 520, display: 'block', marginTop: 4, width: '100%' }} value={allow} onChange={(e) => setAllow(e.target.value)} />
          </label>
          <div style={{ marginTop: 8 }}><button className="ghost" disabled={allow.trim() === t.allow.join('\n')} onClick={() => save({ allow }, 'Allowed list saved.')}>Save the list</button></div>
        </div>
      )}
      {t.open && t.protect && <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--warn)' }}>Sign-in & access is set to “Anyone who signs in”, but this policy still only lets in the allowed list.</p>}
      {protectProblem && <p className="reason" role="alert" style={{ margin: '8px 0 0', fontSize: 13 }}>{protectProblem}</p>}
      {t.appOpen && <div className="banner" role="status" style={{ marginTop: 14 }}><span>Frames’ own sign-in is off, so anyone who can reach the App URL can use Frames. That is fine if you protect it in Cloudflare (Access, an IP rule); if not, turn on sign-in under Access.</span></div>}

      <Eyebrow>3 · What Frames sets up</Eyebrow>
      <SCard>
        {t.hostnames.length === 0 && <SRow title="Nothing yet" hint="Enter the App URL (and turn on Portfolios, once people have set a portfolio address) to see the addresses." />}
        {t.hostnames.map((h) => {
          const login = t.accessApps.find((a) => a.decision === 'allow' && a.addresses.includes(h.hostname));
          const open = t.accessApps.some((a) => a.decision === 'bypass' && a.addresses.some((x) => x === h.hostname || x.startsWith(h.hostname + '/')));
          const policy = h.kind === 'app'
            ? (login ? `Access: login, allow ${login.who.join(', ') || 'no one'}${open ? '; share links and portfolio public' : ''}` : open ? 'Access: share links and portfolio public, the rest not behind Access' : 'no Access policy')
            : (open ? 'Access: public, no login' : 'no Access policy');
          const dest = h.kind === 'app' ? t.service.replace(/^https?:\/\//, '') : `portfolio${h.who ? `: ${h.who}` : ''} (only the public portfolio)`;
          return <SRow key={h.hostname} title={<span className="mono" style={{ userSelect: 'all' }}>{h.hostname}</span>} hint={`${policy} → ${dest}`} />;
        })}
      </SCard>

      <Eyebrow>Cloudflare Access policies</Eyebrow>
      <SCard>
        {t.accessApps.length === 0 && <SRow title="No Access applications" hint={t.protect ? 'None are set up yet.' : t.hasApiToken ? 'Choose Invitation only above to put a login in front of the app.' : 'Frames sets these up once the API token is saved.'} />}
        {t.accessApps.map((a) => (
          <SRow key={a.name} title={<>{a.name} <span className="faint" style={{ fontSize: 12.5 }}>· {a.decision === 'allow' ? 'login required' : 'public, no login'}</span></>}
            hint={<><span className="mono" style={{ userSelect: 'all' }}>{a.addresses.join('  ')}</span> · {a.decision === 'allow' ? `Policy: allow ${a.who.length ? a.who.join(', ') : 'no one'}` : 'Policy: bypass (everyone), so share links and portfolios work without a login. A more specific path wins over a login covering the whole address.'}</>} />
        ))}
        <SRow title="Tunnel log" hint="What cloudflared reported, newest last."><button className="ghost" onClick={() => toggleLogs(!showLogs)}>{showLogs ? 'Hide' : 'Show'}</button></SRow>
      </SCard>
      {showLogs && <pre className="mono" style={{ fontSize: 11.5, background: 'var(--surface)', borderRadius: 8, padding: 12, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{logs.data?.lines.length ? logs.data.lines.join('\n') : 'Nothing logged yet.'}</pre>}
    </>
  );
}

/** What to pick on Cloudflare's "Create token" screen, laid out the way that screen shows it. */
export function TokenSheet() {
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
