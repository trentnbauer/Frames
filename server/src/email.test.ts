import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { CODE_ALPHABET, checkCode, checkSmtp, cleanCode, issueCode, mailer, newCode, render, saveSmtp, logRows, logCsv, retryFailed, sendMail } from './email.js';
import { setSetting, type DB } from './db.js';
import { resolveUser, type Who } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** Emailed sign-in codes, SMTP health, the email log and the two templates. Nothing here reaches a real mail server. */
let env: Env, sys: DB;
const sent: Record<string, any>[] = [];
let failNext = false, verifyOk = true;
mailer.make = () => ({
  verify: async () => { if (!verifyOk) throw new Error('connect ECONNREFUSED 127.0.0.1:587'); },
  sendMail: async (m) => { if (failNext) { failNext = false; throw new Error('535 authentication failed'); } sent.push(m); },
});
const who = (sub: string, email: string, name: string): Who => ({ provider: 'g', sub, email, emailVerified: true, name });
const call = async (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) => {
  const r = await env.app.inject({ method: method as any, url, payload: payload as any, headers });
  const ct = String(r.headers['content-type'] ?? '');
  return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.rawPayload.toString(), headers: r.headers };
};
let admin: Record<string, string>;
const lastCode = () => /sign-in code is ([A-Z0-9]{6})/.exec(String(sent[sent.length - 1].text))![1];

beforeAll(() => {
  env = makeEnv();
  sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['@x.test'], publicUrl: 'https://frames.example.com', testedBy: null, email: true });
  resolveUser(sys, who('o', 'owner@x.test', 'Owner'), true);
  admin = { cookie: `${SESSION_COOKIE}=${createSession(sys, 1)}` };
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('codes', () => {
  it('are six characters from an alphabet with no look-alikes', () => {
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    for (let i = 0; i < 200; i++) expect(newCode()).toMatch(/^[A-HJKMN-Z2-9]{6}$/);
    expect(cleanCode(' ab-c d23 ')).toBe('ABCD23');
  });
  it('work once, expire after ten minutes, and are voided by the fifth wrong try', () => {
    const t0 = Date.now();
    let c = issueCode(sys, 'a@x.test', t0);
    expect(checkCode(sys, 'a@x.test', c, t0 + 1000)).toBe('ok');
    expect(checkCode(sys, 'a@x.test', c, t0 + 2000)).toBe('expired'); // single use
    c = issueCode(sys, 'a@x.test', t0);
    expect(checkCode(sys, 'a@x.test', c, t0 + 11 * 60_000)).toBe('expired');
    c = issueCode(sys, 'b@x.test', t0);
    for (let i = 0; i < 4; i++) expect(checkCode(sys, 'b@x.test', 'WRONG1', t0 + 1000)).toBe('wrong');
    expect(checkCode(sys, 'b@x.test', 'WRONG1', t0 + 1000)).toBe('voided');
    expect(checkCode(sys, 'b@x.test', c, t0 + 1000)).toBe('expired'); // even the right code is gone
  });
  it('a new code replaces the old one', () => {
    const c1 = issueCode(sys, 'c@x.test'), c2 = issueCode(sys, 'c@x.test');
    expect(checkCode(sys, 'c@x.test', c1)).toBe(c1 === c2 ? 'ok' : 'wrong');
  });
});

describe('SMTP health and the sign-in option', () => {
  it('offers email only when SMTP is set up and passing its check', async () => {
    expect((await call('GET', '/api/public/auth')).body.email).toBe(false);
    expect((await call('POST', '/api/public/auth/email/send', { email: 'owner@x.test' })).status).toBe(404);
    expect((await call('PUT', '/api/admin/email', { host: 'smtp.test', port: 587, from: 'frames@x.test', password: 'pw' }, admin)).body.health.ok).toBe(true);
    expect((await call('GET', '/api/public/auth')).body.email).toBe(true);
    verifyOk = false;
    expect((await call('POST', '/api/admin/email/check', {}, admin)).body.health).toMatchObject({ ok: false });
    expect((await call('GET', '/api/public/auth')).body.email).toBe(false); // hidden again while the check fails
    verifyOk = true;
    await checkSmtp(sys);
    expect((await call('GET', '/api/public/auth')).body.email).toBe(true);
  });
  it('never returns the password, and validates the settings', async () => {
    const r = await call('GET', '/api/admin/email', undefined, admin);
    expect(r.body.hasPassword).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('"pw"');
    expect((await call('PUT', '/api/admin/email', { port: 99999 }, admin)).status).toBe(400);
    expect((await call('PUT', '/api/admin/email', { from: 'not an address' }, admin)).status).toBe(400);
    expect((await call('GET', '/api/admin/email')).status).toBe(401); // administrators only
  });
});

