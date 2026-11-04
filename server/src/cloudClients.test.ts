import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { setSetting, type DB } from './db.js';
import { resolveUser, type User } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** The cloud services' app registration is the server's, set by an administrator; people only connect their own account. */
let env: Env, sys: DB, alice: User;
const SECRET = 'cloud-secret-' + Buffer.from('registration').toString('hex');
const cookie = (id: number) => ({ cookie: `${SESSION_COOKIE}=${createSession(sys, id)}` });
const call = async (method: string, url: string, headers: Record<string, string>, payload?: unknown) => {
  const r = await env.app.inject({ method: method as any, url, headers, payload: payload as any });
  return { status: r.statusCode, body: r.headers['content-type']?.toString().includes('json') ? r.json() : r.body };
};

beforeAll(async () => {
  env = makeEnv();
  env.app.close();
  const { buildApp } = await import('./app.js');
  env.app = buildApp(env.db, env.cfg);
  sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['@x.test'], publicUrl: '', testedBy: null });
  alice = resolveUser(sys, { provider: 'g', sub: 'a1', email: 'alice@x.test', emailVerified: true, name: 'Alice' }, true)!;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('cloud services are set up once, for the server', () => {
  it('only an administrator can enter the registration', async () => {
    expect((await call('PUT', '/api/cloud/client/google', cookie(alice.id), { clientId: 'x' })).status).toBe(403);
    expect((await call('PUT', '/api/cloud/client/google', cookie(1), { clientId: 'CID', clientSecret: SECRET })).status).toBe(200);
  });
  it('everyone then sees it is ready, but only the administrator sees the client ID', async () => {
    const member = (await call('GET', '/api/cloud', cookie(alice.id))).body;
    expect(member.providers.find((p: any) => p.id === 'google')).toMatchObject({ configured: true });
    expect(member.providers.find((p: any) => p.id === 'google').clientId).toBeUndefined();
    expect(JSON.stringify(member)).not.toContain(SECRET);
    const admin = (await call('GET', '/api/cloud', cookie(1))).body;
    expect(admin.providers.find((p: any) => p.id === 'google')).toMatchObject({ configured: true, clientId: 'CID', hasSecret: true });
    expect(JSON.stringify(admin)).not.toContain(SECRET);
  });
  it('a member can start connecting their own account with the server’s registration', async () => {
    const r = await call('POST', '/api/cloud/connect/google', cookie(alice.id), {});
    expect(r.status).toBe(200);
    expect(r.body.url).toContain('client_id=CID');
  });
  it('is kept in the system database, so it travels in the env file', () => {
    expect(sys.prepare("SELECT 1 FROM settings WHERE key = 'cloudClients'").get()).toBeTruthy();
    expect(sys.prepare("SELECT 1 FROM settings WHERE key = 'secret:cloud:client:google'").get()).toBeTruthy();
  });
  it('a service nobody set up says so, and cannot be connected', async () => {
    const r = await call('POST', '/api/cloud/connect/dropbox', cookie(alice.id), {});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/administrator/);
  });
});
