import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { dailyBackup } from './backup.js';
import { isAllowed } from './auth.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/**
 * A stand-in sign-in provider. It speaks real OpenID Connect (discovery, signed ID tokens, PKCE check) and a
 * GitHub-style OAuth 2 flow, and can be told to misbehave so the app's defences get exercised.
 */
type Who = { sub: string; email?: string; verified?: boolean; name?: string };
const fake = { who: { sub: 'u1', email: 'owner@example.test', verified: true, name: 'Owner' } as Who, badNonce: false, wrongKey: false, wrongAud: false, expired: false, error: '' as string };
let provider: http.Server, base = '';
const codes = new Map<string, { who: Who; nonce: string; challenge: string; redirect: string; clientId: string }>();
let key: Awaited<ReturnType<typeof generateKeyPair>>, otherKey: Awaited<ReturnType<typeof generateKeyPair>>, jwk: object;

beforeAll(async () => {
  key = await generateKeyPair('RS256'); otherKey = await generateKeyPair('RS256');
  jwk = { ...(await exportJWK(key.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  provider = http.createServer((req, res) => {
    const url = new URL(req.url!, base);
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', async () => {
      const json = (o: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      const authorize = () => {
        if (fake.error) { res.writeHead(302, { Location: `${url.searchParams.get('redirect_uri')}?error=access_denied&error_description=${encodeURIComponent('User said no')}&state=${url.searchParams.get('state')}` }); return res.end(); }
        const code = crypto.randomBytes(8).toString('hex');
        codes.set(code, { who: { ...fake.who }, nonce: url.searchParams.get('nonce') ?? '', challenge: url.searchParams.get('code_challenge') ?? '', redirect: url.searchParams.get('redirect_uri')!, clientId: url.searchParams.get('client_id')! });
        res.writeHead(302, { Location: `${url.searchParams.get('redirect_uri')}?code=${code}&state=${url.searchParams.get('state')}` }); res.end();
      };
      const redeem = (form: URLSearchParams) => {
        const c = codes.get(form.get('code') ?? '');
        codes.delete(form.get('code') ?? '');
        if (!c || c.redirect !== form.get('redirect_uri')) return null;
        // PKCE: the verifier the app kept must hash to the challenge it sent.
        const ok = crypto.createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url') === c.challenge;
        return ok ? c : null;
      };
      if (url.pathname === '/.well-known/openid-configuration') return json({ issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, jwks_uri: `${base}/jwks`, response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'] });
      if (url.pathname === '/jwks') return json({ keys: [jwk] });
      if (url.pathname === '/authorize' || url.pathname === '/gh/authorize') return authorize();
      if (url.pathname === '/token') {
        const form = new URLSearchParams(body);
        const c = redeem(form);
        if (!c) return json({ error: 'invalid_grant' }, 400);
        if (form.get('client_secret') !== 'right-secret') return json({ error: 'invalid_client' }, 401);
        const now = Math.floor(Date.now() / 1000);
        const idToken = await new SignJWT({ email: c.who.email, email_verified: c.who.verified, name: c.who.name, nonce: fake.badNonce ? 'not-the-nonce' : c.nonce })
          .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(base).setAudience(fake.wrongAud ? 'someone-else' : c.clientId).setSubject(c.who.sub).setIssuedAt(fake.expired ? now - 1200 : now - 10).setExpirationTime(fake.expired ? now - 600 : now + 300)
          .sign(fake.wrongKey ? otherKey.privateKey : key.privateKey);
        return json({ access_token: 'at-' + c.who.sub, token_type: 'Bearer', expires_in: 300, id_token: idToken });
      }
      if (url.pathname === '/gh/token') {
        const c = redeem(new URLSearchParams(body));
        if (!c) return json({ error: 'bad_verification_code' }, 400);
        return json({ access_token: 'gh-' + c.who.sub, token_type: 'bearer' });
      }
      if (url.pathname === '/gh/user' && req.headers.authorization?.startsWith('Bearer gh-')) return json({ id: Number(req.headers.authorization.slice(10).replace(/\D/g, '') || 1), login: 'octo', name: 'Octo Cat', email: 'public@spoof.test' });
      if (url.pathname === '/gh/emails' && req.headers.authorization?.startsWith('Bearer gh-')) return json(fake.who.email ? [{ email: fake.who.email, primary: true, verified: !!fake.who.verified }] : []);
      json({ error: 'not found' }, 404);
    });
  });
  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
});
afterAll(() => provider.close());

let env: Env;
let sess: { cookie: string };
// Each test gets its own client address, so the sign-in rate limit only trips where a test means it to.
let clientIp = '10.1.0.1', ipCount = 1;
beforeEach(() => { clientIp = `10.1.${Math.floor(ipCount / 250)}.${(ipCount++ % 250) + 1}`; });
const H = { host: 'frames.test' };
const call = (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => env.app.inject({ method: method as any, url, payload: payload as any, headers: { ...H, ...headers }, remoteAddress: clientIp });
const cookieOf = (r: { headers: Record<string, any> }) => String([r.headers['set-cookie']].flat().find((c) => String(c).startsWith('frames_session=')) ?? '');
const sessionHeader = (r: { headers: Record<string, any> }) => ({ cookie: cookieOf(r).split(';')[0] });
const OIDC = { id: 'fake', type: 'oidc', name: 'Fake ID', clientId: 'frames-app', issuer: '', clientSecret: 'right-secret' };
const GH = { id: 'ghlike', type: 'oauth2', name: 'GH-like', clientId: 'gh-client', authUrl: '', tokenUrl: '', userUrl: '', emailsUrl: '', clientSecret: 'right-secret' };

/** A full browser sign-in: start, visit the provider, come back to the app. Returns the app's last answer. */
async function signIn(id: string, who: Who, opts: { test?: boolean; returnTo?: string; guest?: boolean } = {}) {
  fake.who = who;
  const q = [opts.test && 'test=1', opts.guest && 'guest=1', opts.returnTo && `returnTo=${encodeURIComponent(opts.returnTo)}`].filter(Boolean).join('&');
  const start = await call('GET', `/auth/login/${id}${q ? `?${q}` : ''}`);
  if (start.statusCode !== 302) return start;
  const there = await fetch(start.headers.location as string, { redirect: 'manual' });
  const back = new URL(there.headers.get('location')!);
  return call('GET', back.pathname + back.search);
}

beforeAll(() => {
  env = makeEnv({ allowInsecureOidc: true, authUser: 'me', authPassword: undefined });
});
afterAll(() => cleanup(env));
const put = (body: unknown, headers: Record<string, string> = {}) => call('PUT', '/api/auth/config', body, headers);
const withUrls = () => ({ ...OIDC, issuer: base });
const ghUrls = () => ({ ...GH, authUrl: `${base}/gh/authorize`, tokenUrl: `${base}/gh/token`, userUrl: `${base}/gh/user`, emailsUrl: `${base}/gh/emails` });

describe('off by default', () => {
  it('leaves everything open and reports no sign-in', async () => {
    expect((await call('GET', '/api/photos')).statusCode).toBe(200);
    expect((await call('GET', '/api/me')).json()).toMatchObject({ mode: 'none', user: null });
    expect((await call('GET', '/api/auth/config')).json()).toMatchObject({ enabled: false, providers: [], allow: [] });
  });
});

describe('the allow-list', () => {
  const who = (email: string, verified = true, provider = 'fake', sub = 'u1') => ({ provider, sub, email, emailVerified: verified });
  it('matches an email, a whole domain, or a provider account, case-insensitively', () => {
    expect(isAllowed(who('Ann@Example.com'), ['ann@example.com'])).toBe(true);
    expect(isAllowed(who('ann@example.com'), ['@example.com'])).toBe(true);
    expect(isAllowed(who('ann@sub.example.com'), ['@example.com'])).toBe(false);
    expect(isAllowed(who('ann@evilexample.com'), ['@example.com'])).toBe(false);
    expect(isAllowed(who('x@y.z', true, 'github', '123'), ['GitHub:123'])).toBe(true);
    expect(isAllowed(who('x@y.z', true, 'github', '1234'), ['github:123'])).toBe(false);
  });
  it('never trusts an email the provider has not verified', () => {
    expect(isAllowed(who('ann@example.com', false), ['ann@example.com', '@example.com'])).toBe(false);
    expect(isAllowed(who('ann@example.com', false, 'github', '9'), ['github:9'])).toBe(true); // an account id is still fine
  });
  it('allows nobody from an empty list', () => expect(isAllowed(who('ann@example.com'), [])).toBe(false));
});

describe('setting a provider up', () => {
  it('rejects incomplete providers with a plain message', async () => {
    for (const [p, msg] of [[{ ...OIDC, clientId: '' }, /client ID/], [{ ...OIDC, issuer: 'nope' }, /issuer/], [{ id: 'm', type: 'microsoft', clientId: 'x' }, /tenant/], [{ ...OIDC, id: 'Bad Id!' }, /id/], [{ ...OIDC, type: 'weird' }, /type/]] as const) {
      const r = await put({ providers: [{ ...withUrls(), ...p }] });
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(msg);
    }
  });
  it('keeps secrets write-only, and out of every response', async () => {
    const r = await put({ providers: [withUrls(), ghUrls()], allow: ['owner@example.test'], publicUrl: 'http://frames.test' });
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j.providers[0]).toMatchObject({ id: 'fake', hasSecret: true, redirectUrl: 'http://frames.test/auth/callback/fake' });
    expect(JSON.stringify(j)).not.toContain('right-secret');
    expect(JSON.stringify((await call('GET', '/api/auth/config')).json())).not.toContain('right-secret');
    expect(JSON.stringify((await call('GET', '/api/settings')).json())).not.toContain('right-secret');
  });
  it('shows the exact callback address to register, from the public address', async () => {
    const c = (await call('GET', '/api/auth/config')).json();
    expect(c.callbackBase).toBe('http://frames.test');
    expect(c.providers.map((p: any) => p.redirectUrl)).toEqual(['http://frames.test/auth/callback/fake', 'http://frames.test/auth/callback/ghlike']);
  });
});

describe('it cannot lock the owner out', () => {
  it('refuses to turn on before a test sign-in has worked', async () => {
    const r = await put({ enabled: true });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/Test sign-in/);
  });
  it('refuses to turn on with nobody on the list, or with no provider', async () => {
    expect((await put({ enabled: true, allow: [] })).json().error).toMatch(/at least one/);
  });
  it('a test sign-in by someone NOT on the list proves nothing', async () => {
    const r = await signIn('fake', { sub: 'stranger', email: 'stranger@evil.test', verified: true }, { test: true });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/settings?section=access&access=notallowed');
    expect(cookieOf(r)).toBe('');
    expect((await put({ enabled: true })).json().error).toMatch(/Test sign-in/);
  });
  it('a successful test by an allowed account unlocks turning it on, and keeps that person signed in', async () => {
    const r = await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true, name: 'Owner' }, { test: true });
    expect(r.headers.location).toBe('/settings?section=access&access=tested');
    const sess = sessionHeader(r);
    expect(sess.cookie).toMatch(/^frames_session=.{40,}/);
    const on = await put({ enabled: true });
    expect(on.statusCode).toBe(200);
    expect(on.json().testedBy).toMatchObject({ email: 'owner@example.test' });
    // still signed in after switching it on
    expect((await call('GET', '/api/photos', undefined, sess)).statusCode).toBe(200);
  });
});

describe('with sign-in on', () => {
  beforeAll(async () => { sess = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true, name: 'Owner' })); });

  it('turns away anyone without a session, in the way that suits who is asking', async () => {
    const api = await call('GET', '/api/photos');
    expect(api.statusCode).toBe(401);
    expect(api.json()).toMatchObject({ signIn: true });
    expect(api.headers['www-authenticate']).toBeUndefined(); // no browser password box for the app's own requests
    const page = await call('GET', '/', undefined, { accept: 'text/html' });
    expect(page.statusCode).toBe(401);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.body).toContain('Continue with Fake ID');
    expect(page.body).toContain('href="/auth/login/fake"');
    expect((await call('POST', '/api/collections', { name: 'x' })).statusCode).toBe(401);
    expect((await call('PUT', '/api/auth/config', { enabled: false })).statusCode).toBe(401); // nobody can switch it off without signing in
  });
  it('lets a signed-in person in, and says who they are', async () => {
    expect((await call('GET', '/api/photos', undefined, sess)).statusCode).toBe(200);
    expect((await call('GET', '/api/me', undefined, sess)).json()).toMatchObject({ mode: 'oauth', canSignOut: true, user: { email: 'owner@example.test', name: 'Owner', provider: 'fake' } });
  });
  it('keeps the health check, sign-in pages and share links reachable', async () => {
    expect((await call('GET', '/api/health')).statusCode).toBe(200);
    expect((await call('GET', '/auth/signin')).statusCode).toBe(200);
    expect((await call('GET', '/api/s/AAAAAAAAAAAAAAAAAAAAAA')).statusCode).toBe(404); // reaches the share code (unknown link), not the sign-in wall
  });
  it('sets a safe cookie, and stores only a hash of it', async () => {
    const r = await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true });
    const c = cookieOf(r);
    expect(c).toContain('HttpOnly');
    expect(c).toContain('SameSite=Lax');
    expect(c).not.toContain('Secure'); // the public address here is http
    const token = decodeURIComponent(c.split(';')[0].split('=')[1]);
    const raw = new Database(path.join(env.data, 'system.db'), { readonly: true });
    const rows = raw.prepare('SELECT id FROM sessions').all() as { id: string }[];
    raw.close();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((x) => x.id === token)).toBe(false);
    expect(rows.some((x) => x.id === crypto.createHash('sha256').update(token).digest('hex'))).toBe(true);
  });
  it('marks the cookie Secure when the public address is https', async () => {
    await call('PUT', '/api/auth/config', { publicUrl: 'https://frames.test' }, sess);
    const r = await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true });
    expect(cookieOf(r)).toContain('Secure');
    await call('PUT', '/api/auth/config', { publicUrl: 'http://frames.test' }, sess);
  });
  it('ends one session on sign-out, and all of them on request', async () => {
    const a = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }));
    const b = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }));
    const out = await call('POST', '/auth/logout', {}, a);
    expect(out.headers['set-cookie']).toContain('Max-Age=0');
    expect((await call('GET', '/api/photos', undefined, a)).statusCode).toBe(401);
    expect((await call('GET', '/api/photos', undefined, b)).statusCode).toBe(200);
    expect((await call('POST', '/api/auth/sessions/clear', {}, b)).json().ended).toBeGreaterThan(0);
    expect((await call('GET', '/api/photos', undefined, b)).statusCode).toBe(401);
    expect((await call('GET', '/api/photos', undefined, sess)).statusCode).toBe(401);
    sess = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true })); // sign back in for later tests
  });
  it('lets a session expire', async () => {
    const s = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }));
    (env.app as any).frames.sys.prepare("UPDATE sessions SET expires = '2020-01-01T00:00:00Z'").run();
    expect((await call('GET', '/api/photos', undefined, s)).statusCode).toBe(401);
    sess = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }));
  });
  it('blocks a sign-out sent from another website', async () => {
    expect((await call('POST', '/auth/logout', {}, { ...sess, origin: 'https://evil.example' })).statusCode).toBe(403);
  });

  describe('who gets in', () => {
    it('gives the sign-in and privacy pages the site icon, which is served without signing in', async () => {
      for (const page of ['/auth/signin', '/privacy']) expect((await call('GET', page)).body, page).toContain('<link rel="icon" type="image/svg+xml" href="/icon.svg">');
      expect((await call('GET', '/icon.svg')).statusCode).not.toBe(401); // no web folder in a test, so 404; what matters is that it is not behind the sign-in
    });
    it('turns away an account that is not on the list, with no session', async () => {
      const r = await signIn('fake', { sub: 'x9', email: 'mallory@evil.test', verified: true });
      expect(r.statusCode).toBe(403);
      expect(r.body).toContain('Not on the list');
      expect(cookieOf(r)).toBe('');
    });
    it('lets a whole domain in, once the owner adds it', async () => {
      expect((await call('PUT', '/api/auth/config', { allow: ['owner@example.test', '@family.test'] }, sess)).statusCode).toBe(200);
      const r = await signIn('fake', { sub: 'kid', email: 'kid@family.test', verified: true });
      expect(r.statusCode).toBe(302);
      expect(cookieOf(r)).toContain('frames_session=');
    });
    it('gives a first-time visitor their own member account, with a folder named for them', async () => {
      const r = await signIn('fake', { sub: 'kid', email: 'kid@family.test', verified: true });
      const me = (await call('GET', '/api/me', undefined, sessionHeader(r))).json();
      expect(me).toMatchObject({ role: 'member', user: { email: 'kid@family.test', folder: 'kid' } });
    });
    it('“Anyone who signs in” lets any verified account in with a library of its own, and the list is kept for switching back', async () => {
      const outsider = { sub: 'open1', email: 'stranger@elsewhere.test', verified: true };
      expect((await signIn('fake', outsider)).statusCode).toBe(403); // list mode: not on the list
      expect((await call('PUT', '/api/auth/config', { open: true }, sess)).json().open).toBe(true);
      const r = await signIn('fake', outsider);
      expect(r.statusCode).toBe(302);
      expect(cookieOf(r)).toContain('frames_session=');
      const me = (await call('GET', '/api/me', undefined, sessionHeader(r))).json();
      expect(me).toMatchObject({ role: 'member', user: { email: 'stranger@elsewhere.test' } });
      expect((await call('GET', '/api/auth/config', undefined, sess)).json().allow).toContain('@family.test'); // kept
      await call('PUT', '/api/auth/config', { open: false }, sess);
      expect((await signIn('fake', { sub: 'open2', email: 'another@elsewhere.test', verified: true })).statusCode).toBe(403);
    });
    it('lets someone who came from a share link make a guest account without being on the list, and nothing more', async () => {
      const c = (await call('POST', '/api/collections', { name: 'For a guest' }, sess)).json();
      const token = (await call('POST', '/api/shares', { kind: 'collection', id: c.id, allowReview: true }, sess)).json().token;
      const page = (await call('GET', `/api/s/${token}`)).json();
      expect(page.signIn.map((p: any) => p.id)).toContain('fake'); // the page can offer an account
      expect(page.viewer).toBeNull();
      const stranger = { sub: 'sl1', email: 'guestperson@nowhere.test', verified: true };
      expect((await signIn('fake', stranger)).statusCode).toBe(403); // the ordinary way in is still the list
      expect((await signIn('fake', stranger, { guest: true, returnTo: '/library' })).statusCode).toBe(403); // only from a share link
      const r = await signIn('fake', stranger, { guest: true, returnTo: `/s/${token}` });
      expect(r.statusCode).toBe(302);
      expect(r.headers.location).toBe(`/s/${token}`);
      const h = sessionHeader(r);
      expect((await call('GET', '/api/me', undefined, h)).json()).toMatchObject({ role: 'guest', user: { email: 'guestperson@nowhere.test' } });
      expect((await call('GET', '/api/photos', undefined, h)).statusCode).toBe(403);
      expect((await call('GET', `/api/s/${token}`, undefined, h)).json().viewer).toMatchObject({ name: expect.any(String), role: 'guest' }); // greeted by name
      expect((await call('GET', '/api/guest/links', undefined, h)).json().links).toHaveLength(1);
      // a member who was taken off the list cannot use the share-link door to get back in
      const m = { sub: 'sl2', email: 'former@family.test', verified: true };
      expect((await signIn('fake', m)).statusCode).toBe(302); // on the list through @family.test
      await call('PUT', '/api/auth/config', { allow: ['owner@example.test'] }, sess);
      expect((await signIn('fake', m, { guest: true, returnTo: `/s/${token}` })).statusCode).toBe(403);
      await call('PUT', '/api/auth/config', { allow: ['owner@example.test', '@family.test'] }, sess);
    });
    it('with ALLOW_SIGNUPS off, an allowed newcomer gets no account, but people who already have one still sign in', async () => {
      env.cfg.allowSignups = false;
      try {
        const r = await signIn('fake', { sub: 'newkid', email: 'newkid@family.test', verified: true });
        expect(r.statusCode).toBe(403);
        expect(r.body).toContain('No account');
        expect(cookieOf(r)).toBe('');
        expect((await signIn('fake', { sub: 'kid', email: 'kid@family.test', verified: true })).statusCode).toBe(302);
        expect((await call('GET', '/api/me', undefined, sess)).json().signups).toBe(false);
      } finally { env.cfg.allowSignups = undefined; }
    });
    it('does not accept an unverified email, even for an allowed address', async () => {
      const r = await signIn('fake', { sub: 'imp', email: 'owner@example.test', verified: false });
      expect(r.statusCode).toBe(403);
    });
    it('lets an account in by its provider id, with no email at all', async () => {
      await call('PUT', '/api/auth/config', { allow: ['owner@example.test', 'fake:noemail'] }, sess);
      expect((await signIn('fake', { sub: 'noemail', verified: false })).statusCode).toBe(302);
      await call('PUT', '/api/auth/config', { allow: ['owner@example.test'] }, sess);
    });
  });

  describe('a provider (or someone in the middle) misbehaving', () => {
    const owner: Who = { sub: 'u1', email: 'owner@example.test', verified: true };
    const reset = () => { fake.badNonce = fake.wrongKey = fake.wrongAud = fake.expired = false; fake.error = ''; };
    it('rejects a token with the wrong nonce, the wrong signing key, the wrong audience, or past its expiry', async () => {
      for (const flag of ['badNonce', 'wrongKey', 'wrongAud', 'expired'] as const) {
        reset(); (fake as any)[flag] = true;
        const r = await signIn('fake', owner);
        expect(r.statusCode, flag).toBe(400);
        expect(cookieOf(r), flag).toBe('');
      }
      reset();
    });
    it('shows a plain message when the provider refuses, and still signs nobody in', async () => {
      fake.error = 'denied';
      const r = await signIn('fake', owner);
      expect(r.statusCode).toBe(400);
      expect(r.body).toContain('did not sign you in');
      expect(cookieOf(r)).toBe('');
      reset();
    });
    it('refuses a callback with no state, a made-up state, or a state used before', async () => {
      expect((await call('GET', '/auth/callback/fake?code=x')).statusCode).toBe(400);
      expect((await call('GET', '/auth/callback/fake?code=x&state=forged')).statusCode).toBe(400);
      fake.who = owner;
      const start = await call('GET', '/auth/login/fake');
      const there = await fetch(start.headers.location as string, { redirect: 'manual' });
      const back = new URL(there.headers.get('location')!);
      expect((await call('GET', back.pathname + back.search)).statusCode).toBe(302);
      expect((await call('GET', back.pathname + back.search)).statusCode).toBe(400); // replaying the same answer
    });
    it('refuses a state that was issued for a different provider', async () => {
      fake.who = owner;
      const start = await call('GET', '/auth/login/fake');
      const there = await fetch(start.headers.location as string, { redirect: 'manual' });
      const back = new URL(there.headers.get('location')!);
      expect((await call('GET', back.pathname.replace('/fake', '/ghlike') + back.search)).statusCode).toBe(400);
    });
    it('sends PKCE, state and nonce on the way out', async () => {
      const start = await call('GET', '/auth/login/fake');
      const u = new URL(start.headers.location as string);
      expect(u.origin).toBe(base);
      expect(u.searchParams.get('code_challenge_method')).toBe('S256');
      expect(u.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
      expect(u.searchParams.get('state')!.length).toBeGreaterThan(20);
      expect(u.searchParams.get('nonce')!.length).toBeGreaterThan(10);
      expect(u.searchParams.get('scope')).toContain('openid');
      expect(u.searchParams.get('redirect_uri')).toBe('http://frames.test/auth/callback/fake');
    });
    it('explains when the provider cannot be reached, without leaking detail', async () => {
      const cur = (await call('GET', '/api/auth/config', undefined, sess)).json();
      expect(cur.enabled).toBe(true);
      // a provider that is down: point a fresh instance at a closed port
      const e2 = makeEnv({ allowInsecureOidc: true });
      try {
        await e2.app.inject({ method: 'PUT', url: '/api/auth/config', headers: H, payload: { providers: [{ ...OIDC, issuer: 'http://127.0.0.1:1' }], allow: ['a@b.test'] } });
        const r = await e2.app.inject({ method: 'GET', url: '/auth/login/fake', headers: H });
        expect(r.statusCode).toBe(502);
        expect(r.body).toContain('could not contact');
        expect(r.body).not.toContain('127.0.0.1');
      } finally { cleanup(e2); }
    });
  });

  describe('sending people back where they were', () => {
    it('only to a path on this site, never to another website', async () => {
      const ok = await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }, { returnTo: '/library?tag=fog' });
      expect(ok.headers.location).toBe('/library?tag=fog');
      for (const evil of ['https://evil.example', '//evil.example/x', '/\\evil', 'javascript:alert(1)', '/auth/login/fake']) {
        const r = await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }, { returnTo: evil });
        expect(r.headers.location, evil).toBe('/');
      }
    });
  });

  describe('the lock-out protections stay on while it is on', () => {
    it('refuses a list that would remove your own account', async () => {
      const r = await call('PUT', '/api/auth/config', { allow: ['someone-else@example.test'] }, sess);
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/lock you out/);
    });
    it('refuses to change a provider while it is on', async () => {
      const r = await call('PUT', '/api/auth/config', { providers: [{ ...withUrls(), clientId: 'changed' }, ghUrls()] }, sess);
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/Turn sign-in off/);
    });
    it('lets another provider be added while it is on, touching nothing that already works, and the tester stays valid', async () => {
      const before = (await call('GET', '/api/auth/config', undefined, sess)).json();
      const extra = { id: 'second', type: 'github', name: 'Second GitHub', clientId: 'cid-2' };
      const r = await call('PUT', '/api/auth/config', { providers: [withUrls(), ghUrls(), extra] }, sess);
      expect(r.json().error ?? '', 'the reason').toBe('');
      expect(r.statusCode).toBe(200);
      const after = r.json();
      expect(after.enabled).toBe(true);
      expect(after.testedBy).toEqual(before.testedBy); // not made to test again
      expect(after.providers.map((p: any) => p.id)).toEqual([...before.providers.map((p: any) => p.id), 'second']);
      // Taking one away, or changing one, is still refused.
      expect((await call('PUT', '/api/auth/config', { providers: [withUrls(), ghUrls()] }, sess)).statusCode).toBe(400);
      expect((await call('PUT', '/api/auth/config', { providers: [{ ...withUrls(), clientId: 'changed' }, ghUrls(), extra] }, sess)).statusCode).toBe(400);
      expect((await call('PUT', '/api/auth/config', { providers: [withUrls(), ghUrls(), { ...extra, clientSecret: 'a-secret' }] }, sess)).statusCode).toBe(400); // a secret for a saved provider
    });
    it('refuses to replace a secret while it is on', async () => {
      const r = await call('PUT', '/api/auth/config', { providers: [{ ...withUrls(), clientSecret: 'new-secret' }, ghUrls()] }, sess);
      expect(r.statusCode).toBe(400);
    });
    it('lets the owner turn it off (ending every sign-in), fix the provider, test, and turn it on again', async () => {
      expect((await call('PUT', '/api/auth/config', { enabled: false }, sess)).statusCode).toBe(200);
      expect((await call('GET', '/api/photos')).statusCode).toBe(200); // open again
      expect((await call('GET', '/api/me')).json().mode).toBe('none');
      expect((await put({ providers: [{ ...withUrls(), clientId: 'frames-app' }, ghUrls()] })).json().testedBy).toBeNull(); // changed provider: must be tested again
      expect((await put({ enabled: true })).statusCode).toBe(400);
      const t = await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }, { test: true });
      expect(t.headers.location).toBe('/settings?section=access&access=tested');
      expect((await put({ enabled: true })).statusCode).toBe(200);
      sess = sessionHeader(t);
    });
    it('will not turn on if the account that tested is no longer on the list', async () => {
      await put({ enabled: false }, sess);
      await put({ allow: ['other@example.test'] });
      expect((await put({ enabled: true })).json().error).toMatch(/locked out/);
      await put({ allow: ['owner@example.test'] });
      expect((await put({ enabled: true })).statusCode).toBe(200);
      sess = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true }));
    });
  });

  describe('a GitHub-style provider (plain OAuth 2)', () => {
    it('signs in an allowed account by its verified primary email, ignoring the public profile email', async () => {
      await call('PUT', '/api/auth/config', { allow: ['owner@example.test', 'ghlike:77'] }, sess);
      const r = await signIn('ghlike', { sub: '77', email: 'owner@example.test', verified: true, name: 'Octo' });
      expect(r.statusCode).toBe(302);
      const s = sessionHeader(r);
      expect((await call('GET', '/api/me', undefined, s)).json().user).toMatchObject({ email: 'owner@example.test', provider: 'ghlike' });
    });
    it('does not let an unverified or spoofed email in; an allowed account id still works', async () => {
      const spoof = await signIn('ghlike', { sub: '78', email: 'owner@example.test', verified: false });
      expect(spoof.statusCode).toBe(403); // the profile says public@spoof.test and the only listed address is unverified
      expect((await signIn('ghlike', { sub: '77', email: '', verified: false })).statusCode).toBe(302);
    });
  });
});

