import { afterEach, describe, expect, it } from 'vitest';
import { applyEnvConfig, buildEnvFile, envLine, isConfigKey, OWNER_VAR, snapshot, SYSTEM_VAR } from './envConfig.js';
import { setSetting } from './db.js';
import { getUser } from './users.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

// The built-in way Docker Compose reads a value, for the quoting forms envLine produces.
const parseEnv = (text: string) => {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    const k = line.slice(0, i); let v = line.slice(i + 1);
    if (v.startsWith("'")) v = v.slice(1, -1);
    else if (v.startsWith('"')) v = v.slice(1, -1).replace(/\\(["\\])/g, '$1').replace(/\$\$/g, '$');
    out[k] = v;
  }
  return out;
};
const sysOf = (e: Env) => (e.app as any).frames.sys;
const SECRET = 'sk-' + Buffer.from('export-test').toString('hex');
const envs: Env[] = [];
const mk = (extra = {}) => { const e = makeEnv(extra); envs.push(e); return e; };
afterEach(() => { for (const e of envs.splice(0)) { e.app.close(); cleanup(e); } delete process.env[SYSTEM_VAR]; delete process.env[OWNER_VAR]; });

describe('which settings travel', () => {
  it('everything about how Frames is set up, secrets included, and nothing about what is happening now', () => {
    const e = mk();
    setSetting(e.db, 'aiSources', [{ id: 'a', type: 'openai' }]);
    setSetting(e.db, 'secret:ai:a:key', SECRET);
    setSetting(e.db, 'lastScan', 'now'); setSetting(e.db, 'lastScan:/x', 'now'); setSetting(e.db, 'reviewSession', { index: 1 });
    const s = snapshot(e.db);
    expect(s['secret:ai:a:key']).toBe(SECRET);
    expect(s.aiSources).toEqual([{ id: 'a', type: 'openai' }]);
    for (const k of ['lastScan', 'lastScan:/x', 'reviewSession']) expect(k in s, k).toBe(false);
    expect(isConfigKey('legacyMigrated')).toBe(false);
    expect(isConfigKey('tunnelEnvState')).toBe(false);
    expect(isConfigKey('../etc')).toBe(false);
    expect(isConfigKey('secret:cloud:tok:ab12')).toBe(true);
  });
});

describe('the env file', () => {
  it('switches its own export off, says how to use it, and carries the settings as JSON', () => {
    const e = mk();
    setSetting(e.db, 'secret:ai:a:key', SECRET);
    const f = buildEnvFile(sysOf(e), e.db, { version: '1.2.3', date: new Date('2026-11-04T00:00:00Z'), env: {} });
    expect(f).toContain('# Frames 1.2.3 settings, exported 2026-11-04.');
    expect(f).toMatch(/^ALLOW_ENV_EXPORT=false$/m);
    const v = parseEnv(f);
    expect(v.ALLOW_ENV_EXPORT).toBe('false');
    expect(JSON.parse(v[OWNER_VAR])['secret:ai:a:key']).toBe(SECRET);
    expect(JSON.parse(v[SYSTEM_VAR])).toBeTypeOf('object');
    expect(f.endsWith('\n')).toBe(true);
  });
  it('carries over the plain variables the container was started with, and only those', () => {
    const e = mk();
    const f = buildEnvFile(sysOf(e), e.db, { env: { AUTH_DISABLE: 'true', AUTH_PASSWORD: 'pass word', APP_HOSTNAME: 'frames.example.com', PATH: '/usr/bin', HOME: '/root', EMPTY: '' } });
    const v = parseEnv(f);
    expect(v).toMatchObject({ AUTH_DISABLE: 'true', AUTH_PASSWORD: 'pass word', APP_HOSTNAME: 'frames.example.com' });
    expect('PATH' in v || 'HOME' in v || 'EMPTY' in v).toBe(false);
  });
  it('is quoted so Docker Compose reads back exactly what was written, whatever the values hold', () => {
    const e = mk();
    for (const value of ["plain", 'has space', "it's", 'a"b', 'cost $5 and $$', 'back\\slash', '{"k":"v with \\"quotes\\" and \'single\' and $x"}']) {
      const line = envLine('K', value);
      expect(parseEnv(line)['K'], line).toBe(value);
    }
    expect(() => envLine('K', 'one\ntwo')).toThrow(/line break/);
    void e;
  });
});

describe('the env file wins', () => {
  it('writes its settings over what was saved, and leaves other saved settings alone', () => {
    const e = mk();
    setSetting(e.db, 'aiSources', [{ id: 'old' }]);
    setSetting(e.db, 'keepMe', 1);
    const r = applyEnvConfig(sysOf(e), e.db, { [OWNER_VAR]: JSON.stringify({ aiSources: [{ id: 'new' }], 'secret:ai:new:key': SECRET }), [SYSTEM_VAR]: JSON.stringify({ privacy: { operator: 'Studio', contact: '', extra: '' } }) });
    expect(r).toEqual({ applied: 3, problems: [] });
    expect(snapshot(e.db)).toMatchObject({ aiSources: [{ id: 'new' }], 'secret:ai:new:key': SECRET, keepMe: 1 });
    expect(snapshot(sysOf(e)).privacy).toMatchObject({ operator: 'Studio' });
  });
  it('ignores volatile and malformed names, and reports JSON it cannot read instead of guessing', () => {
    const e = mk();
    const r = applyEnvConfig(sysOf(e), e.db, { [OWNER_VAR]: JSON.stringify({ lastScan: 'x', '../bad': 1, ok: 2 }), [SYSTEM_VAR]: '{not json' });
    expect(r.applied).toBe(1);
    expect(r.problems[0]).toMatch(/FRAMES_CONFIG_SYSTEM is not valid JSON/);
    expect(snapshot(e.db)).toMatchObject({ ok: 2 });
    expect('lastScan' in snapshot(e.db)).toBe(false);
    expect(applyEnvConfig(sysOf(e), e.db, { [OWNER_VAR]: '[1,2]' }).problems[0]).toMatch(/not valid JSON/);
  });
  it('makes the person who tested sign-in the owner, and registers the portfolio hostname', () => {
    const e = mk();
    const tester = { provider: 'g', sub: 'owner-sub', email: 'me@example.com', emailVerified: true, name: 'Me' };
    applyEnvConfig(sysOf(e), e.db, { [SYSTEM_VAR]: JSON.stringify({ auth: { enabled: true, providers: [], allow: [], publicUrl: '', testedBy: tester } }), [OWNER_VAR]: JSON.stringify({ portfolio: { host: 'Gallery.Example.com' } }) });
    expect(getUser(sysOf(e), 1)).toMatchObject({ provider: 'g', sub: 'owner-sub', role: 'admin' });
    expect(sysOf(e).prepare("SELECT user_id FROM portfolio_hosts WHERE host = 'gallery.example.com'").get()).toEqual({ user_id: 1 });
  });
});

describe('export, import, and the block', () => {
  it('moves a configured app (AI sources, keys, the tunnel token, the privacy page) to a fresh one, and then refuses a second export', async () => {
    // 1. Set up with no variables at all, through the app.
    const a = mk(); const A = api(a);
    const created = (await A.post('/api/ai/sources', { type: 'openai', endpoint: 'https://api.example.test', model: 'm1', embedModel: 'e1', ack: true, key: SECRET })).body.sources[0];
    await A.put('/api/ai/active', { id: created.id });
    await A.put('/api/tunnel', { tunnelToken: SECRET + '-tunnel', appUrl: 'https://frames.example.com' });
    await A.put('/api/admin/privacy', { operator: 'Studio', contact: 'hi@example.test' });
    // 2. Export: allowed (the default), and an attachment that is never cached.
    const r = await A.raw('GET', '/api/admin/env/export');
    expect(r.status).toBe(200);
    expect(String(r.headers['content-disposition'])).toContain('frames.env');
    expect(String(r.headers['cache-control'])).toBe('no-store');
    const text = Buffer.from(r.body as Buffer).toString();
    expect(text).toContain(SECRET);
    // 3. Use the file as the stack's env on a fresh instance: its values win, and export is now off.
    const vars = parseEnv(text);
    process.env[SYSTEM_VAR] = vars[SYSTEM_VAR]; process.env[OWNER_VAR] = vars[OWNER_VAR];
    const b = mk({ allowEnvExport: vars.ALLOW_ENV_EXPORT !== 'false' }); const B = api(b);
    const list = (await B.get('/api/ai/sources')).body;
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0]).toMatchObject({ type: 'openai', model: 'm1', hasKey: true, ready: true });
    expect(list.active).toBe(created.id);
    expect(JSON.stringify(list)).not.toContain(SECRET); // still write-only through the API
    expect((await B.get('/api/tunnel')).body).toMatchObject({ hasToken: true, appUrl: 'https://frames.example.com' });
    expect(String((await B.get('/privacy')).body)).toContain('Studio');
    expect((await B.get('/api/me')).body.envConfig).toBe(true);
    const again = await B.get('/api/admin/env/export');
    expect(again.status).toBe(403);
    expect(again.body.error).toMatch(/ALLOW_ENV_EXPORT/);
    expect((await B.get('/api/admin/env')).body).toMatchObject({ allowed: false, loaded: { system: true, owner: true } });
  });
  it('changes made in the app after import last only until restart: the env file wins again', async () => {
    const a = mk(); const A = api(a);
    await A.put('/api/admin/privacy', { operator: 'From the file' });
    const vars = parseEnv(Buffer.from((await A.raw('GET', '/api/admin/env/export')).body as Buffer).toString());
    process.env[SYSTEM_VAR] = vars[SYSTEM_VAR]; process.env[OWNER_VAR] = vars[OWNER_VAR];
    const b = mk(); const B = api(b);
    await B.put('/api/admin/privacy', { operator: 'Changed in the app' });
    expect(String((await B.get('/privacy')).body)).toContain('Changed in the app');
    applyEnvConfig(sysOf(b), b.db); // what the next start does
    expect(String((await B.get('/privacy')).body)).toContain('From the file');
  });
  it('is for administrators only, and not reachable without signing in', async () => {
    const e = mk({ authUser: 'me', authPassword: 'pw' });
    expect((await e.app.inject('/api/admin/env/export')).statusCode).toBe(401);
    expect((await e.app.inject({ url: '/api/admin/env/export', headers: { authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') } })).statusCode).toBe(200);
  });
});
