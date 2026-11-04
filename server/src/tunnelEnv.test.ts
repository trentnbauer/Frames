import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PUBLIC_DESTINATIONS, loadAccess } from './access.js';
import { createTunnelRunner } from './tunnel.js';
import { applyEnvTunnel, loadEnvState, readEnvTunnel, type EnvTunnel } from './tunnelEnv.js';
import { cleanup, makeEnv, type Env } from './testutil.js';
import type { DB } from './db.js';

// Built at run time, in the shape of a real tunnel token (base64 JSON), so no token-like literal sits in the repo.
const TUNNEL_TOKEN = Buffer.from(JSON.stringify({ a: '1234567890', t: 'abcdefghijklmnopqrstuvwxyz', s: 'secret' })).toString('base64');
const API_TOKEN = 'cf-api-token-' + Buffer.from('env-test').toString('hex');
const ACCOUNT = 'a'.repeat(32);
const TEAM = 'team.example.test';

type App = { id: string; name: string; aud: string; destinations: string[]; policies: { id: string; name: string; decision: string; include: any[] }[] };
const cf = { tunnels: new Map<string, string>(), dns: [] as { id: string; zone: string; name: string; type: string; content: string; proxied?: boolean }[], routes: [] as any[], apps: [] as App[], seq: 0, failAccess: false, calls: [] as string[] };
const ZONES = [{ id: 'z1', name: 'example.com' }];
let cfServer: http.Server, cfBase = '', certs: http.Server, certsBase = '';
let keyPair: Awaited<ReturnType<typeof generateKeyPair>>, jwk: JWK;

const reset = () => { cf.tunnels.clear(); cf.dns.length = 0; cf.routes = []; cf.apps.length = 0; cf.failAccess = false; cf.calls.length = 0; };

