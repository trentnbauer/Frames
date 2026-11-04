import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { FastifyInstance } from 'fastify';
import { getSecret, setSecret } from './ai.js';
import { loadAccess, PUBLIC_DESTINATIONS } from './access.js';
import { cleanAllow, isAllowed, loadAuth, saveAuth, type Provider } from './auth.js';
import { CloudflareError, cloudflare, type Cloudflare } from './cloudflare.js';
import type { Ctx, Row } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { loadEnvState } from './tunnelEnv.js';

/**
 * A Cloudflare tunnel run by Frames itself: cloudflared (bundled in the Docker image) makes an outbound-only connection to
 * Cloudflare, so you need no open ports. You create the tunnel in the Cloudflare dashboard and paste its token here; Frames runs it.
 *
 * The addresses are not typed in twice. The App URL is the public address (Settings, Sign-in & access), and with "Portfolios" ticked each
 * person's own portfolio address (Settings, Portfolio) comes along. Given a Cloudflare account ID and API token, Frames finds
 * (or makes) its tunnel by name, sets the tunnel's routes to this server and keeps a proxied DNS record for each address, again
 * whenever an address changes. No tunnel id is stored: the tunnel is looked up by its name each time.
 * (Doing the same from environment variables, plus Cloudflare Access, is tunnelEnv.ts.)
 */

export type HostKind = 'portfolio' | 'app';
export type TunnelCfg = {
  enabled: boolean;
  /** Also serve each person's portfolio address through the tunnel. */
  portfolios: boolean;
  /** Put the App URL behind Cloudflare Access, letting in the people on the Settings, Sign-in & access list, and sign them in to Frames from it. */
  protect: boolean; protectApplied: boolean;
  /** The person switched the tunnel off themselves: setup keeps it off. Otherwise a tunnel that is set up runs. */
  stopped: boolean; mode: 'token' | 'api'; accountId: string; tunnelName: string; tunnelId: string;
  /** The last problem talking to Cloudflare, and when the last run worked. */
  error: string | null; appliedAt: string | null;
  /** Set when the tunnel is fine but Cloudflare Access could not be told which addresses are public (the token may lack that permission). */
  accessNote: string | null;
  /** The Access login is in place but the team domain could not be read, so the sign-in method waits (a token permission is missing). */
  orgNote: string | null;
  hostnames: { hostname: string; kind: HostKind }[];
  dns: Record<string, { zoneId: string; recordId: string }>; // records Frames made, so it only ever removes its own
  /** Set up from environment variables (tunnelEnv.ts): shown read-only, changed by editing the variables. */
  env?: boolean;
};
const DEFAULTS: TunnelCfg = { enabled: false, portfolios: false, protect: false, protectApplied: false, stopped: false, mode: 'token', accountId: '', tunnelName: 'Frames', tunnelId: '', hostnames: [], dns: {}, error: null, appliedAt: null, accessNote: null, orgNote: null };
export const loadTunnel = (db: DB): TunnelCfg => ({ ...DEFAULTS, ...getSetting<Partial<TunnelCfg>>(db, 'tunnel', {}) });
const saveTunnel = (db: DB, c: TunnelCfg) => setSetting(db, 'tunnel', c);

const servicePort = () => Number(process.env.PORT ?? 3000);

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

/**
 * Cloudflare Access (if you use it to lock the app) must let the public things through: the share links and portfolio paths on the app
 * address, and every portfolio address in full. Two bypass applications, found by name, made when needed and removed when there is
 * nothing left to list. A path-specific bypass wins over an Access application that covers the whole address.
 */
export async function ensureBypass(cf: Cloudflare, appHost: string, portfolioHosts: string[]): Promise<void> {
  const want: { name: string; destinations: string[] }[] = [
    { name: 'Frames public paths', destinations: appHost ? PUBLIC_DESTINATIONS.map((p) => appHost + p) : [] },
    { name: 'Frames portfolio addresses', destinations: portfolioHosts },
  ];
  const existing = await cf.accessApps();
  for (const w of want) {
    const found = existing.find((a) => a.name === w.name);
    if (!w.destinations.length) { if (found) await cf.removeAccessApp(found.id); continue; }
    const a = await cf.saveAccessApp(found?.id ?? null, { name: w.name, destinations: w.destinations, session: '24h' });
    await cf.saveAccessPolicy(a.id, { name: 'Frames: public', decision: 'bypass' });
  }
}

