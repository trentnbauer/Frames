import { markFactor, mfaPolicy, hasTotp } from './mfa.js';
import { clientOf } from './cloud.js';
import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import * as oidc from 'openid-client';
import { getSecret, setSecret } from './ai.js';
import type { AppCfg } from './ctx.js';
import { getSetting, setSetting, type DB } from './db.js';
import { getUser, OWNER_ID, type User } from './users.js';
import { active } from './turnstile.js';

/**
 * Optional sign-in through OAuth providers (design doc section 2.9).
 *
 *  - Off by default. Nothing here runs until the owner turns it on.
 *  - OpenID Connect (Google, Microsoft, any OIDC server) goes through the openid-client library: discovery, PKCE,
 *    state and nonce, and verification of the signed ID token. GitHub and other plain OAuth 2 services use the same
 *    code flow with PKCE and then ask the service who the user is.
 *  - OAuth only answers "who is this?". A separate allow-list decides who may come in. Everyone allowed has the same access.
 *  - Sessions are random tokens in HttpOnly cookies. Only a hash of each token is stored.
 *  - It cannot lock the owner out: it can only be switched on after a test sign-in by an allowed account, and
 *    AUTH_DISABLE=true switches it off from outside.
 */

export type ProviderType = 'google' | 'github' | 'microsoft' | 'dropbox' | 'oidc' | 'oauth2' | 'cloudflare';
export type Provider = {
  id: string; type: ProviderType; name: string; clientId: string;
  issuer?: string; tenant?: string; // oidc / microsoft
  authUrl?: string; tokenUrl?: string; userUrl?: string; emailsUrl?: string; // oauth2 (GitHub has these built in)
  /** google, microsoft and dropbox: sign in with the app registered under Settings, Cloud storage providers, so no second client ID and secret. */
  useCloudApp?: boolean;
  teamDomain?: string; aud?: string; // cloudflare: the Access team's domain, and the application's audience tag
  /** Set up but switched off: not offered on the sign-in page. */
  off?: boolean;
};
export type Identity = { provider: string; sub: string; email: string; emailVerified: boolean; name: string };
export type AuthConfig = { enabled: boolean; providers: Provider[]; allow: string[]; publicUrl: string; testedBy: Identity | null;
  /** Anyone who signs in with a provider is let in (and gets their own library), whatever the allowed list says. The list is kept. */
  open?: boolean;
  /** Sign in with an emailed code. Offered on the sign-in page only while SMTP is configured and passing its health check. */
  email?: boolean;
  /** Personal email-and-password sign-in, enabled by an administrator. */
  password?: boolean };

const EMPTY: AuthConfig = { enabled: false, providers: [], allow: [], publicUrl: '', testedBy: null };
export const loadAuth = (db: DB): AuthConfig => ({ ...EMPTY, ...getSetting<Partial<AuthConfig>>(db, 'auth', {}) });
export const saveAuth = (db: DB, c: AuthConfig) => setSetting(db, 'auth', c);
/** Is OAuth sign-in switched on, with at least one provider? */
export const oauthEnabled = (db: DB) => { const a = loadAuth(db); return a.enabled && (a.providers.some((p) => !p.off) || !!a.email || !!a.password); };

export const PRESETS: Record<'github' | 'dropbox', Required<Pick<Provider, 'authUrl' | 'tokenUrl' | 'userUrl' | 'emailsUrl'>>> = {
  dropbox: { authUrl: 'https://www.dropbox.com/oauth2/authorize', tokenUrl: 'https://api.dropboxapi.com/oauth2/token', userUrl: 'https://api.dropboxapi.com/2/users/get_current_account', emailsUrl: '' },
  github: { authUrl: 'https://github.com/login/oauth/authorize', tokenUrl: 'https://github.com/login/oauth/access_token', userUrl: 'https://api.github.com/user', emailsUrl: 'https://api.github.com/user/emails' },
};

