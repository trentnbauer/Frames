import { useEffect, useState } from 'react';
import { api, useApi } from '../api';

type Host = { hostname: string; kind: 'portfolio' | 'app' };
type Data = {
  config: { enabled: boolean; mode: 'token' | 'api'; accountId: string; tunnelName: string; tunnelId: string; hostnames: Host[] };
  hasToken: boolean; hasApiToken: boolean; portfolioHost: string; signInOn: boolean; appOpen: boolean; service: string;
  managedByEnv: boolean; access: { appHost: string; emails: string[]; publicPaths: string[]; error: string | null } | null;
  status: { state: 'stopped' | 'starting' | 'connected' | 'error'; error: string | null; since: string | null; restarts: number };
};

const LABEL = { stopped: 'Stopped', starting: 'Connecting…', connected: 'Connected', error: 'Problem' } as const;

/** Reach Frames from outside your network through Cloudflare, with no open ports. */
export function TunnelSettings() {
  const d = useApi<Data>('/tunnel');
  const logs = useApi<{ lines: string[] }>('/tunnel/logs');
  const [hosts, setHosts] = useState<Host[]>([]);
  const [account, setAccount] = useState('');
  const [name, setName] = useState('Frames');
  const [tunnelToken, setTunnelToken] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [applied, setApplied] = useState<{ hostname: string; ok: boolean; detail: string }[] | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const c = d.data?.config;
  useEffect(() => { if (c) { setHosts(c.hostnames); setAccount(c.accountId); setName(c.tunnelName); } }, [c]);
  // Keep the status fresh while this page is open.
  useEffect(() => { const t = setInterval(() => { d.reload(); if (showLogs) logs.reload(); }, 3000); return () => clearInterval(t); }, [showLogs]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d.data || !c) return <p className="empty">Loading…</p>;
  const { status } = d.data;
  if (d.data.managedByEnv) return <FromEnvironment d={d.data} logs={logs.data?.lines ?? []} showLogs={showLogs} setShowLogs={(v) => { setShowLogs(v); logs.reload(); }} />;

  const save = async (body: Record<string, unknown>, ok = 'Saved.') => {
    setMsg(null);
    try { await api('/tunnel', { method: 'PUT', body }); d.reload(); setMsg({ ok: true, text: ok }); return true; }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); return false; }
  };
  const saveAll = async () => {
    const ok = await save({ accountId: account, tunnelName: name, hostnames: hosts, ...(tunnelToken ? { tunnelToken } : {}), ...(apiToken ? { apiToken } : {}) }, 'Saved.');
    if (ok) { setTunnelToken(''); setApiToken(''); }
    return ok;
  };
  const apply = async () => {
    if (!(await saveAll())) return;
    try { const r = await api<{ ok: boolean; result: { hostname: string; ok: boolean; detail: string }[] }>('/tunnel/apply', { body: {} }); setApplied(r.result); d.reload(); setMsg({ ok: r.ok, text: r.ok ? 'The tunnel is set up. Turn it on below.' : 'Some hostnames need attention (below).' }); }
    catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
  };
  const run = async () => (c.enabled ? api('/tunnel/stop', { body: {} }) : api('/tunnel/start', { body: {} })).then(() => d.reload()).catch((e: Error) => setMsg({ ok: false, text: e.message }));
  const addHost = (kind: Host['kind']) => { setHosts([...hosts, { hostname: kind === 'portfolio' ? d.data!.portfolioHost : '', kind }]); };

  return (
    <>
      {msg && <div className="banner" role={msg.ok ? 'status' : 'alert'}><span className={msg.ok ? '' : 'reason'}>{msg.text}</span></div>}

      <div className="field toggle">
        <div>
          <h3 style={{ fontSize: 19 }}>Run the tunnel</h3>
          <p style={{ margin: 0 }}>
            <b className={status.state === 'error' ? 'reason' : ''}>{LABEL[status.state]}</b>
            {status.state === 'connected' && ' — Frames can be reached through Cloudflare.'}
            {status.error && <span className="reason"> {status.error}</span>}
            {status.restarts > 0 && status.state !== 'connected' && <span className="muted"> (retry {status.restarts})</span>}
          </p>
        </div>
        <button className={'sw' + (c.enabled ? ' on' : '')} role="switch" aria-checked={c.enabled} aria-label="Run the tunnel" onClick={run} />
      </div>

      <div className="field">
        <h3>How to set it up</h3>
        <div className="cards2" role="radiogroup" aria-label="Setup mode">
          <button role="radio" aria-checked={c.mode === 'token'} className={'opt' + (c.mode === 'token' ? ' sel' : '')} onClick={() => save({ mode: 'token' })}><b>I have a tunnel token</b>You made the tunnel in the Cloudflare dashboard and paste its token.</button>
          <button role="radio" aria-checked={c.mode === 'api'} className={'opt' + (c.mode === 'api' ? ' sel' : '')} onClick={() => save({ mode: 'api' })}><b>Set it up for me</b>Give Frames an API token. It creates the tunnel, its routes and the DNS records.</button>
        </div>
        {c.mode === 'token' ? (
          <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 520, marginTop: 14 }}>
            <label>Tunnel token <input type="password" autoComplete="off" aria-label="Tunnel token" value={tunnelToken} placeholder={d.data.hasToken ? 'Saved. Type to replace' : 'Paste the token'} onChange={(e) => setTunnelToken(e.target.value)} /></label>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>In the dashboard, add each public hostname below to the tunnel and point it at <span className="mono" style={{ userSelect: 'all' }}>{d.data.service}</span>.</p>
          </div>
        ) : (
          <div className="form" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, maxWidth: 520, marginTop: 14 }}>
            <label>Account ID <input aria-label="Account ID" value={account} placeholder="32 letters and numbers, from the dashboard" onChange={(e) => setAccount(e.target.value)} /></label>
            <label>API token <input type="password" autoComplete="off" aria-label="API token" value={apiToken} placeholder={d.data.hasApiToken ? 'Saved. Type to replace' : 'Paste the API token'} onChange={(e) => setApiToken(e.target.value)} /></label>
            <label>Tunnel name <input aria-label="Tunnel name" value={name} onChange={(e) => setName(e.target.value)} /></label>
            <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>The token needs only <b>Account: Cloudflare Tunnel: Edit</b> and <b>Zone: DNS: Edit</b> (plus Zone: Read), limited to your domain. It is kept on this server only, never shown again, and left out of backups.</p>
          </div>
        )}
      </div>

      <div className="field">
        <h3>What is reachable from outside</h3>
        <p>Everything goes to this Frames server, nothing else. A <b>portfolio</b> address shows only the public portfolio: no app, no share links, nothing private. The <b>whole app</b> address gives access to everything, so lock it down in Cloudflare (for example Cloudflare Access) or turn on sign-in. These addresses are shared with Settings: the whole-app address is the public address under Access, and the portfolio address is the one under Portfolio, so changing one changes the other.</p>
        {hosts.map((h, i) => (
          <div className="form" key={i} style={{ marginBottom: 8 }}>
            <input aria-label={`Hostname ${i + 1}`} style={{ minWidth: 280 }} value={h.hostname} placeholder={h.kind === 'portfolio' ? 'photography.example.com' : 'frames.example.com'} onChange={(e) => setHosts(hosts.map((x, j) => (j === i ? { ...x, hostname: e.target.value } : x)))} />
            <select aria-label={`Hostname ${i + 1} shows`} value={h.kind} onChange={(e) => setHosts(hosts.map((x, j) => (j === i ? { ...x, kind: e.target.value as Host['kind'] } : x)))}>
              <option value="portfolio">Only the portfolio</option><option value="app">The whole app</option>
            </select>
            <button className="t2" onClick={() => setHosts(hosts.filter((_, j) => j !== i))}>Remove</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          <button className="pill" onClick={() => addHost('portfolio')}>Add the portfolio address</button>
          <button className="pill" onClick={() => addHost('app')}>Add the whole app</button>
        </div>
        {!d.data.portfolioHost && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Set the portfolio’s own address first (Settings, Portfolio), then add it here.</p>}
        {d.data.appOpen && <p className="banner" role="status" style={{ marginTop: 10 }}><span>Frames’ own sign-in is off, so anyone who can reach the whole-app address can use Frames. That is fine if you protect it in Cloudflare (Access, an IP rule); if not, turn on sign-in under Access.</span></p>}
      </div>

      <div className="field">
        {c.mode === 'api'
          ? <button className="pill primary" onClick={apply}>{c.tunnelId ? 'Update the tunnel' : 'Create the tunnel'}</button>
          : <button className="pill primary" onClick={saveAll}>Save</button>}
        {applied && (
          <div style={{ marginTop: 12 }}>
            {applied.map((r) => <div className="row" key={r.hostname}><span>{r.hostname}</span><span className={r.ok ? 'faint' : 'reason'}>{r.detail}</span></div>)}
          </div>
        )}
      </div>

      <div className="field">
        <button className="t2" onClick={() => { setShowLogs(!showLogs); logs.reload(); }}>{showLogs ? 'Hide' : 'Show'} the tunnel log</button>
        {showLogs && <pre className="mono" style={{ fontSize: 11.5, background: 'var(--surface)', borderRadius: 8, padding: 12, maxHeight: 260, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{logs.data?.lines.length ? logs.data.lines.join('\n') : 'Nothing logged yet.'}</pre>}
      </div>
    </>
  );
}

/** A tunnel set up from environment variables (compose file): nothing to edit here, but everything to see. */
function FromEnvironment({ d, logs, showLogs, setShowLogs }: { d: Data; logs: string[]; showLogs: boolean; setShowLogs: (v: boolean) => void }) {
  const { status, config, access } = d;
  return (
    <>
      <div className="banner"><span>This tunnel is set up by environment variables (<span className="mono">CLOUDFLARE_API_TOKEN</span>, <span className="mono">APP_HOSTNAME</span>, <span className="mono">ACCESS_EMAILS</span>, <span className="mono">PORTFOLIO_HOSTNAME</span>). To change it, edit them in your compose file and restart Frames.</span></div>
      <div className="field">
        <h3 style={{ fontSize: 19 }}>Status</h3>
        <p style={{ margin: 0 }}>
          <b className={status.state === 'error' ? 'reason' : ''}>{LABEL[status.state]}</b>
          {status.state === 'connected' && ' — Frames can be reached through Cloudflare.'}
          {status.error && <span className="reason"> {status.error}</span>}
        </p>
        {access?.error && <p className="reason" role="alert">{access.error}</p>}
      </div>
      <div className="field">
        <h3>What is reachable</h3>
        {config.hostnames.length === 0 && <p className="muted">Nothing yet.</p>}
        {config.hostnames.map((h) => (
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
