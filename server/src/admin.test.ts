import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAuth, createSession, SESSION_COOKIE } from './auth.js';
import { setSetting, type DB } from './db.js';
import { getUser, resolveUser, updateUser, type User, type Who } from './users.js';
import { cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/** Managing people, deleting data on request, and the privacy page. */
let env: Env, sys: DB;
let alice: User, bob: User, carol: User;
const who = (sub: string, email: string, name: string): Who => ({ provider: 'g', sub, email, emailVerified: true, name });
const cookie = (u: number | User) => ({ cookie: `${SESSION_COOKIE}=${createSession(sys, typeof u === 'number' ? u : u.id)}` });
const call = async (method: string, url: string, headers: Record<string, string> = {}, payload?: unknown) => {
  const r = await env.app.inject({ method: method as any, url, headers, payload: payload as any });
  const ct = String(r.headers['content-type'] ?? '');
  return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.rawPayload.toString(), headers: r.headers };
};
const put = async (dir: string, name: string, c: string) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), await jpg(svg(900, 600, c, '#eeeeee', [0.3, 0.3]))); };
let me: Record<string, string>, a: Record<string, string>, b: Record<string, string>;

beforeAll(async () => {
  env = makeEnv();
  (env.cfg as any).libraryRoots = [env.lib];
  env.app.close();
  const { buildApp } = await import('./app.js');
  env.app = buildApp(env.db, env.cfg);
  sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['@x.test'], publicUrl: '', testedBy: null });
  resolveUser(sys, who('o0', 'owner@x.test', 'Owner'), true); // the first person to sign in is the administrator
  alice = resolveUser(sys, who('a1', 'alice@x.test', 'Alice'), true)!;
  bob = resolveUser(sys, who('b1', 'bob@x.test', 'Bob'), true)!;
  carol = resolveUser(sys, who('c1', 'carol@x.test', 'Carol'), true)!;
  await put(env.lib, 'own.jpg', '#c0392b');
  await put(path.join(env.lib, 'alice'), 'a1.jpg', '#1b4f9c');
  await put(path.join(env.lib, 'bob'), 'b1.jpg', '#145a32');
  me = cookie(1); a = cookie(alice); b = cookie(bob);
  for (const h of [me, a, b]) await call('POST', '/api/library/scan?wait=1', h);
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('managing people', () => {
  it('lists everyone with their space and photo count, for administrators only', async () => {
    const r = await call('GET', '/api/admin/users', me);
    expect(r.status).toBe(200);
    const byName = Object.fromEntries(r.body.users.map((u: any) => [u.name, u]));
    expect(byName.Alice).toMatchObject({ role: 'member', folder: 'alice', photos: 1 });
    expect(byName.Alice.bytes).toBeGreaterThan(0);
    expect(byName.Owner).toMatchObject({ role: 'admin', photos: 1 });
    expect((await call('GET', '/api/admin/users', a)).status).toBe(403);
    expect((await call('GET', '/api/admin/users')).status).toBe(401);
  });
  it('adds someone by email, putting them on the allow-list too', async () => {
    expect((await call('POST', '/api/admin/users', me, { email: 'not an email' })).status).toBe(400);
    const r = await call('POST', '/api/admin/users', me, { email: 'Dana@Y.test' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ email: 'dana@y.test', invited: true, role: 'member' });
    expect(loadAuth(sys).allow).toContain('dana@y.test');
    expect(r.body.allowedList).toBe('added'); // they were not on the list, so they were put on it
    const ed = await call('POST', '/api/admin/users', me, { email: 'ed@x.test' }); // @x.test is already allowed
    expect(ed.body.allowedList).toBe('already');
    expect(loadAuth(sys).allow).not.toContain('ed@x.test');
    expect((await call('POST', '/api/admin/users', me, { email: 'dana@y.test' })).status).toBe(409);
    expect((await call('POST', '/api/admin/users', a, { email: 'x@y.test' })).status).toBe(403);
  });
  it('changes roles and folders, never leaving no administrator and never accepting an unsafe folder', async () => {
    expect((await call('PATCH', `/api/admin/users/${alice.id}`, me, { role: 'admin' })).body.role).toBe('admin');
    expect((await call('GET', '/api/auth/config', a)).status).toBe(200);
    expect((await call('PATCH', `/api/admin/users/${alice.id}`, me, { role: 'member' })).body.role).toBe('member');
    expect((await call('PATCH', '/api/admin/users/1', me, { role: 'member' })).status).toBe(400); // the only administrator
    expect((await call('PATCH', '/api/admin/users/1', me, { disabled: true })).status).toBe(400);
    for (const f of ['../etc', 'Upper', 'users', 'a/b', '', '.hidden']) expect((await call('PATCH', `/api/admin/users/${bob.id}`, me, { folder: f })).status, f).toBe(400);
    expect((await call('PATCH', `/api/admin/users/${bob.id}`, me, { folder: 'alice' })).status).toBe(400); // taken
    expect((await call('PATCH', '/api/admin/users/1', me, { folder: 'mine' })).status).toBe(400);
    expect((await call('PATCH', '/api/admin/users/99999', me, { role: 'admin' })).status).toBe(404);
  });
  it('switching someone off ends their sign-in', async () => {
    const c = cookie(carol);
    expect((await call('GET', '/api/photos', c)).status).toBe(200);
    expect((await call('PATCH', `/api/admin/users/${carol.id}`, me, { disabled: true })).body.disabled).toBe(true);
    expect((await call('GET', '/api/photos', c)).status).toBe(401);
    await call('PATCH', `/api/admin/users/${carol.id}`, me, { disabled: false });
  });
});