let SESSION_DAYS = Number(process.env.SESSION_DAYS) || 14;
/** The days a sign-in lasts: the Sign-in & access setting, unless SESSION_DAYS fixes it. */
export const sessionDays = () => SESSION_DAYS;
export const setSessionDays = (n: number) => { if (!process.env.SESSION_DAYS && Number.isInteger(n) && n >= 1 && n <= 365) SESSION_DAYS = n; };
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const rand = (n = 32) => crypto.randomBytes(n).toString('base64url');
/**
 * A page that sends the browser on to `url` by itself. Used when a form (the sign-in buttons next to the Turnstile check) started the request:
 * the page's content-security-policy lets a form submit only to this site, and the browser applies that to a redirect from a form too, so a
 * plain redirect to the sign-in provider is refused and the button seems to do nothing. A page that moves on by itself is not a form submission.
 */
export const handOver = (url: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${esc(url)}"><title>Signing in · Frames</title></head><body style="margin:0;background:#0d0d0d;color:#a8a59f;font:15px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh"><p>Taking you to sign in… <a href="${esc(url)}" style="color:#efede8">Continue</a></p></body></html>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------- the allow-list ----------
/** Entries: an email (a@b.com), a whole domain (@b.com), or a provider account (github:12345). Email entries need a verified email. */
export function isAllowed(who: Pick<Identity, 'provider' | 'sub' | 'email' | 'emailVerified'>, allow: string[]): boolean {
  const email = who.email.toLowerCase();
  return allow.some((raw) => {
    const e = raw.trim().toLowerCase();
    if (!e) return false;
    if (e.startsWith('@')) return who.emailVerified && email.endsWith(e) && email.length > e.length;
    if (e.includes('@')) return who.emailVerified && email === e;
    const i = e.indexOf(':');
    return i > 0 && e.slice(0, i) === who.provider.toLowerCase() && e.slice(i + 1) === who.sub.toLowerCase();
  });
}
export const cleanAllow = (v: unknown): string[] => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(/[\n,]/)).map((s) => String(s).trim()).filter(Boolean))].slice(0, 200).map((s) => s.slice(0, 200));

export function validateProvider(p: Partial<Provider>): string | null {
  if (!/^[a-z0-9-]{1,30}$/.test(p.id ?? '')) return 'The provider needs a short id (letters, numbers, dashes)';
  if (!['google', 'github', 'microsoft', 'dropbox', 'oidc', 'oauth2', 'cloudflare'].includes(p.type as string)) return 'Unknown provider type';
  if (p.type === 'cloudflare') {
    if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(p.teamDomain ?? '')) return 'Enter your Cloudflare Zero Trust team domain (for example myteam.cloudflareaccess.com)';
    if (!/^[0-9a-f]{32,64}$/i.test(p.aud ?? '')) return 'Enter the Application Audience (AUD) tag of the Access application that protects Frames';
    return null; // no client ID or secret: Cloudflare Access signs the person in and passes a signed token
  }
  if (p.useCloudApp && !['google', 'microsoft', 'dropbox'].includes(p.type as string)) return 'Only Google, Microsoft and Dropbox can use the cloud app';
  if (!p.useCloudApp && !p.clientId?.trim()) return 'Enter the client ID';
  const url = (v?: string) => { try { const u = new URL(v ?? ''); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; } };
  if (p.type === 'oidc' && !url(p.issuer)) return 'Enter the issuer address of your OpenID Connect server';
  if (p.type === 'microsoft' && !/^[0-9a-f-]{36}$|^[a-z0-9.-]+\.[a-z]+$/i.test(p.tenant ?? '')) return 'Enter your Microsoft tenant ID';
  if (p.type === 'oauth2' && !(url(p.authUrl) && url(p.tokenUrl) && url(p.userUrl))) return 'Enter the authorize, token and user-info addresses';
  return null;
}

