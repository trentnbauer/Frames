import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { createTunnelRunner } from './tunnel.js';
import { seedTunnelFromEnv } from './tunnelEnv.js';
import { resolveUser } from './users.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
// Nothing here may reach the real Cloudflare (a made-up token is saved); the API suite below points this at a stand-in.
process.env.CLOUDFLARE_API_BASE = 'http://127.0.0.1:9';

// Built at run time, in the shape of a real tunnel token (base64 JSON), so no token-like literal sits in the repo.
const TOKEN = Buffer.from(JSON.stringify({ a: '1234567890', t: 'abcdefghijklmnopqrstuvwxyz', s: 'secret' })).toString('base64');

/** A stand-in for cloudflared: records how it was started, serves /ready on the metrics port, and logs the token (so redaction is tested). */
function fakeBin(dir: string, kind: 'ok' | 'die'): string {
  const f = path.join(dir, `fake-cloudflared-${kind}`);
  fs.writeFileSync(f, `#!/usr/bin/env node
const fs = require('node:fs'), http = require('node:http');
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(dir, 'runs.log'))}, JSON.stringify({ argv, tokenEnv: process.env.TUNNEL_TOKEN, pid: process.pid, config: argv.includes('--config') ? fs.readFileSync(argv[argv.indexOf('--config') + 1], 'utf8') : null }) + '\\n');
console.error('connecting with token ' + process.env.TUNNEL_TOKEN + ' to the edge');
if (${JSON.stringify(kind)} === 'die') { console.error('Failed to start'); process.exit(1); }
const m = argv[argv.indexOf('--metrics') + 1].split(':');
setTimeout(() => http.createServer((q, r) => { r.writeHead(q.url === '/ready' ? 200 : 404); r.end('ok'); }).listen(+m[1], m[0]), 200);
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  return f;
}
const until = async (fn: () => boolean, ms = 8000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 50)); return fn(); };

describe('keeping cloudflared running', () => {
  let env: Env;
  beforeAll(() => { env = makeEnv(); });
  afterAll(() => cleanup(env));
  const setToken = () => env.db.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('secret:cloudflare:tunnelToken', ?)").run(JSON.stringify(TOKEN));
  const runs = () => fs.existsSync(path.join(env.tmp, 'runs.log')) ? fs.readFileSync(path.join(env.tmp, 'runs.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];

  it('starts it, reports connected once it has a connection, and stops it', async () => {
    setToken();
    const r = createTunnelRunner(env.db, { bin: fakeBin(env.tmp, 'ok') });
    expect(r.status.state).toBe('stopped');
    r.start();
    expect(await until(() => r.status.state === 'connected')).toBe(true);
    const pid = runs().at(-1).pid;
    await r.stop();
    expect(r.status.state).toBe('stopped');
    expect(() => process.kill(pid, 0)).toThrow(); // the process is really gone
  });
  it('hands over the token in the environment, never on the command line', () => {
    const run = runs().at(-1);
    expect(run.tokenEnv).toBe(TOKEN);
    expect(run.argv.join(' ')).not.toContain(TOKEN);
    expect(run.argv).toEqual(expect.arrayContaining(['tunnel', '--no-autoupdate', 'run']));
  });
  it('never lets the token reach the log', async () => {
    const r = createTunnelRunner(env.db, { bin: fakeBin(env.tmp, 'ok') });
    r.start();
    await until(() => r.logs.length > 0);
    expect(r.logs.join('\n')).toContain('connecting with token [token]');
    expect(r.logs.join('\n')).not.toContain(TOKEN);
    expect(r.logs.join('\n')).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    await r.stop();
  });
  it('restarts it after a crash, with a pause, and says what happened', async () => {
    const r = createTunnelRunner(env.db, { bin: fakeBin(env.tmp, 'die'), backoffMs: [60, 120] });
    r.start();
    expect(await until(() => r.status.restarts >= 2)).toBe(true);
    expect(r.status.state).toBe('error');
    expect(r.status.error).toMatch(/stopped \(exit 1\)/);
    expect(r.logs.join('\n')).toContain('Failed to start');
    await r.stop();
    expect(r.status.state).toBe('stopped');
    const n = runs().length;
    await new Promise((x) => setTimeout(x, 300));
    expect(runs().length).toBe(n); // stopping really stops the retries
  });
  it('explains when cloudflared is not installed, and when there is no token', async () => {
    const r = createTunnelRunner(env.db, { bin: '/nonexistent/cloudflared', backoffMs: [5000] });
    r.start();
    expect(await until(() => r.status.state === 'error')).toBe(true);
    expect(r.status.error).toMatch(/not installed/);
    await r.stop();
    env.db.prepare("DELETE FROM settings WHERE key LIKE 'secret:cloudflare%'").run();
    const r2 = createTunnelRunner(env.db, { bin: fakeBin(env.tmp, 'ok') });
    r2.start();
    expect(await until(() => r2.status.state === 'error')).toBe(true);
    expect(r2.status.error).toMatch(/No tunnel token/);
  });
});

describe('shutting down', () => {
  it('stops cloudflared when the server stops', async () => {
    const e = makeEnv();
    try {
      process.env.CLOUDFLARED_BIN = fakeBin(e.tmp, 'ok');
      const A = api(e);
      (e.app as any).frames.sys.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('secret:cloudflare:tunnelToken', ?)").run(JSON.stringify(TOKEN));
      await A.post('/api/tunnel/start');
      expect(await until(() => ((A as any) && true) && fs.existsSync(path.join(e.tmp, 'runs.log')))).toBe(true);
      const pid = JSON.parse(fs.readFileSync(path.join(e.tmp, 'runs.log'), 'utf8').trim().split('\n').at(-1)!).pid;
      expect(() => process.kill(pid, 0)).not.toThrow();
      await e.app.close();
      expect(await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } })).toBe(true);
    } finally { delete process.env.CLOUDFLARED_BIN; cleanup(e); }
  });
});


const API = 'cf-api-' + Buffer.from('tunnel-test').toString('hex');

describe('the tunnel page: App URL, Portfolios and the credentials', () => {
  let env: Env, A: ReturnType<typeof api>, sys: any;
  const list = async () => (await A.get('/api/tunnel')).body.hostnames.map((h: any) => `${h.kind}:${h.hostname}${h.who ? ` (${h.who})` : ''}`);
  beforeAll(() => { env = makeEnv(); A = api(env); sys = (env.app as any).frames.sys; });
  afterAll(() => { env.app.close(); cleanup(env); });

  it('starts empty: no hostnames to add, Portfolios off', async () => {
    const t = (await A.get('/api/tunnel')).body;
    expect(t).toMatchObject({ appUrl: '', hostnames: [], hasToken: false, managedByEnv: false, config: { enabled: false, portfolios: false } });
  });
  it('the App URL is the public address under Settings, Access: setting either one shows in both', async () => {
    const r = await A.put('/api/tunnel', { appUrl: 'https://frames.example.com/' });
    expect(r.status).toBe(200);
    expect(r.body.appUrl).toBe('https://frames.example.com');
    expect((await A.get('/api/auth/config')).body.publicUrl).toBe('https://frames.example.com');
    expect(await list()).toEqual(['app:frames.example.com']);
    await A.put('/api/auth/config', { publicUrl: 'https://app2.example.com' });
    expect((await A.get('/api/tunnel')).body.appUrl).toBe('https://app2.example.com');
    expect(await list()).toEqual(['app:app2.example.com']);
    expect((await A.put('/api/tunnel', { appUrl: '' })).body.appUrl).toBe('');
    expect(await list()).toEqual([]);
  });
  it('the allowed list is one list, edited from the tunnel page or from Access, and cannot lock out the tester', async () => {
    const r = await A.put('/api/tunnel', { allow: 'alice@x.test\n@family.test, alice@x.test' });
    expect(r.body.allow).toEqual(['alice@x.test', '@family.test']);
    expect((await A.get('/api/auth/config')).body.allow).toEqual(['alice@x.test', '@family.test']);
    await A.put('/api/auth/config', { allow: 'bob@x.test' });
    expect((await A.get('/api/tunnel')).body.allow).toEqual(['bob@x.test']);
    sys.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('auth', ?)").run(JSON.stringify({ enabled: true, providers: [], allow: ['bob@x.test'], publicUrl: '', testedBy: { provider: 'g', sub: 'b', email: 'bob@x.test', emailVerified: true, name: 'Bob' } }));
    expect((await A.put('/api/tunnel', { allow: 'carol@x.test' })).status).toBe(400); // would lock the tester out
    expect((await A.get('/api/auth/config')).body.allow).toEqual(['bob@x.test']);
    sys.prepare("DELETE FROM settings WHERE key = 'auth'").run();
  });
  it('refuses an App URL that is not a web address', async () => {
    for (const v of ['ftp://x.example.com', 'frames', 'javascript:alert(1)']) expect((await A.put('/api/tunnel', { appUrl: v })).status, v).toBe(400);
  });
  it('lists each person’s portfolio address once Portfolios is ticked, and not before', async () => {
    await A.put('/api/portfolio', { host: 'owner.example.com' });
    const alice = resolveUser(sys, { provider: 'g', sub: 'a', email: 'alice@x.test', emailVerified: true, name: 'Alice' }, true)!;
    sys.prepare('INSERT INTO portfolio_hosts(host, user_id) VALUES(?, ?)').run('alice.example.com', alice.id);
    expect(await list()).toEqual([]);
    await A.put('/api/tunnel', { appUrl: 'https://frames.example.com', portfolios: true });
    expect(await list()).toEqual(['app:frames.example.com', 'portfolio:owner.example.com (Owner)', 'portfolio:alice.example.com (Alice)']);
    await A.put('/api/tunnel', { portfolios: false });
    expect(await list()).toEqual(['app:frames.example.com']);
  });
  it('says the whole app is open when Frames’ sign-in is off, but never blocks it', async () => {
    const t = (await A.get('/api/tunnel')).body;
    expect(t.appOpen).toBe(true);
    const e = makeEnv({ authUser: 'me', authPassword: 'pw' });
    try {
      const h = { authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') };
      const r = await e.app.inject({ method: 'PUT', url: '/api/tunnel', headers: h, payload: { appUrl: 'https://frames.example.com' } });
      expect(r.statusCode).toBe(200);
      expect(r.json().appOpen).toBe(false);
    } finally { e.app.close(); cleanup(e); }
  });
  it('will not switch on without Cloudflare credentials, keeps them write-only, and leaves them out of backups', async () => {
    expect((await A.put('/api/tunnel', { enabled: true })).status).toBe(400);
    expect((await A.put('/api/tunnel', { accountId: 'not an id' })).status).toBe(400);
    const r = await A.put('/api/tunnel', { accountId: 'A'.repeat(32), apiToken: API });
    expect(r.body).toMatchObject({ hasApiToken: true, apiReady: true, accountId: 'a'.repeat(32) });
    expect(JSON.stringify(r.body)).not.toContain(API);
    expect(JSON.stringify((await A.get('/api/tunnel')).body)).not.toContain(API);
    expect(Buffer.from((await A.get('/api/backup')).body as Buffer).includes(Buffer.from(API))).toBe(false);
    await A.put('/api/tunnel', { clearApiToken: true });
    expect((await A.get('/api/tunnel')).body).toMatchObject({ hasApiToken: false, apiReady: false });
  });
  it('always sends traffic to this server, whatever is typed', async () => {
    const t = (await A.get('/api/tunnel')).body;
    expect(t.service).toMatch(/^http:\/\/localhost:\d+$/);
    await A.put('/api/tunnel', { service: 'http://169.254.169.254', hostnames: [{ hostname: 'x.example.com', kind: 'app' }] });
    expect((await A.get('/api/tunnel')).body.service).toBe(t.service);
    expect(await list()).not.toContain('app:x.example.com');
  });
  it('is read-only when the tunnel is set up from environment variables', async () => {
    sys.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('tunnel', ?)").run(JSON.stringify({ enabled: true, portfolios: false, env: true, mode: 'api', accountId: '', tunnelName: 'x', tunnelId: 't', dns: {}, hostnames: [{ hostname: 'env.example.com', kind: 'app' }] }));
    expect((await A.put('/api/tunnel', { appUrl: 'https://other.example.com' })).status).toBe(409);
    expect((await A.post('/api/tunnel/stop')).status).toBe(409);
    expect(await list()).toEqual(['app:env.example.com']);
    sys.prepare("DELETE FROM settings WHERE key = 'tunnel'").run();
  });
});

describe('pre-filling from the environment', () => {
  let env: Env, sys: any, A: ReturnType<typeof api>;
  beforeAll(() => { env = makeEnv(); A = api(env); sys = (env.app as any).frames.sys; });
  afterAll(() => { env.app.close(); cleanup(env); });

  it('leaves everything alone when nothing is set', async () => {
    seedTunnelFromEnv(sys, env.db, {});
    expect((await A.get('/api/tunnel')).body).toMatchObject({ appUrl: '', hasToken: false, config: { enabled: false, portfolios: false } });
  });
  it('fills in the token (turning the tunnel on), the App URL, and the owner’s portfolio address with Portfolios ticked', async () => {
    seedTunnelFromEnv(sys, env.db, { TUNNEL_TOKEN: TOKEN, APP_HOSTNAME: 'Frames.Example.com', PORTFOLIO_HOSTNAME: 'https://gallery.example.com/' });
    const t = (await A.get('/api/tunnel')).body;
    expect(t).toMatchObject({ appUrl: 'https://frames.example.com', hasToken: true, config: { enabled: true, portfolios: true } });
    expect(t.hostnames.map((h: any) => h.hostname)).toEqual(['frames.example.com', 'gallery.example.com']);
    expect((await A.get('/api/portfolio')).body.config.host).toBe('gallery.example.com');
    expect(JSON.stringify(t)).not.toContain(TOKEN);
  });
  it('wins over what was saved in the app, every start', async () => {
    await A.put('/api/tunnel', { appUrl: 'https://changed.example.com' });
    seedTunnelFromEnv(sys, env.db, { APP_HOSTNAME: 'frames.example.com' });
    expect((await A.get('/api/tunnel')).body.appUrl).toBe('https://frames.example.com');
  });
  it('ignores a hostname that is not valid, and one that is another person’s portfolio address', async () => {
    seedTunnelFromEnv(sys, env.db, { APP_HOSTNAME: 'not a host', PORTFOLIO_HOSTNAME: 'also bad' });
    expect((await A.get('/api/tunnel')).body.appUrl).toBe('https://frames.example.com');
    const bob = resolveUser(sys, { provider: 'g', sub: 'b', email: 'bob@x.test', emailVerified: true, name: 'Bob' }, true)!;
    sys.prepare('INSERT INTO portfolio_hosts(host, user_id) VALUES(?, ?)').run('bobs.example.com', bob.id);
    seedTunnelFromEnv(sys, env.db, { PORTFOLIO_HOSTNAME: 'bobs.example.com' });
    expect((await A.get('/api/portfolio')).body.config.host).toBe('gallery.example.com');
  });
});

describe('Frames sets up the tunnel through the Cloudflare API', () => {
  const ACCOUNT = 'b'.repeat(32), TUNNEL_TOKEN = Buffer.from(JSON.stringify({ a: 'acct', t: 'tunnel', s: 'secret' })).toString('base64');
  const cf = { tunnels: new Map<string, string>(), dns: [] as { id: string; zone: string; name: string; content: string; type: string }[], routes: [] as any[], calls: [] as string[], seq: 0, apps: [] as any[], policies: [] as any[], orgDenied: false };
  let srv: http.Server, base = '', e: Env, A: ReturnType<typeof api>;
  const runs = () => (fs.existsSync(path.join(e.tmp, 'runs.log')) ? fs.readFileSync(path.join(e.tmp, 'runs.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : []);
  const settle = () => new Promise((r) => setTimeout(r, 400));
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      let body = ''; req.on('data', (c) => (body += c));
      req.on('end', () => {
        const url = new URL(req.url!, 'http://x'); const j = body ? JSON.parse(body) : {}; let m: RegExpExecArray | null;
        cf.calls.push(`${req.method} ${url.pathname}`);
        const ok = (result: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ success: true, result })); };
        if ((m = /\/access\/apps\/([^/]+)\/policies/.exec(url.pathname))) {
          if (req.method === 'GET') return ok(cf.policies.filter((x) => x.app === m![1]));
          cf.policies.push({ id: `p${++cf.seq}`, app: m[1], ...j }); return ok({});
        }
        if (/\/access\/apps(\/[^/]+)?$/.test(url.pathname)) {
          if (req.method === 'GET') return ok(cf.apps);
          if (req.method === 'DELETE') { cf.apps = cf.apps.filter((x) => x.id !== url.pathname.split('/').pop()); return ok({}); }
          const id = url.pathname.split('/').pop()!;
          const a = { id: id === 'apps' ? `a${++cf.seq}` : id, aud: 'aud', ...j };
          cf.apps = [...cf.apps.filter((x) => x.id !== a.id), a]; return ok(a);
        }
        if (/\/access\/organizations$/.test(url.pathname)) { if (cf.orgDenied) { res.statusCode = 403; return res.end(JSON.stringify({ success: false, errors: [{ message: 'Authentication error' }] })); } return ok({ auth_domain: 'team.example.test' }); }
        if (url.pathname === '/zones') return ok([{ id: 'z1', name: 'example.com' }, { id: 'z2', name: 'example.org' }]);
        if (/\/cfd_tunnel$/.test(url.pathname) && req.method === 'GET') return ok([...cf.tunnels].filter(([, n]) => n === url.searchParams.get('name')).map(([id, name]) => ({ id, name })));
        if (/\/cfd_tunnel$/.test(url.pathname)) { const id = `tun-${++cf.seq}`; cf.tunnels.set(id, j.name); return ok({ id }); }
        if (/\/configurations$/.test(url.pathname)) { cf.routes = j.config.ingress; return ok({}); }
        if (/\/token$/.test(url.pathname)) return ok(TUNNEL_TOKEN);
        if ((m = /\/zones\/([^/]+)\/dns_records(?:\/([^/]+))?$/.exec(url.pathname))) {
          if (req.method === 'GET') return ok(cf.dns.filter((d) => d.zone === m![1] && d.name === url.searchParams.get('name')));
          if (req.method === 'POST') { const d = { id: `r${++cf.seq}`, zone: m[1], name: j.name, content: j.content, type: j.type }; cf.dns.push(d); return ok(d); }
          if (req.method === 'PUT') { const d = cf.dns.find((x) => x.id === m![2])!; d.content = j.content; return ok(d); }
          if (req.method === 'DELETE') { cf.dns = cf.dns.filter((x) => x.id !== m![2]); return ok({}); }
        }
        res.statusCode = 404; res.end(JSON.stringify({ success: false, errors: [{ message: 'not found' }] }));
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(srv.address() as any).port}`;
    process.env.CLOUDFLARE_API_BASE = base;
    e = makeEnv(); A = api(e); process.env.CLOUDFLARED_BIN = fakeBin(e.tmp, 'ok');
  });
  afterAll(async () => { await e.app.close(); srv.close(); delete process.env.CLOUDFLARED_BIN; delete process.env.CLOUDFLARE_API_BASE; cleanup(e); });

  it('makes the tunnel, its routes and a DNS record per address, then runs it with the token Cloudflare gave', async () => {
    await A.put('/api/tunnel', { appUrl: 'https://frames.example.com', portfolios: true, accountId: ACCOUNT, apiToken: API });
    await A.put('/api/portfolio', { host: 'gallery.example.org' });
    await settle();
    const r = await A.put('/api/tunnel', { enabled: true });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ error: null, hasToken: true });
    expect([...cf.tunnels.values()]).toEqual(['Frames']);
    expect(cf.routes).toEqual([{ hostname: 'frames.example.com', service: 'http://localhost:3000' }, { hostname: 'gallery.example.org', service: 'http://localhost:3000' }, { service: 'http_status:404' }]);
    expect(cf.dns.map((d) => `${d.name} -> ${d.content}`).sort()).toEqual(['frames.example.com -> tun-1.cfargotunnel.com', 'gallery.example.org -> tun-1.cfargotunnel.com']);
    expect(await until(() => runs().length > 0)).toBe(true);
    const run = runs().at(-1);
    expect(run.tokenEnv).toBe(TUNNEL_TOKEN);
    expect(run.argv).not.toContain('--config'); // no local routes file: the routes live in Cloudflare
    expect(JSON.stringify(r.body)).not.toContain('tun-1'); // no tunnel id is kept or shown
    expect(JSON.stringify(e.db.prepare("SELECT value FROM settings WHERE key = 'tunnel'").all())).not.toContain('tun-1');
  });
  it('finds its tunnel by name next time instead of making another, and follows an address change with no restart', async () => {
    const n = runs().length;
    await A.put('/api/auth/config', { publicUrl: 'https://app.example.org' });
    await settle();
    expect(cf.tunnels.size).toBe(1);
    expect(cf.routes.map((x) => x.hostname)).toEqual(['app.example.org', 'gallery.example.org', undefined]);
    expect(cf.dns.map((d) => d.name).sort()).toEqual(['app.example.org', 'gallery.example.org']); // frames.example.com's record, made by Frames, is gone
    expect(runs().length).toBe(n); // a route change in Cloudflare needs no restart
  });
  it('follows a portfolio address and un-ticking Portfolios too', async () => {
    await A.put('/api/portfolio', { host: 'gallery2.example.org' });
    await settle();
    expect(cf.dns.map((d) => d.name).sort()).toEqual(['app.example.org', 'gallery2.example.org']);
    await A.put('/api/tunnel', { portfolios: false });
    expect(cf.dns.map((d) => d.name)).toEqual(['app.example.org']);
    expect(cf.routes.map((x) => x.hostname)).toEqual(['app.example.org', undefined]);
  });
  it('lets the share links and the portfolio paths through Cloudflare Access, and every portfolio address in full', async () => {
    await A.put('/api/tunnel', { portfolios: true });
    await A.put('/api/portfolio', { host: 'gallery3.example.org' });
    await settle();
    const uris = (name: string) => cf.apps.find((a) => a.name === name)?.destinations.map((d: any) => d.uri).sort();
    expect(uris('Frames public paths')).toEqual(expect.arrayContaining(['app.example.org/s/*', 'app.example.org/api/s/*', 'app.example.org/portfolio', 'app.example.org/portfolio/*']));
    expect(uris('Frames portfolio addresses')).toEqual(['gallery3.example.org']);
    for (const a of cf.apps) expect(cf.policies.find((p) => p.app === a.id)).toMatchObject({ decision: 'bypass' });
    expect((await A.get('/api/tunnel')).body.accessNote).toBe(null);
    expect((await A.get('/api/portfolio')).body.dnsTarget).toBe('app.example.org'); // what a portfolio address's DNS points at
    await A.put('/api/tunnel', { portfolios: false });
    expect(cf.apps.find((a) => a.name === 'Frames portfolio addresses')).toBeUndefined(); // nothing left to list: removed
  });
  it('protects the App URL with Cloudflare Access when asked, for the people on the allow-list, and signs them in from it', async () => {
    const r1 = await A.put('/api/tunnel', { protect: true });
    expect(r1.body.error).toMatch(/Add the people allowed in/); // nobody on the list: Access would let no one in, so nothing is made
    expect(cf.apps.find((a) => a.name === 'Frames (app.example.org)')).toBeUndefined();
    await A.put('/api/auth/config', { allow: 'alice@x.test, @family.test, github:123' });
    await settle();
    expect((await A.get('/api/tunnel')).body.error).toBe(null);
    const main = cf.apps.find((a) => a.name === 'Frames (app.example.org)');
    expect(main.destinations.map((d: any) => d.uri)).toEqual(['app.example.org']);
    expect(cf.policies.find((p) => p.app === main.id)).toMatchObject({ decision: 'allow', include: [{ email: { email: 'alice@x.test' } }, { email_domain: { domain: 'family.test' } }] });
    const provider = (await A.get('/api/auth/config')).body.providers.find((p: any) => p.type === 'cloudflare');
    expect(provider).toMatchObject({ teamDomain: 'team.example.test', aud: 'aud' });
    expect((await A.get('/api/tunnel')).body.appOpen).toBe(false);
    const shown = (await A.get('/api/tunnel')).body.accessApps;
    expect(shown.map((a: any) => `${a.decision}:${a.name}`)).toEqual(['allow:Frames (app.example.org)', 'bypass:Frames public paths']);
    expect(shown[0]).toMatchObject({ addresses: ['app.example.org'], who: ['alice@x.test', '@family.test'] });
    expect(shown[1].addresses).toEqual(expect.arrayContaining(['app.example.org/s/*', 'app.example.org/portfolio/*']));
    await A.put('/api/tunnel', { protect: false });
    expect(cf.apps.find((a) => a.name === 'Frames (app.example.org)')).toBeUndefined(); // un-ticking removes what it made
  });
  it('still puts the Access login in place when the team domain cannot be read, and says which permission is missing', async () => {
    cf.orgDenied = true;
    await A.put('/api/auth/config', { providers: [] });
    await A.put('/api/tunnel', { protect: true });
    await settle();
    const t = (await A.get('/api/tunnel')).body;
    expect(t.error).toBe(null);
    expect(t.protectApplied).toBe(true);
    expect(t.orgNote).toMatch(/Organizations, Identity Providers, and Groups, Read/);
    expect(cf.apps.some((a) => a.name === 'Frames (app.example.org)')).toBe(true); // the login is there
    expect((await A.get('/api/auth/config')).body.providers.some((p: any) => p.type === 'cloudflare')).toBe(false); // the sign-in method waits
    cf.orgDenied = false;
    await A.put('/api/tunnel', { protect: false });
  });
  it('switches itself on once set up, and stays off after the person switches it off', async () => {
    expect((await A.get('/api/tunnel')).body.config.enabled).toBe(true); // nobody pressed Run
    await A.post('/api/tunnel/stop');
    await A.put('/api/auth/config', { publicUrl: 'https://app.example.org' });
    await settle();
    expect((await A.get('/api/tunnel')).body.config.enabled).toBe(false); // their choice is kept
    await A.post('/api/tunnel/start');
    expect((await A.get('/api/tunnel')).body.config.enabled).toBe(true);
  });
  it('never touches a DNS record it did not make, and shows Cloudflare’s reason when it cannot', async () => {
    cf.dns.push({ id: 'mine', zone: 'z1', name: 'other.example.com', content: 'x', type: 'CNAME' });
    await A.put('/api/auth/config', { publicUrl: 'https://another.example.org' });
    await settle();
    expect(cf.dns.some((d) => d.id === 'mine')).toBe(true);
    await A.put('/api/auth/config', { publicUrl: 'https://nowhere.invalid-domain.test' });
    await settle();
    expect((await A.get('/api/tunnel')).body.error).toMatch(/No domain on this Cloudflare account matches/);
  });
});

