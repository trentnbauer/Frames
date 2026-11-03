import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { getSecret, setSecret } from './ai.js';
import { CloudflareError, cloudflare } from './cloudflare.js';
import type { Ctx, Row } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { loadPortfolio } from './portfolio.js';

/**
 * A Cloudflare tunnel run by Frames itself: cloudflared (bundled in the Docker image) makes an outbound-only
 * connection to Cloudflare, so you need no open ports. Two ways to set it up:
 *  - token:  you made the tunnel in the Cloudflare dashboard and paste its token.
 *  - api:    you give Frames a scoped API token and it creates the tunnel, its routes and the DNS records.
 *
 * Safety: traffic always goes to this Frames server, never an address you type in. A hostname for the portfolio only
 * shows the portfolio (see portfolio.ts). A hostname for the whole app is refused unless sign-in is on.
 */

export type HostKind = 'portfolio' | 'app';
export type TunnelCfg = {
  enabled: boolean; mode: 'token' | 'api'; accountId: string; tunnelName: string; tunnelId: string;
  hostnames: { hostname: string; kind: HostKind }[];
  dns: Record<string, { zoneId: string; recordId: string }>; // records Frames made, so it only ever removes its own
};
const DEFAULTS: TunnelCfg = { enabled: false, mode: 'token', accountId: '', tunnelName: 'Frames', tunnelId: '', hostnames: [], dns: {} };
export const loadTunnel = (db: DB): TunnelCfg => ({ ...DEFAULTS, ...getSetting<Partial<TunnelCfg>>(db, 'tunnel', {}) });
const saveTunnel = (db: DB, c: TunnelCfg) => setSetting(db, 'tunnel', c);

export type TunnelStatus = { state: 'stopped' | 'starting' | 'connected' | 'error'; error: string | null; since: string | null; restarts: number };

const freePort = () => new Promise<number>((resolve, reject) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = (s.address() as net.AddressInfo).port; s.close(() => resolve(p)); }); s.on('error', reject); });

