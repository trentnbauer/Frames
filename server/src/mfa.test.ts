import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import path from 'node:path';
import { scrubCopy } from './backup.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession } from './auth.js';
import { startEmergency, removeEmergency } from './emergency.js';
import { snapshot } from './envConfig.js';
import { setSecret, getSecret } from './ai.js';
import { setSetting, type DB } from './db.js';
import { base32, markFactor, mfaStatus, setMfaPolicy, totpCode } from './mfa.js';
import { resolveUser, type User } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, sys: DB, admin: User, member: User, guest: User, ownerToken: string;
const headers = (token: string) => ({ cookie: `frames_session=${token}` });
const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token = ownerToken, payload?: object) => env.app.inject({ method, url, headers: headers(token), payload });
const newSession = (user = admin) => createSession(sys, user.id);
const sid = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
beforeEach(() => {
  env = makeEnv({ authPassword: 'test-' + crypto.randomBytes(16).toString('hex') }); sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [], email: true, allow: ['@mfa.test'], publicUrl: '', testedBy: null });
  const person = (email: string, guest = false) => resolveUser(sys, { provider: 'email', sub: email, email, emailVerified: true, name: email }, true, guest)!;
  admin = person('owner@mfa.test'); member = person('member@mfa.test'); guest = person('guest@mfa.test', true);
  ownerToken = newSession();
});
afterEach(async () => { await env.app.close(); cleanup(env); });
async function enroll(token = ownerToken) {
  const setup = await call('POST', '/api/me/mfa/totp/setup', token, {}); expect(setup.statusCode).toBe(200);
  const secret = setup.json().secret;
  const code = totpCode(secret);
  const confirmed = await call('POST', '/api/me/mfa/totp/confirm', token, { code }); expect(confirmed.statusCode).toBe(200);
  return { secret, code, codes: confirmed.json().recoveryCodes as string[] };
}

