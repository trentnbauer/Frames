import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { setSetting, type DB } from './db.js';
import { resolveUser, type User, type Who } from './users.js';
import { cleanup, makeEnv, type Env } from './testutil.js';

/** The guest role, and the default role for new accounts. */
let env: Env, sys: DB;
const who = (sub: string, email: string, name: string): Who => ({ provider: 'g', sub, email, emailVerified: true, name });
const cookie = (u: number | User) => ({ cookie: `${SESSION_COOKIE}=${createSession(sys, typeof u === 'number' ? u : u.id)}` });
const call = async (method: string, url: string, headers: Record<string, string> = {}, payload?: unknown) => {
  const r = await env.app.inject({ method: method as any, url, headers, payload: payload as any });
  return { status: r.statusCode, body: String(r.headers['content-type'] ?? '').includes('json') ? r.json() : r.rawPayload.toString() };
};
let admin: Record<string, string>, token: string;

beforeAll(async () => {
  env = makeEnv();
  env.app.close();
  const { buildApp } = await import('./app.js');
  env.app = buildApp(env.db, env.cfg);
  sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['@x.test'], publicUrl: '', testedBy: null });
  resolveUser(sys, who('o0', 'owner@x.test', 'Owner'), true);
  admin = cookie(1);
  const c = await call('POST', '/api/collections', admin, { name: 'Wall for guests' });
  token = (await call('POST', '/api/shares', admin, { kind: 'collection', id: c.body.id, allowReview: true })).body.token;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('guests', () => {
  it('new accounts are members unless the administrator makes guest the default', async () => {
    expect(resolveUser(sys, who('m1', 'm1@x.test', 'M1'), true)!.role).toBe('member');
    expect((await call('GET', '/api/admin/instance', admin)).body.defaultRole).toBe('member');
    expect((await call('PUT', '/api/admin/instance', admin, { defaultRole: 'guest' })).body.defaultRole).toBe('guest');
    expect(resolveUser(sys, who('g1', 'g1@x.test', 'G1'), true)!.role).toBe('guest');
    expect((await call('PUT', '/api/admin/instance', admin, { defaultRole: 'nonsense' })).body.defaultRole).toBe('guest'); // ignored
    await call('PUT', '/api/admin/instance', admin, { defaultRole: 'member' });
  });
  it('lets the administrator close the door to new accounts, and open it again', async () => {
    expect((await call('GET', '/api/admin/instance', admin)).body).toMatchObject({ signups: true, signupsLocked: false });
    expect((await call('PUT', '/api/admin/instance', admin, { signups: false })).body.signups).toBe(false);
    expect((await call('GET', '/api/me', admin)).body.signups).toBe(false);
    expect((await call('GET', '/api/admin/users', admin)).body.signups).toBe(false);
    await call('PUT', '/api/admin/instance', admin, { signups: 'no' }); // not a boolean: ignored
    expect((await call('GET', '/api/admin/instance', admin)).body.signups).toBe(false);
    expect((await call('PUT', '/api/admin/instance', admin, { signups: true })).body.signups).toBe(true);
  });
  it('an administrator can add a guest, or change someone to one', async () => {
    const r = await call('POST', '/api/admin/users', admin, { email: 'inv@x.test', role: 'guest' });
    expect(r.body.role).toBe('guest');
    const m = resolveUser(sys, who('m2', 'm2@x.test', 'M2'), true)!;
    expect((await call('PATCH', `/api/admin/users/${m.id}`, admin, { role: 'guest' })).body.role).toBe('guest');
    expect((await call('PATCH', `/api/admin/users/${m.id}`, admin, { role: 'wizard' })).status).toBe(400);
    expect((await call('PATCH', '/api/admin/users/1', admin, { role: 'guest' })).status).toBe(400); // the only administrator
  });
  it('a guest can only see who they are and the links they opened', async () => {
    const g = resolveUser(sys, who('g2', 'g2@x.test', 'G2'), true)!;
    await call('PATCH', `/api/admin/users/${g.id}`, admin, { role: 'guest' });
    const h = cookie(g);
    expect((await call('GET', '/api/me', h)).body.role).toBe('guest');
    for (const url of ['/api/photos', '/api/collections', '/api/shares', '/api/admin/users']) expect((await call('GET', url, h)).status, url).toBe(403);
    expect((await call('POST', '/api/collections', h, { name: 'x' })).status).toBe(403);
    expect((await call('GET', '/api/guest/links', h)).body.links).toEqual([]);
    expect((await call('GET', `/api/s/${token}`, h)).status).toBe(200);
    expect((await call('GET', `/api/s/${token}`)).status).toBe(200); // signed out: the link works as before and is not recorded
    const links = (await call('GET', '/api/guest/links', h)).body.links;
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ token, label: 'Wall for guests', kind: 'collection' });
    await call('GET', `/api/s/${token}`, h);
    expect((await call('GET', '/api/guest/links', h)).body.links).toHaveLength(1); // opened twice, listed once
  });
});
