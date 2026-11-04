import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { getSecret, setSecret } from './ai.js';
import { loadAccess, PUBLIC_DESTINATIONS } from './access.js';
import { loadAuth, saveAuth } from './auth.js';
import type { Ctx, Row } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { loadEnvState } from './tunnelEnv.js';

/**
 * A Cloudflare tunnel run by Frames itself: cloudflared (bundled in the Docker image) makes an outbound-only connection to
 * Cloudflare, so you need no open ports. You create the tunnel in the Cloudflare dashboard and paste its token here; Frames runs it.
 *
 * The addresses are not typed in twice. The App URL is the public address (Settings, Access), and with "Portfolios" ticked each
 * person's own portfolio address (Settings, Portfolio) comes along. Frames lists them so you can add them as public hostnames in
 * Cloudflare, and traffic always goes to this server, never an address you type in.
 * (Setting the tunnel up through the Cloudflare API is done from environment variables, see tunnelEnv.ts.)
 */

export type HostKind = 'portfolio' | 'app';
export type TunnelCfg = {
  enabled: boolean;
  /** Also serve each person's portfolio address through the tunnel. */
  portfolios: boolean; mode: 'token' | 'api'; accountId: string; tunnelName: string; tunnelId: string;
  hostnames: { hostname: string; kind: HostKind }[];
  dns: Record<string, { zoneId: string; recordId: string }>; // records Frames made, so it only ever removes its own
  /** Set up from environment variables (tunnelEnv.ts): shown read-only, changed by editing the variables. */
  env?: boolean;
};
const DEFAULTS: TunnelCfg = { enabled: false, portfolios: false, mode: 'token', accountId: '', tunnelName: 'Frames', tunnelId: '', hostnames: [], dns: {} };
export const loadTunnel = (db: DB): TunnelCfg => ({ ...DEFAULTS, ...getSetting<Partial<TunnelCfg>>(db, 'tunnel', {}) });
const saveTunnel = (db: DB, c: TunnelCfg) => setSetting(db, 'tunnel', c);

const servicePort = () => Number(process.env.PORT ?? 3000);

/**
 * The routes cloudflared serves, as its own config file: one rule per address from Settings (the App URL, and each person's portfolio
 * address when Portfolios is ticked), all pointing at this server, then a final rule that answers 404 for anything else. A tunnel that
 * is "locally managed" (its routes cannot be edited in the dashboard) reads exactly this; a tunnel managed in the dashboard ignores it.
 */
export function buildIngress(sys: DB, port = servicePort()): string {
  const rules = wantedHostnames(sys).map((h) => `  - hostname: ${h.hostname}\n    service: http://localhost:${port}`);
  return `ingress:\n${[...rules, '  - service: http_status:404'].join('\n')}\n`;
}

/** The tunnel's id is inside its token (base64 JSON: account, tunnel, secret). Only the id is read, and only if it looks like one. */
export function tunnelIdOf(token: string): string {
  try { const t = (JSON.parse(Buffer.from(token.trim(), 'base64').toString('utf8')) as { t?: unknown }).t; return typeof t === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t) ? t.toLowerCase() : ''; } catch { return ''; }
}

export type TunnelStatus = { state: 'stopped' | 'starting' | 'connected' | 'error'; error: string | null; since: string | null; restarts: number };

const freePort = () => new Promise<number>((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); }); s.on('error', reject); });

