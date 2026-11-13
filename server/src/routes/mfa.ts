import type { FastifyInstance } from 'fastify';
import type { Auth } from '../auth.js';
import { sessionIdOf } from '../auth.js';
import type { Ctx, Row } from '../ctx.js';
import { getUser, type User } from '../users.js';
import { authenticationOptions, verifyAuthentication } from '../passkeys.js';
import { beginTotp, confirmTotp, factorVerified, hasFactor, hasTotp, markFactor, mfaPolicy, mfaRequired, mfaStatus, policyApplies, removeTotp, setMfaPolicy, verifyTotp } from '../mfa.js';

export function registerMfa(app: FastifyInstance, x: Ctx, auth: Auth) {
  const db = x.sys;
  const userOf = (req: any): User | null => req.authVia === 'session' && req.authUser?.role !== 'guest' ? req.authUser : null;
  const where = (req: any) => { const url = new URL(auth.baseUrl(req)); return { rpID: url.hostname, origin: url.origin }; };
  const attempts = new Map<string, { n: number; until: number }>();
  const limited = (req: any, user: User) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    let blocked = false;
    for (const key of [`user:${user.id}`, `ip:${req.ip}`]) {
      if (!attempts.has(key) && attempts.size >= 10_000) return true;
      const value = attempts.get(key) ?? { n: 0, until: now + 300_000 }; value.n++; attempts.set(key, value); if (value.n > 10) blocked = true;
    }
    return blocked;
  };
  const setupAllowed = (req: any, user: User) => user.provider !== 'emergency' && (!mfaRequired(db, user) || !hasFactor(db, user.id) || factorVerified(db, sessionIdOf(req)));
  app.get('/api/me/mfa', async (req, rep) => {
    const user = userOf(req); if (!user) return rep.code(401).send({ error: 'Sign in with a personal account first.' });
    return rep.header('Cache-Control', 'no-store').send(mfaStatus(db, user, sessionIdOf(req)));
  });
  app.post('/api/me/mfa/totp/setup', async (req, rep) => {
    const user = userOf(req); if (!user) return rep.code(401).send({ error: 'Sign in first.' });
    if (limited(req, user)) return rep.code(429).send({ error: 'Too many attempts. Wait five minutes.' });
    if (!setupAllowed(req, user) || hasTotp(db, user.id)) return rep.code(403).send({ error: 'Verify your existing factor before changing security settings.' });
    return rep.header('Cache-Control', 'no-store').send(beginTotp(db, user, sessionIdOf(req)!));
  });
  app.post('/api/me/mfa/totp/confirm', async (req, rep) => {
    const user = userOf(req); if (!user) return rep.code(401).send({ error: 'Sign in first.' });
    if (limited(req, user)) return rep.code(429).send({ error: 'Too many attempts. Wait five minutes.' });
    if (!setupAllowed(req, user)) return rep.code(403).send({ error: 'Verify your existing factor first.' });
    const codes = confirmTotp(db, user.id, sessionIdOf(req)!, ((req.body ?? {}) as Row).code);
    if (!codes) return rep.code(400).send({ error: 'That code is not valid, or setup expired. Try again.' });
    return rep.header('Cache-Control', 'no-store').send({ ok: true, recoveryCodes: codes });
  });
  app.post('/api/me/mfa/totp/verify', async (req, rep) => {
    const user = userOf(req); if (!user) return rep.code(401).send({ error: 'Sign in first.' });
    if (limited(req, user)) return rep.code(429).send({ error: 'Too many attempts. Wait five minutes.' });
    if (!verifyTotp(db, user.id, ((req.body ?? {}) as Row).code)) return rep.code(400).send({ error: 'That code is invalid or was already used. Try a new code.' });
    markFactor(db, sessionIdOf(req)!); return { ok: true };
  });
  app.delete('/api/me/mfa/totp', async (req, rep) => {
    const user = userOf(req); if (!user) return rep.code(401).send({ error: 'Sign in first.' });
    const status = mfaStatus(db, user, sessionIdOf(req));
    if (policyApplies(db, user) && !status.verifiedPasskeys) return rep.code(403).send({ error: 'Your server requires two-factor authentication. Add a passkey before removing your authenticator.' });
    if (limited(req, user)) return rep.code(429).send({ error: 'Too many attempts. Wait five minutes.' });
    if (!verifyTotp(db, user.id, ((req.body ?? {}) as Row).code)) return rep.code(400).send({ error: 'Enter a new authenticator or recovery code.' });
    removeTotp(db, user.id); return { ok: true };
  });
  app.post('/api/me/mfa/passkey/options', async (req, rep) => {
    const user = userOf(req); if (!user) return rep.code(401).send({ error: 'Sign in first.' });
    return authenticationOptions(where(req), user.id, db);
  });
  app.post('/api/me/mfa/passkey/verify', async (req, rep) => {
    const user = userOf(req); if (!user) return rep.code(401).send({ error: 'Sign in first.' });
    if (limited(req, user)) return rep.code(429).send({ error: 'Too many attempts. Wait five minutes.' });
    const body = (req.body ?? {}) as Row;
    if ((await verifyAuthentication(db, where(req), body.cid, body.response, user.id))?.userId !== user.id) return rep.code(400).send({ error: 'That passkey did not verify this account.' });
    markFactor(db, sessionIdOf(req)!); return { ok: true };
  });
  app.post('/api/admin/users/:id/reset-mfa', async (req, rep) => {
    const user = userOf(req);
    if (!x.cfg.authDisabled && (!user || (user.provider !== 'emergency' && !factorVerified(db, sessionIdOf(req))))) return rep.code(403).send({ error: 'Verify your own security factor before resetting another account.' });
    if (((req.body ?? {}) as Row).confirm !== 'RESET') return rep.code(400).send({ error: 'Confirm the reset with RESET.' });
    const id = Number((req.params as Row).id);
    if (!Number.isSafeInteger(id) || id < 1 || !getUser(db, id)) return rep.code(404).send({ error: 'Account not found.' });
    db.transaction(() => {
      removeTotp(db, id);
      db.prepare('DELETE FROM passkeys WHERE user_id = ?').run(id);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
    })();
    return { ok: true };
  });
  app.get('/api/auth/mfa', async () => ({ policy: mfaPolicy(db) }));
  app.put('/api/auth/mfa', async (req, rep) => {
    const policy = ((req.body ?? {}) as Row).policy;
    if (!['off', 'admins', 'members'].includes(policy)) return rep.code(400).send({ error: 'Choose off, admins or members.' });
    if (policy !== 'off') {
      const user = userOf(req);
      if (x.cfg.authDisabled || !auth.oauthOn() || !user || !hasFactor(db, user.id) || !factorVerified(db, sessionIdOf(req))) return rep.code(400).send({ error: 'Sign in with a personal account and verify a passkey or authenticator before enforcing two-factor authentication. Personal sign-in must be enabled.' });
    }
    setMfaPolicy(db, policy); return { policy };
  });
}
