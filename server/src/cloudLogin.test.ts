import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createSession, SESSION_COOKIE, validateProvider } from './auth.js';
import { setSetting, type DB } from './db.js';
import { resolveUser } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** Signing in with Google, Microsoft or Dropbox using the app already registered under Administration, Cloud services. */
let env: Env, sys: DB;
const cookie = { get: () => ({ cookie: `${SESSION_COOKIE}=${createSession(sys, 1)}` }) };
const call = async (method: string, url: string, payload?: unknown, headers: Record<string, string> = cookie.get()) => {
  const r = await env.app.inject({ method: method as any, url, headers, payload: payload as any });
  const ct = String(r.headers['content-type'] ?? '');
  return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.body, headers: r.headers };
};
const CLIENT_SECRET = 'dbx-secret-' + Buffer.from('cloud-login').toString('hex');

beforeAll(() => {
  env = makeEnv();
  sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: false, providers: [], allow: ['@x.test'], publicUrl: 'https://frames.example.com', testedBy: null });
  resolveUser(sys, { provider: 'g', sub: 'o', email: 'owner@x.test', emailVerified: true, name: 'Owner' }, true); // the first person is the administrator
});
afterAll(() => { env.app.close(); cleanup(env); vi.restoreAllMocks(); });

describe('sign in with the cloud services’ own app', () => {
  it('needs no client ID of its own, but only Google, Microsoft and Dropbox can use it', () => {
    expect(validateProvider({ id: 'd', type: 'dropbox', useCloudApp: true })).toBeNull();
    expect(validateProvider({ id: 'g', type: 'google', useCloudApp: true })).toBeNull();
    expect(validateProvider({ id: 'h', type: 'github', useCloudApp: true })).toMatch(/Only Google, Microsoft and Dropbox/);
    expect(validateProvider({ id: 'd', type: 'dropbox' })).toMatch(/client ID/);
  });
  it('is refused until that service is set up under Cloud services', async () => {
    const r = await call('PUT', '/api/auth/config', { providers: [{ id: 'dbx', type: 'dropbox', useCloudApp: true }] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Set up Dropbox under Administration, Cloud services first/);
  });
  it('once it is, saves without a client ID and sends people to Dropbox with the cloud app’s ID', async () => {
    expect((await call('PUT', '/api/cloud/client/dropbox', { clientId: 'DBX-CID', clientSecret: CLIENT_SECRET })).status).toBe(200);
    const saved = await call('PUT', '/api/auth/config', { providers: [{ id: 'dbx', type: 'dropbox', useCloudApp: true }] });
    expect(saved.status).toBe(200);
    expect(saved.body.providers[0]).toMatchObject({ id: 'dbx', type: 'dropbox', name: 'Dropbox', useCloudApp: true, clientId: '' });
    expect(JSON.stringify(saved.body)).not.toContain(CLIENT_SECRET);
    const go = await call('GET', '/auth/login/dbx', undefined, {});
    expect(go.status).toBe(302);
    const u = new URL(String(go.headers.location));
    expect(u.origin + u.pathname).toBe('https://www.dropbox.com/oauth2/authorize');
    expect(u.searchParams.get('client_id')).toBe('DBX-CID');
    expect(u.searchParams.get('scope')).toBe('account_info.read');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    expect(u.searchParams.get('redirect_uri')).toBe('https://frames.example.com/auth/callback/dbx');
  });
  it('signs in the Dropbox account, asking Dropbox who it is, and the allow-list still decides', async () => {
    const calls: { url: string; method: string; body: string }[] = [];
    const real = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
      const url = String(input);
      if (!url.includes('dropboxapi.com')) return real(input, init);
      calls.push({ url, method: init?.method ?? 'GET', body: String(init?.body ?? '') });
      if (url.endsWith('/oauth2/token')) return new Response(JSON.stringify({ access_token: 'tok', token_type: 'bearer' }), { status: 200, headers: { 'content-type': 'application/json' } });
      const who = (globalThis as any).__dbxWho as { account_id: string; email: string };
      return new Response(JSON.stringify({ account_id: who.account_id, email: who.email, email_verified: true, name: { display_name: 'Dee Box' } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const start = async () => new URL(String((await call('GET', '/auth/login/dbx', undefined, {})).headers.location)).searchParams.get('state');
    (globalThis as any).__dbxWho = { account_id: 'dbid:AAA', email: 'dee@x.test' };
    const ok = await call('GET', `/auth/callback/dbx?code=abc&state=${await start()}`, undefined, {});
    expect(ok.status).toBe(302);
    expect(String(([] as string[]).concat(ok.headers['set-cookie'] as string[]).join(';'))).toContain(SESSION_COOKIE);
    const token = calls.find((c) => c.url.endsWith('/oauth2/token'))!;
    expect(token.body).toContain('client_id=DBX-CID');
    expect(token.body).toContain(`client_secret=${CLIENT_SECRET}`); // the cloud app's secret, sent to Dropbox only
    expect(calls.find((c) => c.url.endsWith('/users/get_current_account'))!.method).toBe('POST');
    (globalThis as any).__dbxWho = { account_id: 'dbid:BBB', email: 'mallory@evil.test' };
    const no = await call('GET', `/auth/callback/dbx?code=abc&state=${await start()}`, undefined, {});
    expect(no.status).toBe(403); // not on the allowed list
  });
});