/** Keeps cloudflared running: starts it, watches it, restarts it with a growing pause if it dies, never logs the token. */
export function createTunnelRunner(db: DB, opts: { bin?: string; backoffMs?: number[] } = {}) {
  const bin = () => opts.bin ?? process.env.CLOUDFLARED_BIN ?? 'cloudflared';
  const backoff = opts.backoffMs ?? [2000, 4000, 8000, 16000, 32000, 60000];
  let configFile = '', lastConfig = '';
  let child: ChildProcess | null = null, wanted = false, timer: NodeJS.Timeout | null = null, poll: NodeJS.Timeout | null = null, port = 0, startedAt = 0;
  const logs: string[] = [];
  const status: TunnelStatus = { state: 'stopped', error: null, since: null, restarts: 0 };
  const set = (state: TunnelStatus['state'], error: string | null = null) => { if (status.state !== state) status.since = new Date().toISOString(); status.state = state; status.error = error; };

  const redact = (line: string, token: string) => {
    let l = line;
    if (token) l = l.split(token).join('[token]');
    return l.replace(/eyJ[A-Za-z0-9_-]{20,}/g, '[token]').slice(0, 400); // tunnel tokens are base64 JSON
  };
  const log = (line: string, token = '') => { for (const l of line.split('\n').filter(Boolean)) { logs.push(redact(l, token)); if (logs.length > 200) logs.shift(); } };

  async function spawnOnce() {
    const token = getSecret(db, 'cloudflare:tunnelToken');
    if (!token) { wanted = false; return set('error', 'No tunnel token is set.'); }
    set('starting');
    port = await freePort();
    // The token goes in the environment, not the command line, so it never shows in a process list.
    const env = { PATH: process.env.PATH ?? '', HOME: '/tmp', TUNNEL_TOKEN: token };
    // Its routes: written fresh each time it starts, into the temporary folder (nothing in it is secret: the token is in the environment).
    try {
      configFile ||= path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'frames-cloudflared-')), 'config.yml');
      lastConfig = buildIngress(db);
      fs.writeFileSync(configFile, lastConfig);
    } catch (e) { return fail(`Could not write the tunnel's routes: ${(e as Error).message}`); }
    startedAt = Date.now();
    let c: ChildProcess;
    try { c = spawn(bin(), ['tunnel', '--config', configFile, '--no-autoupdate', '--metrics', `127.0.0.1:${port}`, 'run'], { env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return fail(`Could not start cloudflared: ${(e as Error).message}`); }
    child = c;
    c.stdout?.on('data', (d) => log(String(d), token));
    c.stderr?.on('data', (d) => log(String(d), token));
    c.on('error', (e) => { log(`cloudflared: ${e.message}`, token); if (child === c) fail(/ENOENT/.test(e.message) ? 'cloudflared is not installed in this image.' : e.message); });
    c.on('exit', (code) => {
      if (poll) clearInterval(poll);
      if (child !== c) return; // an old process we already replaced
      child = null;
      if (!wanted) return set('stopped');
      fail(`cloudflared stopped (exit ${code ?? 'signal'}). Retrying.`);
    });
    // "Ready" means it has a connection to Cloudflare.
    poll = setInterval(async () => {
      try { const r = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(1500) }); if (r.ok && child === c && wanted) { set('connected'); if (Date.now() - startedAt > 60_000) status.restarts = 0; } else if (status.state === 'connected') set('starting'); } catch { /* not up yet */ }
    }, 1000);
    poll.unref();
  }
  function fail(msg: string) {
    set('error', msg);
    if (!wanted) return;
    const wait = backoff[Math.min(status.restarts, backoff.length - 1)];
    status.restarts++;
    timer = setTimeout(() => { timer = null; if (wanted) void spawnOnce(); }, wait);
    timer.unref();
  }

  return {
    status, logs,
    start() { if (wanted && (child || timer)) return; wanted = true; status.restarts = 0; void spawnOnce(); },
    async stop() {
      wanted = false;
      if (timer) { clearTimeout(timer); timer = null; }
      if (poll) clearInterval(poll);
      const c = child; child = null;
      if (c && c.exitCode === null) { await new Promise<void>((r) => { c.once('exit', () => r()); c.kill('SIGTERM'); setTimeout(() => { c.kill('SIGKILL'); r(); }, 5000).unref(); }); }
      set('stopped');
    },
    restart() { void this.stop().then(() => this.start()); },
    /** The addresses may have changed: restart with the new routes, but only if the routes really are different. */
    refresh() { if (wanted && child && buildIngress(db) !== lastConfig) this.restart(); },
  };
}
export type TunnelRunner = ReturnType<typeof createTunnelRunner>;

export const hostOfUrl = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

export type Wanted = { hostname: string; kind: HostKind; who: string };
/** The addresses to add as public hostnames in Cloudflare, worked out from Settings every time rather than kept in a second list. */
export function wantedHostnames(sys: DB): Wanted[] {
  const c = loadTunnel(sys);
  if (c.env) return c.hostnames.map((h) => ({ ...h, who: '' })); // an environment-managed tunnel says what it made
  const app = hostOfUrl(loadAuth(sys).publicUrl);
  const people = c.portfolios
    ? (sys.prepare('SELECT h.host host, u.name name, u.email email FROM portfolio_hosts h JOIN users u ON u.id = h.user_id ORDER BY h.user_id').all() as { host: string; name: string; email: string }[])
    : [];
  return [...(app ? [{ hostname: app, kind: 'app' as const, who: '' }] : []), ...people.map((p) => ({ hostname: p.host.toLowerCase(), kind: 'portfolio' as const, who: p.name || p.email }))];
}

