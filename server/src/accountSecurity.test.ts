import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { issueCode } from './email.js';
import { setSetting, type DB } from './db.js';
import { resolveUser } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, sys: DB;
let owner: string, other: string, spare: string;
const headers = (token: string) => ({ cookie: `${SESSION_COOKIE}=${token}` });
const call = (method: 'GET' | 'DELETE' | 'POST', url: string, token = owner, payload?: object) => env.app.inject({ method, url, headers: headers(token), payload });
beforeAll(() => {
  env = makeEnv(); sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [], email: true, allow: ['@x.test'], publicUrl: '', testedBy: null });
  const who = (email: string) => ({ provider: 'email', sub: email, email, emailVerified: true, name: email });
  resolveUser(sys, who('owner@x.test'), true);
  const second = resolveUser(sys, who('other@x.test'), true)!;
  owner = createSession(sys, 1); spare = createSession(sys, 1); other = createSession(sys, second.id);
});
afterAll(async () => { await env.app.close(); cleanup(env); });

describe('personal session security', () => {
  it('lists only the current person’s sessions, marks this browser and never exposes token hashes', async () => {
    const r = await call('GET', '/api/me/security'); expect(r.statusCode).toBe(200);
    const d = r.json(); expect(d.sessions).toHaveLength(2); expect(d.sessions.filter((s: any) => s.current)).toHaveLength(1);
    const rawIds = (sys.prepare('SELECT id FROM sessions').all() as {id: string}[]).map((r) => r.id);
    for (const id of [...rawIds, owner, spare, other]) expect(r.body).not.toContain(id);
    expect((await call('GET', '/api/me/security', '')).statusCode).toBe(401);
  });
  it('refuses another person’s session and revokes a selected session immediately', async () => {
    const foreign = (await call('GET', '/api/me/security', other)).json().sessions[0].id;
    expect((await call('DELETE', `/api/me/sessions/${foreign}`)).statusCode).toBe(404);
    const target = (await call('GET', '/api/me/security')).json().sessions.find((s: any) => !s.current).id;
    expect((await call('DELETE', `/api/me/sessions/${target}`)).json()).toEqual({ ok: true, current: false });
    expect((await call('GET', '/api/me/security', spare)).statusCode).toBe(401);
    const history = (await call('GET', '/api/me/security')).json().history;
    expect(history.find((h: any) => h.id === target).active).toBe(false);
    expect((await call('GET', '/api/me/security', other)).statusCode).toBe(200);
  });
  it('records the IP and browser on an actual successful sign-in', async () => {
    setSetting(sys, 'smtp', { host: 'smtp.test', from: 'frames@x.test', enabled: true });
    setSetting(sys, 'smtpHealth', { ok: true, at: new Date().toISOString(), error: '' });
    const code = issueCode(sys, 'owner@x.test');
    const r = await env.app.inject({ method: 'POST', url: '/api/public/auth/email/verify', remoteAddress: '192.0.2.42', headers: { 'user-agent': 'Security test browser' }, payload: { email: 'owner@x.test', code } });
    expect(r.statusCode).toBe(200);
    const h = (await call('GET', '/api/me/security')).json().history;
    expect(h.some((v: any) => v.ip === '192.0.2.42' && v.userAgent === 'Security test browser')).toBe(true);
  });
  it('clears the current cookie and invalidates the current session when signed out', async () => {
    const own = (await call('GET', '/api/me/security')).json().sessions.find((s: any) => s.current).id;
    const r = await call('DELETE', `/api/me/sessions/${own}`);
    expect(r.json()).toEqual({ ok: true, current: true }); expect(r.headers['set-cookie']).toContain('Max-Age=0');
    expect((await call('GET', '/api/me/security')).statusCode).toBe(401);
  });
});

it('keeps pre-upgrade sessions usable and backfills them without inventing client details', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const { openSystemDb } = await import('./users.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-security-upgrade-'));
  let db = openSystemDb(dir);
  try {
    const token = createSession(db, 1);
    db.exec('DROP TABLE sign_in_events'); db.close();
    db = openSystemDb(dir);
    const rows = db.prepare('SELECT ip, user_agent FROM sign_in_events').all();
    expect(rows).toEqual([{ ip: '', user_agent: '' }]);
    const { sessionUser } = await import('./auth.js');
    expect(sessionUser(db, { headers: headers(token) } as any)?.id).toBe(1);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
