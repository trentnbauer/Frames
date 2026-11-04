import { setSecret } from './ai.js';
import { ACCESS_KEY, PUBLIC_DESTINATIONS, type AccessState } from './access.js';
import { CloudflareError, cloudflare, type Cloudflare } from './cloudflare.js';
import { getSetting, setSetting, type DB } from './db.js';
import { loadTunnel, type TunnelCfg, type TunnelRunner } from './tunnel.js';
import { OWNER_ID } from './users.js';

/**
 * The Cloudflare tunnel, set up from environment variables instead of the Settings screen. For a single person who runs
 * Frames from a compose file with no sign-in of its own:
 *
 *   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID   what Frames uses to create the tunnel, its DNS records and Access
 *   APP_HOSTNAME        the address of the app (for example frames.example.com), behind Cloudflare Access
 *   ACCESS_EMAILS       who Access lets in: comma-separated emails
 *   PORTFOLIO_HOSTNAME  the public portfolio's own address (shows only the portfolio, needs no login)
 *   TUNNEL_NAME         optional, default Frames
 *
 * On every start Frames makes the Cloudflare side match: the tunnel and its routes, proxied DNS records, an Access
 * application that lets only those emails in, and a second Access application that bypasses the login for share links,
 * the portfolio and the files they need. It only ever changes things it created, tracked by id in its own settings.
 */
export type EnvTunnel = { token: string; accountId: string; name: string; appHost: string; portfolioHost: string; emails: string[] };
export type EnvState = { tunnelId: string; dns: Record<string, { zoneId: string; recordId: string }>; apps: { main?: string; bypass?: string }; error: string | null; appliedAt: string | null };
export const ENV_STATE_KEY = 'tunnelEnvState';
export const loadEnvState = (sys: DB): EnvState => ({ tunnelId: '', dns: {}, apps: {}, error: null, appliedAt: null, ...getSetting<Partial<EnvState>>(sys, ENV_STATE_KEY, {}) });
const saveEnvState = (sys: DB, s: EnvState) => setSetting(sys, ENV_STATE_KEY, s);

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const EMAIL = /^[^\s@,]{1,64}@[^\s@,]{1,190}\.[^\s@,]{2,}$/;
const bareHost = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