describe('deleting data', () => {
  it('needs the confirmation word, from the person or from an administrator', async () => {
    expect((await call('DELETE', '/api/me/data', b, {})).status).toBe(400);
    expect((await call('DELETE', `/api/admin/users/${bob.id}/data`, me, { confirm: 'yes' })).status).toBe(400);
    expect((await call('DELETE', `/api/admin/users/${bob.id}/data`, a, { confirm: 'delete' })).status).toBe(403); // a member cannot
    expect(fs.existsSync(path.join(env.data, 'users', String(bob.id)))).toBe(true);
  });
  it('lets a person erase everything Frames holds for them, and signs them out', async () => {
    // Give Alice something of every kind: a collection, a portfolio hostname, an upload.
    await call('POST', '/api/collections', a, { name: 'Mine' });
    await call('PUT', '/api/portfolio', a, { host: 'gallery.alice.test' });
    const dir = path.join(env.data, 'users', String(alice.id));
    expect(fs.existsSync(path.join(dir, 'frames.db'))).toBe(true);
    const r = await call('DELETE', '/api/me/data', a, { confirm: 'delete' });
    expect(r.body).toMatchObject({ ok: true, accountRemoved: true });
    expect(fs.existsSync(dir)).toBe(false);
    expect(getUser(sys, alice.id)).toBeNull();
    expect(sys.prepare('SELECT COUNT(*) n FROM portfolio_hosts WHERE user_id = ?').get(alice.id)).toEqual({ n: 0 });
    expect(String(r.headers['set-cookie'])).toContain('Max-Age=0');
    expect((await call('GET', '/api/photos', a)).status).toBe(401);
    // Her read-only library folder is not Frames' to delete.
    expect(fs.existsSync(path.join(env.lib, 'alice', 'a1.jpg'))).toBe(true);
  });
  it('leaves everyone else untouched', async () => {
    expect((await call('GET', '/api/photos', b)).body.photos.map((p: any) => p.file)).toEqual(['b1.jpg']);
    expect((await call('GET', '/api/photos', me)).body.photos.map((p: any) => p.file)).toEqual(['own.jpg']);
  });
  it('an administrator can erase someone else’s data on request', async () => {
    const r = await call('DELETE', `/api/admin/users/${bob.id}/data`, me, { confirm: 'delete' });
    expect(r.body.accountRemoved).toBe(true);
    expect(fs.existsSync(path.join(env.data, 'users', String(bob.id)))).toBe(false);
    expect((await call('GET', '/api/admin/users', me)).body.users.some((u: any) => u.id === bob.id)).toBe(false);
  });
  it('the last administrator cannot erase their own account, but the owner can empty their library', async () => {
    const dana = resolveUser(sys, who('d1', 'dana@x.test', 'Dana'), true)!;
    updateUser(sys, dana.id, { role: 'admin' });
    updateUser(sys, 1, { role: 'member' });
    expect((await call('DELETE', '/api/me/data', cookie(dana), { confirm: 'delete' })).status).toBe(400); // she is now the only administrator
    updateUser(sys, 1, { role: 'admin' });
    const own = await call('DELETE', '/api/me/data', me, { confirm: 'delete' });
    expect(own.body).toMatchObject({ ok: true, accountRemoved: false });
    expect((await call('GET', '/api/photos', me)).body.photos).toEqual([]);
    expect(fs.existsSync(path.join(env.data, 'frames.db'))).toBe(true);
    expect(getUser(sys, 1)).not.toBeNull();
    // The instance itself is intact: another person's library still works.
    expect((await call('GET', '/api/photos', cookie(dana))).status).toBe(200);
  });
});

describe('the privacy page', () => {
  it('is public, says who runs the server once they have said so, and describes this instance', async () => {
    const r = await call('GET', '/privacy');
    expect(r.status).toBe(200);
    expect(String(r.headers['content-type'])).toContain('text/html');
    expect(r.body).toContain('Privacy');
    expect(r.body).toContain('the person who runs this server');
    expect(r.body).toContain('Google'); // the sign-in provider that is set up
    expect(r.body).toContain('Delete my data');
    expect((await call('PUT', '/api/admin/privacy', me, { operator: 'Example Studio', contact: 'privacy@example.test' })).status).toBe(200);
    const after = (await call('GET', '/privacy')).body;
    expect(after).toContain('Example Studio');
    expect(after).toContain('privacy@example.test');
  });
  it('turns whatever an administrator types into plain text', async () => {
    await call('PUT', '/api/admin/privacy', me, { operator: '<script>alert(1)</script>', extra: 'Line one\n\n<img src=x onerror=alert(1)>' });
    const html = (await call('GET', '/privacy')).body;
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Line one');
  });
  it('can only be edited by an administrator, and the legacy sign-in redirects to the app', async () => {
    expect((await call('PUT', '/api/admin/privacy', cookie(resolveUser(sys, who('e1', 'eve@x.test', 'Eve'), true)!), { operator: 'x' })).status).toBe(403);
    expect((await call('GET', '/auth/signin')).headers.location).toBe('/signin');
  });
  it('reflects whether new accounts are allowed', async () => {
    expect((await call('GET', '/privacy')).body).toContain('can create an account');
    env.cfg.allowSignups = false;
    try { expect((await call('GET', '/privacy')).body).toContain('New accounts are switched off'); } finally { env.cfg.allowSignups = undefined; }
  });
});