beforeAll(async () => {
  keyPair = await generateKeyPair('RS256');
  jwk = { ...(await exportJWK(keyPair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  certs = http.createServer((req, res) => {
    if (req.url === '/cdn-cgi/access/certs') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); } else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>((r) => certs.listen(0, '127.0.0.1', r));
  certsBase = `http://127.0.0.1:${(certs.address() as AddressInfo).port}`;

  cfServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://x');
      cf.calls.push(`${req.method} ${url.pathname}`);
      const ok = (result: unknown) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, result })); };
      const err = (code: number, message: string) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, errors: [{ message }] })); };
      if (req.headers.authorization !== `Bearer ${API_TOKEN}`) return err(403, 'Authentication error');
      const j = body ? JSON.parse(body) : {};
      let m: RegExpExecArray | null;
      if (url.pathname === '/zones') return ok(ZONES);
      if (url.pathname.includes('/access/') && cf.failAccess) return err(403, 'Access: you do not have permission');
      if (url.pathname.endsWith('/access/organizations')) return ok({ auth_domain: TEAM });
      if (url.pathname.endsWith('/access/apps')) {
        if (req.method === 'GET') return ok(cf.apps.map(({ id, name, aud }) => ({ id, name, aud })));
        const app: App = { id: `app-${++cf.seq}`, name: j.name, aud: `aud-${cf.seq}`, destinations: j.destinations.map((d: any) => d.uri), policies: [] };
        cf.apps.push(app);
        return ok({ id: app.id, name: app.name, aud: app.aud });
      }
      if ((m = /\/access\/apps\/([^/]+)$/.exec(url.pathname))) {
        const a = cf.apps.find((x) => x.id === m![1]);
        if (!a) return err(404, 'Application not found');
        if (req.method === 'DELETE') { cf.apps.splice(cf.apps.indexOf(a), 1); return ok({ id: a.id }); }
        a.name = j.name; a.destinations = j.destinations.map((d: any) => d.uri);
        return ok({ id: a.id, name: a.name, aud: a.aud });
      }
      if ((m = /\/access\/apps\/([^/]+)\/policies(?:\/([^/]+))?$/.exec(url.pathname))) {
        const a = cf.apps.find((x) => x.id === m![1])!;
        if (req.method === 'GET') return ok(a.policies.map(({ id, name }) => ({ id, name })));
        if (req.method === 'POST') { const p = { id: `pol-${++cf.seq}`, name: j.name, decision: j.decision, include: j.include }; a.policies.push(p); return ok({ id: p.id }); }
        const p = a.policies.find((x) => x.id === m![2])!; Object.assign(p, { name: j.name, decision: j.decision, include: j.include }); return ok({ id: p.id });
      }
      if (req.method === 'POST' && /\/cfd_tunnel$/.test(url.pathname)) { const id = `tun-${++cf.seq}`; cf.tunnels.set(id, j.name); return ok({ id }); }
      if ((m = /\/cfd_tunnel\/([^/]+)$/.exec(url.pathname)) && req.method === 'GET') return cf.tunnels.has(m[1]) ? ok({ id: m[1] }) : err(404, 'Tunnel not found');
      if (/\/cfd_tunnel\/([^/]+)\/configurations$/.test(url.pathname)) { cf.routes = j.config.ingress; return ok({}); }
      if (/\/cfd_tunnel\/([^/]+)\/token$/.test(url.pathname)) return ok(TUNNEL_TOKEN);
      if (url.pathname.endsWith('/dns_records') && req.method === 'GET') return ok(cf.dns.filter((d) => d.name === url.searchParams.get('name')));
      if ((m = /\/zones\/([^/]+)\/dns_records$/.exec(url.pathname)) && req.method === 'POST') { const r = { id: `dns-${++cf.seq}`, zone: m[1], ...j }; cf.dns.push(r); return ok({ id: r.id }); }
      if ((m = /\/zones\/([^/]+)\/dns_records\/([^/]+)$/.exec(url.pathname))) {
        const i = cf.dns.findIndex((d) => d.id === m![2]);
        if (req.method === 'DELETE') { if (i < 0) return err(404, 'Record does not exist'); cf.dns.splice(i, 1); return ok({ id: m[2] }); }
        if (req.method === 'PUT') { Object.assign(cf.dns[i], j); return ok({ id: m[2] }); }
      }
      err(404, 'no such endpoint');
    });
  });
  await new Promise<void>((r) => cfServer.listen(0, '127.0.0.1', r));
  cfBase = `http://127.0.0.1:${(cfServer.address() as AddressInfo).port}`;
});
afterAll(() => { cfServer.close(); certs.close(); });

describe('reading the environment', () => {
  const good = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: ACCOUNT, APP_HOSTNAME: 'Frames.Example.com', ACCESS_EMAILS: 'Me@Example.com, other@example.com;me@example.com', PORTFOLIO_HOSTNAME: 'https://gallery.example.com/' };
  it('is nothing at all when none of it is set', () => {
    expect(readEnvTunnel({})).toEqual({ cfg: null, problems: [] });
    expect(readEnvTunnel({ CLOUDFLARE_API_TOKEN: '' })).toEqual({ cfg: null, problems: [] });
  });
  it('is not the API setup without Cloudflare API credentials: the addresses and TUNNEL_TOKEN only pre-fill Settings', () => {
    expect(readEnvTunnel({ APP_HOSTNAME: 'frames.example.com', PORTFOLIO_HOSTNAME: 'gallery.example.com', TUNNEL_TOKEN: 'x' })).toEqual({ cfg: null, problems: [] });
  });
  it('tidies what it is given: lower case, no scheme or path, emails split and de-duplicated', () => {
    const r = readEnvTunnel(good);
    expect(r.problems).toEqual([]);
    expect(r.cfg).toMatchObject({ appHost: 'frames.example.com', portfolioHost: 'gallery.example.com', emails: ['me@example.com', 'other@example.com'], name: 'Frames' });
  });
  it('says what is wrong, in plain words, and sets nothing up when anything is', () => {
    const p = (extra: Record<string, string>) => readEnvTunnel({ ...good, ...extra }).problems.join(' | ');
    expect(readEnvTunnel({ ...good, CLOUDFLARE_API_TOKEN: '' }).cfg).toBeNull();
    expect(p({ CLOUDFLARE_API_TOKEN: '' })).toMatch(/CLOUDFLARE_API_TOKEN is not set/);
    expect(p({ CLOUDFLARE_ACCOUNT_ID: 'short' })).toMatch(/32 letters and numbers/);
    expect(p({ ACCESS_EMAILS: '' })).toMatch(/APP_HOSTNAME needs ACCESS_EMAILS/);
    expect(p({ ACCESS_EMAILS: 'not-an-email' })).toMatch(/not an email address/);
    expect(p({ APP_HOSTNAME: 'no_dots' })).toMatch(/not a valid hostname/);
    expect(p({ PORTFOLIO_HOSTNAME: 'frames.example.com' })).toMatch(/must be different/);
    expect(p({ APP_HOSTNAME: '', PORTFOLIO_HOSTNAME: '' })).toMatch(/Set APP_HOSTNAME and\/or PORTFOLIO_HOSTNAME/);
  });
  it('lets a portfolio-only setup go without any emails', () => {
    expect(readEnvTunnel({ ...good, APP_HOSTNAME: '', ACCESS_EMAILS: '' })).toMatchObject({ problems: [], cfg: { appHost: '', portfolioHost: 'gallery.example.com' } });
  });
});

