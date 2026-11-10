import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE, validateProvider } from './auth.js';
import { setSetting, type DB } from './db.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** Cloudflare Access as a sign-in provider: the signed token Access adds to each request is the login. */
const TEAM = 'team.example.test', AUD = 'a'.repeat(64);
let env: Env, sys: DB, certs: http.Server, key: CryptoKey;
const token = (o: { email?: string | null; aud?: string; name?: string } = {}) =>
  new SignJWT({ ...(o.email === null ? {} : { email: o.email ?? 'alice@x.test' }), ...(o.name ? { name: o.name } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(`https://${TEAM}`).setAudience(o.aud ?? AUD).setSubject('cf-user-1').setIssuedAt().setExpirationTime('5m').sign(key);
const get = (url: string, headers: Record<string, string> = {}) => env.app.inject({ url, headers });
const cookieFrom = (r: { headers: Record<string, unknown> }) => String(([] as string[]).concat(r.headers['set-cookie'] as string[]).find((c) => c?.startsWith(SESSION_COOKIE)) ?? '').split(';')[0];

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  key = kp.privateKey;
  const jwk = { ...(await exportJWK(kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  certs = http.createServer((req, res) => { res.writeHead(req.url === '/cdn-cgi/access/certs' ? 200 : 404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise<void>((r) => certs.listen(0, '127.0.0.1', r));
  env = makeEnv({ accessCertsBase: `http://127.0.0.1:${(certs.address() as AddressInfo).port}` });
  sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'cf', type: 'cloudflare', name: 'Cloudflare Access', clientId: '', teamDomain: TEAM, aud: AUD }], allow: ['@x.test'], publicUrl: '', testedBy: { provider: 'cf', sub: 'cf-user-1', email: 'alice@x.test', emailVerified: true, name: 'Alice' } });
});
afterAll(() => { env.app.close(); certs.close(); cleanup(env); });

describe('Cloudflare Access as a sign-in provider', () => {
  it('needs the team domain and the audience tag, and no client ID', () => {
    expect(validateProvider({ id: 'cf', type: 'cloudflare', teamDomain: TEAM, aud: AUD })).toBeNull();
    expect(validateProvider({ id: 'cf', type: 'cloudflare', teamDomain: 'nope', aud: AUD })).toMatch(/team domain/);
    expect(validateProvider({ id: 'cf', type: 'cloudflare', teamDomain: TEAM, aud: 'short' })).toMatch(/AUD/);
  });
  it('shows the usual sign-in page to someone with no Access token', async () => {
    const r = await get('/', { accept: 'text/html' });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/signin');
    expect((await get('/api/public/auth')).json().providers).toEqual([expect.objectContaining({ type: 'cloudflare', name: 'Cloudflare Access' })]);
  });
  it('signs someone in by the email in a valid token, with no sign-in screen, and lands them where they were going', async () => {
    const h = { 'cf-access-jwt-assertion': await token({ name: 'Alice A' }), accept: 'text/html' };
    const first = await get('/library', h);
    expect(first.statusCode).toBe(302);
    expect(first.headers.location).toBe('/auth/login/cf?returnTo=%2Flibrary');
    const login = await get(first.headers.location as string, h);
    expect(login.statusCode).toBe(302);
    const back = await get((login.headers.location as string).replace(/^https?:\/\/[^/]+/, ''), h);
    expect(back.statusCode).toBe(302);
    expect(back.headers.location).toBe('/library');
    const cookie = cookieFrom(back);
    expect(cookie).toContain(SESSION_COOKIE);
    const me = (await get('/api/me', { cookie })).json();
    expect(me.user).toMatchObject({ email: 'alice@x.test', name: 'Alice A', provider: 'cf' });
  });
  it('still checks the allow-list: an email that is not on it is refused', async () => {
    const h = { 'cf-access-jwt-assertion': await token({ email: 'mallory@evil.test' }) };
    const login = await get('/auth/login/cf', h);
    const back = await get((login.headers.location as string).replace(/^https?:\/\/[^/]+/, ''), h);
    expect(back.statusCode).toBe(403);
    expect(cookieFrom(back)).toBe('');
  });
  it('refuses a token for another application, an unsigned one, a missing one and one with no email', async () => {
    for (const t of [await token({ aud: 'b'.repeat(64) }), 'not.a.jwt', '', await token({ email: null })]) {
      const login = await get('/auth/login/cf', t ? { 'cf-access-jwt-assertion': t } : {});
      const back = await get((login.headers.location as string).replace(/^https?:\/\/[^/]+/, ''), t ? { 'cf-access-jwt-assertion': t } : {});
      expect(back.statusCode, t.slice(0, 12)).toBe(400);
      expect(cookieFrom(back)).toBe('');
    }
  });
  it('a token only signs in through the sign-in route: an API call with one but no session is still refused', async () => {
    const r = await get('/api/me', { 'cf-access-jwt-assertion': await token() });
    expect(r.statusCode).toBe(401);
  });
});