export function registerTunnel(app: FastifyInstance, x: Ctx, runner: TunnelRunner) {
  const db = x.sys;
  const port = () => Number(process.env.PORT ?? 3000);
  const service = () => `http://localhost:${port()}`; // always this server, never a typed-in address

  const dto = (c: TunnelCfg) => {
    const hostnames = wantedHostnames(db);
    return {
      config: { enabled: c.enabled, portfolios: c.portfolios, env: !!c.env },
      appUrl: loadAuth(db).publicUrl, hostnames, hasToken: !!getSecret(db, 'cloudflare:tunnelToken'),
      status: { ...runner.status }, signInOn: x.isProtected(), service: service(),
      managedByEnv: !!c.env,
      // A locally managed tunnel has its routes written by Frames, so the one step left is a DNS record per address, pointing at the tunnel.
      dns: tunnelIdOf(getSecret(db, 'cloudflare:tunnelToken')) ? hostnames.map((h) => ({ name: h.hostname, target: `${tunnelIdOf(getSecret(db, 'cloudflare:tunnelToken'))}.cfargotunnel.com` })) : [],
      // The whole app is on the internet and Frames itself asks for no sign-in: fine if Cloudflare protects it, so it is a warning, not a block.
      appOpen: hostnames.some((h) => h.kind === 'app') && !x.isProtected() && !c.env,
      // For an environment-managed tunnel: who Cloudflare Access lets in, what it leaves public, and the last problem.
      access: c.env ? { appHost: loadAccess(db)?.appHost ?? '', emails: loadAccess(db)?.emails ?? [], publicPaths: PUBLIC_DESTINATIONS, error: loadEnvState(db).error } : null,
    };
  };

  x.tunnelRefresh = () => runner.refresh();
  app.get('/api/tunnel', async () => dto(loadTunnel(db)));
  app.get('/api/tunnel/logs', async () => ({ lines: runner.logs.slice(-100) }));

  /** An environment-managed tunnel is changed by editing its variables, not here. */
  const locked = (rep: any) => loadTunnel(db).env ? rep.code(409).send({ error: 'This tunnel is set up by environment variables (CLOUDFLARE_API_TOKEN, APP_HOSTNAME and the others). Change them and restart Frames.' }) : null;

  /** The App URL, the Portfolios box and the token. The App URL is the same public address as under Settings, Access. */
  app.put('/api/tunnel', async (req, rep) => {
    if (locked(rep)) return;
    const b = (req.body ?? {}) as Row;
    const cur = loadTunnel(db);
    const n: TunnelCfg = { ...cur };
    const bad = (error: string) => rep.code(400).send({ error });
    if (b.appUrl !== undefined) {
      const v = String(b.appUrl).trim().replace(/\/+$/, '');
      if (v) { try { const u = new URL(v); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(); } catch { return bad('The App URL must start with https:// (for example https://frames.example.com)'); } }
      saveAuth(db, { ...loadAuth(db), publicUrl: v.slice(0, 300) });
    }
    if (typeof b.portfolios === 'boolean') n.portfolios = b.portfolios;
    if (typeof b.tunnelToken === 'string' && b.tunnelToken.trim()) setSecret(db, 'cloudflare:tunnelToken', b.tunnelToken.trim().slice(0, 4000));
    if (b.clearTunnelToken === true) setSecret(db, 'cloudflare:tunnelToken', '');
    if (typeof b.enabled === 'boolean') {
      if (b.enabled && !getSecret(db, 'cloudflare:tunnelToken')) return bad('Paste the tunnel token first.');
      n.enabled = b.enabled;
    }
    saveTunnel(db, n);
    if (n.enabled) { if (b.enabled === true || b.tunnelToken) runner.restart(); else runner.refresh(); } else if (cur.enabled) void runner.stop();
    return dto(n);
  });

  app.post('/api/tunnel/start', async (_req, rep) => {
    if (locked(rep)) return;
    if (!getSecret(db, 'cloudflare:tunnelToken')) return rep.code(400).send({ error: 'There is no tunnel token yet.' });
    saveTunnel(db, { ...loadTunnel(db), enabled: true });
    runner.start();
    return dto(loadTunnel(db));
  });
  app.post('/api/tunnel/stop', async (_req, rep) => { if (locked(rep)) return; saveTunnel(db, { ...loadTunnel(db), enabled: false }); await runner.stop(); return dto(loadTunnel(db)); });
}