describe('making Cloudflare match', () => {
  let env: Env, sys: DB, dir: string;
  const cfg = (extra: Partial<EnvTunnel> = {}): EnvTunnel => ({ token: API_TOKEN, accountId: ACCOUNT, name: 'Frames', appHost: 'frames.example.com', portfolioHost: 'gallery.example.com', emails: ['me@example.com'], ...extra });
  const run = async (c: EnvTunnel) => {
    const runner = createTunnelRunner(sys, { bin: path.join(dir, 'fake-cloudflared'), backoffMs: [50] });
    const state = await applyEnvTunnel(c, { sys, ownerDb: env.db, runner, port: 3000, apiBase: cfBase });
    await runner.stop();
    return state;
  };
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'frames-te-'));
    fs.writeFileSync(path.join(dir, 'fake-cloudflared'), '#!/usr/bin/env node\nsetInterval(() => {}, 1000);\n', { mode: 0o755 });
    env = makeEnv({ cloudflareApi: cfBase, accessCertsBase: certsBase, authDisabled: true });
    sys = (env.app as any).frames.sys;
  });
  afterAll(() => { env.app.close(); cleanup(env); fs.rmSync(dir, { recursive: true, force: true }); });

  it('puts the login in place first, then the tunnel, its routes and the DNS, for both addresses', async () => {
    reset();
    const state = await run(cfg());
    expect(state.error).toBeNull();
    const main = cf.apps.find((a) => a.name === 'Frames (frames.example.com)')!;
    expect(main.destinations).toEqual(['frames.example.com']);
    expect(main.policies).toHaveLength(1);
    expect(main.policies[0]).toMatchObject({ decision: 'allow', include: [{ email: { email: 'me@example.com' } }] });
    const bypass = cf.apps.find((a) => a.name === 'Frames public paths (frames.example.com)')!;
    expect(bypass.destinations).toEqual(PUBLIC_DESTINATIONS.map((p) => `frames.example.com${p}`));
    expect(bypass.destinations).toEqual(expect.arrayContaining(['frames.example.com/s/*', 'frames.example.com/portfolio', 'frames.example.com/portfolio/*', 'frames.example.com/api/s/*']));
    expect(bypass.policies[0]).toMatchObject({ decision: 'bypass', include: [{ everyone: {} }] });
    // The login was made before any route or DNS record that publishes the app.
    expect(cf.calls.findIndex((c) => c.includes('/access/apps'))).toBeLessThan(cf.calls.findIndex((c) => c.includes('/configurations')));
    expect(cf.calls.findIndex((c) => c.includes('/access/apps'))).toBeLessThan(cf.calls.findIndex((c) => c.includes('/dns_records') && c.startsWith('POST')));
    expect(cf.routes).toEqual([{ hostname: 'frames.example.com', service: 'http://localhost:3000' }, { hostname: 'gallery.example.com', service: 'http://localhost:3000' }, { service: 'http_status:404' }]);
    expect(cf.dns.map((d) => [d.name, d.type, d.proxied]).sort()).toEqual([['frames.example.com', 'CNAME', true], ['gallery.example.com', 'CNAME', true]]);
    expect(loadAccess(sys)).toEqual({ appHost: 'frames.example.com', aud: main.aud, authDomain: TEAM, emails: ['me@example.com'] });
  });
  it('makes the portfolio address the owner’s and shows the tunnel read-only in Settings', async () => {
    expect(sys.prepare("SELECT user_id FROM portfolio_hosts WHERE host = 'gallery.example.com'").get()).toEqual({ user_id: 1 });
    const t = (await env.app.inject('/api/tunnel')).json();
    expect(t).toMatchObject({ managedByEnv: true, config: { env: true }, access: { appHost: 'frames.example.com', emails: ['me@example.com'], publicPaths: PUBLIC_DESTINATIONS } });
    expect((await env.app.inject({ method: 'PUT', url: '/api/tunnel', payload: { enabled: false } })).statusCode).toBe(409);
    expect((await env.app.inject({ method: 'POST', url: '/api/tunnel/stop', payload: {} })).statusCode).toBe(409);
    expect((await env.app.inject({ method: 'PUT', url: '/api/portfolio', payload: { host: 'elsewhere.example.com' } })).statusCode).toBe(400);
  });
  it('keeps the API token in the environment only: it is not written to any database', () => {
    for (const db of [sys, env.db]) for (const r of db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]) expect(r.value, r.key).not.toContain(API_TOKEN);
  });
  it('is safe to run again: nothing is made twice', async () => {
    const before = { apps: cf.apps.length, dns: cf.dns.length, tunnels: cf.tunnels.size, policies: cf.apps.reduce((n, a) => n + a.policies.length, 0) };
    expect((await run(cfg())).error).toBeNull();
    expect({ apps: cf.apps.length, dns: cf.dns.length, tunnels: cf.tunnels.size, policies: cf.apps.reduce((n, a) => n + a.policies.length, 0) }).toEqual(before);
  });
  it('changes who is let in by updating the policy in place', async () => {
    await run(cfg({ emails: ['me@example.com', 'partner@example.com'] }));
    expect(cf.apps.find((a) => a.name.startsWith('Frames (frames'))!.policies[0].include).toEqual([{ email: { email: 'me@example.com' } }, { email: { email: 'partner@example.com' } }]);
    expect(loadAccess(sys)!.emails).toEqual(['me@example.com', 'partner@example.com']);
  });
  it('finds its applications again by name if its own record of them is lost', async () => {
    sys.prepare("DELETE FROM settings WHERE key = 'tunnelEnvState'").run();
    const n = cf.apps.length;
    await run(cfg());
    expect(cf.apps).toHaveLength(n);
  });
  it('publishes nothing when the login cannot be set up', async () => {
    reset();
    sys.prepare("DELETE FROM settings WHERE key = 'tunnelEnvState'").run();
    cf.failAccess = true;
    const state = await run(cfg());
    expect(state.error).toMatch(/Cloudflare said: Access: you do not have permission/);
    expect(cf.routes).toEqual([]);
    expect(cf.dns).toEqual([]);
    expect(cf.tunnels.size).toBe(0);
    expect(loadEnvState(sys).error).toMatch(/permission/);
    cf.failAccess = false;
  });
  it('takes the login and the app’s DNS record away when the app address is removed, and only those', async () => {
    reset();
    sys.prepare("DELETE FROM settings WHERE key = 'tunnelEnvState'").run();
    await run(cfg());
    cf.dns.push({ id: 'theirs', zone: 'z1', name: 'www.example.com', type: 'A', content: '1.2.3.4' });
    cf.apps.push({ id: 'theirs-app', name: 'Their app', aud: 'x', destinations: [], policies: [] });
    expect((await run(cfg({ appHost: '', emails: [] }))).error).toBeNull();
    expect(cf.apps.map((a) => a.name)).toEqual(['Their app']);
    expect(cf.dns.map((d) => d.name).sort()).toEqual(['gallery.example.com', 'www.example.com']);
    expect(loadAccess(sys)).toBeNull();
    expect(cf.routes).toEqual([{ hostname: 'gallery.example.com', service: 'http://localhost:3000' }, { service: 'http_status:404' }]);
  });
});

