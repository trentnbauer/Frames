import type { FastifyInstance } from 'fastify';
import { envConfigLoaded } from '../envConfig.js';
import { cleanAllow, createSession, endAllSessions, endSession, getSecret, isAllowed, loadAuth, saveAuth, sessionCookie, setSecret, validateProvider, type Auth, type AuthConfig, type Provider } from '../auth.js';
import type { Ctx, Row } from '../ctx.js';
import { bindOwner, resolveUser, type User } from '../users.js';

/** A path inside this site, never another website: used for "take me back to where I was". */
const safeReturn = (v: unknown) => (typeof v === 'string' && /^\/(?!\/)[\w\-./?=&%]*$/.test(v) && !v.startsWith('/auth/') ? v : '/');

export function registerAuth(app: FastifyInstance, x: Ctx, auth: Auth) {
  const { cfg } = x;
  const db = x.sys; // sign-in is instance-wide: providers, sessions and people live in the system database

  // ---------- rate limit the sign-in routes ----------
  const hits = new Map<string, { n: number; reset: number }>();
  const tooMany = (ip: string) => {
    const now = Date.now();
    let b = hits.get(ip);
    if (!b || b.reset < now) { b = { n: 0, reset: now + 60_000 }; hits.set(ip, b); if (hits.size > 2000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }
    return ++b.n > 40;
  };

  // ---------- public: the sign-in pages ----------
  app.get('/auth/signin', async (req, rep) => rep.type('text/html').send(auth.signinPage(String((req.query as Row).e ?? '').slice(0, 200) || undefined)));

  app.get('/auth/login/:id', async (req, rep) => {
    if (tooMany(req.ip)) return rep.code(429).type('text/html').send(auth.messagePage('Slow down', 'Too many sign-in attempts. Try again in a minute.'));
    const p = loadAuth(db).providers.find((v) => v.id === (req.params as Row).id);
    if (!p || !loadAuth(db).providers.length) return rep.code(404).type('text/html').send(auth.messagePage('Not set up', 'That sign-in method is not set up.'));
    const q = req.query as Row;
    try {
      return rep.redirect(await auth.begin(p, req, { test: q.test === '1', returnTo: safeReturn(q.returnTo) }));
    } catch (e) {
      console.error('sign-in start failed', (e as Error).message);
      return rep.code(502).type('text/html').send(auth.messagePage('Could not reach the provider', 'Frames could not contact the sign-in provider. Check its address in Settings, Access.'));
    }
  });

  app.get('/auth/callback/:id', async (req, rep) => {
    if (tooMany(req.ip)) return rep.code(429).type('text/html').send(auth.messagePage('Slow down', 'Too many sign-in attempts. Try again in a minute.'));
    let done;
    try { done = await auth.finish(req); } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed.';
      // Provider and protocol errors can carry technical detail: log it, show a plain message.
      const known = /expired|already used|did not|no longer|would not|no code|answered/.test(msg);
      if (!known) console.error('sign-in failed', msg);
      return rep.code(400).type('text/html').send(auth.messagePage('Sign-in did not work', known ? msg : 'The provider’s answer could not be checked. Please try again.'));
    }
    const { who, flow } = done;
    const conf = loadAuth(db);
    const allowed = isAllowed(who, conf.allow);
    if (!allowed) {
      console.warn(`sign-in refused: ${who.provider}:${who.sub} ${who.email || '(no email)'}`);
      if (flow.test) return rep.redirect('/settings?access=notallowed');
      return rep.code(403).type('text/html').send(auth.messagePage('Not on the list', `${who.email || 'That account'} is not allowed to use this Frames. Ask the owner to add it.`));
    }
    if (flow.test) {
      saveAuth(db, { ...conf, testedBy: who }); // proof that this provider works and that an allowed account can get in
      bindOwner(db, who); // the person doing the test from Settings is the owner of the library that already exists
    }
    // Being on the list lets someone in; ALLOW_SIGNUPS decides whether a first-time visitor gets an account of their own.
    const user = resolveUser(db, who, cfg.allowSignups !== false);
    if (!user) {
      console.warn(`account refused: ${who.provider}:${who.sub}`);
      return rep.code(403).type('text/html').send(auth.messagePage('No account', 'New accounts are turned off here, or this account has been switched off. Ask the owner to add you.'));
    }
    // A signed-in session even for a test, so turning sign-in on never signs the person who tested it out.
    const token = createSession(db, user.id);
    rep.header('Set-Cookie', sessionCookie(token, auth.isSecure(req)));
    return rep.redirect(flow.test ? '/settings?access=tested' : flow.returnTo);
  });

  app.post('/auth/logout', async (req, rep) => {
    endSession(db, req);
    rep.header('Set-Cookie', sessionCookie(null, auth.isSecure(req)));
    return { ok: true };
  });

  // For the shared-password option alongside OAuth: asking for it makes the browser show its password box.
  app.get('/auth/password', async (req, rep) => {
    if (!cfg.authPassword) return rep.redirect('/');
    const pw = auth.checkPassword(req);
    if (pw === 'ok') return rep.redirect('/');
    if (pw === 'limited') return rep.code(429).header('Retry-After', '60').send({ error: 'Too many wrong passwords. Try again in a minute.' });
    return rep.code(401).header('WWW-Authenticate', 'Basic realm="Frames", charset="UTF-8"').send({ error: 'Authentication required' });
  });

  // ---------- behind the sign-in: who am I, and the owner's settings ----------
  app.get('/api/me', async (req) => {
    const u = (req as any).authUser as User | null;
    const signedIn = (req as any).authVia === 'session';
    return {
      mode: !auth.protectedNow() ? 'none' : auth.oauthOn() ? 'oauth' : 'password',
      user: u && signedIn ? { name: u.name, email: u.email, provider: u.provider, folder: u.folder } : null,
      id: u?.id ?? 1, owner: (u?.id ?? 1) === 1, role: u?.role ?? 'member', canSignOut: signedIn, envConfig: ((l) => l.system || l.owner)(envConfigLoaded()), signups: cfg.allowSignups !== false,
    };
  });

  const dto = (req: any, c: AuthConfig) => ({
    enabled: c.enabled, allow: c.allow, publicUrl: c.publicUrl,
    testedBy: c.testedBy ? { email: c.testedBy.email, name: c.testedBy.name, provider: c.testedBy.provider } : null,
    providers: c.providers.map((p) => ({ ...p, hasSecret: !!getSecret(db, `oauth:${p.id}`), redirectUrl: `${auth.baseUrl(req)}/auth/callback/${p.id}` })),
    passwordOption: !!cfg.authPassword, disabledByEnv: !!cfg.authDisabled, callbackBase: auth.baseUrl(req),
    sessions: (db.prepare('SELECT COUNT(*) n FROM sessions WHERE expires > ?').get(new Date().toISOString()) as { n: number }).n,
  });

  app.get('/api/auth/config', async (req) => dto(req, loadAuth(db)));

  app.put('/api/auth/config', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    const cur = loadAuth(db);
    const next: AuthConfig = { ...cur };
    const bad = (error: string) => rep.code(400).send({ error });
    const secrets: Record<string, string> = {};
    let changedProviders = false;

    if (Array.isArray(b.providers)) {
      const seen = new Set<string>();
      const list: Provider[] = [];
      for (const raw of b.providers.slice(0, 10)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Each provider must be an object.');
        const p: Provider = {
          id: String(raw.id ?? '').trim().toLowerCase(), type: raw.type, name: String(raw.name ?? '').trim().slice(0, 40), clientId: String(raw.clientId ?? '').trim().slice(0, 300),
          ...(raw.issuer ? { issuer: String(raw.issuer).trim().slice(0, 300) } : {}), ...(raw.tenant ? { tenant: String(raw.tenant).trim().slice(0, 100) } : {}),
          ...(raw.authUrl ? { authUrl: String(raw.authUrl).trim().slice(0, 300) } : {}), ...(raw.tokenUrl ? { tokenUrl: String(raw.tokenUrl).trim().slice(0, 300) } : {}),
          ...(raw.teamDomain ? { teamDomain: String(raw.teamDomain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').slice(0, 253) } : {}), ...(raw.aud ? { aud: String(raw.aud).trim().toLowerCase().slice(0, 64) } : {}),
          ...(raw.userUrl ? { userUrl: String(raw.userUrl).trim().slice(0, 300) } : {}), ...(raw.emailsUrl ? { emailsUrl: String(raw.emailsUrl).trim().slice(0, 300) } : {}),
        };
        const err = validateProvider(p);
        if (err) return bad(err);
        if (seen.has(p.id)) return bad(`Two providers use the id “${p.id}”`);
        seen.add(p.id);
        p.name ||= ({ google: 'Google', github: 'GitHub', microsoft: 'Microsoft', oidc: 'OpenID Connect', oauth2: 'OAuth', cloudflare: 'Cloudflare Access' } as Record<string, string>)[p.type];
        if (typeof raw.clientSecret === 'string' && raw.clientSecret) secrets[p.id] = raw.clientSecret.slice(0, 500);
        list.push(p);
      }
      const strip = (ps: Provider[]) => JSON.stringify(ps.map((p) => Object.fromEntries(Object.entries(p).sort())));
      changedProviders = strip(list) !== strip(cur.providers) || Object.keys(secrets).length > 0;
      next.providers = list;
    }
    if (b.allow !== undefined) next.allow = cleanAllow(b.allow);
    if (b.publicUrl !== undefined) {
      const v = String(b.publicUrl).trim().replace(/\/+$/, '');
      if (v) { try { const u = new URL(v); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(); } catch { return bad('The public address must start with http:// or https://'); } }
      next.publicUrl = v.slice(0, 300);
    }
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled;

    // --- the lock-out protections ---
    if (changedProviders) {
      if (cur.enabled && next.enabled) return bad('Turn sign-in off before changing a provider, then test it and turn sign-in back on.');
      next.testedBy = null; // a changed provider has to be tested again
    }
    const au = (req as any).authUser as User | null;
    const me = au && (req as any).authVia === 'session' ? { provider: au.provider, sub: au.sub, email: au.email, emailVerified: true } : null;
    if (next.enabled) {
      if (!next.providers.length) return bad('Add a provider first.');
      if (!next.allow.length) return bad('Add at least one email, domain or account to the list of people allowed in.');
      if (!next.testedBy) return bad('Use “Test sign-in” with a provider first, so you know you can get back in.');
      if (!next.providers.some((p) => p.id === next.testedBy!.provider)) return bad('The account that tested sign-in uses a provider that is no longer set up. Test again.');
      if (cur.enabled && me && !isAllowed(me, next.allow)) return bad('That list would lock you out: your own account is not on it.');
      if (!isAllowed(next.testedBy, next.allow)) return bad('The account you tested with is not on the allowed list, so you would be locked out. Add it, or test with an allowed account.');
    }
    for (const [id, s] of Object.entries(secrets)) setSecret(db, `oauth:${id}`, s);
    for (const p of cur.providers) if (!next.providers.some((n) => n.id === p.id)) setSecret(db, `oauth:${p.id}`, ''); // a removed provider's secret goes with it
    saveAuth(db, next);
    if (!next.enabled && cur.enabled) endAllSessions(db); // switching off ends every sign-in
    x.tunnelRefresh?.(); // the tunnel's routes follow the public address
    return dto(req, next);
  });

  app.post('/api/auth/sessions/clear', async (req, rep) => {
    const n = endAllSessions(db);
    rep.header('Set-Cookie', sessionCookie(null, auth.isSecure(req)));
    return { ended: n };
  });
}
