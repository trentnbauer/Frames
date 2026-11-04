import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTunnelRunner } from './tunnel.js';
import { seedTunnelFromEnv } from './tunnelEnv.js';
import { resolveUser } from './users.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

// Built at run time, in the shape of a real tunnel token (base64 JSON), so no token-like literal sits in the repo.
const TOKEN = Buffer.from(JSON.stringify({ a: '1234567890', t: 'abcdefghijklmnopqrstuvwxyz', s: 'secret' })).toString('base64');

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


describe('the tunnel page: App URL, Portfolios and the token', () => {
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
  it('will not switch on without a token, keeps tokens write-only, and leaves them out of backups', async () => {
    expect((await A.put('/api/tunnel', { enabled: true })).status).toBe(400);
    const r = await A.put('/api/tunnel', { tunnelToken: TOKEN });
    expect(r.body).toMatchObject({ hasToken: true });
    expect(JSON.stringify(r.body)).not.toContain(TOKEN);
    expect(JSON.stringify((await A.get('/api/tunnel')).body)).not.toContain(TOKEN);
    expect(Buffer.from((await A.get('/api/backup')).body as Buffer).includes(Buffer.from(TOKEN))).toBe(false);
    await A.put('/api/tunnel', { clearTunnelToken: true });
    expect((await A.get('/api/tunnel')).body.hasToken).toBe(false);
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
