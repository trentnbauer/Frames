import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTunnelRunner } from './tunnel.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

const TOKEN = 'eyJhIjoiMTIzNDU2Nzg5MCIsInQiOiJhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiIsInMiOiJzZWNyZXQifQ==';

/** A stand-in for cloudflared: records how it was started, serves /ready on the metrics port, and logs the token (so redaction is tested). */
function fakeBin(dir: string, kind: 'ok' | 'die'): string {
  const f = path.join(dir, `fake-cloudflared-${kind}`);
  fs.writeFileSync(f, `#!/usr/bin/env node
const fs = require('node:fs'), http = require('node:http');
const argv = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(path.join(dir, 'runs.log'))}, JSON.stringify({ argv, tokenEnv: process.env.TUNNEL_TOKEN, pid: process.pid }) + '\\n');
console.error('connecting with token ' + process.env.TUNNEL_TOKEN + ' to the edge');
if (${JSON.stringify(kind)} === 'die') { console.error('Failed to start'); process.exit(1); }
const m = argv[argv.indexOf('--metrics') + 1].split(':');
setTimeout(() => http.createServer((q, r) => { r.writeHead(q.url === '/ready' ? 200 : 404); r.end('ok'); }).listen(+m[1], m[0]), 200);
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  return f;
}
const until = async (fn: () => boolean, ms = 8000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 50)); return fn(); };

/** A stand-in for the Cloudflare API, with just enough memory to tell whether a call is repeated. */
const cf = { tunnels: new Map<string, { name: string }>(), dns: [] as { id: string; zone: string; type: string; name: string; content: string; proxied?: boolean }[], routes: [] as any[], calls: [] as string[], authSeen: new Set<string>(), seq: 0 };
let cfServer: http.Server, cfBase = '';
const ZONES = [{ id: 'z1', name: 'example.com' }, { id: 'z2', name: 'sub.example.com' }, { id: 'z3', name: 'mygallery.net' }];
beforeAll(async () => {
  cfServer = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', () => {
      const url = new URL(req.url!, 'http://x');
      cf.calls.push(`${req.method} ${url.pathname}`);
      cf.authSeen.add(String(req.headers.authorization));
      const ok = (result: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: true, result })); };
      const err = (code: number, message: string) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, errors: [{ message }] })); };
      if (req.headers.authorization !== 'Bearer good-api-token') return err(403, 'Authentication error');
      const j = body ? JSON.parse(body) : {};
      let m: RegExpExecArray | null;
      if (url.pathname === '/zones') return ok(ZONES);
      if (req.method === 'POST' && /\/cfd_tunnel$/.test(url.pathname)) { const id = `tun-${++cf.seq}`; cf.tunnels.set(id, { name: j.name }); return ok({ id }); }
      if ((m = /\/cfd_tunnel\/([^/]+)$/.exec(url.pathname)) && req.method === 'GET') return cf.tunnels.has(m[1]) ? ok({ id: m[1] }) : err(404, 'Tunnel not found');
      if ((m = /\/cfd_tunnel\/([^/]+)\/configurations$/.exec(url.pathname))) { cf.routes = j.config.ingress; return ok({}); }
      if ((m = /\/cfd_tunnel\/([^/]+)\/token$/.exec(url.pathname))) return ok(`${TOKEN}`);
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
afterAll(() => cfServer.close());

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

describe('what may be exposed, and what is checked', () => {
  let env: Env, A: ReturnType<typeof api>;
  beforeAll(() => { env = makeEnv(); A = api(env); });
  afterAll(() => cleanup(env));

  it('rejects bad hostnames and account IDs', async () => {
    expect((await A.put('/api/tunnel', { hostnames: [{ hostname: 'not a host', kind: 'portfolio' }] })).status).toBe(400);
    expect((await A.put('/api/tunnel', { hostnames: [{ hostname: 'a.example.com', kind: 'app' }, { hostname: 'A.example.com', kind: 'app' }] })).body.error).toMatch(/twice|sign-in/);
    expect((await A.put('/api/tunnel', { accountId: 'short' })).status).toBe(400);
  });
  it('lets a hostname show the portfolio only if it is the portfolio’s own address', async () => {
    const r = await A.put('/api/tunnel', { hostnames: [{ hostname: 'photography.example.com', kind: 'portfolio' }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/portfolio’s own address/);
    await A.put('/api/portfolio', { host: 'photography.example.com' });
    expect((await A.put('/api/tunnel', { hostnames: [{ hostname: 'photography.example.com', kind: 'portfolio' }] })).status).toBe(200);
  });
  it('refuses to expose the whole app unless sign-in is on', async () => {
    const r = await A.put('/api/tunnel', { hostnames: [{ hostname: 'frames.example.com', kind: 'app' }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Turn on sign-in/);
    const e = makeEnv({ authUser: 'me', authPassword: 'pw' });
    try {
      const h = { authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') };
      const ok = await e.app.inject({ method: 'PUT', url: '/api/tunnel', headers: h, payload: { hostnames: [{ hostname: 'frames.example.com', kind: 'app' }] } });
      expect(ok.statusCode).toBe(200);
    } finally { cleanup(e); }
  });
  it('will not switch on without a token, and keeps tokens write-only', async () => {
    expect((await A.put('/api/tunnel', { enabled: true })).status).toBe(400);
    const r = await A.put('/api/tunnel', { tunnelToken: TOKEN, apiToken: 'good-api-token' });
    expect(r.body).toMatchObject({ hasToken: true, hasApiToken: true });
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
    expect(JSON.stringify(r.body)).not.toContain('good-api-token');
    expect(JSON.stringify((await A.get('/api/tunnel')).body)).not.toContain(TOKEN);
  });
  it('never sends the tokens in a backup', async () => {
    const dl = await A.get('/api/backup');
    expect((dl.body as Buffer).includes(Buffer.from(TOKEN))).toBe(false);
    expect((dl.body as Buffer).includes(Buffer.from('good-api-token'))).toBe(false);
  });
  it('always sends traffic to this server, whatever is typed', async () => {
    const r = await A.get('/api/tunnel');
    expect(r.body.service).toMatch(/^http:\/\/localhost:\d+$/);
  });
});

describe('automatic setup through the Cloudflare API', () => {
  let env: Env, A: ReturnType<typeof api>;
  const setup = async (hosts: { hostname: string; kind: 'portfolio' | 'app' }[], token = 'good-api-token') => {
    await A.put('/api/tunnel', { mode: 'api', accountId: 'a'.repeat(32), apiToken: token, tunnelName: 'Frames test', hostnames: hosts });
    return A.post('/api/tunnel/apply');
  };
  beforeAll(async () => {
    env = makeEnv({ cloudflareApi: cfBase });
    A = api(env);
    await A.put('/api/portfolio', { host: 'photography.example.com' });
  });
  afterAll(() => cleanup(env));

  it('creates the tunnel, its route to this server, a proxied DNS record, and keeps the token', async () => {
    const r = await setup([{ hostname: 'photography.example.com', kind: 'portfolio' }]);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(cf.tunnels.get(r.body.tunnelId)?.name).toBe('Frames test');
    expect(cf.routes[0]).toMatchObject({ hostname: 'photography.example.com', service: expect.stringMatching(/^http:\/\/localhost:\d+$/) });
    expect(cf.routes.at(-1)).toEqual({ service: 'http_status:404' }); // anything else gets "not found" at Cloudflare's edge too
    expect(cf.dns).toHaveLength(1);
    expect(cf.dns[0]).toMatchObject({ type: 'CNAME', name: 'photography.example.com', content: `${r.body.tunnelId}.cfargotunnel.com`, proxied: true, zone: 'z1' });
    expect((await A.get('/api/tunnel')).body.hasToken).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
  });
  it('is safe to run again: no second tunnel, no duplicate DNS record', async () => {
    const before = { t: cf.tunnels.size, d: cf.dns.length };
    expect((await A.post('/api/tunnel/apply')).body.ok).toBe(true);
    expect(cf.tunnels.size).toBe(before.t);
    expect(cf.dns.length).toBe(before.d);
  });
  it('makes a new tunnel if the old one was deleted in Cloudflare', async () => {
    cf.tunnels.clear();
    const r = await A.post('/api/tunnel/apply');
    expect(r.body.ok).toBe(true);
    expect(cf.tunnels.has(r.body.tunnelId)).toBe(true);
  });
  it('picks the right domain, including a subdomain that is its own zone', async () => {
    await A.put('/api/portfolio', { host: 'gallery.sub.example.com' });
    const r = await setup([{ hostname: 'gallery.sub.example.com', kind: 'portfolio' }]);
    expect(r.body.ok).toBe(true);
    expect(cf.dns.find((d) => d.name === 'gallery.sub.example.com')?.zone).toBe('z2');
  });
  it('works for a bare domain (the zone itself), not just subdomains', async () => {
    await A.put('/api/portfolio', { host: 'mygallery.net' });
    const r = await setup([{ hostname: 'mygallery.net', kind: 'portfolio' }]);
    expect(r.body.ok).toBe(true);
    expect(cf.dns.find((d) => d.name === 'mygallery.net')?.zone).toBe('z3');
  });
  it('removes only the DNS records it made, for hostnames you took off', async () => {
    cf.dns.push({ id: 'theirs', zone: 'z1', type: 'A', name: 'www.example.com', content: '1.2.3.4' });
    await A.put('/api/portfolio', { host: 'photography.example.com' });
    await setup([{ hostname: 'photography.example.com', kind: 'portfolio' }]);
    expect(cf.dns.some((d) => d.name === 'gallery.sub.example.com')).toBe(false);
    expect(cf.dns.some((d) => d.id === 'theirs')).toBe(true); // somebody else's record is never touched
  });
  it('will not overwrite a DNS record that is not a CNAME, and says which hostname', async () => {
    cf.dns.push({ id: 'a-rec', zone: 'z1', type: 'A', name: 'taken.example.com', content: '5.6.7.8' });
    await A.put('/api/portfolio', { host: 'taken.example.com' });
    const r = await setup([{ hostname: 'taken.example.com', kind: 'portfolio' }]);
    expect(r.body.ok).toBe(false);
    expect(r.body.result[0]).toMatchObject({ ok: false, detail: expect.stringContaining('non-CNAME') });
    expect(cf.dns.find((d) => d.id === 'a-rec')?.content).toBe('5.6.7.8');
  });
  it('changes nothing if a hostname is not on the account, and says so', async () => {
    const before = { t: cf.tunnels.size, d: cf.dns.length, c: cf.calls.length };
    await A.put('/api/portfolio', { host: 'photos.nowhere.org' });
    const r = await setup([{ hostname: 'photos.nowhere.org', kind: 'portfolio' }]);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/No domain on this Cloudflare account matches photos\.nowhere\.org/);
    expect(cf.tunnels.size).toBe(before.t);
    expect(cf.dns.length).toBe(before.d);
    expect(cf.calls.slice(before.c).some((c) => c.startsWith('POST') || c.startsWith('PUT'))).toBe(false);
  });
  it('passes on Cloudflare’s own message when the API token is wrong, without echoing it', async () => {
    const r = await setup([{ hostname: 'photography.example.com', kind: 'portfolio' }].map((h) => h), 'bad-token');
    expect(r.status).toBe(400);
    expect(r.body.error).toContain('Authentication error');
    expect(JSON.stringify(r.body)).not.toContain('bad-token');
  });
  it('needs the account and a token first', async () => {
    const e = makeEnv({ cloudflareApi: cfBase });
    try {
      const r = await api(e).post('/api/tunnel/apply');
      expect(r.status).toBe(400);
    } finally { cleanup(e); }
  });
});

describe('shutting down', () => {
  it('stops cloudflared when the server stops', async () => {
    const e = makeEnv();
    try {
      process.env.CLOUDFLARED_BIN = fakeBin(e.tmp, 'ok');
      const A = api(e);
      await A.put('/api/tunnel', { tunnelToken: TOKEN });
      await A.post('/api/tunnel/start');
      expect(await until(() => ((A as any) && true) && fs.existsSync(path.join(e.tmp, 'runs.log')))).toBe(true);
      const pid = JSON.parse(fs.readFileSync(path.join(e.tmp, 'runs.log'), 'utf8').trim().split('\n').at(-1)!).pid;
      expect(() => process.kill(pid, 0)).not.toThrow();
      await e.app.close();
      expect(await until(() => { try { process.kill(pid, 0); return false; } catch { return true; } })).toBe(true);
    } finally { delete process.env.CLOUDFLARED_BIN; cleanup(e); }
  });
});
