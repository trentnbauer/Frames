import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { getSecret, setSecret } from './ai.js';
import { CloudflareError, cloudflare } from './cloudflare.js';
import type { Ctx, Row } from './ctx.js';
import { loadAuth, saveAuth } from './auth.js';
import { loadAccess } from './access.js';
import { PUBLIC_DESTINATIONS } from './access.js';
import { loadEnvState } from './tunnelEnv.js';
import { getSetting, setSetting, type DB } from './db.js';

/**
 * A Cloudflare tunnel run by Frames itself: cloudflared (bundled in the Docker image) makes an outbound-only
 * connection to Cloudflare, so you need no open ports. Two ways to set it up:
 *  - token:  you made the tunnel in the Cloudflare dashboard and paste its token.
 *  - api:    you give Frames a scoped API token and it creates the tunnel, its routes and the DNS records.
 *
 * Safety: traffic always goes to this Frames server, never an address you type in. A hostname for the portfolio only
 * shows the portfolio (see portfolio.ts). A hostname for the whole app is allowed with sign-in off, for people who lock the address
 * down in Cloudflare (Access, an IP rule): the page says plainly when nothing in Frames protects it.
 */

export type HostKind = 'portfolio' | 'app';
export type TunnelCfg = {
  enabled: boolean; mode: 'token' | 'api'; accountId: string; tunnelName: string; tunnelId: string;
  hostnames: { hostname: string; kind: HostKind }[];
  dns: Record<string, { zoneId: string; recordId: string }>; // records Frames made, so it only ever removes its own
  /** Set up from environment variables (tunnelEnv.ts): shown read-only, changed by editing the variables. */
  env?: boolean;
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

/**
 * The app's public address (Settings, Access) and the portfolio address (Settings, Portfolio) are the same two addresses as the
 * tunnel's whole-app and portfolio hostnames, so changing one changes the other. This keeps the tunnel's side in step; the callers
 * keep their own side. An environment-managed tunnel is left alone: its variables are the source of truth.
 */
export function linkTunnelHost(sys: DB, kind: HostKind, from: string, to: string): boolean {
  const c = loadTunnel(sys);
  if (c.env) return false;
  const old = from.toLowerCase(), next = to.toLowerCase();
  if (old === next) return false;
  const hostnames = c.hostnames.filter((h) => !(h.kind === kind && h.hostname === old));
  const had = hostnames.length !== c.hostnames.length;
  let out = hostnames;
  if (next) {
    if (c.hostnames.some((h) => h.hostname === next && h.kind !== kind)) return false; // that name is already used for the other kind
    if (!out.some((h) => h.hostname === next)) out = had ? c.hostnames.map((h) => (h.kind === kind && h.hostname === old ? { hostname: next, kind } : h)) : [...out, { hostname: next, kind }];
  }
  if (out.length === c.hostnames.length && out.every((h, i) => h.hostname === c.hostnames[i].hostname && h.kind === c.hostnames[i].kind)) return false;
  saveTunnel(sys, { ...c, hostnames: out });
  return true;
}
export const hostOfUrl = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

export function registerTunnel(app: FastifyInstance, x: Ctx, runner: TunnelRunner) {
  const db = x.sys;
  const port = () => Number(process.env.PORT ?? 3000);
  /** Every portfolio address anyone has set (each person has their own). */
  const portfolioHosts = () => (db.prepare('SELECT host FROM portfolio_hosts ORDER BY user_id').all() as { host: string }[]).map((r) => r.host.toLowerCase());
  const service = () => `http://localhost:${port()}`; // always this server, never a typed-in address

  const dto = (c: TunnelCfg) => ({
    config: { ...c, dns: undefined }, hasToken: !!getSecret(db, 'cloudflare:tunnelToken'), hasApiToken: !!getSecret(db, 'cloudflare:apiToken') || (c.env && !!process.env.CLOUDFLARE_API_TOKEN),
    managedByEnv: !!c.env,
    // For an environment-managed tunnel: who Cloudflare Access lets in, what it leaves public, and the last problem.
    access: c.env ? { appHost: loadAccess(db)?.appHost ?? '', emails: loadAccess(db)?.emails ?? [], publicPaths: PUBLIC_DESTINATIONS, error: loadEnvState(db).error } : null,
    status: { ...runner.status }, portfolioHost: portfolioHosts()[0] ?? '', signInOn: x.isProtected(), service: service(),
    // The whole app is on the internet and Frames itself asks for no sign-in: fine if Cloudflare protects it, so it is a warning, not a block.
    appOpen: c.hostnames.some((h) => h.kind === 'app') && !x.isProtected() && !c.env,
  });

  app.get('/api/tunnel', async () => dto(loadTunnel(db)));
  app.get('/api/tunnel/logs', async () => ({ lines: runner.logs.slice(-100) }));

  /** An environment-managed tunnel is changed by editing its variables, not here. */
  const locked = (rep: any) => loadTunnel(db).env ? rep.code(409).send({ error: 'This tunnel is set up by environment variables (CLOUDFLARE_API_TOKEN, APP_HOSTNAME and the others). Change them and restart Frames.' }) : null;

  /** Validates and saves the setup. Secrets are write-only. Does not touch Cloudflare. */
  app.put('/api/tunnel', async (req, rep) => {
    if (locked(rep)) return;
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

    // --- the addresses are shared with Settings: a portfolio hostname here is the owner's portfolio address, the app hostname is the public address ---
    const fresh = n.hostnames.filter((h) => h.kind === 'portfolio' && !portfolioHosts().includes(h.hostname));
    if (fresh.length > 1) return bad('Only one new portfolio address can be added at a time: it becomes your portfolio’s own address. Add the others from Settings, Portfolio.');
    if (fresh[0] && db.prepare('SELECT 1 FROM portfolio_hosts WHERE host = ?').get(fresh[0].hostname)) return bad(`${fresh[0].hostname} is already used.`);
    if (typeof b.enabled === 'boolean') {
      if (b.enabled && !getSecret(db, 'cloudflare:tunnelToken')) return bad(n.mode === 'token' ? 'Paste the tunnel token first.' : 'Set the tunnel up first (press “Create or update the tunnel”).');
      n.enabled = b.enabled;
    }
    saveTunnel(db, n);
    // The other side of the link.
    if (fresh[0]) setOwnerPortfolioHost(fresh[0].hostname);
    const appOld = cur.hostnames.find((h) => h.kind === 'app')?.hostname ?? '', appNew = n.hostnames.find((h) => h.kind === 'app')?.hostname ?? '';
    if (appNew !== appOld) {
      const a = loadAuth(db);
      if (appNew) saveAuth(db, { ...a, publicUrl: `https://${appNew}` });
      else if (hostOfUrl(a.publicUrl) === appOld) saveAuth(db, { ...a, publicUrl: '' });
    }
    if (n.enabled) { if (b.enabled === true || b.tunnelToken) runner.restart(); } else if (cur.enabled) void runner.stop();
    return dto(n);
  });

  /** The tunnel names a new portfolio address: it becomes the owner's own, replacing the one they had. */
  function setOwnerPortfolioHost(host: string) {
    const owner = x.tenants.owner();
    const cur = getSetting<Record<string, unknown>>(owner.db, 'portfolio', {});
    setSetting(owner.db, 'portfolio', { ...cur, host });
    db.prepare('DELETE FROM portfolio_hosts WHERE user_id = ?').run(owner.user.id);
    db.prepare('INSERT INTO portfolio_hosts(host, user_id) VALUES(?, ?)').run(host, owner.user.id);
  }

  type Applied = { ok: boolean; result: { hostname: string; ok: boolean; detail: string }[]; tunnelId: string };
  class Refused extends Error { constructor(public status: number, message: string) { super(message); } }

  /** API mode: create the tunnel if needed, set its routes, point DNS at it, keep the token. Throws Refused with what to tell the person. */
  async function applyTunnel(): Promise<Applied> {
    const c = loadTunnel(db);
    const apiToken = getSecret(db, 'cloudflare:apiToken');
    if (c.mode !== 'api') throw new Refused(400, 'This is only for automatic setup. Switch the mode first.');
    if (!apiToken || !c.accountId) throw new Refused(400, 'Enter the Cloudflare account ID and an API token first.');
    if (!c.hostnames.length) throw new Refused(400, 'Add at least one hostname.');
    for (const h of c.hostnames) {
      if (h.kind === 'portfolio' && !portfolioHosts().includes(h.hostname)) throw new Refused(400, `${h.hostname} is not the portfolio’s address any more.`);
    }
    const cf = cloudflare(apiToken, c.accountId, x.cfg.cloudflareApi);
    const result: Applied['result'] = [];
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
      throw new Refused(e instanceof CloudflareError && e.status >= 400 && e.status < 500 ? 400 : 502, `Cloudflare said: ${(e as Error).message}`);
    }
  }

  app.post('/api/tunnel/apply', async (_req, rep) => {
    if (locked(rep)) return;
    try { return await applyTunnel(); } catch (e) { if (e instanceof Refused) return rep.code(e.status).send({ error: e.message }); throw e; }
  });

  // After the app's public address or the portfolio address changes, Cloudflare is brought into line too, if the tunnel was set up by
  // Frames (automatic mode, already created). Otherwise there is nothing to do: a token-mode tunnel is routed in the Cloudflare dashboard.
  x.tunnelSync = async () => {
    const c = loadTunnel(db);
    if (c.env || c.mode !== 'api' || !c.tunnelId || !c.hostnames.length || !getSecret(db, 'cloudflare:apiToken')) return null;
    try { await applyTunnel(); return { applied: true }; } catch (e) { return { applied: false, error: (e as Error).message }; }
  };

  app.post('/api/tunnel/start', async (_req, rep) => {
    if (locked(rep)) return;
    if (!getSecret(db, 'cloudflare:tunnelToken')) return rep.code(400).send({ error: 'There is no tunnel token yet.' });
    saveTunnel(db, { ...loadTunnel(db), enabled: true });
    runner.start();
    return dto(loadTunnel(db));
  });
  app.post('/api/tunnel/stop', async (_req, rep) => { if (locked(rep)) return; saveTunnel(db, { ...loadTunnel(db), enabled: false }); await runner.stop(); return dto(loadTunnel(db)); });
}