describe('the app address behind Cloudflare Access', () => {
  let env: Env, sys: DB;
  const HOST = 'frames.example.com';
  const token = (o: { email?: string; aud?: string; iss?: string; exp?: string; key?: CryptoKey } = {}) =>
    new SignJWT({ email: o.email ?? 'me@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(o.iss ?? `https://${TEAM}`).setAudience(o.aud ?? 'aud-main').setIssuedAt().setExpirationTime(o.exp ?? '5m').sign(o.key ?? keyPair.privateKey);
  const get = (url: string, headers: Record<string, string> = {}) => env.app.inject({ url, headers });
  beforeAll(() => {
    env = makeEnv({ accessCertsBase: certsBase, authDisabled: true });
    sys = (env.app as any).frames.sys;
    sys.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)').run('accessState', JSON.stringify({ appHost: HOST, aud: 'aud-main', authDomain: TEAM, emails: ['me@example.com'] }));
  });
  afterAll(() => { env.app.close(); cleanup(env); });

  it('lets in a request that carries a valid Access token for an allowed email', async () => {
    const r = await get('/api/settings', { host: HOST, 'cf-access-jwt-assertion': await token() });
    expect(r.statusCode).toBe(200);
  });
  it('turns away everything else on that address: no token, a wrong person, audience, issuer, key or an expired token', async () => {
    const bad: Record<string, string>[] = [
      {},
      { 'cf-access-jwt-assertion': 'not-a-jwt' },
      { 'cf-access-jwt-assertion': await token({ email: 'stranger@example.com' }) },
      { 'cf-access-jwt-assertion': await token({ aud: 'some-other-app' }) },
      { 'cf-access-jwt-assertion': await token({ iss: 'https://evil.example.test' }) },
      { 'cf-access-jwt-assertion': await token({ key: (await generateKeyPair('RS256')).privateKey }) },
      { 'cf-access-jwt-assertion': await token({ exp: '-1m' }) },
    ];
    for (const h of bad) expect((await get('/api/settings', { host: HOST, ...h })).statusCode).toBe(403);
    expect((await get('/', { host: HOST })).statusCode).toBe(403); // the app itself, too
  });
  it('leaves share links, the portfolio and the privacy page public: exactly the paths Access is told to bypass', async () => {
    expect((await get('/privacy', { host: HOST })).statusCode).toBe(200);
    expect((await get('/portfolio/config.json', { host: HOST })).statusCode).not.toBe(403);
    expect((await get('/api/s/AAAAAAAAAAAAAAAAAAAAAA', { host: HOST })).statusCode).toBe(404); // reaches the share routes: an unknown link
    expect((await get('/assets/x.js', { host: HOST })).statusCode).not.toBe(403);
    // But a path that merely looks similar is not public.
    for (const p of ['/api/shares', '/s', '/portfolio/../api/settings', '/api/photos', '/portfolioX']) expect((await get(p, { host: HOST })).statusCode, p).toBe(403);
  });
  it('does not affect other addresses, such as the LAN address', async () => {
    expect((await get('/api/settings', { host: '192.168.1.5:3000' })).statusCode).toBe(200);
    expect((await get('/api/settings')).statusCode).toBe(200);
  });
  it('stays closed if the Access record is incomplete', async () => {
    sys.prepare('INSERT OR REPLACE INTO settings(key, value) VALUES(?, ?)').run('accessState', JSON.stringify({ appHost: HOST, aud: '', authDomain: '', emails: ['me@example.com'] }));
    expect((await get('/api/settings', { host: HOST, 'cf-access-jwt-assertion': await token() })).statusCode).toBe(403);
    expect((await get('/privacy', { host: HOST })).statusCode).toBe(200); // public paths still work
  });
});