describe('two-factor enforcement', () => {
  it('implements the RFC 6238 SHA-1 test vector', () => {
    const secret = base32(Buffer.from(Array.from({ length: 20 }, (_, i) => String((i + 1) % 10)).join('')));
    expect(totpCode(secret, 1)).toBe('287082');
  });
  it('requires existing admin sessions to enrol, lets members through, and exempts guests and public routes', async () => {
    setMfaPolicy(sys, 'admins');
    expect((await call('GET', '/api/photos')).statusCode).toBe(403);
    expect((await call('POST', '/api/collections', ownerToken, { name: 'Bypass' })).statusCode).toBe(403);
    expect((await call('GET', '/api/auth/config')).statusCode).toBe(403);
    expect((await call('GET', '/api/me')).json().mfa).toMatchObject({ required: true, verified: false, totp: false, passkeys: 0 });
    expect((await call('GET', '/api/photos', newSession(member))).statusCode).toBe(200);
    expect((await call('GET', '/api/guest/links', newSession(guest))).statusCode).toBe(200);
    expect((await call('GET', '/api/me', newSession(guest))).json().mfa.required).toBe(false);
    expect((await env.app.inject('/api/health')).statusCode).toBe(200);
    expect((await env.app.inject('/api/public/auth')).json().password).toBe(false);
    await enroll();
    expect((await call('GET', '/api/photos')).statusCode).toBe(200);
    expect((await call('GET', '/api/photos', newSession())).statusCode).toBe(403);
  });
  it('enforces all members, including a later role promotion, but not guests', async () => {
    setMfaPolicy(sys, 'members');
    const token = newSession(member);
    expect((await call('GET', '/api/photos', token)).statusCode).toBe(403);
    const guestToken = newSession(guest);
    expect((await call('GET', '/api/me', guestToken)).json().mfa.required).toBe(false);
    sys.prepare("UPDATE users SET role = 'member' WHERE id = ?").run(guest.id);
    expect((await call('GET', '/api/photos', guestToken)).statusCode).toBe(403);
  });
  it('lets only an enrolled, verified administrator enable a valid policy', async () => {
    expect((await call('PUT', '/api/auth/mfa', ownerToken, { policy: 'members' })).statusCode).toBe(400);
    expect((await call('PUT', '/api/auth/mfa', newSession(member), { policy: 'admins' })).statusCode).toBe(403);
    await enroll();
    expect((await call('PUT', '/api/auth/mfa', ownerToken, { policy: 'invalid' })).statusCode).toBe(400);
    expect((await call('PUT', '/api/auth/mfa', ownerToken, { policy: 'members' })).statusCode).toBe(200);
    expect((await call('GET', '/api/auth/mfa')).json()).toEqual({ policy: 'members' });
  });
  it('never accepts the shared password instead of a personal verified session', async () => {
    setMfaPolicy(sys, 'admins');
    const authorization = 'Basic ' + Buffer.from(`x:${env.cfg.authPassword}`).toString('base64');
    expect((await env.app.inject({ url: '/api/photos', headers: { authorization } })).statusCode).not.toBe(200);
  });
  it('keeps authenticator secrets encrypted and out of status responses; supports single-use recovery and replay prevention', async () => {
    const { secret, code, codes } = await enroll(); expect(codes).toHaveLength(8);
    const raw = (sys.prepare("SELECT value FROM settings WHERE key = ?").get(`secret:totp:${admin.id}`) as { value: string }).value;
    expect(JSON.stringify(snapshot(sys))).not.toContain(secret);
    expect(raw).not.toContain(secret); expect(getSecret(sys, `totp:${admin.id}`)).toBe(secret);
    const token = newSession();
    expect((await call('GET', '/api/me/mfa', token)).body).not.toContain(secret);
    expect((await call('POST', '/api/me/mfa/totp/verify', token, { code })).statusCode).toBe(400); // already used for enrolment
    expect((await call('POST', '/api/me/mfa/totp/verify', token, { code: codes[0] })).statusCode).toBe(200);
    expect((await call('GET', '/api/photos', token)).statusCode).toBe(200);
    expect((await call('POST', '/api/me/mfa/totp/verify', newSession(), { code: codes[0] })).statusCode).toBe(400);
    expect((await call('POST', '/api/me/mfa/totp/verify', newSession(member), { code: codes[1] })).statusCode).toBe(400);
    for (const code of codes) expect(JSON.stringify(sys.prepare('SELECT * FROM mfa_recovery').all())).not.toContain(code);
  });
  it('binds pending setup to its session and refuses unverified replacement/addition of factors', async () => {
    const setup = (await call('POST', '/api/me/mfa/totp/setup', ownerToken, {})).json();
    expect((await call('POST', '/api/me/mfa/totp/confirm', newSession(), { code: totpCode(setup.secret) })).statusCode).toBe(400);
    expect((await call('POST', '/api/me/mfa/totp/confirm', ownerToken, { code: totpCode(setup.secret) })).statusCode).toBe(200);
    const token = newSession();
    expect((await call('POST', '/api/me/mfa/totp/setup', token, {})).statusCode).toBe(403);
    expect((await call('POST', '/api/me/passkeys/options', token, {})).statusCode).toBe(403);
    expect((await call('POST', '/api/me/passkeys/verify', token, {})).statusCode).toBe(403);
  });
  it('cannot remove a last required factor or turn off sign-in while enforcement is active', async () => {
    const { codes } = await enroll(); setMfaPolicy(sys, 'admins');
    expect((await call('DELETE', '/api/me/mfa/totp', ownerToken, { code: codes[0] })).statusCode).toBe(403);
    expect((await call('PUT', '/api/auth/config', ownerToken, { enabled: false })).statusCode).toBe(400);
    sys.prepare("INSERT INTO passkeys(id,user_id,public_key,created) VALUES(?, ?, x'00', ?)").run('test-key', admin.id, new Date().toISOString());
    sys.prepare("INSERT INTO mfa_passkeys(passkey_id) VALUES('test-key')").run();
    expect((await call('DELETE', '/api/me/mfa/totp', ownerToken, { code: codes[0] })).statusCode).toBe(200);
    expect((await call('DELETE', '/api/me/passkeys/test-key')).statusCode).toBe(403);
    expect((await call('PUT', '/api/auth/mfa', ownerToken, { policy: 'off' })).statusCode).toBe(200);
    expect((await call('DELETE', '/api/me/passkeys/test-key')).statusCode).toBe(200);
  });
  it('limits guesses by account even when sessions change', async () => {
    await enroll(); let limited = false;
    for (let i = 0; i < 12; i++) { const r = await call('POST', '/api/me/mfa/totp/verify', newSession(), { code: 'bad' }); if (r.statusCode === 429) limited = true; }
    expect(limited).toBe(true);
  });
  it('requires device verification on passkey challenges and preserves verified sessions separately', async () => {
    const r = await call('POST', '/api/me/passkeys/options', ownerToken, {});
    expect(r.json().options.authenticatorSelection.userVerification).toBe('required');
    const challenge = await call('POST', '/api/me/mfa/passkey/options', ownerToken, {});
    expect(challenge.json().options.userVerification).toBe('required');
    expect((await call('POST', '/api/me/mfa/passkey/verify', newSession(member), { cid: challenge.json().cid, response: {} })).statusCode).toBe(400);
    markFactor(sys, sid(ownerToken)); expect(mfaStatus(sys, admin, sid(ownerToken)).verified).toBe(true);
    expect(mfaStatus(sys, admin, sid(newSession())).verified).toBe(false);
  });
});