/** Reads and checks the variables. `cfg` is null when none are set; `problems` explains anything wrong, in plain words. */
export function readEnvTunnel(env: Record<string, string | undefined> = process.env): { cfg: EnvTunnel | null; problems: string[] } {
  const token = (env.CLOUDFLARE_API_TOKEN ?? '').trim();
  const accountId = (env.CLOUDFLARE_ACCOUNT_ID ?? '').trim();
  const appHost = bareHost(env.APP_HOSTNAME ?? '');
  const portfolioHost = bareHost(env.PORTFOLIO_HOSTNAME ?? '');
  const emails = [...new Set((env.ACCESS_EMAILS ?? '').split(/[,\s;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!token && !accountId && !appHost && !portfolioHost && !emails.length) return { cfg: null, problems: [] };
  const problems: string[] = [];
  if (!token) problems.push('CLOUDFLARE_API_TOKEN is not set.');
  if (!/^[0-9a-f]{32}$/i.test(accountId)) problems.push('CLOUDFLARE_ACCOUNT_ID must be the 32 letters and numbers from the Cloudflare dashboard.');
  if (!appHost && !portfolioHost) problems.push('Set APP_HOSTNAME and/or PORTFOLIO_HOSTNAME.');
  for (const [n, h] of [['APP_HOSTNAME', appHost], ['PORTFOLIO_HOSTNAME', portfolioHost]] as const) if (h && !HOSTNAME.test(h)) problems.push(`${n} “${h}” is not a valid hostname.`);
  if (appHost && appHost === portfolioHost) problems.push('APP_HOSTNAME and PORTFOLIO_HOSTNAME must be different addresses.');
  if (appHost && !emails.length) problems.push('APP_HOSTNAME needs ACCESS_EMAILS: the app is only published behind a login that lets those emails in.');
  for (const e of emails) if (!EMAIL.test(e)) problems.push(`ACCESS_EMAILS has “${e}”, which is not an email address.`);
  if (problems.length) return { cfg: null, problems };
  return { cfg: { token, accountId, name: (env.TUNNEL_NAME ?? '').trim().slice(0, 60) || 'Frames', appHost, portfolioHost, emails }, problems };
}

export type ApplyDeps = { sys: DB; ownerDb: DB; runner: TunnelRunner; port: number; apiBase?: string };

/**
 * Makes Cloudflare match the environment, then starts the tunnel. Safe to repeat. Nothing is published unless every step
 * that protects it has worked: Access is set up first, and the app's route and DNS record are made last.
 */
export async function applyEnvTunnel(env: EnvTunnel, d: ApplyDeps): Promise<EnvState> {
  const { sys } = d;
  const state = loadEnvState(sys);
  const cf: Cloudflare = cloudflare(env.token, env.accountId, d.apiBase);
  const hosts = [...(env.appHost ? [env.appHost] : []), ...(env.portfolioHost ? [env.portfolioHost] : [])];
  try {
    const zones = new Map<string, { id: string; name: string }>();
    for (const h of hosts) zones.set(h, await cf.zoneFor(h)); // fail before changing anything

    // 1. The login first. Without it the app is not published at all.
    let aud = '', authDomain = '';
    const apps: EnvState['apps'] = { ...state.apps };
    if (env.appHost) {
      authDomain = await cf.accessDomain();
      const existing = await cf.accessApps();
      const find = (id: string | undefined, name: string) => existing.find((a) => (id && a.id === id) || a.name === name);
      const mainName = `Frames (${env.appHost})`, bypassName = `Frames public paths (${env.appHost})`;
      const main = await cf.saveAccessApp(find(apps.main, mainName)?.id ?? null, { name: mainName, destinations: [env.appHost], session: '24h' });
      await cf.saveAccessPolicy(main.id, { name: 'Frames: allowed emails', decision: 'allow', emails: env.emails });
      const bypass = await cf.saveAccessApp(find(apps.bypass, bypassName)?.id ?? null, { name: bypassName, destinations: PUBLIC_DESTINATIONS.map((p) => env.appHost + p), session: '24h' });
      await cf.saveAccessPolicy(bypass.id, { name: 'Frames: public paths', decision: 'bypass' });
      apps.main = main.id; apps.bypass = bypass.id; aud = main.aud;
      setSetting(sys, ACCESS_KEY, { appHost: env.appHost, aud, authDomain, emails: env.emails } satisfies AccessState);
    } else {
      // No app address any more: close the gate and remove the Access applications this made.
      for (const id of [apps.main, apps.bypass]) if (id) await cf.removeAccessApp(id);
      delete apps.main; delete apps.bypass;
      setSetting(sys, ACCESS_KEY, null);
    }

    // 2. The tunnel, its routes and DNS.
    let id = state.tunnelId;
    if (!id || !(await cf.tunnelExists(id))) id = (await cf.createTunnel(env.name)).id;
    await cf.setRoutes(id, hosts.map((hostname) => ({ hostname, service: `http://localhost:${d.port}` })));
    const dns: EnvState['dns'] = {};
    for (const h of hosts) dns[h] = { zoneId: zones.get(h)!.id, recordId: await cf.pointDns(zones.get(h)!.id, h, id) };
    for (const [h, rec] of Object.entries(state.dns)) if (!hosts.includes(h)) await cf.removeDns(rec.zoneId, rec.recordId); // only records this made
    setSecret(sys, 'cloudflare:tunnelToken', await cf.token(id));

    // 3. The portfolio address is the owner's, and nobody else's.
    if (env.portfolioHost) {
      const taken = sys.prepare('SELECT user_id FROM portfolio_hosts WHERE host = ?').get(env.portfolioHost) as { user_id: number } | undefined;
      if (taken && taken.user_id !== OWNER_ID) throw new Error(`${env.portfolioHost} is already another person's portfolio address.`);
      sys.prepare('DELETE FROM portfolio_hosts WHERE user_id = ?').run(OWNER_ID);
      sys.prepare('INSERT INTO portfolio_hosts(host, user_id) VALUES(?, ?)').run(env.portfolioHost, OWNER_ID);
      setSetting(d.ownerDb, 'portfolio', { ...getSetting<Record<string, unknown>>(d.ownerDb, 'portfolio', {}), host: env.portfolioHost });
    }

    // The sign-in return addresses use the public address, which is the app address.
    if (env.appHost) { const a = getSetting<Record<string, unknown>>(sys, 'auth', {}); if (a.publicUrl !== `https://${env.appHost}`) setSetting(sys, 'auth', { ...a, publicUrl: `https://${env.appHost}` }); }

    // What the Settings screen shows, so the tunnel looks like any other, but read-only (see tunnel.ts).
    const cfg: TunnelCfg = { ...loadTunnel(sys), enabled: true, mode: 'api', accountId: env.accountId, tunnelName: env.name, tunnelId: id, env: true, dns,
      hostnames: [...(env.appHost ? [{ hostname: env.appHost, kind: 'app' as const }] : []), ...(env.portfolioHost ? [{ hostname: env.portfolioHost, kind: 'portfolio' as const }] : [])] };
    setSetting(sys, 'tunnel', cfg);
    const next: EnvState = { tunnelId: id, dns, apps, error: null, appliedAt: new Date().toISOString() };
    saveEnvState(sys, next);
    d.runner.restart();
    return next;
  } catch (e) {
    const msg = e instanceof CloudflareError ? `Cloudflare said: ${e.message}` : (e as Error).message;
    const failed: EnvState = { ...state, error: msg };
    saveEnvState(sys, failed);
    return failed;
  }
}