describe('signing in with a code', () => {
  it('signs in an existing person, whatever they signed in with before, and sets a session', async () => {
    sent.length = 0;
    expect((await call('POST', '/api/public/auth/email/send', { email: 'owner@x.test' })).body).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('owner@x.test');
    expect(sent[0].html).toContain(lastCode()); // the code is in the email
    const bad = await call('POST', '/api/public/auth/email/verify', { email: 'owner@x.test', code: 'AAAAAA' });
    expect(bad.status).toBe(400);
    const ok = await call('POST', '/api/public/auth/email/verify', { email: 'owner@x.test', code: lastCode(), returnTo: '/library' });
    expect(ok.body).toEqual({ ok: true, returnTo: '/library' });
    expect(String(ok.headers['set-cookie'])).toContain(SESSION_COOKIE);
    const cookie = String(ok.headers['set-cookie']).split(';')[0];
    expect((await call('GET', '/api/me', undefined, { cookie })).body.user.email).toBe('owner@x.test');
  });
  it('makes a new account for an allowed address, and says nothing about addresses that may not sign in', async () => {
    sent.length = 0;
    expect((await call('POST', '/api/public/auth/email/send', { email: 'new@x.test', name: 'Nia' })).body).toEqual({ ok: true });
    const v = await call('POST', '/api/public/auth/email/verify', { email: 'new@x.test', code: lastCode(), name: 'Nia' });
    expect(v.status).toBe(200);
    const cookie = String(v.headers['set-cookie']).split(';')[0];
    expect((await call('GET', '/api/me', undefined, { cookie })).body.user).toMatchObject({ email: 'new@x.test' });
    // Not on the list: the same answer, and no email.
    sent.length = 0;
    expect((await call('POST', '/api/public/auth/email/send', { email: 'stranger@elsewhere.test' })).body).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
    expect((await call('POST', '/api/public/auth/email/verify', { email: 'stranger@elsewhere.test', code: 'ABCDEF' })).status).toBe(400);
  });
  it('limits how many codes one address can ask for', async () => {
    let last = 200;
    for (let i = 0; i < 7; i++) last = (await call('POST', '/api/public/auth/email/send', { email: 'owner@x.test' })).status;
    expect(last).toBe(429);
  });
  it('lets an administrator prove email sign-in works, so it can stand on its own', async () => {
    sent.length = 0;
    expect((await call('POST', '/api/admin/email/signin-test', {}, admin)).body.sent).toBe(true);
    expect((await call('POST', '/api/admin/email/signin-test', { code: 'AAAAAA' }, admin)).status).toBe(400);
    expect((await call('POST', '/api/admin/email/signin-test', { code: lastCode() }, admin)).body.ok).toBe(true);
  });
});

describe('the log and the templates', () => {
  it('logs sends and failures without bodies, retries failures, and exports a safe CSV', async () => {
    failNext = true;
    const r = await sendMail(sys, { to: '=cmd@x.test', template: 'general', type: 'invite', params: { title: 'Hello', name: 'A', body: 'B', button_label: 'Go', button_url: 'https://x.test', subject: 'S' } });
    expect(r).toMatchObject({ ok: false });
    const rows = logRows(sys, 'failed');
    expect(rows[0]).toMatchObject({ status: 'failed', type: 'invite' });
    expect(JSON.stringify(rows)).not.toContain('Hello'); // no body stored
    expect(logCsv(rows)).toContain("\"'=cmd@x.test\""); // a spreadsheet cannot run it as a formula
    expect(await retryFailed(sys)).toBe(1);
    expect(logRows(sys, 'failed')).toHaveLength(0);
    // A code is never kept for retry.
    failNext = true;
    await sendMail(sys, { to: 'a@x.test', template: 'code', type: 'code', params: { code: 'ABC234', name: 'A' } });
    expect(await retryFailed(sys)).toBe(0);
    expect((await call('GET', '/api/admin/email/log?status=delivered', undefined, admin)).body.rows.length).toBeGreaterThan(0);
    expect((await call('GET', '/api/admin/email/log.csv', undefined, admin)).body).toContain('When,To,Subject');
  });
  it('fills the sign-in code template and escapes everything', () => {
    const { html } = render('code', { name: '<b>x</b>', code: 'ABC234', server_name: 'frames.test', owner_name: 'Trent' });
    expect(html).toContain('ABC234');
    expect(html).not.toContain('{{');
    expect(html).not.toContain('<b>x</b>');
  });
  it('drops the optional rows of the general template when empty, and keeps them when given', () => {
    const base = { title: 'T', name: 'N', body: 'line1\nline2', button_label: 'Go', button_url: 'https://x.test/a', subject: 'S' };
    const bare = render('general', { ...base, image_url: '', note: '', eyebrow: '' }).html;
    expect(bare).not.toContain('<img');
    expect(bare).not.toContain('opt:');
    expect(bare).toContain('line1<br>line2');
    const full = render('general', { ...base, image_url: 'https://x.test/i.jpg', image_alt: 'Alt', note: 'Nice <i>work</i>', note_from: 'Mia', eyebrow: 'Guest reply' }).html;
    expect(full).toContain('src="https://x.test/i.jpg"');
    expect(full).toContain('Guest reply');
    expect(full).toContain('Nice &lt;i&gt;work&lt;/i&gt;');
    expect(render('general', { ...base, image_url: 'http://insecure/i.jpg' }).html).not.toContain('<img'); // only https images
    saveSmtp(sys, { host: '' });
  });
});