it('does not authenticate with an empty or unavailable encrypted secret', async () => {
  await enroll(); setSecret(sys, `totp:${admin.id}`, '');
  const r = await call('POST', '/api/me/mfa/totp/verify', newSession(), { code: totpCode('') });
  expect(r.statusCode).toBe(400);
});

it('expires incomplete authenticator setup and never enables it until confirmed', async () => {
  const setup = (await call('POST', '/api/me/mfa/totp/setup', ownerToken, {})).json();
  expect((await call('GET', '/api/me/mfa')).json().totp).toBe(false);
  sys.prepare('UPDATE mfa_totp SET pending_until = 0 WHERE user_id = ?').run(admin.id);
  expect((await call('POST', '/api/me/mfa/totp/confirm', ownerToken, { code: totpCode(setup.secret) })).statusCode).toBe(400);
});

it('scrubs private factors, recovery codes and verification markers from portable system backups', async () => {
  await enroll(); const file = path.join(env.tmp, 'scrub.db'); await sys.backup(file); scrubCopy(file, true);
  const copy = new Database(file);
  try {
    for (const table of ['mfa_totp', 'mfa_recovery', 'mfa_sessions', 'sessions', 'settings']) expect((copy.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: number }).n).toBe(0);
  } finally { copy.close(); }
});

it('requires a verified administrator to reset factors and revokes all target sessions', async () => {
  const memberToken = newSession(member); await enroll(memberToken);
  expect((await call('POST', `/api/admin/users/${member.id}/reset-mfa`, ownerToken, { confirm: 'RESET' })).statusCode).toBe(403);
  await enroll();
  setMfaPolicy(sys, 'members');
  expect((await call('POST', `/api/admin/users/${member.id}/reset-mfa`, ownerToken, {})).statusCode).toBe(400);
  expect((await call('POST', `/api/admin/users/${admin.id}/reset-mfa`, memberToken, { confirm: 'RESET' })).statusCode).toBe(403);
  expect((await call('POST', `/api/admin/users/${member.id}/reset-mfa`, ownerToken, { confirm: 'RESET' })).statusCode).toBe(200);
  expect((await call('GET', '/api/photos', memberToken)).statusCode).toBe(401);
  expect(mfaStatus(sys, member, null).enrolled).toBe(false);
  expect(getSecret(sys, `totp:${member.id}`)).toBe('');
  expect((await call('GET', '/api/me', newSession(member))).json().mfa).toMatchObject({ required: true, enrolled: false });
});