describe('the shared-password option alongside OAuth', () => {
  it('works as a second way in, and the sign-in page offers it', async () => {
    const e = makeEnv({ allowInsecureOidc: true, authUser: 'me', authPassword: 'pw' });
    try {
      const h = { ...H, authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') };
      await e.app.inject({ method: 'PUT', url: '/api/auth/config', headers: h, payload: { providers: [withUrls()], allow: ['owner@example.test'] } });
      fake.who = { sub: 'u1', email: 'owner@example.test', verified: true };
      const start = await e.app.inject({ method: 'GET', url: '/auth/login/fake?test=1', headers: H });
      const there = await fetch(start.headers.location as string, { redirect: 'manual' });
      const back = new URL(there.headers.get('location')!);
      expect((await e.app.inject({ method: 'GET', url: back.pathname + back.search, headers: H })).statusCode).toBe(302);
      expect((await e.app.inject({ method: 'PUT', url: '/api/auth/config', headers: h, payload: { enabled: true } })).statusCode).toBe(200);
      expect((await e.app.inject({ method: 'GET', url: '/api/photos', headers: h })).statusCode).toBe(200); // the password still works
      expect((await e.app.inject({ method: 'GET', url: '/api/photos', headers: H })).statusCode).toBe(401);
      const page = await e.app.inject({ method: 'GET', url: '/', headers: { ...H, accept: 'text/html' } });
      expect(page.body).toContain('Use the shared password instead');
      const pw = await e.app.inject({ method: 'GET', url: '/auth/password', headers: H });
      expect(pw.statusCode).toBe(401);
      expect(pw.headers['www-authenticate']).toContain('Basic');
      expect((await e.app.inject({ method: 'GET', url: '/auth/password', headers: h })).statusCode).toBe(302);
    } finally { cleanup(e); }
  });
});

describe('the break-glass switch', () => {
  it('AUTH_DISABLE opens everything even though sign-in is configured on, and says so', async () => {
    fs.copyFileSync(path.join(env.data, 'frames.db'), path.join(env.tmp, 'copy.db'));
    const db = (await import('./db.js')).openDb(env.data);
    const open = buildApp(db, { libraries: env.cfg.libraries, dataDir: env.data, authDisabled: true });
    expect((await open.inject('/api/photos')).statusCode).toBe(200);
    expect((await open.inject('/api/me')).json().mode).toBe('none');
    await open.close();
    db.close();
  });
});

describe('proxies and the public address', () => {
  it('uses the forwarded address behind a trusted proxy when no public address is set', async () => {
    const e = makeEnv({ allowInsecureOidc: true, trustProxy: true });
    try {
      await e.app.inject({ method: 'PUT', url: '/api/auth/config', headers: H, payload: { providers: [withUrls()], allow: ['a@b.test'] } });
      const r = await e.app.inject({ method: 'GET', url: '/auth/login/fake', headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'photos.example.com', host: 'internal:3000' } });
      expect(new URL(r.headers.location as string).searchParams.get('redirect_uri')).toBe('https://photos.example.com/auth/callback/fake');
    } finally { cleanup(e); }
  });
  it('ignores forwarded headers when the proxy is not trusted', async () => {
    const e = makeEnv({ allowInsecureOidc: true });
    try {
      await e.app.inject({ method: 'PUT', url: '/api/auth/config', headers: H, payload: { providers: [withUrls()], allow: ['a@b.test'] } });
      const r = await e.app.inject({ method: 'GET', url: '/auth/login/fake', headers: { 'x-forwarded-host': 'attacker.example', host: 'frames.test' } });
      expect(new URL(r.headers.location as string).searchParams.get('redirect_uri')).toBe('http://frames.test/auth/callback/fake');
    } finally { cleanup(e); }
  });
  it('rejects a public address that is not http(s)', async () => {
    expect((await put({ publicUrl: 'javascript:alert(1)' }, sess)).statusCode).toBe(400);
  });
});