/** Keeps cloudflared running: starts it, watches it, restarts it with a growing pause if it dies, never logs the token. */
export function createTunnelRunner(db: DB, opts: { bin?: string; backoffMs?: number[] } = {}) {
  const bin = () => opts.bin ?? process.env.CLOUDFLARED_BIN ?? 'cloudflared';
  const backoff = opts.backoffMs ?? [2000, 4000, 8000, 16000, 32000, 60000];
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
    startedAt = Date.now();
    let c: ChildProcess;
    try { c = spawn(bin(), ['tunnel', '--no-autoupdate', '--metrics', `127.0.0.1:${port}`, 'run'], { env, stdio: ['ignore', 'pipe', 'pipe'] }); }
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
  };
}
export type TunnelRunner = ReturnType<typeof createTunnelRunner>;

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function registerTunnel(app: FastifyInstance, x: Ctx, runner: TunnelRunner) {
  const { db, cfg } = x;
  const port = () => Number(process.env.PORT ?? 3000);
  const service = () => `http://localhost:${port()}`; // always this server, never a typed-in address

  const dto = (c: TunnelCfg) => ({
    config: { ...c, dns: undefined }, hasToken: !!getSecret(db, 'cloudflare:tunnelToken'), hasApiToken: !!getSecret(db, 'cloudflare:apiToken'),
    status: { ...runner.status }, portfolioHost: loadPortfolio(db).host, signInOn: x.isProtected(), service: service(),
  });

  app.get('/api/tunnel', async () => dto(loadTunnel(db)));
  app.get('/api/tunnel/logs', async () => ({ lines: runner.logs.slice(-100) }));

  /** Validates and saves the setup. Secrets are write-only. Does not touch Cloudflare. */
  app.put('/api/tunnel', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const cur = loadTunnel(db);
    const n: TunnelCfg = { ...cur, hostnames: [...cur.hostnames] };
    const bad = (error: string) => rep.code(400).send({ error });
    if (b.mode !== undefined) { if (b.mode !== 'token' && b.mode !== 'api') return bad('Unknown mode'); n.mode = b.mode; }
    if (b.accountId !== undefined) { const v = String(b.accountId).trim(); if (v && !/^[0-9a-f]{32}$/i.test(v)) return bad('The account ID is 32 letters and numbers (find it in the Cloudflare dashboard).'); n.accountId = v; }
    if (b.tunnelName !== undefined) n.tunnelName = String(b.tunnelName).trim().slice(0, 60) || 'Frames';
    if (Array.isArray(b.hostnames)) {
      const seen = new Set<string>();
      n.hostnames = [];
      for (const h of b.hostnames.slice(0, 10)) {
        const hostname = String(h.hostname ?? '').trim().toLowerCase();
        const kind: HostKind = h.kind === 'app' ? 'app' : 'portfolio';
        if (!HOSTNAME.test(hostname)) return bad(`“${hostname}” is not a valid hostname`);
        if (seen.has(hostname)) return bad(`${hostname} is listed twice`);
        seen.add(hostname);
        n.hostnames.push({ hostname, kind });
      }
    }
    if (typeof b.tunnelToken === 'string' && b.tunnelToken.trim()) setSecret(db, 'cloudflare:tunnelToken', b.tunnelToken.trim().slice(0, 4000));
    if (typeof b.apiToken === 'string' && b.apiToken.trim()) setSecret(db, 'cloudflare:apiToken', b.apiToken.trim().slice(0, 500));
    if (b.clearTunnelToken === true) setSecret(db, 'cloudflare:tunnelToken', '');
    if (b.clearApiToken === true) setSecret(db, 'cloudflare:apiToken', '');

    // --- what each hostname is allowed to expose ---
    const pf = loadPortfolio(db);
    for (const h of n.hostnames) {
      if (h.kind === 'portfolio' && h.hostname !== pf.host.toLowerCase()) return bad(`Set ${h.hostname} as the portfolio’s own address first (Settings, Portfolio). Then the tunnel shows only the portfolio on it.`);
      if (h.kind === 'app' && !x.isProtected()) return bad(`Turn on sign-in before exposing the whole app at ${h.hostname}. Without it, anyone on the internet could use Frames.`);
    }
    if (typeof b.enabled === 'boolean') {
      if (b.enabled && !getSecret(db, 'cloudflare:tunnelToken')) return bad(n.mode === 'token' ? 'Paste the tunnel token first.' : 'Set the tunnel up first (press “Create or update the tunnel”).');
      n.enabled = b.enabled;
    }
    saveTunnel(db, n);
    if (n.enabled) { if (b.enabled === true || b.tunnelToken) runner.restart(); } else if (cur.enabled) void runner.stop();
    return dto(n);
  });

  /** API mode: create the tunnel if needed, set its routes, point DNS at it, keep the token. */
  app.post('/api/tunnel/apply', async (_req, rep) => {
    const c = loadTunnel(db);
    const apiToken = getSecret(db, 'cloudflare:apiToken');
    if (c.mode !== 'api') return rep.code(400).send({ error: 'This is only for automatic setup. Switch the mode first.' });
    if (!apiToken || !c.accountId) return rep.code(400).send({ error: 'Enter the Cloudflare account ID and an API token first.' });
    if (!c.hostnames.length) return rep.code(400).send({ error: 'Add at least one hostname.' });
    const pf = loadPortfolio(db);
    for (const h of c.hostnames) {
      if (h.kind === 'portfolio' && h.hostname !== pf.host.toLowerCase()) return rep.code(400).send({ error: `${h.hostname} is not the portfolio’s address any more.` });
      if (h.kind === 'app' && !x.isProtected()) return rep.code(400).send({ error: `Sign-in is off, so ${h.hostname} cannot expose the app.` });
    }
    const cf = cloudflare(apiToken, c.accountId, cfg.cloudflareApi);
    const result: { hostname: string; ok: boolean; detail: string }[] = [];
    try {
      const zones = new Map<string, { id: string; name: string }>();
      for (const h of c.hostnames) zones.set(h.hostname, await cf.zoneFor(h.hostname)); // fail before changing anything
      let id = c.tunnelId;
      if (!id || !(await cf.tunnelExists(id))) id = (await cf.createTunnel(c.tunnelName)).id;
      await cf.setRoutes(id, c.hostnames.map((h) => ({ hostname: h.hostname, service: service() })));
      const dns: TunnelCfg['dns'] = {};
      for (const h of c.hostnames) {
        const z = zones.get(h.hostname)!;
        try { dns[h.hostname] = { zoneId: z.id, recordId: await cf.pointDns(z.id, h.hostname, id) }; result.push({ hostname: h.hostname, ok: true, detail: `Points at the tunnel (${z.name})` }); }
        catch (e) { result.push({ hostname: h.hostname, ok: false, detail: (e as Error).message }); }
      }
      // Remove only DNS records Frames made for hostnames you have since taken off.
      for (const [host, rec] of Object.entries(c.dns)) if (!c.hostnames.some((h) => h.hostname === host)) await cf.removeDns(rec.zoneId, rec.recordId);
      setSecret(db, 'cloudflare:tunnelToken', await cf.token(id));
      saveTunnel(db, { ...c, tunnelId: id, dns });
      if (c.enabled) runner.restart();
      return { ok: result.every((r) => r.ok), result, tunnelId: id };
    } catch (e) {
      const status = e instanceof CloudflareError && e.status >= 400 && e.status < 500 ? 400 : 502;
      return rep.code(status).send({ error: `Cloudflare said: ${(e as Error).message}` });
    }
  });

  app.post('/api/tunnel/start', async (_req, rep) => {
    if (!getSecret(db, 'cloudflare:tunnelToken')) return rep.code(400).send({ error: 'There is no tunnel token yet.' });
    saveTunnel(db, { ...loadTunnel(db), enabled: true });
    runner.start();
    return dto(loadTunnel(db));
  });
  app.post('/api/tunnel/stop', async () => { saveTunnel(db, { ...loadTunnel(db), enabled: false }); await runner.stop(); return dto(loadTunnel(db)); });
}