/** Who Cloudflare Access should let in: the emails and whole domains (@family.com) on the allow-list. Account ids mean nothing to Cloudflare. */
export function accessPeople(sys: DB): { emails: string[]; domains: string[] } {
  const allow = loadAuth(sys).allow.map((a) => a.trim().toLowerCase());
  const EMAIL = /^[^\s@,]{1,64}@[^\s@,]{1,190}\.[^\s@,]{2,}$/, DOMAIN = /^@([a-z0-9.-]+\.[a-z]{2,})$/;
  return { emails: allow.filter((a) => EMAIL.test(a)), domains: allow.map((a) => DOMAIN.exec(a)?.[1] ?? '').filter(Boolean) };
}
export const ACCESS_PROVIDER_ID = 'cloudflare';
const accessAppName = (host: string) => `Frames (${host})`;

/** While sign-in is on and only the people on the allowed list may use it, the App URL is protected by Cloudflare Access (when Frames can set that up): it is not a separate choice. */
export const protectForced = (sys: DB) => { const a = loadAuth(sys); return a.enabled && !a.open && hasApi(sys); };
export const protectOn = (sys: DB) => loadTunnel(sys).protect || protectForced(sys);

const ACCOUNT_ID = /^[0-9a-f]{32}$/i;
export const hasApi = (sys: DB) => !!getSecret(sys, 'cloudflare:apiToken') && ACCOUNT_ID.test(loadTunnel(sys).accountId);

/**
 * Makes Cloudflare match Settings: finds or makes the tunnel by name, sets its routes (every address to this server), keeps a proxied
 * DNS record per address and removes the ones it made for addresses that are gone. Safe to repeat; never throws (it runs from timers
 * and request hooks), the problem is kept in the tunnel's settings for the page to show. Only records it made are ever removed.
 */
export async function applyTunnel(sys: DB, runner: TunnelRunner, port = Number(process.env.PORT ?? 3000), apiBase?: string): Promise<void> {
  try {
    const c = loadTunnel(sys);
    if (c.env || !hasApi(sys)) return;
    const hosts = wantedHostnames(sys).map((h) => h.hostname);
    try {
      const cf = cloudflare(getSecret(sys, 'cloudflare:apiToken'), c.accountId, apiBase);
      const zones = new Map<string, { id: string }>();
      for (const h of hosts) zones.set(h, await cf.zoneFor(h)); // fail before changing anything
      const appHost = hostOfUrl(loadAuth(sys).publicUrl);
      // The login first: nothing new is published until the App URL is behind it (the same order as the environment setup).
      let protectApplied = c.protectApplied;
      let orgNote: string | null = null;
      if (protectOn(sys)) {
        if (!appHost) throw new Error('Enter the App URL first: it is the address Cloudflare Access protects.');
        const people = accessPeople(sys);
        if (!people.emails.length && !people.domains.length) throw new Error('Add the people allowed in (an email or a whole domain) under Settings, Sign-in & access first: with nobody on the list, Cloudflare Access would let no one in.');
        // The team domain needs a separate permission (Access: Organizations, Identity Providers, and Groups, Read). Without it the login is
        // still put in place; only the automatic sign-in method has to wait.
        let authDomain = '';
        try { authDomain = await cf.accessDomain(); }
        catch (e) { orgNote = `The Access login is in place, but Frames cannot read your team domain (${e instanceof CloudflareError ? e.message : (e as Error).message}), so it cannot add Cloudflare Access as a sign-in method yet. Add the token permission Account, Access: Organizations, Identity Providers, and Groups, Read.`; }
        const found = (await cf.accessApps()).find((a) => a.name === accessAppName(appHost));
        const main = await cf.saveAccessApp(found?.id ?? null, { name: accessAppName(appHost), destinations: [appHost], session: '24h' });
        await cf.saveAccessPolicy(main.id, { name: 'Frames: allowed people', decision: 'allow', ...people });
        // Frames signs people in from what Access vouches for: the matching sign-in provider is kept up to date.
        const a = loadAuth(sys);
        const want: Provider = { id: ACCESS_PROVIDER_ID, type: 'cloudflare', name: 'Cloudflare Access', clientId: '', teamDomain: authDomain, aud: main.aud };
        const have = a.providers.find((p) => p.id === ACCESS_PROVIDER_ID);
        if (authDomain && JSON.stringify(have) !== JSON.stringify(want)) saveAuth(sys, { ...a, providers: [...a.providers.filter((p) => p.id !== ACCESS_PROVIDER_ID), want] });
        protectApplied = true;
      } else if (c.protectApplied) {
        if (appHost) { const found = (await cf.accessApps()).find((a) => a.name === accessAppName(appHost)); if (found) await cf.removeAccessApp(found.id); }
        protectApplied = false;
      }
      const id = (await cf.findTunnel(c.tunnelName)) ?? (await cf.createTunnel(c.tunnelName)).id;
      await cf.setRoutes(id, hosts.map((hostname) => ({ hostname, service: `http://localhost:${port}` })));
      const dns: TunnelCfg['dns'] = {};
      for (const h of hosts) dns[h] = { zoneId: zones.get(h)!.id, recordId: await cf.pointDns(zones.get(h)!.id, h, id) };
      for (const [h, rec] of Object.entries(c.dns)) if (!hosts.includes(h)) await cf.removeDns(rec.zoneId, rec.recordId);
      const token = await cf.token(id);
      const changed = token !== getSecret(sys, 'cloudflare:tunnelToken');
      if (changed) setSecret(sys, 'cloudflare:tunnelToken', token);
      let accessNote: string | null = null;
      try { await ensureBypass(cf, hostOfUrl(loadAuth(sys).publicUrl), wantedHostnames(sys).filter((h) => h.kind === 'portfolio').map((h) => h.hostname)); }
      catch (e) { accessNote = `The tunnel is set up, but Cloudflare Access could not be told which addresses are public (${e instanceof CloudflareError ? e.message : (e as Error).message}). If you protect these addresses with Access, add the permission Access: Apps and Policies, Edit to the API token.`; }
      // A tunnel that is set up runs by itself, unless the person switched it off.
      const turnOn = !loadTunnel(sys).enabled && !loadTunnel(sys).stopped;
      saveTunnel(sys, { ...loadTunnel(sys), dns, protectApplied, error: null, accessNote, orgNote, appliedAt: new Date().toISOString(), ...(turnOn ? { enabled: true } : {}) });
      if (turnOn) runner.start();
      else if (changed && loadTunnel(sys).enabled) runner.restart(); // routes changed in Cloudflare need no restart; a new tunnel does
    } catch (e) {
      saveTunnel(sys, { ...loadTunnel(sys), error: e instanceof CloudflareError ? `Cloudflare said: ${e.message}` : (e as Error).message });
    }
  } catch { /* the database was closed under us */ }
}