describe('backups never carry keys or logins', () => {
  it('leaves out OAuth secrets, the AI key and every session, in downloads and in the daily backups', async () => {
    await call('PUT', '/api/ai/key', { key: 'sk-secret-ai' }, sess);
    const dl = await call('GET', '/api/backup', undefined, sess);
    expect(dl.statusCode).toBe(200);
    await dailyBackup(env.db, env.data, new Date('2026-01-02T10:00:00Z'));
    const files = [path.join(env.tmp, 'dl.db'), path.join(env.data, 'backups', 'auto-2026-01-02.db')];
    fs.writeFileSync(files[0], dl.rawPayload);
    for (const f of files) {
      const raw = fs.readFileSync(f);
      for (const s of ['right-secret', 'sk-secret-ai']) expect(raw.includes(Buffer.from(s)), `${path.basename(f)} has ${s}`).toBe(false);
      const c = new Database(f, { readonly: true });
      expect((c.prepare('SELECT COUNT(*) n FROM sessions').get() as { n: number }).n).toBe(0);
      expect((c.prepare("SELECT COUNT(*) n FROM settings WHERE key LIKE 'secret:%'").get() as { n: number }).n).toBe(0);
      c.close();
    }
    // …but the live database still has them, so signing in keeps working.
    expect(((env.app as any).frames.sys.prepare('SELECT COUNT(*) n FROM sessions').get() as { n: number }).n).toBeGreaterThan(0);
  });
});