it('keeps AUTH_DISABLE available as an operator recovery override', async () => {
  const { codes } = await enroll(); setMfaPolicy(sys, 'admins'); env.cfg.authDisabled = true;
  expect((await env.app.inject('/api/me')).json().mfa.required).toBe(false);
  expect((await env.app.inject('/api/photos')).statusCode).toBe(200);
  expect((await env.app.inject({ method: 'POST', url: `/api/admin/users/${admin.id}/reset-mfa`, payload: { confirm: 'RESET' } })).statusCode).toBe(200);
  expect(codes.length).toBe(8);
});

it('allows legacy passkeys to sign in without declaring them a verified second factor', async () => {
  sys.prepare("INSERT INTO passkeys(id,user_id,public_key,created) VALUES(?, ?, x'00', ?)").run('legacy-key', admin.id, new Date().toISOString());
  setMfaPolicy(sys, 'admins');
  expect((await call('GET', '/api/me/mfa')).json()).toMatchObject({ enrolled: false, verifiedPasskeys: 0, passkeys: 1 });
  expect((await call('POST', '/api/me/mfa/totp/setup', ownerToken, {})).statusCode).toBe(200);
  const pub = await env.app.inject({ method: 'POST', url: '/api/public/auth/passkey/options', payload: {} });
  expect(pub.json().options.userVerification).toBe('preferred');
});

it('exempts the actual temporary emergency administrator from enrollment and verification under every policy', async () => {
  await enroll(); const x = (env.app as any).frames; const lines: string[] = [];
  startEmergency(x, (line) => lines.push(line));
  try {
    expect((await env.app.inject('/auth/emergency')).statusCode).toBe(200);
    const match = /username (\S+) password (\S+)/.exec(lines[0])!;
    const login = await env.app.inject({ method: 'POST', url: '/api/public/auth/emergency', payload: { username: match[1], password: match[2] } });
    expect(login.statusCode).toBe(200); const cookie = String(login.headers['set-cookie']).split(';')[0];
    for (const policy of ['admins', 'members'] as const) {
      setMfaPolicy(sys, policy);
      const me = (await env.app.inject({ url: '/api/me', headers: { cookie } })).json();
      expect(me.user.provider).toBe('emergency'); expect(me.role).toBe('admin');
      expect(me.mfa).toMatchObject({ required: false, verified: false, enrolled: false });
      expect((await env.app.inject({ url: '/api/admin/users', headers: { cookie } })).statusCode).toBe(200);
    }
    expect((await env.app.inject({ method: 'POST', url: `/api/admin/users/${admin.id}/reset-mfa`, headers: { cookie }, payload: { confirm: 'RESET' } })).statusCode).toBe(200);
  } finally { removeEmergency(x); }
});

it('refuses cross-site factor enrollment and malformed session cookies safely', async () => {
  expect((await env.app.inject({ method: 'POST', url: '/api/me/mfa/totp/setup', headers: { ...headers(ownerToken), origin: 'https://other.test', 'sec-fetch-site': 'cross-site' }, payload: {} })).statusCode).toBe(403);
  expect((await env.app.inject({ url: '/api/me/mfa', headers: { cookie: 'frames_session=%E0%A4%A' } })).statusCode).toBe(401);
});

