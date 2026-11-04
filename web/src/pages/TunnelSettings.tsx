import { useEffect, useState } from 'react';
import { api, useApi } from '../api';

type Host = { hostname: string; kind: 'portfolio' | 'app'; who: string };
type Data = {
  config: { enabled: boolean; portfolios: boolean; env: boolean };
  appUrl: string; hostnames: Host[]; hasToken: boolean; signInOn: boolean; appOpen: boolean; service: string;
  status: { state: 'stopped' | 'starting' | 'connected' | 'error'; error: string | null; since: string | null; restarts: number };
  dns: { name: string; target: string }[]; managedByEnv: boolean; access: { appHost: string; emails: string[]; publicPaths: string[]; error: string | null } | null;
};

const LABEL = { stopped: 'Stopped', starting: 'Connecting…', connected: 'Connected', error: 'Problem' } as const;
const link = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>{text}</a>;

/** Reach Frames from outside through a Cloudflare tunnel you made in the Cloudflare dashboard, with no open ports. */
export function TunnelSettings() {
  const d = useApi<Data>('/tunnel');
  const logs = useApi<{ lines: string[] }>('/tunnel/logs');
  const [appUrl, setAppUrl] = useState('');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  useEffect(() => { if (d.data) setAppUrl(d.data.appUrl); }, [d.data?.appUrl]); // eslint-disable-line react-hooks/exhaustive-deps
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
        <h3>1. Make the tunnel in Cloudflare</h3>
        <ol className="muted" style={{ fontSize: 13.5, margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
          <li>{link('https://dash.cloudflare.com/?to=/:account/tunnels', 'Open Tunnels in Cloudflare')}, press <b>Create a tunnel</b> and choose <b>Cloudflared</b>. ({link('https://developers.cloudflare.com/tunnel/get-started/', 'Cloudflare’s guide')})</li>
          <li>Name it, pick <b>Docker</b>, and copy the <b>token</b>: the long text after <span className="mono">--token</span>.</li>
          <li>Paste it here.</li>
        </ol>
        <div className="form" style={{ marginTop: 12, maxWidth: 520 }}>
          <input type="password" autoComplete="off" aria-label="Tunnel token" value={token} placeholder={t.hasToken ? 'Saved. Type to replace' : 'Paste the tunnel token'} onChange={(e) => setToken(e.target.value)} />
          <button className="pill" disabled={!token} onClick={async () => { if (await save({ tunnelToken: token }, 'Token saved.')) setToken(''); }}>Save token</button>
          {t.hasToken && <button className="t2" onClick={() => save({ clearTunnelToken: true, enabled: false }, 'Token removed.')}>Remove it</button>}
        </div>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0' }}>The token is kept on this server only, never shown again, and left out of backups.</p>
      </div>

      <div className="field">
        <h3>2. Addresses</h3>
        <p>The App URL is the address you open Frames at from outside. It is the same <b>public address</b> as under Settings, Access. Each person sets their own portfolio address under Settings, Portfolio.</p>
        <div className="form" style={{ maxWidth: 560 }}>
          <label>Frames: App URL <input aria-label="App URL" style={{ minWidth: 300 }} value={appUrl} placeholder="https://frames.example.com" onChange={(e) => setAppUrl(e.target.value)} /></label>
          <button className="pill" disabled={appUrl === t.appUrl} onClick={() => save({ appUrl }, 'App URL saved. It is the public address everywhere in Settings now.')}>Save</button>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14 }}>
          <input type="checkbox" aria-label="Portfolios" checked={t.config.portfolios} onChange={(e) => save({ portfolios: e.target.checked })} />
          <span><b>Portfolios</b>: also serve each person’s portfolio through this tunnel. A portfolio address shows only that person’s public portfolio, nothing else.</span>
        </label>
        {t.appOpen && <div className="banner" role="status" style={{ marginTop: 14 }}><span>Frames’ own sign-in is off, so anyone who can reach the App URL can use Frames. That is fine if you protect it in Cloudflare (Access, an IP rule); if not, turn on sign-in under Access.</span></div>}
      </div>

      <div className="field">
        <h3>3. Point DNS at the tunnel</h3>
        {t.hostnames.length === 0
          ? <p className="muted">Enter the App URL above (and tick Portfolios, once people have set a portfolio address) to see what to do.</p>
          : (
            <>
              <p>Frames writes the tunnel’s routes itself: each address below is served by this server ({link('https://developers.cloudflare.com/tunnel/', 'a locally managed tunnel')}), and the routes change on their own when you change an address. You do not add anything in the tunnel’s Published application routes.</p>
              {t.dns.length > 0
                ? (
                  <>
                    <p>The one thing left is a <b>DNS record</b> for each address, in your domain’s DNS ({link('https://dash.cloudflare.com/?to=/:account/:zone/dns/records', 'open DNS')}): type <b>CNAME</b>, proxied (orange cloud), pointing at the tunnel:</p>
                    {t.dns.map((r) => (
                      <div className="row" key={r.name}>
                        <span className="mono" style={{ userSelect: 'all' }}>{r.name}</span>
                        <span className="faint">CNAME → <span className="mono" style={{ userSelect: 'all' }}>{r.target}</span></span>
                      </div>
                    ))}
                  </>
                )
                : (
                  <>
                    <p>Save the tunnel token above to see the DNS record each address needs. These are the addresses:</p>
                    {t.hostnames.map((h) => <div className="row" key={h.hostname}><span className="mono">{h.hostname}</span><span className="faint">{h.kind === 'app' ? 'Frames (the app)' : `portfolio${h.who ? `: ${h.who}` : ''}`}</span></div>)}
                  </>
                )}
              <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>If Cloudflare says your tunnel is <i>remotely managed</i> (routes editable in the dashboard), it ignores the routes Frames writes: add the addresses as Published application routes there, with the service <span className="mono" style={{ userSelect: 'all' }}>{t.service}</span>.</p>
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
