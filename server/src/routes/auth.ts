import type { FastifyInstance } from 'fastify';
import { envConfigLoaded } from '../envConfig.js';
import { sessionUser, cleanAllow, createSession, endAllSessions, endSession, getSecret, isAllowed, loadAuth, saveAuth, sessionCookie, setSecret, validateProvider, type Auth, type AuthConfig, type Provider, handOver } from '../auth.js';
import type { Ctx, Row } from '../ctx.js';
import { clientOf, storesOriginalQuality } from '../cloud.js';
import { getSetting } from '../db.js';
import { notify } from '../notifications.js';
import { queueMail } from '../mailEvents.js';
import crypto from 'node:crypto';
import { checkCode, checkSmtp, footer, issueCode, sendMail, smtpHealthy } from '../email.js';
import { humanCookie } from '../turnstile.js';
import fs from 'node:fs';
import { active as turnstileOn, isHuman, verifyToken } from '../turnstile.js';
import { avatarPath, displayNameOf } from './profile.js';
import { trimEnd } from '../text.js';
import { authenticationOptions, listPasskeys, registrationOptions, removePasskey, renamePasskey, verifyAuthentication, verifyRegistration } from '../passkeys.js';
import { EMERGENCY_PROVIDER, emergencyActive, removeEmergency, useEmergency } from '../emergency.js';
import { bindOwner, findByEmail, getUser, identitiesOf, linkIdentity, resolveUser, signupsOn, unlinkIdentity, type User, type Who } from '../users.js';

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
  app.get('/auth/signin', async (req, rep) => { const q = req.query as Row; return rep.type('text/html').send(auth.signinPage(String(q.e ?? '').slice(0, 200) || undefined, { returnTo: safeReturn(q.returnTo) === '/' ? undefined : safeReturn(q.returnTo), guest: q.guest === '1' })); });

  app.get('/auth/login/:id', async (req, rep) => {
    if (tooMany(req.ip)) return rep.code(429).type('text/html').send(auth.messagePage('Slow down', 'Too many sign-in attempts. Try again in a minute.'));
    const p = loadAuth(db).providers.find((v) => v.id === (req.params as Row).id && !v.off);
    if (!p || !loadAuth(db).providers.length) return rep.code(404).type('text/html').send(auth.messagePage('Not set up', 'That sign-in method is not set up.'));
    const q = req.query as Row;
    // The Turnstile check, when it is on for sign-in: a person who has passed it (the cookie) or who brings its answer gets through. The test
    // sign-in an administrator starts from Settings is exempt, so the check can never get in the way of setting sign-in up.
    if (turnstileOn(db, 'signin') && q.test !== '1' && !isHuman(db, req)) {
      const v = await verifyToken(db, q['cf-turnstile-response'], req.ip, cfg.turnstileUrl);
      if (v === 'bad') return rep.redirect(`/auth/signin?e=${encodeURIComponent('Please complete the check to show you are a person, then choose how to sign in.')}${q.returnTo ? `&returnTo=${encodeURIComponent(safeReturn(q.returnTo))}` : ''}${q.guest === '1' ? '&guest=1' : ''}`);
    }
    try {
      const to = await auth.begin(p, req, { test: q.test === '1', returnTo: safeReturn(q.returnTo), guest: q.guest === '1' && /^\/s\/[\w-]+$/.test(safeReturn(q.returnTo)) });
      // From the sign-in page's form (it brings the Turnstile answer along) a redirect would be refused by the page's form-action policy.
      if (q['cf-turnstile-response'] !== undefined) return rep.type('text/html').header('Cache-Control', 'no-store').send(handOver(to));
      return rep.redirect(to);
    } catch (e) {
      console.error('sign-in start failed', (e as Error).message);
      return rep.code(502).type('text/html').send(auth.messagePage('Could not reach the provider', 'Frames could not contact the sign-in provider. Check its address in Settings, Sign-in & access.'));
    }
  });

  /**
   * A sign-in from a device this person has not used before tells them (the bell, and an email if they asked for it; always for
   * administrators). The first device ever is not news. Returns the cookies to set: the session, and the device marker.
   */
  const seenCookie = (req: any) => /(?:^|;\s*)frames_seen=([A-Za-z0-9_-]{16,40})/.exec(String(req.headers.cookie ?? ''))?.[1];
  const withDevice = (req: any, user: User, session: string): string[] => {
    const cookies = [session];
    let dev = seenCookie(req);
    if (!dev) { dev = crypto.randomBytes(16).toString('base64url'); cookies.push(`frames_seen=${dev}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${365 * 86400}${auth.isSecure(req) ? '; Secure' : ''}`); }
    try {
      db.exec('CREATE TABLE IF NOT EXISTS known_devices (user_id INTEGER NOT NULL, dev TEXT NOT NULL, first_seen TEXT NOT NULL, PRIMARY KEY (user_id, dev))');
      const had = (db.prepare('SELECT COUNT(*) n FROM known_devices WHERE user_id = ?').get(user.id) as { n: number }).n;
      const known = !!db.prepare('SELECT 1 FROM known_devices WHERE user_id = ? AND dev = ?').get(user.id, dev);
      if (!known) {
        db.prepare('INSERT INTO known_devices (user_id, dev, first_seen) VALUES (?,?,?)').run(user.id, dev, new Date().toISOString());
        const t = had > 0 ? x.tenants.get(user.id) : null;
        if (t) {
          const ua = String(req.headers['user-agent'] ?? '').slice(0, 80) || 'a new device';
          const base = (loadAuth(db).publicUrl || auth.baseUrl(req)).replace(/\/+$/, '');
          notify(t.db, 'sign-in', 'Someone signed in to your account from a new device', { screen: '/settings?section=profile' }, `si:${dev}`);
          queueMail(x, t, 'sign-in', { type: 'signin', baseUrl: base, params: { subject: 'New sign-in to Frames', preheader: 'A new device signed in', eyebrow: 'Security', title: 'New sign-in', body: `Your account was just signed in on ${ua}. If that was you, there is nothing to do. If not, open Settings and sign out everywhere.`, button_label: 'Review your account', button_url: `${base}/settings?section=profile`, fine_print: 'You get this when a device you have not used before signs in.', image_url: '', image_alt: '', note: '', note_from: '' } });
        }
      }
    } catch { /* never stop a sign-in over a notice */ }
    return cookies;
  };

  /** Lets an identity in (or not) and sets the session: the part of every sign-in that comes after "who is this". */
  const admit = (req: any, rep: any, who: Who, flow: { test?: boolean; returnTo: string; linkUser?: number; guest?: boolean }, via: 'redirect' | 'json' = 'redirect') => {
    const conf = loadAuth(db);
    const listed = !!conf.open || isAllowed(who, conf.allow); // open: anyone who signs in is let in
    // Someone who came from a share link to make a guest account needs no place on the list; that lets in a guest and no one else (checked below).
    const allowed = listed || !!flow.guest;
    if (flow.linkUser) {
      // Someone signed in is adding this account to themselves. The flow was started by their own session, so it is theirs to finish.
      return rep.redirect(`/settings?section=profile&linked=${allowed ? linkIdentity(db, flow.linkUser, who) : 'notallowed'}`);
    }
    if (!allowed) {
      console.warn(`sign-in refused: ${who.provider}:${who.sub} ${who.email || '(no email)'}`);
      if (flow.test) return rep.redirect('/settings?section=access&access=notallowed');
      return rep.code(403).type('text/html').send(auth.messagePage('Not on the list', `${who.email || 'That account'} is not allowed to use this Frames. Ask the owner to add it.`));
    }
    if (flow.test) {
      saveAuth(db, { ...conf, testedBy: who }); // proof that this provider works and that an allowed account can get in
      bindOwner(db, who); // the person doing the test from Settings is the owner of the library that already exists
    }
    // Being on the list lets someone in; ALLOW_SIGNUPS decides whether a first-time visitor gets an account of their own.
    const user = resolveUser(db, who, signupsOn(db, cfg.allowSignups !== false), !listed);
    if (user && !listed && user.role !== 'guest') return rep.code(403).type('text/html').send(auth.messagePage('Not on the list', `${who.email || 'That account'} is not allowed to use this Frames. Ask the owner to add it.`));
    if (!user) {
      console.warn(`account refused: ${who.provider}:${who.sub}`);
      return rep.code(403).type('text/html').send(auth.messagePage('No account', 'New accounts are turned off here, or this account has been switched off. Ask the owner to add you.'));
    }
    // A signed-in session even for a test, so turning sign-in on never signs the person who tested it out.
    const token = createSession(db, user.id);
    rep.header('Set-Cookie', withDevice(req, user, sessionCookie(token, auth.isSecure(req))));
    return rep.redirect(flow.test ? '/settings?section=access&access=tested' : flow.returnTo);
  };

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
    return admit(req, rep, done.who, done.flow);
  });


  // ---------- public: what the sign-in screens need, and the emailed code ----------
  const emailOn = () => !!loadAuth(db).email && smtpHealthy(db);
  const ownerName = () => { const o = x.tenants.owner(); return displayNameOf(o.db) || ''; };
  const sendHits = new Map<string, number[]>();
  const sendLimited = (key: string, max: number, windowMs: number) => {
    const now = Date.now();
    const l = (sendHits.get(key) ?? []).filter((t) => t > now - windowMs);
    if (l.length >= max) { sendHits.set(key, l); return true; }
    l.push(now); sendHits.set(key, l);
    if (sendHits.size > 5000) sendHits.clear();
    return false;
  };
  const guestFlow = (b: Row) => b.guest === true && /^\/s\/[\w-]+$/.test(safeReturn(b.returnTo));
  const okEmail = (v: unknown) => { const e = String(v ?? '').trim().toLowerCase(); return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) ? e : ''; };

  app.get('/api/public/auth', async (req) => {
    const conf = loadAuth(db);
    const t = turnstileOn(db, 'signin');
    return {
      providers: conf.providers.filter((p) => !p.off).map((p) => ({ id: p.id, name: p.name, type: p.type })),
      email: emailOn(), password: !!cfg.authPassword, passkey: true, turnstile: t ? { siteKey: t.siteKey } : null,
      signups: signupsOn(db, cfg.allowSignups !== false), serverName: (() => { try { return new URL(auth.baseUrl(req)).host; } catch { return 'Frames'; } })(),
      signedIn: !!sessionUser(db, req),
    };
  });

  // Sends a code. The answer is the same whether or not the address may sign in, so this cannot be used to find out who has an account.
  app.post('/api/public/auth/email/send', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    if (!emailOn()) return rep.code(404).send({ error: 'Signing in with an emailed code is not available here.' });
    const email = okEmail(b.email);
    if (!email) return rep.code(400).send({ error: 'Enter a valid email address.' });
    if (sendLimited(`ip:${req.ip}`, 20, 600_000) || sendLimited(`e:${email}`, 5, 600_000)) return rep.code(429).send({ error: 'Too many codes asked for. Wait a few minutes and try again.' });
    if (turnstileOn(db, 'signin') && !isHuman(db, req)) {
      const v = await verifyToken(db, b.turnstile, req.ip, cfg.turnstileUrl);
      if (v === 'bad') return rep.code(400).send({ error: 'Please complete the check to show you are a person.' });
      if (v === 'ok') rep.header('Set-Cookie', humanCookie(db, auth.isSecure(req)));
    }
    const conf = loadAuth(db);
    const who: Who = { provider: 'email', sub: email, email, emailVerified: true, name: String(b.name ?? '').trim().slice(0, 80) || email };
    const existing = findByEmail(db, email);
    const invited = !!db.prepare("SELECT 1 FROM users WHERE provider = 'invite' AND sub = ?").get(email);
    const listed = !!conf.open || isAllowed(who, conf.allow) || invited;
    const eligible = existing ? !existing.disabled && (listed || existing.role === 'guest' || existing.provider !== 'invite') : (listed && signupsOn(db, cfg.allowSignups !== false)) || guestFlow(b);
    if (eligible) {
      const code = issueCode(db, email);
      const sent = await sendMail(db, { to: email, template: 'code', type: 'code', params: { ...footer(db, ownerName(), auth.baseUrl(req)), name: existing?.name?.split(' ')[0] || who.name.split('@')[0], code, device: String(req.headers['user-agent'] ?? '').slice(0, 80) || 'a browser', location: '', time: new Date().toUTCString() } });
      if (!sent.ok) return rep.code(502).send({ error: 'The email could not be sent. Ask the owner to check Settings, Email.' });
    }
    return { ok: true };
  });

  app.post('/api/public/auth/email/verify', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    if (!emailOn()) return rep.code(404).send({ error: 'Signing in with an emailed code is not available here.' });
    const email = okEmail(b.email);
    if (!email || sendLimited(`v:${req.ip}`, 30, 600_000)) return rep.code(email ? 429 : 400).send({ error: email ? 'Too many tries. Wait a few minutes.' : 'Enter a valid email address.' });
    const r = checkCode(db, email, b.code);
    if (r !== 'ok') {
      const msg = r === 'wrong' ? 'That code is not right. Check it and try again.' : r === 'voided' ? 'Too many wrong tries. That code no longer works: send a new one.' : 'That code has expired. Send a new one.';
      return rep.code(400).send({ error: msg, reason: r });
    }
    const conf = loadAuth(db);
    const who: Who = { provider: 'email', sub: email, email, emailVerified: true, name: String(b.name ?? '').trim().slice(0, 80) || email };
    const existing = findByEmail(db, email);
    const invited = !!db.prepare("SELECT 1 FROM users WHERE provider = 'invite' AND sub = ?").get(email);
    const listed = !!conf.open || isAllowed(who, conf.allow) || invited;
    const user = existing ?? (listed || guestFlow(b) ? resolveUser(db, who, signupsOn(db, cfg.allowSignups !== false), !listed) : null);
    if (!user || user.disabled) return rep.code(403).send({ error: 'This address is not allowed to use this Frames. Ask the owner to add it.' });
    rep.header('Set-Cookie', withDevice(req, user, sessionCookie(createSession(db, user.id), auth.isSecure(req))));
    return { ok: true, returnTo: safeReturn(b.returnTo) };
  });

  // ---------- the emergency login: made at start-up, see emergency.ts ----------
  app.get('/auth/emergency', async (_req, rep) => {
    if (!emergencyActive()) return rep.code(404).type('text/html').send(auth.messagePage('No emergency login', 'There is none right now. One is made, and written to the server log, each time the server starts, and lasts five minutes.'));
    return rep.type('text/html').header('Cache-Control', 'no-store').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Emergency sign-in · Frames</title><style>body{margin:0;background:#0d0d0d;color:#d8d5cf;font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}main{width:360px;max-width:90vw}h1{font:400 36px/1.1 Georgia,serif;color:#efede8;margin:0 0 8px}input,button{width:100%;box-sizing:border-box;height:46px;border-radius:999px;border:0;padding:0 18px;font:inherit;margin-bottom:10px}input{background:#161615;color:#efede8;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}button{background:#efede8;color:#0d0d0d;font-weight:500;cursor:pointer}p{color:#8f8c86;font-size:14px}#e{color:#f0877f}</style></head><body><main><h1>Emergency sign-in</h1><p>The username and password are in the server log. They work once, for five minutes.</p><form id="f"><input name="u" placeholder="Username" autocomplete="off" autofocus required><input name="p" type="password" placeholder="Password" autocomplete="off" required><p id="e" role="alert"></p><button>Sign in</button></form></main><script>f.onsubmit=async function(ev){ev.preventDefault();var r=await fetch('/api/public/auth/emergency',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:f.u.value,password:f.p.value})});var j=await r.json().catch(function(){return{}});if(r.ok)location.assign('/');else e.textContent=j.error||'That did not work.'}</script></body></html>`);
  });
  app.post('/api/public/auth/emergency', async (req, rep) => {
    if (sendLimited(`em:${req.ip}`, 10, 600_000)) return rep.code(429).send({ error: 'Too many tries. Wait a few minutes.' });
    const b = (req.body ?? {}) as Row;
    const r = useEmergency(x, b.username, b.password);
    if (r === 'none') return rep.code(404).send({ error: 'There is no emergency login right now.' });
    if (r === 'wrong') return rep.code(401).send({ error: 'That username or password is not right.' });
    rep.header('Set-Cookie', withDevice(req, getUser(db, r.userId)!, sessionCookie(createSession(db, r.userId), auth.isSecure(req))));
    return { ok: true };
  });

  // ---------- passkeys ----------
  const where = (req: any) => { const u = new URL(auth.baseUrl(req)); return { rpID: u.hostname, origin: u.origin }; };
  const sessionUserOf = (req: any) => ((req as any).authVia === 'session' ? ((req as any).authUser as User | null) : null);
  app.post('/api/public/auth/passkey/options', async (req, rep) => {
    if (sendLimited(`pk:${req.ip}`, 60, 600_000)) return rep.code(429).send({ error: 'Too many tries. Wait a few minutes.' });
    return authenticationOptions(where(req));
  });
  app.post('/api/public/auth/passkey/verify', async (req, rep) => {
    const b = (req.body ?? {}) as Row;
    if (sendLimited(`pkv:${req.ip}`, 30, 600_000)) return rep.code(429).send({ error: 'Too many tries. Wait a few minutes.' });
    const uid = await verifyAuthentication(db, where(req), b.cid, b.response);
    const user = uid ? getUser(db, uid) : null;
    if (!user || user.disabled) return rep.code(400).send({ error: 'That passkey did not work. Try another way to sign in.' });
    rep.header('Set-Cookie', withDevice(req, user, sessionCookie(createSession(db, user.id), auth.isSecure(req))));
    return { ok: true, returnTo: safeReturn(b.returnTo) };
  });
  app.get('/api/me/passkeys', async (req, rep) => { const u = sessionUserOf(req); return u ? { passkeys: listPasskeys(db, u.id) } : rep.code(401).send({ error: 'Sign in first.' }); });
  app.post('/api/me/passkeys/options', async (req, rep) => { const u = sessionUserOf(req); if (!u) return rep.code(401).send({ error: 'Sign in first.' }); return registrationOptions(db, where(req), u); });
  app.post('/api/me/passkeys/verify', async (req, rep) => {
    const u = sessionUserOf(req); if (!u) return rep.code(401).send({ error: 'Sign in first.' });
    const b = (req.body ?? {}) as Row;
    const r = await verifyRegistration(db, where(req), u.id, b.cid, b.response, String(b.name ?? ''));
    return r.ok ? { ok: true, passkeys: listPasskeys(db, u.id) } : rep.code(400).send({ error: r.error });
  });
  app.patch('/api/me/passkeys/:id', async (req, rep) => {
    const u = sessionUserOf(req); if (!u) return rep.code(401).send({ error: 'Sign in first.' });
    if (!renamePasskey(db, u.id, String((req.params as Row).id), String(((req.body ?? {}) as Row).name ?? ''))) return rep.code(400).send({ error: 'Give the passkey a name.' });
    return { ok: true, passkeys: listPasskeys(db, u.id) };
  });
  app.delete('/api/me/passkeys/:id', async (req, rep) => { const u = sessionUserOf(req); if (!u) return rep.code(401).send({ error: 'Sign in first.' }); return { removed: removePasskey(db, u.id, String((req.params as Row).id)) }; });

  // Every way this person can sign in, the ones the administrator turned on: for Settings, Profile.
  app.get('/api/me/sign-in-methods', async (req, rep) => {
    const u = sessionUserOf(req); if (!u) return rep.code(401).send({ error: 'Sign in first.' });
    const conf = loadAuth(db);
    const linked = new Set(identitiesOf(db, u.id).map((i) => i.provider));
    const methods: { id: string; label: string; kind: string; state: 'on' | 'auto' | 'linked' | 'unlinked'; count?: number; canUnlink?: boolean }[] = [];
    if (conf.email && smtpHealthy(db)) methods.push({ id: 'email', label: 'Email code', kind: 'email', state: 'on' });
    methods.push({ id: 'passkey', label: 'Passkeys', kind: 'passkey', state: 'on', count: listPasskeys(db, u.id).length });
    for (const p of conf.providers.filter((q) => !q.off)) {
      if (p.type === 'cloudflare') methods.push({ id: p.id, label: 'Cloudflare Access', kind: 'access', state: 'auto' });
      else methods.push({ id: p.id, label: p.name || p.type, kind: 'provider', state: linked.has(p.id) ? 'linked' : 'unlinked', canUnlink: linked.has(p.id) && identitiesOf(db, u.id).length > 1 });
    }
    return { methods };
  });

  // Add another way to sign in to the person who is signed in now: they pass through the provider once, and that account is then theirs too.
  app.get('/auth/link/:id', async (req, rep) => {
    const u = (req as any).authUser as User | null;
    const p = loadAuth(db).providers.find((x) => x.id === (req.params as Row).id);
    if (!u || (req as any).authVia !== 'session' || !p) return rep.code(404).type('text/html').send(auth.messagePage('Not available', 'Sign in first, then add another way to sign in from Settings.'));
    try { return rep.redirect(await auth.begin(p, req, { test: false, returnTo: '/', linkUser: u.id })); } catch (e) {
      console.error('link start failed', (e as Error).message);
      return rep.code(502).type('text/html').send(auth.messagePage('Could not reach the provider', 'Frames could not contact the sign-in provider.'));
    }
  });
  app.get('/api/me/identities', async (req) => {
    const u = (req as any).authUser as User | null;
    return { identities: u ? identitiesOf(db, u.id) : [], providers: loadAuth(db).providers.filter((p) => p.type !== 'cloudflare').map((p) => ({ id: p.id, type: p.type })) };
  });
  app.delete('/api/me/identities/:id', async (req, rep) => {
    const u = (req as any).authUser as User | null;
    if (!u || !unlinkIdentity(db, u.id, Number((req.params as Row).id))) return rep.code(404).send({ error: 'Not found' });
    return { ok: true };
  });

  app.post('/auth/logout', async (req, rep) => {
    const who = sessionUser(db, req);
    endSession(db, req);
    if (who?.provider === EMERGENCY_PROVIDER) removeEmergency(x, who.id); // signing out of the emergency login deletes it
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
  // A guest's "Shared with you": the share links they opened while signed in (see the onRequest hook in app.ts).
  // Settings, Server, Sign-in & access: switch a set-up method on or off without losing its client ID and secret. Never the last way in while sign-in is required.
  app.put('/api/auth/methods/:id', async (req, rep) => {
    const on = ((req.body ?? {}) as Row).on;
    if (typeof on !== 'boolean') return rep.code(400).send({ error: 'on must be true or false' });
    const conf = loadAuth(db);
    const p = conf.providers.find((v) => v.id === (req.params as Row).id);
    if (!p) return rep.code(404).send({ error: 'That method is not set up yet. Use Configure first.' });
    const next = conf.providers.map((v) => (v.id === p.id ? { ...v, off: on ? undefined : true } : v));
    if (!on && conf.enabled && !next.some((v) => !v.off) && !conf.email) return rep.code(400).send({ error: 'That is the only way in while sign-in is required. Turn on another method first, or turn sign-in off.' });
    if (!on && conf.enabled && conf.testedBy?.provider === p.id && !next.some((v) => !v.off && v.id !== p.id)) return rep.code(400).send({ error: 'The account that tested sign-in used this method. Test another method first.' });
    saveAuth(db, { ...conf, providers: next as typeof conf.providers });
    return { ok: true };
  });
  app.get('/api/guest/links', async (req) => ({
    // The first part of a link names whose it is, so a guest can see who shared what.
    links: (db.prepare('SELECT token, label, kind, seen FROM guest_links WHERE user_id = ? ORDER BY seen DESC LIMIT 200').all(((req as any).authUser as User).id) as { token: string; label: string; kind: string; seen: string }[])
      .map((l) => ({ ...l, from: (getUser(x.sys, parseInt(l.token.split('_')[0], 36))?.name ?? '').split(' ')[0] })),
  }));
  app.get('/api/me', async (req) => {
    const u = (req as any).authUser as User | null;
    const signedIn = (req as any).authVia === 'session';
    return {
      mode: !auth.protectedNow() ? 'none' : auth.oauthOn() ? 'oauth' : 'password',
      user: u && signedIn ? { name: u.name, email: u.email, provider: u.provider, folder: u.folder } : null,
      displayName: displayNameOf(x.db), hasAvatar: fs.existsSync(avatarPath(x.cfg.dataDir)),
      id: u?.id ?? 1, owner: (u?.id ?? 1) === 1, role: u?.role ?? 'member', canSignOut: signedIn, envConfig: ((l) => l.system || l.owner)(envConfigLoaded()), signups: signupsOn(db, cfg.allowSignups !== false), signupsLocked: cfg.allowSignups === false, cloudOnly: !!getSetting<{ cloudOnly?: boolean }>(db, 'instance', {}).cloudOnly,
      storeOriginalQuality: storesOriginalQuality(db), // off: photographs a person uploads are kept as smaller copies (see shrinkUpload)
    };
  });

  const dto = (req: any, c: AuthConfig) => ({
    enabled: c.enabled, allow: c.allow, open: !!c.open, email: !!c.email, emailHealthy: smtpHealthy(db), publicUrl: c.publicUrl,
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
    let changedProviders = false, onlyAdded = false;

    if (Array.isArray(b.providers)) {
      const seen = new Set<string>();
      const list: Provider[] = [];
      for (const raw of b.providers.slice(0, 10)) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('Each provider must be an object.');
        const p: Provider = {
          ...(raw.useCloudApp === true ? { useCloudApp: true } : {}), ...(raw.off === true ? { off: true } : {}), id: String(raw.id ?? '').trim().toLowerCase(), type: raw.type, name: String(raw.name ?? '').trim().slice(0, 40), clientId: String(raw.clientId ?? '').trim().slice(0, 300),
          ...(raw.issuer ? { issuer: String(raw.issuer).trim().slice(0, 300) } : {}), ...(raw.tenant ? { tenant: String(raw.tenant).trim().slice(0, 100) } : {}),
          ...(raw.authUrl ? { authUrl: String(raw.authUrl).trim().slice(0, 300) } : {}), ...(raw.tokenUrl ? { tokenUrl: String(raw.tokenUrl).trim().slice(0, 300) } : {}),
          ...(raw.teamDomain ? { teamDomain: String(raw.teamDomain).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').slice(0, 253) } : {}), ...(raw.aud ? { aud: String(raw.aud).trim().toLowerCase().slice(0, 64) } : {}),
          ...(raw.userUrl ? { userUrl: String(raw.userUrl).trim().slice(0, 300) } : {}), ...(raw.emailsUrl ? { emailsUrl: String(raw.emailsUrl).trim().slice(0, 300) } : {}),
        };
        const err = validateProvider(p);
        if (err) return bad(err);
        if (p.useCloudApp && !clientOf(cfg, db, p.type === 'microsoft' ? 'onedrive' : (p.type as 'google' | 'dropbox')).clientId) return bad(`Set up ${p.type === 'microsoft' ? 'OneDrive' : p.type === 'google' ? 'Google Drive' : 'Dropbox'} under Settings, Cloud storage providers first: its client ID and secret are what this uses.`);
        if (seen.has(p.id)) return bad(`Two providers use the id “${p.id}”`);
        seen.add(p.id);
        p.name ||= ({ google: 'Google', github: 'GitHub', microsoft: 'Microsoft', dropbox: 'Dropbox', oidc: 'OpenID Connect', oauth2: 'OAuth', cloudflare: 'Cloudflare Access' } as Record<string, string>)[p.type];
        if (typeof raw.clientSecret === 'string' && raw.clientSecret) secrets[p.id] = raw.clientSecret.slice(0, 500);
        list.push(p);
      }
      const strip = (ps: Provider[]) => JSON.stringify(ps.map((p) => Object.fromEntries(Object.entries(p).sort())));
      changedProviders = strip(list) !== strip(cur.providers) || Object.keys(secrets).length > 0;
      // Adding a way to sign in cannot lock anyone out: every provider that was there is still there, unchanged, and none has a new secret.
      const same = (a: Provider, b: Provider) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
      onlyAdded = cur.providers.every((p) => list.some((n) => same(n, p)) && !(p.id in secrets && secrets[p.id] !== getSecret(db, `oauth:${p.id}`))); // sending the same secret again is not a change
      next.providers = list;
    }
    if (b.allow !== undefined) next.allow = cleanAllow(b.allow);
    if (b.publicUrl !== undefined) {
      const v = trimEnd(String(b.publicUrl).trim().slice(0, 400), '/');
      if (v) { try { const u = new URL(v); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(); } catch { return bad('The public address must start with http:// or https://'); } }
      next.publicUrl = v.slice(0, 300);
    }
    if (typeof b.enabled === 'boolean') next.enabled = b.enabled;
    if (typeof b.open === 'boolean') next.open = b.open;
    if (typeof b.email === 'boolean') {
      if (b.email && !smtpHealthy(db)) return bad('Set up Email first (Settings, Email) and pass its check.');
      next.email = b.email;
    }

    // --- the lock-out protections ---
    if (changedProviders && !(cur.enabled && onlyAdded)) { // adding one while sign-in is on is allowed: nothing that already works is touched
      if (cur.enabled && next.enabled) return bad('Turn sign-in off before changing a provider, then test it and turn sign-in back on.');
      next.testedBy = null; // a changed provider has to be tested again
    }
    const au = (req as any).authUser as User | null;
    const me = au && (req as any).authVia === 'session' ? { provider: au.provider, sub: au.sub, email: au.email, emailVerified: true } : null;
    if (next.enabled) {
      if (!next.providers.length && !next.email) return bad('Add a provider first, or turn on email codes.');
      if (!next.open && !next.allow.length) return bad('Add at least one email, domain or account to the list of people allowed in, or choose “Anyone who signs in”.');
      if (!next.testedBy) return bad('Use “Test sign-in” with a provider first, so you know you can get back in.');
      if (!next.providers.some((p) => p.id === next.testedBy!.provider) && !(next.email && next.testedBy.provider === 'email')) return bad('The account that tested sign-in uses a provider that is no longer set up. Test again.');
      if (cur.enabled && me && !next.open && !isAllowed(me, next.allow)) return bad('That list would lock you out: your own account is not on it.');
      if (!next.open && !isAllowed(next.testedBy, next.allow)) return bad('The account you tested with is not on the allowed list, so you would be locked out. Add it, or test with an allowed account.');
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
