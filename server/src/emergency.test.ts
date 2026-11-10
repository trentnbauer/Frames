import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from './auth.js';
import { emergencyActive, removeEmergency, startEmergency } from './emergency.js';
import { cleanup, makeEnv, type Env } from './testutil.js';
import { countAdmins, listUsers } from './users.js';

/** The emergency login: one temporary administrator made at start-up, spent by its first sign-in, deleted by sign-out. */
let env: Env, x: any;
const lines: string[] = [];
const log = (l: string) => { lines.push(l); };
const creds = () => { const m = /username (\S+) password (\S+)/.exec(lines[lines.length - 1])!; return { username: m[1], password: m[2] }; };
const post = (payload: object) => env.app.inject({ method: 'POST', url: '/api/public/auth/emergency', payload });
const emergencyUsers = () => listUsers(x.sys).filter((u) => u.provider === 'emergency');

beforeAll(() => { env = makeEnv(); x = (env.app as any).frames; });
afterAll(() => { removeEmergency(x); env.app.close(); cleanup(env); });

describe('emergency login', () => {
  it('writes its credentials to the log and signs in once as an administrator', async () => {
    const admins = countAdmins(x.sys);
    startEmergency(x, log);
    expect(emergencyActive()).toBe(true);
    expect(emergencyUsers()).toHaveLength(1);
    expect(countAdmins(x.sys)).toBe(admins); // it never counts as the instance's administrator
    const { username, password } = creds();
    expect((await post({ username, password: 'not-it' })).statusCode).toBe(401);
    const ok = await post({ username, password });
    expect(ok.statusCode).toBe(200);
    const cookie = String(ok.headers['set-cookie']).split(';')[0];
    expect(cookie).toContain(SESSION_COOKIE);
    const me = (await env.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).json();
    expect(me.role).toBe('admin');
    expect((await post({ username, password })).statusCode).toBe(404); // one use
    // Signing out deletes the account.
    await env.app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie }, payload: {} });
    expect(emergencyUsers()).toHaveLength(0);
  });
  it('is voided, and deleted, by five wrong tries', async () => {
    startEmergency(x, log);
    const { username } = creds();
    for (let i = 0; i < 5; i++) await post({ username, password: 'wrong' });
    expect(emergencyUsers()).toHaveLength(0);
    expect((await post({ username, password: 'wrong' })).statusCode).toBe(404);
  });
  it('is replaced, not added to, by the next start, and can be removed', () => {
    startEmergency(x, log);
    startEmergency(x, log);
    expect(emergencyUsers()).toHaveLength(1);
    removeEmergency(x);
    expect(emergencyUsers()).toHaveLength(0);
    expect(emergencyActive()).toBe(false);
  });
});