export function registerTunnel(app: FastifyInstance, x: Ctx, runner: TunnelRunner) {
  const db = x.sys;
  const port = () => Number(process.env.PORT ?? 3000);
  const service = () => `http://localhost:${port()}`; // always this server, never a typed-in address

  /** The Access applications Frames keeps in Cloudflare for these settings, so the page can say what protects what and what is public. */
  const accessApps = (c: TunnelCfg, hostnames: Wanted[]) => {
    if (c.env || !hasApi(db) || !c.appliedAt) return [];
    const appHost = hostOfUrl(loadAuth(db).publicUrl), people = accessPeople(db);
    const portfolioHosts = hostnames.filter((h) => h.kind === 'portfolio').map((h) => h.hostname);
    return [
      ...(c.protectApplied && appHost ? [{ name: accessAppName(appHost), decision: 'allow' as const, addresses: [appHost], who: [...people.emails, ...people.domains.map((d) => `@${d}`)] }] : []),
      ...(!c.accessNote && appHost ? [{ name: 'Frames public paths', decision: 'bypass' as const, addresses: PUBLIC_DESTINATIONS.map((d) => appHost + d), who: [] as string[] }] : []),
      ...(!c.accessNote && portfolioHosts.length ? [{ name: 'Frames portfolio addresses', decision: 'bypass' as const, addresses: portfolioHosts, who: [] as string[] }] : []),
    ];
  };

  const dto = (c: TunnelCfg) => {
    const hostnames = wantedHostnames(db);
    return {
      config: { enabled: c.enabled, portfolios: c.portfolios, env: !!c.env },
      accessApps: accessApps(c, hostnames),
      appUrl: loadAuth(db).publicUrl, hostnames, hasToken: !!getSecret(db, 'cloudflare:tunnelToken'),
      allow: loadAuth(db).allow, open: !!loadAuth(db).open, protect: protectOn(db), protectForced: protectForced(db), protectApplied: c.protectApplied, accessPeople: ((p) => p.emails.length + p.domains.length)(accessPeople(db)), accountId: c.accountId, hasApiToken: !!getSecret(db, 'cloudflare:apiToken'), apiReady: hasApi(db), error: c.error, accessNote: c.accessNote, orgNote: c.orgNote, appliedAt: c.appliedAt,
      status: { ...runner.status }, signInOn: x.isProtected(), service: service(),
      managedByEnv: !!c.env,
      // The whole app is on the internet and Frames itself asks for no sign-in: fine if Cloudflare protects it, so it is a warning, not a block.
      appOpen: hostnames.some((h) => h.kind === 'app') && !x.isProtected() && !c.env && !c.protectApplied,
      // For an environment-managed tunnel: who Cloudflare Access lets in, what it leaves public, and the last problem.
      access: c.env ? { appHost: loadAccess(db)?.appHost ?? '', emails: loadAccess(db)?.emails ?? [], publicPaths: PUBLIC_DESTINATIONS, error: loadEnvState(db).error } : null,
    };
  };

  // One run at a time, queued: an address change while another is being applied is applied after it.
  let queue: Promise<void> = Promise.resolve();
  const apply = () => (queue = queue.then(() => applyTunnel(db, runner, port())));
  x.tunnelRefresh = () => { void apply(); };
  app.get('/api/tunnel', async () => dto(loadTunnel(db)));
  app.get('/api/tunnel/logs', async () => ({ lines: runner.logs.slice(-100) }));

  /** An environment-managed tunnel is changed by editing its variables, not here. */
  const locked = (rep: any) => loadTunnel(db).env ? rep.code(409).send({ error: 'This tunnel is set up by environment variables (CLOUDFLARE_API_TOKEN, APP_HOSTNAME and the others). Change them and restart Frames.' }) : null;

  /** The App URL, the Portfolios box and the token. The App URL is the same public address as under Settings, Sign-in & access. */
  app.put('/api/tunnel', async (req, rep) => {
    if (locked(rep)) return;
    const b = (req.body ?? {}) as Row;
    const cur = loadTunnel(db);
    const n: TunnelCfg = { ...cur };
    const bad = (error: string) => rep.code(400).send({ error });
    if (b.allow !== undefined) {
      // The same list as Settings, Sign-in & access (one list, edited in either place), with the same protection against locking yourself out.
      const list = cleanAllow(b.allow), a = loadAuth(db);
      if (a.enabled && a.testedBy && !isAllowed(a.testedBy, list)) return bad('That list would lock you out: the account that tested sign-in is not on it.');
      saveAuth(db, { ...a, allow: list });
    }
    if (b.appUrl !== undefined) {
      const v = String(b.appUrl).trim().replace(/\/+$/, '');
      if (v) { try { const u = new URL(v); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(); } catch { return bad('The App URL must start with https:// (for example https://frames.example.com)'); } }
      saveAuth(db, { ...loadAuth(db), publicUrl: v.slice(0, 300) });
    }
    if (typeof b.portfolios === 'boolean') n.portfolios = b.portfolios;
    if (typeof b.protect === 'boolean') {
      if (!b.protect && protectForced(db)) return bad('Required while only people on the allowed list can sign in. Choose “Anyone who signs in” under Sign-in & access to turn it off.');
      n.protect = b.protect;
    }
    if (b.accountId !== undefined) {
      const v = String(b.accountId).trim();
      if (v && !ACCOUNT_ID.test(v)) return bad('The account ID is the 32 letters and numbers shown in the Cloudflare dashboard.');
      n.accountId = v.toLowerCase();
    }
    if (typeof b.apiToken === 'string' && b.apiToken.trim()) setSecret(db, 'cloudflare:apiToken', b.apiToken.trim().slice(0, 500));
    if (b.clearApiToken === true) setSecret(db, 'cloudflare:apiToken', '');
    if (typeof b.enabled === 'boolean') { n.enabled = b.enabled; n.stopped = !b.enabled; }
    saveTunnel(db, n);
    await apply(); // creates the tunnel and its records, and fetches the token to run it with
    if (typeof b.apiToken === 'string' && b.apiToken.trim() && b.enabled === undefined && getSecret(db, 'cloudflare:tunnelToken') && !loadTunnel(db).error) { n.enabled = true; saveTunnel(db, { ...loadTunnel(db), enabled: true }); runner.restart(); }
    if (n.enabled && !getSecret(db, 'cloudflare:tunnelToken')) {
      saveTunnel(db, { ...loadTunnel(db), enabled: false });
      return bad(loadTunnel(db).error || 'Enter the Cloudflare account ID and API token first.');
    }
    if (n.enabled) { if (b.enabled === true) runner.start(); } else if (cur.enabled) void runner.stop();
    return dto(loadTunnel(db));
  });

  app.post('/api/tunnel/start', async (_req, rep) => {
    if (locked(rep)) return;
    await apply();
    if (!getSecret(db, 'cloudflare:tunnelToken')) return rep.code(400).send({ error: loadTunnel(db).error || 'Enter the Cloudflare account ID and API token first.' });
    saveTunnel(db, { ...loadTunnel(db), enabled: true, stopped: false });
    runner.start();
    return dto(loadTunnel(db));
  });
  app.post('/api/tunnel/stop', async (_req, rep) => { if (locked(rep)) return; saveTunnel(db, { ...loadTunnel(db), enabled: false, stopped: true }); await runner.stop(); return dto(loadTunnel(db)); });
}
