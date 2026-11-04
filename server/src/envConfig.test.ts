import { afterEach, describe, expect, it } from 'vitest';
import { applyEnvConfig, buildEnvFile, envLine, isConfigKey, OWNER_VAR, snapshot, SYSTEM_VAR } from './envConfig.js';
import { getSetting, setSetting } from './db.js';
import { getUser } from './users.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
// Nothing in these tests may reach the real Cloudflare: a made-up token is saved, and Frames would try it.
process.env.CLOUDFLARE_API_BASE = 'http://127.0.0.1:9';

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
const used: string[] = [];
/** What loading the file as the stack's env does: every setting variable becomes part of the environment. */
const useVars = (vars: Record<string, string>) => { for (const [k, v] of Object.entries(vars)) if (k !== 'ALLOW_ENV_EXPORT') { process.env[k] = v; used.push(k); } };
afterEach(() => { for (const e of envs.splice(0)) { e.app.close(); cleanup(e); } for (const k of used.splice(0)) delete process.env[k]; delete process.env[SYSTEM_VAR]; delete process.env[OWNER_VAR]; });

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
  it('switches its own export off, says how to use it, and carries each server setting as its own plain variable, and nobody’s library', () => {
    const e = mk();
    setSetting(sysOf(e), 'aiSources', [{ id: 'a', type: 'openai', name: 'Main', endpoint: 'https://api.example.test', model: 'm1', embedModel: '', ack: true }]);
    setSetting(sysOf(e), 'secret:ai:a:key', SECRET);
    // The owner's own library: not the server's, so not in the file.
    setSetting(e.db, 'aiSources', [{ id: 'mine', type: 'ollama', name: 'My own', endpoint: 'http://ollama:11434', model: 'llava', embedModel: '', ack: false }]);
    setSetting(e.db, 'secret:ai:mine:key', 'owner-private-key');
    setSetting(e.db, 'portfolio', { tagline: 'Owner only' });
    setSetting(e.db, 'cloud', { clients: {}, connections: [{ id: 'c1', provider: 'google', account: 'me@x.test' }] });
    const f = buildEnvFile(sysOf(e), e.db, { version: '1.2.3', date: new Date('2026-11-04T00:00:00Z'), env: {} });
    expect(f).toContain('# Frames 1.2.3 settings, exported 2026-11-04.');
    expect(f).toMatch(/^ALLOW_ENV_EXPORT=false$/m);
    const v = parseEnv(f);
    expect(v.ALLOW_ENV_EXPORT).toBe('false');
    expect(v).toMatchObject({ SHARED_AI_1_ID: 'a', SHARED_AI_1_TYPE: 'openai', SHARED_AI_1_ENDPOINT: 'https://api.example.test', SHARED_AI_1_MODEL: 'm1', SHARED_AI_1_ACK: 'true', SHARED_AI_1_KEY: SECRET });
    expect(f).not.toContain('FRAMES_CONFIG_'); // no JSON blobs
    expect(f).not.toContain('FRAMES_OWNER__');
    for (const gone of ['My own', 'owner-private-key', 'Owner only', 'AI_1_', 'CLOUD_1_', 'me@x.test']) expect(f.replace(/SHARED_AI_1_/g, ''), gone).not.toContain(gone);
    expect(f.endsWith('\n')).toBe(true);
  });
  it('carries over the plain variables the container was started with, and only those', () => {
    const e = mk();
    const f = buildEnvFile(sysOf(e), e.db, { env: { AUTH_DISABLE: 'true', AUTH_PASSWORD: 'pass word', APP_HOSTNAME: 'frames.example.com', PATH: '/usr/bin', HOME: '/root', EMPTY: '' } });
    const v = parseEnv(f);
    expect(v).toMatchObject({ AUTH_DISABLE: 'true', AUTH_PASSWORD: 'pass word' });
    expect('PATH' in v || 'HOME' in v || 'EMPTY' in v).toBe(false);
    // The Cloudflare API variables are the environment setup's: left-overs when the tunnel is managed from Settings, so not carried.
    expect('APP_HOSTNAME' in v).toBe(false);
    setSetting(sysOf(e), 'tunnel', { env: true });
    expect(parseEnv(buildEnvFile(sysOf(e), e.db, { env: { APP_HOSTNAME: 'frames.example.com' } })).APP_HOSTNAME).toBe('frames.example.com');
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

describe('readable names', () => {
  it('numbers every shared AI and sign-in method, with its key beside it, and reads them back exactly', () => {
    const a = mk();
    const s = sysOf(a);
    setSetting(s, 'aiSources', [
      { id: 'one', type: 'ollama', name: 'Home', endpoint: 'http://ollama:11434', model: 'llava', embedModel: 'nomic', ack: false },
      { id: 'two', type: 'openai', name: '12345', endpoint: 'https://api.example.test', model: 'true', embedModel: '', ack: true },
    ]);
    setSetting(s, 'secret:ai:two:key', SECRET);
    setSetting(s, 'auth', { enabled: true, allow: ['me@x.test', '@family.test'], publicUrl: 'https://frames.example.com', testedBy: { provider: 'g1', sub: 's', email: 'me@x.test', emailVerified: true, name: 'Me' },
      providers: [{ id: 'g1', type: 'google', name: 'Google', clientId: 'cid-1' }, { id: 'cf', type: 'cloudflare', name: 'Cloudflare Access', clientId: '', teamDomain: 'team.example.test', aud: 'a'.repeat(64) }] });
    setSetting(s, 'secret:oauth:g1', 'oauth-secret-1');
    setSetting(s, 'cloudClients', { google: { clientId: 'goog-id' } });
    setSetting(s, 'secret:cloud:client:google', 'goog-secret');
    setSetting(s, 'privacy', { operator: 'Studio\nTwo' });
    const file = buildEnvFile(s, a.db, { env: {} });
    const v = parseEnv(file);
    expect(v).toMatchObject({
      SHARED_AI_1_ID: 'one', SHARED_AI_1_ENDPOINT: 'http://ollama:11434', SHARED_AI_1_EMBED_MODEL: 'nomic', SHARED_AI_1_ACK: 'false',
      SHARED_AI_2_NAME: '"12345"', SHARED_AI_2_MODEL: '"true"', SHARED_AI_2_KEY: SECRET, // text that looks like a number or a boolean is quoted so it stays text
      AUTH_ENABLED: 'true', AUTH_ALLOW: 'me@x.test,@family.test', AUTH_PUBLIC_URL: 'https://frames.example.com',
      AUTH_1_TYPE: 'google', AUTH_1_CLIENT_ID: 'cid-1', AUTH_1_KEY: 'oauth-secret-1', AUTH_2_TYPE: 'cloudflare', AUTH_2_TEAM_DOMAIN: 'team.example.test',
      CLOUD_GOOGLE_CLIENT_ID: 'goog-id', CLOUD_GOOGLE_CLIENT_SECRET: 'goog-secret',
    });
    expect(v.FRAMES_SYSTEM__privacy__operator).toBe('"Studio\\nTwo"'); // the rest is by path, a line break kept as text
    expect(file.split('\n').some((l) => l.startsWith('FRAMES_CONFIG'))).toBe(false); // no JSON blobs
    // Read it all back into a fresh instance.
    const b = mk();
    const out = applyEnvConfig(sysOf(b), b.db, v);
    expect(out.problems).toEqual([]);
    const want = snapshot(s), got = snapshot(sysOf(b));
    for (const k of ['aiSources', 'secret:ai:two:key', 'auth', 'secret:oauth:g1', 'cloudClients', 'secret:cloud:client:google', 'privacy']) expect(got[k], k).toEqual(want[k]);
  });
  it('can be written by hand: a few variables are enough, and a plain list for who is allowed in', () => {
    const b = mk();
    const out = applyEnvConfig(sysOf(b), b.db, { SHARED_AI_1_ID: 'mine', SHARED_AI_1_TYPE: 'ollama', SHARED_AI_1_NAME: 'Mine', SHARED_AI_1_ENDPOINT: 'http://ollama:11434', SHARED_AI_1_MODEL: 'llava', SHARED_AI_1_EMBED_MODEL: '', SHARED_AI_1_ACK: 'true', AUTH_ALLOW: 'a@x.test, b@x.test' });
    expect(out.problems).toEqual([]);
    expect(snapshot(sysOf(b)).aiSources).toEqual([{ id: 'mine', type: 'ollama', name: 'Mine', endpoint: 'http://ollama:11434', model: 'llava', embedModel: '', ack: true }]);
    expect((snapshot(sysOf(b)).auth as any).allow).toEqual(['a@x.test', 'b@x.test']);
  });
  it('still reads the owner’s settings from a file made by an earlier version, and the plain variables win over the older JSON', () => {
    const b = mk();
    applyEnvConfig(sysOf(b), b.db, { [OWNER_VAR]: JSON.stringify({ portfolio: { tagline: 'old', gear: 'camera' } }), FRAMES_OWNER__portfolio__tagline: 'new' });
    expect(snapshot(b.db).portfolio).toEqual({ tagline: 'new' }); // a setting written by path replaces the old whole
  });
});

describe('comparing what is saved with what the container was started with', () => {
  it('says same, different, app only and env only for each variable, and never sends a value', async () => {
    const a = mk(); const A = api(a);
    await A.put('/api/admin/privacy', { operator: 'Studio', contact: 'hi@example.test' });
    await A.post('/api/admin/ai/sources', { type: 'openai', endpoint: 'https://api.example.test', model: 'm1', embedModel: 'e1', ack: true, key: SECRET });
    const pairs: [string, string][] = [];
    buildEnvFile(sysOf(a), a.db, { pairs });
    const operator = pairs.find(([, v]) => v === 'Studio')![0];
    const key = pairs.find(([, v]) => v === SECRET)![0];
    const contact = pairs.find(([, v]) => v === 'hi@example.test')![0];
    useVars({ [operator]: 'Studio', [contact]: 'other@example.test', [key]: 'a-different-key', AI_9_URL: 'https://elsewhere.test' });
    const r = (await A.get('/api/admin/env/compare')).body;
    const by = (n: string) => r.rows.find((x: any) => x.name === n);
    expect(by(operator).status).toBe('same');
    expect(by(key)).toMatchObject({ status: 'differs', secret: true });
    expect(by('AI_9_URL').status).toBe('env only');
    // Values are shown for what is not secret: the environment's, and the app's where it differs.
    expect(by(operator)).toMatchObject({ env: 'Studio' });
    expect(by(operator).app).toBeUndefined(); // the same, so no second value
    expect(by(contact)).toMatchObject({ status: 'differs', env: 'other@example.test', app: 'hi@example.test' });
    expect(by('AI_9_URL')).toMatchObject({ env: 'https://elsewhere.test' });
    // A secret has no value in either column, only whether it is set.
    expect(by(key).env).toBeUndefined(); expect(by(key).app).toBeUndefined();
    expect(r.rows.filter((x: any) => x.secret).every((x: any) => x.env === undefined && x.app === undefined)).toBe(true);
    expect(r.rows.some((x: any) => x.status === 'app only')).toBe(true); // the rest are saved in the app and not in the environment
    expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(JSON.stringify(r)).not.toContain('a-different-key');
    expect(r.counts.same).toBe(1);
    expect(r.counts.differs).toBe(2);
  });
});

describe('export, import, and the block', () => {
  it('moves a configured server (shared AIs, keys, the tunnel token, the privacy page) to a fresh one, and then refuses a second export', async () => {
    // 1. Set up with no variables at all, through the app.
    const a = mk(); const A = api(a);
    await A.post('/api/admin/ai/sources', { type: 'openai', endpoint: 'https://api.example.test', model: 'm1', embedModel: 'e1', ack: true, key: SECRET });
    await A.put('/api/tunnel', { apiToken: SECRET + '-tunnel', accountId: 'c'.repeat(32), appUrl: 'https://frames.example.com' });
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
    useVars(vars);
    const b = mk({ allowEnvExport: vars.ALLOW_ENV_EXPORT !== 'false' }); const B = api(b);
    const list = (await B.get('/api/ai/sources')).body;
    expect(list.sources).toHaveLength(1);
    expect(list.sources[0]).toMatchObject({ type: 'openai', model: 'm1', hasKey: true, ready: true, shared: true });
    expect(JSON.stringify(list)).not.toContain(SECRET); // still write-only through the API
    expect((await B.get('/api/tunnel')).body).toMatchObject({ hasApiToken: true, appUrl: 'https://frames.example.com' });
    expect(String((await B.get('/privacy')).body)).toContain('Studio');
    expect((await B.get('/api/me')).body.envConfig).toBe(true);
    const again = await B.get('/api/admin/env/export');
    expect(again.status).toBe(403);
    expect(again.body.error).toMatch(/ALLOW_ENV_EXPORT/);
    expect((await B.get('/api/admin/env')).body).toMatchObject({ allowed: false, loaded: { system: true, owner: false } }); // only the server's settings are in the file
  });
  it('changes made in the app after import last only until restart: the env file wins again', async () => {
    const a = mk(); const A = api(a);
    await A.put('/api/admin/privacy', { operator: 'From the file' });
    const vars = parseEnv(Buffer.from((await A.raw('GET', '/api/admin/env/export')).body as Buffer).toString());
    useVars(vars);
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

describe('several AIs in the export', () => {
  const KEYS = { claude: 'sk-ant-' + Buffer.from('one').toString('hex'), gemini: 'g-' + Buffer.from('two').toString('hex'), openai: 'sk-' + Buffer.from('three').toString('hex') };
  const post = (A: ReturnType<typeof api>, type: string, fields: object) => A.post('/api/admin/ai/sources', { type, ...fields });
  it('carries every AI set up for everyone, with its own key and settings, and gives a fresh instance exactly that', async () => {
    const a = mk(); const A = api(a);
    const add = async (type: string, fields: object) => (await post(A, type, fields)).body.sources.at(-1);
    const claude = await add('anthropic', { name: 'Claude for descriptions', endpoint: 'https://api.anthropic.com', model: 'claude-x', ack: true, key: KEYS.claude });
    const gemini = await add('gemini', { endpoint: 'https://generativelanguage.example/v1beta/openai', model: 'gem-x', embedModel: 'gem-embed', ack: true, key: KEYS.gemini });
    const openai = await add('openai', { model: 'gpt-x', embedModel: 'te-x', ack: true, key: KEYS.openai });
    const local = await add('ollama', { endpoint: 'http://192.168.1.20:11434', model: 'llava', embedModel: 'nomic' }); // on the network, and no key
    await A.del(`/api/admin/ai/sources/${openai.id}`); // a removed AI must not travel, and neither must its key
    // The owner's own AI is theirs, not the server's: it is not in the file.
    await A.post('/api/ai/sources', { type: 'ollama', name: 'Only mine', endpoint: 'http://localhost:11434', model: 'mine', embedModel: '' });

    const text = Buffer.from((await A.raw('GET', '/api/admin/env/export')).body as Buffer).toString();
    expect(text).toContain(KEYS.claude);
    expect(text).toContain(KEYS.gemini);
    expect(text).not.toContain(KEYS.openai);
    expect(text).not.toContain('Only mine');
    useVars(parseEnv(text));

    const b = mk(); const B = api(b);
    const got = (await B.get('/api/ai/sources')).body;
    expect(got.sources.map((x: any) => `${x.type}:${x.name}`)).toEqual(['anthropic:Claude for descriptions', 'gemini:Gemini (Google)', 'ollama:Ollama']);
    expect(got.sources.every((x: any) => x.shared)).toBe(true);
    const by = Object.fromEntries(got.sources.map((x: any) => [x.type, x]));
    expect(by.anthropic).toMatchObject({ id: claude.id, endpoint: 'https://api.anthropic.com', model: 'claude-x', ack: true, hasKey: true, ready: true });
    expect(by.gemini).toMatchObject({ id: gemini.id, model: 'gem-x', embedModel: 'gem-embed', hasKey: true, ready: true });
    expect(by.ollama).toMatchObject({ id: local.id, endpoint: 'http://192.168.1.20:11434', model: 'llava', hasKey: false, ready: true });
    expect(JSON.stringify(got)).not.toMatch(/sk-ant-|g-[0-9a-f]{6}/); // still write-only through the API
    // Each key belongs to its own AI, in the server's database; nobody else's.
    expect(getSetting(sysOf(b), `secret:ai:${gemini.id}:key`, '')).toBe(KEYS.gemini);
    expect(sysOf(b).prepare('SELECT value FROM settings WHERE key = ?').get(`secret:ai:${openai.id}:key`)).toBeUndefined();
  });
  it('the file wins over AIs added in the app since, at the next start', async () => {
    const a = mk(); const A = api(a);
    await post(A, 'ollama', { endpoint: 'http://localhost:11434', model: 'llava', name: 'From the file' });
    useVars(parseEnv(Buffer.from((await A.raw('GET', '/api/admin/env/export')).body as Buffer).toString()));
    const b = mk(); const B = api(b);
    await post(B, 'ollama', { endpoint: 'http://localhost:11434', model: 'llava', name: 'Added later in the app' });
    const names = async () => (await B.get('/api/admin/ai/sources')).body.sources.map((x: any) => x.name);
    expect(await names()).toEqual(['From the file', 'Added later in the app']);
    applyEnvConfig(sysOf(b), b.db); // what the next start does
    expect(await names()).toEqual(['From the file']);
  });
});