describe('turning on the env file export needs a fresh sign-in', () => {
  it('accepts a sign-in made just now, and asks to sign in again once it is older', async () => {
    const sys = (env.app as any).frames.sys;
    expect((await call('PUT', '/api/admin/env/export-enabled', { on: true }, sess)).statusCode).toBe(200); // the session was made moments ago
    await call('PUT', '/api/admin/env/export-enabled', { on: false }, sess);
    sys.prepare('UPDATE sessions SET created = ?').run(new Date(Date.now() - 10 * 60_000).toISOString()); // ten minutes old
    const r = await call('PUT', '/api/admin/env/export-enabled', { on: true }, sess);
    expect(r.statusCode).toBe(401);
    expect(r.json()).toMatchObject({ reauth: true });
    expect((await call('PUT', '/api/admin/env/export-enabled', { on: false }, sess)).statusCode).toBe(200); // turning it off never needs it
    // signing in again makes a new session, which is fresh
    const again = sessionHeader(await signIn('fake', { sub: 'u1', email: 'owner@example.test', verified: true, name: 'Owner' }));
    expect((await call('PUT', '/api/admin/env/export-enabled', { on: true }, again)).statusCode).toBe(200);
    await call('PUT', '/api/admin/env/export-enabled', { on: false }, again);
  });
});