// ---------- sessions ----------
/** A sign-in session belongs to one person. Only a hash of the token is stored (in the system database). */
export function createSession(sys: DB, userId: number, verified = false): string {
  const token = rand(32);
  const now = new Date();
  sys.prepare('DELETE FROM sessions WHERE expires < ?').run(now.toISOString());
  sys.prepare('INSERT INTO sessions(id, user_id, created, expires, last_seen) VALUES(?, ?, ?, ?, ?)')
    .run(hash(token), userId, now.toISOString(), new Date(now.getTime() + SESSION_DAYS * 86_400_000).toISOString(), now.toISOString());
  sys.prepare('INSERT INTO sign_in_events(id, session_id, user_id, created) VALUES(?, ?, ?, ?)').run(rand(18), hash(token), userId, now.toISOString());
  sys.prepare('DELETE FROM sign_in_events WHERE user_id = ? AND session_id NOT IN (SELECT id FROM sessions) AND id NOT IN (SELECT id FROM sign_in_events WHERE user_id = ? ORDER BY created DESC, rowid DESC LIMIT 1000)').run(userId, userId);
  if (verified) markFactor(sys, hash(token));
  return token;
}
const cookieOf = (req: FastifyRequest, name: string) => {
  for (const part of String(req.headers.cookie ?? '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) { try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return ''; } } }
  return '';
};
export const SESSION_COOKIE = 'frames_session';
export const sessionIdOf = (req: FastifyRequest) => { const t = cookieOf(req, SESSION_COOKIE); return t ? hash(t) : null; };

export function sessionUser(sys: DB, req: FastifyRequest): User | null {
  const t = cookieOf(req, SESSION_COOKIE);
  if (!t) return null;
  const id = hash(t);
  const s = sys.prepare('SELECT user_id, expires, last_seen FROM sessions WHERE id = ?').get(id) as { user_id: number; expires: string; last_seen: string } | undefined;
  if (!s || new Date(s.expires).getTime() < Date.now()) return null;
  const user = getUser(sys, s.user_id);
  if (!user || user.disabled) return null;
  // Sliding expiry: using it keeps it alive, written at most once a day.
  if (Date.now() - new Date(s.last_seen).getTime() > 86_400_000) sys.prepare('UPDATE sessions SET last_seen = ?, expires = ? WHERE id = ?').run(new Date().toISOString(), new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString(), id);
  return user;
}
/** How long ago the signed-in session of this request began (null if there is none): a fresh sign-in is a new session. */
export function sessionAgeMs(sys: DB, req: FastifyRequest): number | null {
  const t = cookieOf(req, SESSION_COOKIE);
  if (!t) return null;
  const s = sys.prepare('SELECT created FROM sessions WHERE id = ?').get(hash(t)) as { created: string } | undefined;
  return s ? Date.now() - new Date(s.created).getTime() : null;
}
export const endSession = (sys: DB, req: FastifyRequest) => { const t = cookieOf(req, SESSION_COOKIE); if (t) sys.prepare('DELETE FROM sessions WHERE id = ?').run(hash(t)); };
export const endAllSessions = (sys: DB) => sys.prepare('DELETE FROM sessions').run().changes;

export function sessionCookie(token: string | null, secure: boolean): string {
  const base = `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
  return token ? `${base}; Max-Age=${SESSION_DAYS * 86_400}` : `${base}; Max-Age=0`;
}

// ---------- talking to providers ----------
type Flow = { providerId: string; verifier: string; nonce: string; test: boolean; created: number; returnTo: string; redirectUri: string; /** Set when a signed-in person is adding this account to themselves, not signing in. */ linkUser?: number; /** Set when someone started from a share link to make a guest account: they need not be on the allowed list, and can only become a guest. */ guest?: boolean };

export function createAuth(db: DB, cfg: AppCfg) {
  const flows = new Map<string, Flow>(); // state -> flow, kept for ten minutes
  const configs = new Map<string, { at: number; key: string; config: oidc.Configuration }>();
  const jwksSets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
  const http = cfg.allowInsecureOidc ? [oidc.allowInsecureRequests] : [];

  const baseUrl = (req: FastifyRequest) => (loadAuth(db).publicUrl || `${req.protocol}://${req.host}`).replace(/\/+$/, '');
  const isSecure = (req: FastifyRequest) => baseUrl(req).startsWith('https://');
  const issuerOf = (p: Provider) => (p.type === 'google' ? 'https://accounts.google.com' : p.type === 'microsoft' ? `https://login.microsoftonline.com/${p.tenant}/v2.0` : p.issuer!);

  /** The client ID and secret to sign in with: the provider's own, or the cloud app's (Settings, Cloud storage providers) when it uses that. */
  const creds = (p: Provider): { clientId: string; secret: string } => {
    if (p.useCloudApp) { const k = clientOf(cfg, db, p.type === 'microsoft' ? 'onedrive' : (p.type as 'google' | 'dropbox')); return { clientId: k.clientId, secret: k.secret }; }
    return { clientId: p.clientId, secret: getSecret(db, `oauth:${p.id}`) };
  };

  async function oidcConfig(p: Provider) {
    const { clientId, secret } = creds(p);
    const key = JSON.stringify([p.type, clientId, p.issuer, p.tenant, !!secret]);
    const hit = configs.get(p.id);
    if (hit && hit.key === key && Date.now() - hit.at < 600_000) return hit.config;
    const config = await oidc.discovery(new URL(issuerOf(p)), clientId, secret ? { client_secret: secret } : undefined, secret ? undefined : oidc.None(), { execute: http as any });
    configs.set(p.id, { at: Date.now(), key, config });
    return config;
  }

  /** The person Cloudflare Access signed in, from the signed token it adds to each request. The signature, issuer, audience and expiry are all checked. */
  async function cloudflareIdentity(p: Provider, req: FastifyRequest): Promise<Identity> {
    const token = String(req.headers['cf-access-jwt-assertion'] ?? '');
    if (!token) throw new Error('Cloudflare Access did not pass a login to Frames. Open Frames through the address that Cloudflare Access protects.');
    try {
      const base = cfg.accessCertsBase ?? `https://${p.teamDomain}`;
      let jwks = jwksSets.get(base);
      if (!jwks) { jwks = createRemoteJWKSet(new URL(`${base}/cdn-cgi/access/certs`)); jwksSets.set(base, jwks); }
      const { payload } = await jwtVerify(token, jwks, { issuer: `https://${p.teamDomain}`, audience: p.aud });
      const email = String(payload.email ?? '').toLowerCase();
      if (!email) throw new Error('no email');
      return { provider: p.id, sub: String(payload.sub ?? email), email, emailVerified: true, name: String(payload.name ?? '') || email };
    } catch { throw new Error('Cloudflare Access did not give a valid login for this Frames. Check the team domain and audience tag under Settings, Sign-in & access.'); }
  }

  const prune = () => { const old = Date.now() - 600_000; for (const [k, f] of flows) if (f.created < old) flows.delete(k); if (flows.size > 1000) flows.clear(); };

  /** Where to send the browser to start signing in. */
  async function begin(p: Provider, req: FastifyRequest, opts: { test: boolean; returnTo: string; linkUser?: number; guest?: boolean }): Promise<string> {
    prune();
    const state = rand(24), verifier = oidc.randomPKCECodeVerifier(), nonce = rand(16);
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    const redirectUri = `${baseUrl(req)}/auth/callback/${p.id}`;
    flows.set(state, { providerId: p.id, verifier, nonce, test: opts.test, created: Date.now(), returnTo: opts.returnTo, redirectUri, linkUser: opts.linkUser, guest: opts.guest });
    if (p.type === 'cloudflare') return `${baseUrl(req)}/auth/callback/${p.id}?state=${state}`; // nothing to ask a provider: Access already signed the person in
    if (p.type === 'github' || p.type === 'oauth2' || p.type === 'dropbox') {
      const a = p.type === 'github' ? PRESETS.github : p.type === 'dropbox' ? PRESETS.dropbox : p;
      const u = new URL(a.authUrl!);
      u.search = new URLSearchParams({ client_id: creds(p).clientId, redirect_uri: redirectUri, response_type: 'code', scope: p.type === 'github' ? 'read:user user:email' : p.type === 'dropbox' ? 'account_info.read' : 'profile email', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
      return u.toString();
    }
    const config = await oidcConfig(p);
    return oidc.buildAuthorizationUrl(config, { redirect_uri: redirectUri, scope: 'openid email profile', code_challenge: challenge, code_challenge_method: 'S256', state, nonce }).toString();
  }

  const getJson = async (url: string, token: string, method: 'GET' | 'POST' = 'GET') => {
    const r = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'Frames' }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`The provider answered ${r.status}`);
    return r.json() as Promise<Record<string, any>>;
  };

  /** Finishes the sign-in and says who it was. Throws a plain-language Error if anything does not check out. */
  async function finish(req: FastifyRequest): Promise<{ who: Identity; flow: Flow }> {
    const q = req.query as Record<string, string>;
    const flow = flows.get(q.state ?? '');
    flows.delete(q.state ?? ''); // one use only
    const id = (req.params as { id: string }).id;
    if (!flow || flow.providerId !== id || Date.now() - flow.created > 600_000) throw new Error('This sign-in link expired or was already used. Please start again.');
    if (q.error) throw new Error(`The provider did not sign you in (${q.error_description || q.error}).`);
    const p = loadAuth(db).providers.find((x) => x.id === id && !x.off);
    if (!p) throw new Error('That provider is no longer set up.');
    const { clientId, secret } = creds(p);

    if (p.type === 'cloudflare') return { who: await cloudflareIdentity(p, req), flow };

    if (p.type === 'github' || p.type === 'oauth2' || p.type === 'dropbox') {
      const a = p.type === 'github' ? PRESETS.github : p.type === 'dropbox' ? PRESETS.dropbox : (p as Required<Provider>);
      if (!q.code) throw new Error('The provider sent no code.');
      const body = new URLSearchParams({ grant_type: 'authorization_code', code: q.code, redirect_uri: flow.redirectUri, client_id: clientId, code_verifier: flow.verifier });
      if (secret) body.set('client_secret', secret);
      const tr = await fetch(a.tokenUrl, { method: 'POST', body, headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Frames' }, signal: AbortSignal.timeout(15_000) });
      const t = (await tr.json().catch(() => ({}))) as Record<string, any>;
      if (!tr.ok || !t.access_token) throw new Error('The provider would not give out a sign-in token. Check the client ID and secret.');
      // Dropbox asks who you are with a POST and an empty body; the others with a GET.
      const u = await getJson(a.userUrl, t.access_token, p.type === 'dropbox' ? 'POST' : 'GET');
      let email = String(u.email ?? ''), verified = u.email_verified === true;
      if (a.emailsUrl) {
        // GitHub: the public profile email is unverified. Only the primary verified address counts.
        const list = (await getJson(a.emailsUrl, t.access_token).catch(() => [])) as unknown as { email: string; primary: boolean; verified: boolean }[];
        const best = Array.isArray(list) ? list.find((e) => e.primary && e.verified) ?? list.find((e) => e.verified) : undefined;
        if (best) { email = best.email; verified = true; }
      }
      const sub = String(u.id ?? u.sub ?? u.account_id ?? '');
      if (!sub) throw new Error('The provider did not say who you are.');
      return { who: { provider: p.id, sub, email, emailVerified: verified && !!email, name: String((typeof u.name === 'object' ? u.name?.display_name : u.name) ?? u.login ?? email ?? sub) }, flow };
    }

    const config = await oidcConfig(p);
    const current = new URL(`${baseUrl(req)}${req.url}`);
    const tokens = await oidc.authorizationCodeGrant(config, current, { pkceCodeVerifier: flow.verifier, expectedState: q.state, expectedNonce: flow.nonce });
    // The library checks the claims (issuer, audience, nonce, expiry). It does not check the signature, because the OpenID
    // spec lets a client skip that for a token received straight from the provider over TLS. Checking it anyway costs
    // little and stops a forged token, which matters most if the provider is reached over plain http.
    const meta = config.serverMetadata();
    if (!tokens.id_token || !meta.jwks_uri) throw new Error('The provider did not send a signed ID token.');
    const keys = jwksSets.get(meta.jwks_uri) ?? jwksSets.set(meta.jwks_uri, createRemoteJWKSet(new URL(meta.jwks_uri), { timeoutDuration: 10_000 })).get(meta.jwks_uri)!;
    await jwtVerify(tokens.id_token, keys, { issuer: meta.issuer, audience: clientId, clockTolerance: 60 });
    const c = tokens.claims();
    if (!c?.sub) throw new Error('The provider did not say who you are.');
    const email = String(c.email ?? '');
    // Google and well-run OIDC servers say whether the email is verified. Microsoft does not, but a tenant-specific
    // sign-in only ever issues addresses that tenant controls. Anything else without the claim counts as unverified.
    const verified = c.email_verified === true || (p.type === 'microsoft' && !!email);
    return { who: { provider: p.id, sub: String(c.sub), email, emailVerified: verified && !!email, name: String(c.name ?? c.preferred_username ?? email ?? c.sub) }, flow };
  }

  // ---------- the gate ----------
  // The shared password is checked with scrypt (a slow, salted hash), and a header that has been checked once is remembered in memory, so a
  // signed-in script does not pay for it on every request. Wrong attempts are limited below.
  const salt = crypto.randomBytes(16);
  const slow = (s: string) => crypto.scryptSync(s, salt, 32, { N: 16384 });
  const expected = cfg.authPassword ? slow(`${cfg.authUser ?? 'frames'}:${cfg.authPassword}`) : null;
  const accepted = new Set<string>();
  const passwordOk = (req: FastifyRequest) => {
    if (!expected) return false;
    const h = req.headers.authorization ?? '';
    if (accepted.has(h)) return true;
    const m = /^Basic (.+)$/.exec(h);
    if (!m) return false;
    const [u = '', ...rest] = Buffer.from(m[1], 'base64').toString().split(':');
    const ok = crypto.timingSafeEqual(slow(`${u}:${rest.join(':')}`), expected);
    if (ok) { if (accepted.size >= 50) accepted.clear(); accepted.add(h); }
    return ok;
  };
  // Wrong shared-password attempts are counted per address: after 10 in a minute, even the right password is refused until the minute is up.
  const wrong = new Map<string, { n: number; reset: number }>();
  const lockedOut = (ip: string) => { const b = wrong.get(ip); return !!b && b.reset > Date.now() && b.n >= 10; };
  const noteWrong = (ip: string) => {
    const now = Date.now();
    let b = wrong.get(ip);
    if (!b || b.reset < now) { b = { n: 0, reset: now + 60_000 }; wrong.set(ip, b); if (wrong.size > 2000) for (const [k, v] of wrong) if (v.reset < now) wrong.delete(k); }
    b.n++;
  };
  /** The one place a shared password is checked. 'none' = no password offered (the browser's first try), which is not a wrong guess. */
  const checkPassword = (req: FastifyRequest): 'ok' | 'none' | 'wrong' | 'limited' => {
    if (!cfg.authPassword) return 'none';
    if (lockedOut(req.ip)) return 'limited';
    if (passwordOk(req)) return 'ok';
    if (!/^Basic /.test(req.headers.authorization ?? '')) return 'none';
    noteWrong(req.ip);
    return lockedOut(req.ip) ? 'limited' : 'wrong';
  };
  const oauthOn = () => oauthEnabled(db);
  /** Is anything protecting this instance right now? */
  const protectedNow = () => !cfg.authDisabled && (oauthOn() || !!cfg.authPassword || mfaPolicy(db) !== 'off' || hasTotp(db, OWNER_ID));

  /** Who is asking: the owner when nothing protects the instance or the shared password was used, otherwise the person whose session it is. */
  type Verdict = { ok: true; user: User; via: 'open' | 'session' | 'password' } | { ok: false; limited?: boolean };
  const owner = () => getUser(db, OWNER_ID)!;
  function verify(req: FastifyRequest): Verdict {
    const signedIn = sessionUser(db, req);
    if (!cfg.authDisabled && signedIn?.provider === 'emergency') return { ok: true, user: signedIn, via: 'session' };
    if (!protectedNow()) return { ok: true, user: owner(), via: 'open' };
    if ((oauthOn() || mfaPolicy(db) !== 'off' || hasTotp(db, OWNER_ID)) && signedIn) return { ok: true, user: signedIn, via: 'session' };
    const pw = checkPassword(req);
    if (pw === 'ok') return { ok: true, user: owner(), via: 'password' };
    return pw === 'limited' ? { ok: false, limited: true } : { ok: false };
  }

  const PAGE = (body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="/icon.svg"><title>Sign in · Frames</title><style>
  body{margin:0;background:#0d0d0d;color:#efede8;font:15px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}
  main{width:min(380px,calc(100vw - 48px))}h1{font:400 44px/1 Georgia,serif;margin:0 0 8px}p{color:#a8a59f;margin:0 0 22px}
  a.b,button.b{display:block;width:100%;border:0;font:inherit;cursor:pointer;text-align:center;padding:12px 18px;border-radius:999px;background:#efede8;color:#0d0d0d;text-decoration:none;font-weight:500;margin-bottom:10px}
  a.l{color:#8f8c86;font-size:13px}.e{color:#e79a82;background:rgba(231,140,120,.1);border-radius:10px;padding:10px 14px;margin-bottom:18px}</style></head><body><main>${body}</main></body></html>`;

  function signinPage(message?: string, opts: { returnTo?: string; guest?: boolean } = {}): string {
    const a = loadAuth(db);
    const t = active(db, 'signin');
    // With the Turnstile check on, the buttons submit a form that carries the check's answer; without it they are plain links.
    const buttons = t
      ? `<form method="get" action="/auth/login/${esc(a.providers.find((p) => !p.off)?.id ?? '')}">${opts.returnTo ? `<input type="hidden" name="returnTo" value="${esc(opts.returnTo)}">` : ''}${opts.guest ? '<input type="hidden" name="guest" value="1">' : ''}
        <div class="cf-turnstile" data-sitekey="${esc(t.siteKey)}" data-theme="dark" style="margin-bottom:14px"></div>
        ${a.providers.filter((p) => !p.off).map((p) => `<button class="b" type="submit" formaction="/auth/login/${esc(p.id)}">Continue with ${esc(p.name)}</button>`).join('')}</form><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
      : a.providers.filter((p) => !p.off).map((p) => `<a class="b" href="/auth/login/${esc(p.id)}">Continue with ${esc(p.name)}</a>`).join('');
    return PAGE(`<h1>Frames</h1><p>Sign in to continue.</p>${message ? `<div class="e" role="alert">${esc(message)}</div>` : ''}
      ${buttons}
      ${cfg.authPassword ? '<a class="l" href="/auth/password">Use the shared password instead</a>' : ''}<p style="margin-top:26px;font-size:13px"><a class="l" href="/privacy">Privacy</a></p>`);
  }
  const messagePage = (title: string, text: string) => PAGE(`<h1>${esc(title)}</h1><p>${esc(text)}</p><a class="l" href="/auth/signin">Back to sign in</a>`);

  const wantsHtml = (req: FastifyRequest) => req.method === 'GET' && !req.url.startsWith('/api/') && String(req.headers.accept ?? '').includes('text/html');
  /** Refuses a request that has no valid sign-in, in the way that suits who is asking. */
  function deny(req: FastifyRequest, rep: FastifyReply, limited = false) {
    if (limited) return rep.code(429).header('Retry-After', '60').send({ error: 'Too many wrong passwords. Try again in a minute.' });
    if (oauthOn()) {
      // Behind Cloudflare Access there is no screen to show: the signed token in the request is the sign-in.
      const cf = loadAuth(db).providers.find((p) => p.type === 'cloudflare');
      if (cf && req.headers['cf-access-jwt-assertion'] && wantsHtml(req)) return rep.redirect(`/auth/login/${cf.id}?returnTo=${encodeURIComponent(req.url)}`);
      if (wantsHtml(req)) return rep.redirect(`/signin${req.url !== '/' && /^\/(?!\/)[\w\-./?=&%]*$/.test(req.url) ? `?returnTo=${encodeURIComponent(req.url)}` : ''}`);
      return rep.code(401).send({ error: 'Sign in required', signIn: true });
    }
    return rep.code(401).header('WWW-Authenticate', 'Basic realm="Frames", charset="UTF-8"').send({ error: 'Authentication required' });
  }

  return { baseUrl, isSecure, begin, finish, verify, deny, oauthOn, protectedNow, signinPage, messagePage, issuerOf, checkPassword };
}
export type Auth = ReturnType<typeof createAuth>;

/** Addresses served without signing in: the sign-in pages themselves. */
export const isAuthPath = (url: string) => /^\/auth\/(login\/[a-z0-9-]{1,30}|callback\/[a-z0-9-]{1,30}|signin|password|logout|emergency)(\?.*)?$/.test(url);
export { getSecret, setSecret };