describe('coming back up with the server', () => {
  it('starts the saved tunnel even when left-over environment variables for the Cloudflare API do not work', async () => {
    const e = makeEnv({ cloudflareApi: 'http://127.0.0.1:9' });
    const keys = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'APP_HOSTNAME', 'ACCESS_EMAILS', 'CLOUDFLARED_BIN'];
    const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    try {
      // A tunnel set up in Settings and running, then the container is updated and still carries the old variables (a revoked token).
      const sys0 = (e.app as any).frames.sys;
      sys0.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('tunnel', ?)").run(JSON.stringify({ enabled: true }));
      sys0.prepare("INSERT OR REPLACE INTO settings(key, value) VALUES('secret:cloudflare:tunnelToken', ?)").run(JSON.stringify(TOKEN));
      await e.app.close();
      Object.assign(process.env, { CLOUDFLARE_API_TOKEN: 'revoked-' + 'x'.repeat(30), CLOUDFLARE_ACCOUNT_ID: 'c'.repeat(32), APP_HOSTNAME: 'frames.example.com', ACCESS_EMAILS: 'me@example.com', CLOUDFLARED_BIN: fakeBin(e.tmp, 'ok') });
      const { buildApp } = await import('./app.js');
      const { openDb } = await import('./db.js');
      e.app = buildApp(openDb(e.data), e.cfg);
      const A = api(e);
      let state = '';
      for (let i = 0; i < 80 && state !== 'connected'; i++) { state = (await A.get('/api/tunnel')).body.status.state; if (state !== 'connected') await new Promise((r) => setTimeout(r, 100)); }
      expect(state).toBe('connected');
    } finally {
      for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
      await e.app.close(); cleanup(e);
    }
  });
});