it('verifies real WebAuthn signatures and never counts user presence alone as two factors', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const key = Buffer.concat([Buffer.from([0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 0x20]), Buffer.from(jwk.x!, 'base64url'), Buffer.from([0x22, 0x58, 0x20]), Buffer.from(jwk.y!, 'base64url')]);
  const credentialId = crypto.randomBytes(24).toString('base64url');
  sys.prepare('INSERT INTO passkeys(id,user_id,public_key,created) VALUES(?,?,?,?)').run(credentialId, admin.id, key, new Date().toISOString());
  const host = { host: 'localhost' };
  let counter = 0;
  const signed = async (verified: boolean, partialSession?: string) => {
    const route = partialSession ? '/api/me/mfa/passkey' : '/api/public/auth/passkey';
    const requestHeaders = { ...host, ...(partialSession ? headers(partialSession) : {}) };
    const options = (await env.app.inject({ method: 'POST', url: route + '/options', headers: requestHeaders, payload: {} })).json();
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.options.challenge, origin: 'http://localhost', crossOrigin: false }));
    const authenticator = Buffer.alloc(37); crypto.createHash('sha256').update('localhost').digest().copy(authenticator); authenticator[32] = verified ? 5 : 1; authenticator.writeUInt32BE(++counter, 33);
    const signature = crypto.sign('sha256', Buffer.concat([authenticator, crypto.createHash('sha256').update(clientData).digest()]), privateKey);
    return env.app.inject({ method: 'POST', url: route + '/verify', headers: requestHeaders, payload: { cid: options.cid, response: { id: credentialId, rawId: credentialId, type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: clientData.toString('base64url'), authenticatorData: authenticator.toString('base64url'), signature: signature.toString('base64url') } } } });
  };
  const first = await signed(false); expect(first.statusCode).toBe(200);
  const firstCookie = String(first.headers['set-cookie']).split(';')[0];
  expect((await env.app.inject({ url: '/api/photos', headers: { cookie: firstCookie } })).statusCode).toBe(200); // policy off: legacy login still works
  setMfaPolicy(sys, 'admins');
  expect((await env.app.inject({ url: '/api/photos', headers: { cookie: firstCookie } })).statusCode).toBe(403);
  const second = await signed(false); expect(second.statusCode).toBe(200);
  const secondCookie = String(second.headers['set-cookie']).split(';')[0];
  expect((await env.app.inject({ url: '/api/me', headers: { cookie: secondCookie } })).json().mfa.verified).toBe(false);
  const partialToken = secondCookie.slice('frames_session='.length);
  expect((await signed(false, partialToken)).statusCode).toBe(400); // the extra-factor endpoint requires UV
  const full = await signed(true); expect(full.statusCode).toBe(200);
  const fullCookie = String(full.headers['set-cookie']).split(';')[0];
  expect((await env.app.inject({ url: '/api/photos', headers: { cookie: fullCookie } })).statusCode).toBe(200);
  expect((await env.app.inject({ url: '/api/me', headers: { cookie: fullCookie } })).json().mfa).toMatchObject({ verified: true, verifiedPasskeys: 1 });
});

it('lets the temporary emergency session recover a shared-password-only instance without 2FA', async () => {
  setSetting(sys, 'auth', { enabled: false, providers: [], allow: [], publicUrl: '', testedBy: null });
  const x = (env.app as any).frames, lines: string[] = []; startEmergency(x, (line) => lines.push(line));
  try {
    const match = /username (\S+) password (\S+)/.exec(lines[0])!;
    const result = await env.app.inject({ method: 'POST', url: '/api/public/auth/emergency', payload: { username: match[1], password: match[2] } });
    const cookie = String(result.headers['set-cookie']).split(';')[0];
    const me = (await env.app.inject({ url: '/api/me', headers: { cookie } })).json();
    expect(me.user.provider).toBe('emergency'); expect(me.mfa.required).toBe(false);
    expect((await env.app.inject({ url: '/api/admin/users', headers: { cookie } })).statusCode).toBe(200);
    expect((await env.app.inject({ method: 'POST', url: '/api/me/mfa/totp/setup', headers: { cookie }, payload: {} })).statusCode).toBe(403);
    expect((await env.app.inject({ method: 'POST', url: '/api/me/passkeys/options', headers: { cookie }, payload: {} })).statusCode).toBe(403);
  } finally { removeEmergency(x); }
});