describe('linking another way to sign in to the same person', () => {
  /** A signed-in person adds an account from another provider: through the provider once, and back. */
  async function link(id: string, who: Who, headers: Record<string, string>) {
    fake.who = who;
    const start = await call('GET', `/auth/link/${id}`, undefined, headers);
    if (start.statusCode !== 302) return start;
    const there = await fetch(start.headers.location as string, { redirect: 'manual' });
    const back = new URL(there.headers.get('location')!);
    return call('GET', back.pathname + back.search);
  }
  it('adds the account, lists it, and then signing in with it lands in the same library', async () => {
    const before = (await call('GET', '/api/me', undefined, sess)).json();
    const r = await link('ghlike', { sub: 'u7', email: 'owner@example.test', verified: true, name: 'Owner' }, sess);
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe('/settings?section=profile&linked=ok');
    const ids = (await call('GET', '/api/me/identities', undefined, sess)).json().identities;
    expect(ids.map((i: any) => i.provider)).toEqual(['fake', 'ghlike']);
    const viaGh = sessionHeader(await signIn('ghlike', { sub: 'u7', email: 'owner@example.test', verified: true, name: 'Owner' }));
    expect((await call('GET', '/api/me', undefined, viaGh)).json().id).toBe(before.id);
  });
  it('says so when it is already yours, and refuses an account that belongs to someone else', async () => {
    expect((await link('ghlike', { sub: 'u7', email: 'owner@example.test', verified: true }, sess)).headers.location).toBe('/settings?section=profile&linked=same');
    // a second person, with an account of their own
    await put({ allow: ['owner@example.test', 'friend@example.test'] }, sess);
    const friend = sessionHeader(await signIn('fake', { sub: 'f1', email: 'friend@example.test', verified: true, name: 'Friend' }));
    expect((await link('ghlike', { sub: 'u7', email: 'owner@example.test', verified: true }, friend)).headers.location).toBe('/settings?section=profile&linked=taken');
    expect((await call('GET', '/api/me/identities', undefined, friend)).json().identities.map((i: any) => i.provider)).toEqual(['fake']); // nothing moved
  });
  it('refuses an account that is not allowed in, and needs a signed-in session to start at all', async () => {
    expect((await link('ghlike', { sub: 'u9', email: 'stranger@evil.test', verified: true }, sess)).headers.location).toBe('/settings?section=profile&linked=notallowed');
    expect((await call('GET', '/auth/link/ghlike')).statusCode).toBe(401);
  });
  it('lets a linked account be removed, never the one they started with', async () => {
    const list = (await call('GET', '/api/me/identities', undefined, sess)).json().identities as any[];
    const extra = list.find((i) => !i.primary);
    expect((await call('DELETE', '/api/me/identities/0', undefined, sess)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/me/identities/${extra.id}`, undefined, sess)).statusCode).toBe(200);
    expect((await call('GET', '/api/me/identities', undefined, sess)).json().identities.map((i: any) => i.provider)).toEqual(['fake']);
  });
});

describe('sign-in attempts are rate-limited', () => {
  it('slows down someone hammering the sign-in address', async () => {
    const e = makeEnv({ allowInsecureOidc: true });
    try {
      await e.app.inject({ method: 'PUT', url: '/api/auth/config', headers: H, payload: { providers: [withUrls()], allow: ['a@b.test'] } });
      let limited = 0;
      for (let i = 0; i < 60; i++) if ((await e.app.inject({ method: 'GET', url: '/auth/login/fake', headers: H })).statusCode === 429) limited++;
      expect(limited).toBeGreaterThan(0);
    } finally { cleanup(e); }
  });
});
