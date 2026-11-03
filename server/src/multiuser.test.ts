import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { setSetting, type DB } from './db.js';
import { migrateLegacy } from './tenants.js';
import { getUser, invite, resolveUser, updateUser, validFolder, type User, type Who } from './users.js';
import { cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/** Several people on one Frames: each with their own library, collections, share links and portfolio. */
let env: Env, sys: DB;
let alice: User, bob: User;
const who = (sub: string, email: string, name: string, verified = true): Who => ({ provider: 'g', sub, email, emailVerified: verified, name });
const cookie = (u: number | User) => ({ cookie: `${SESSION_COOKIE}=${createSession(sys, typeof u === 'number' ? u : u.id)}` });
const call = async (method: string, url: string, headers: Record<string, string> = {}, payload?: unknown) => {
  const r = await env.app.inject({ method: method as any, url, headers, payload: payload as any });
  const ct = String(r.headers['content-type'] ?? '');
  return { status: r.statusCode, body: ct.includes('json') ? r.json() : r.rawPayload.toString(), headers: r.headers };
};
const put = (f: string, name: string, c: string) => jpg(svg(900, 600, c, '#eeeeee', [0.3, 0.3])).then((b) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(path.join(path.dirname(f), name), b); });
let me: Record<string, string>, a: Record<string, string>, b: Record<string, string>;

beforeAll(async () => {
  env = makeEnv();
  // The library root (where each person's folder lives) is the owner's library folder too.
  (env.cfg as any).libraryRoots = [env.lib];
  env.app.close(); // makeEnv built an app before libraryRoots was known: build the real one below
  const { buildApp } = await import('./app.js');
  env.app = buildApp(env.db, env.cfg);
  sys = (env.app as any).frames.sys;
  // Sign-in on, so every request needs a session.
  setSetting(sys, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['@x.test'], publicUrl: '', testedBy: null });
  updateUser(sys, 1, { name: 'Owner' });
  alice = resolveUser(sys, who('a1', 'alice@x.test', 'Alice'), true)!;
  bob = resolveUser(sys, who('b1', 'bob@x.test', 'Bob'), true)!;
  await put(path.join(env.lib, 'own.jpg'), 'own.jpg', '#c0392b');
  await put(path.join(env.lib, 'alice', 'a1.jpg'), 'a1.jpg', '#1b4f9c');
  await put(path.join(env.lib, 'alice', 'a2.jpg'), 'a2.jpg', '#145a32');
  await put(path.join(env.lib, 'bob', 'b1.jpg'), 'b1.jpg', '#7e5109');
  me = cookie(1); a = cookie(alice); b = cookie(bob);
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('accounts', () => {
  it('gives each new person a safe folder name under the libraries mount, unique among everyone', () => {
    expect(alice.folder).toBe('alice');
    expect(bob.folder).toBe('bob');
    const again = resolveUser(sys, who('a2', 'alice@y.test', 'Alice Two'), true)!;
    expect(again.folder).toBe('alice-2');
    expect(validFolder('../etc')).toBe(false);
    expect(validFolder('users')).toBe(false);
    expect(validFolder('Alice')).toBe(false);
    expect(validFolder('good.name-1')).toBe(true);
    const odd = resolveUser(sys, who('z', '../../x@y.test', '??'), true)!;
    expect(validFolder(odd.folder)).toBe(true);
  });
  it('the first person, the owner, is an administrator; everyone after is a member', () => {
    expect(getUser(sys, 1)!.role).toBe('admin');
    expect(alice.role).toBe('member');
  });
  it('with sign-ups off, only existing or invited people get an account, and an invitation needs a verified email', () => {
    expect(resolveUser(sys, who('c1', 'carol@x.test', 'Carol'), false)).toBeNull();
    const inv = invite(sys, 'dave@x.test');
    expect(resolveUser(sys, who('d1', 'dave@x.test', 'Dave', false), false)).toBeNull(); // an unverified address cannot claim it
    const dave = resolveUser(sys, who('d1', 'dave@x.test', 'Dave'), false)!;
    expect(dave.id).toBe(inv.id);
    expect(dave.provider).toBe('g');
    expect(resolveUser(sys, who('a1', 'alice@x.test', 'Alice'), false)!.id).toBe(alice.id); // existing people still get in
  });
  it('a disabled person is refused everywhere', async () => {
    const tmp = resolveUser(sys, who('t1', 'tmp@x.test', 'Tmp'), true)!;
    const c = cookie(tmp);
    expect((await call('GET', '/api/photos', c)).status).toBe(200);
    updateUser(sys, tmp.id, { disabled: true });
    expect((await call('GET', '/api/photos', c)).status).toBe(401);
    expect(resolveUser(sys, who('t1', 'tmp@x.test', 'Tmp'), true)).toBeNull();
  });
});

describe('separate libraries', () => {
  it('the owner scans their own folder but not other people’s folders under the same root', async () => {
    expect((await call('POST', '/api/library/scan?wait=1', me)).body.imported).toBe(1);
    expect((await call('GET', '/api/photos', me)).body.photos.map((p: any) => p.file)).toEqual(['own.jpg']);
  });
  it('each person scans only the folder named for them', async () => {
    expect((await call('POST', '/api/library/scan?wait=1', a)).body.imported).toBe(2);
    expect((await call('POST', '/api/library/scan?wait=1', b)).body.imported).toBe(1);
    expect((await call('GET', '/api/photos', a)).body.photos.map((p: any) => p.file).sort()).toEqual(['a1.jpg', 'a2.jpg']);
    expect((await call('GET', '/api/photos', b)).body.photos.map((p: any) => p.file)).toEqual(['b1.jpg']);
    expect((await call('GET', '/api/photos', me)).body.photos.map((p: any) => p.file)).toEqual(['own.jpg']);
  });
  it('keeps each person’s data in their own database and folder, and the owner’s where it always was', () => {
    expect(fs.existsSync(path.join(env.data, 'users', String(alice.id), 'frames.db'))).toBe(true);
    expect(fs.existsSync(path.join(env.data, 'frames.db'))).toBe(true);
    expect(fs.existsSync(path.join(env.data, 'users', '1'))).toBe(false);
  });
  it('one person cannot reach another’s photo by id: the same id means their own', async () => {
    const mine = (await call('GET', '/api/photos', a)).body.photos[0];
    const theirs = (await call('GET', '/api/photos', b)).body.photos[0];
    // Both libraries start numbering at 1, so ids overlap: each person only ever sees their own row.
    expect((await call('GET', `/api/photos/${mine.id}`, a)).body.file).toBe(mine.file);
    const other = (await call('GET', `/api/photos/${theirs.id}`, a)).body;
    expect(other.file).not.toBe(theirs.file === mine.file ? '' : theirs.file);
    expect((await call('GET', '/api/photos/99999', a)).status).toBe(404);
  });
  it('collections, reviews and settings are separate too', async () => {
    const c = (await call('POST', '/api/collections', a, { name: 'Alice only' })).body;
    expect(c.name).toBe('Alice only');
    expect((await call('GET', '/api/collections', a)).body).toHaveLength(1);
    expect((await call('GET', '/api/collections', b)).body).toHaveLength(0);
    expect((await call('GET', '/api/collections', me)).body).toHaveLength(0);
    await call('PUT', '/api/settings', a, { sessions: 3 });
    expect((await call('GET', '/api/settings', a)).body.settings.sessions).toBe(3);
    expect((await call('GET', '/api/settings', b)).body.settings.sessions).not.toBe(3);
  });
  it('uploads go to the uploader’s own originals folder', async () => {
    const boundary = '----t';
    const img = await jpg(svg(300, 200, '#000000', '#ffffff', [0.5, 0.5]));
    const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="up.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`), img, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    const r = await env.app.inject({ method: 'POST', url: '/api/upload', payload: body, headers: { ...b, 'content-type': `multipart/form-data; boundary=${boundary}` } });
    expect(r.json().saved).toEqual(['up.jpg']);
    expect(fs.existsSync(path.join(env.data, 'users', String(bob.id), 'originals', 'up.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(env.data, 'originals', 'up.jpg'))).toBe(false);
  });
});

describe('administrators and members', () => {
  it('only an administrator can change sign-in or the tunnel', async () => {
    expect((await call('GET', '/api/auth/config', me)).status).toBe(200);
    expect((await call('GET', '/api/auth/config', a)).status).toBe(403);
    expect((await call('PUT', '/api/auth/config', a, { enabled: false })).status).toBe(403);
    expect((await call('GET', '/api/tunnel', a)).status).toBe(403);
    expect((await call('GET', '/api/tunnel', me)).status).toBe(200);
    updateUser(sys, bob.id, { role: 'admin' });
    expect((await call('GET', '/api/auth/config', b)).status).toBe(200);
    updateUser(sys, bob.id, { role: 'member' });
  });
  it('says who you are and whether you are an administrator', async () => {
    const m = (await call('GET', '/api/me', a)).body;
    expect(m).toMatchObject({ role: 'member', canSignOut: true, user: { name: 'Alice', folder: 'alice' } });
    expect((await call('GET', '/api/me', me)).body.role).toBe('admin');
  });
  it('turns away a request with no session', async () => {
    expect((await call('GET', '/api/photos')).status).toBe(401);
    expect((await call('GET', '/api/photos', { cookie: `${SESSION_COOKIE}=nonsense` })).status).toBe(401);
  });
});

describe('share links', () => {
  let token: string;
  it('are named for their owner and open that person’s library without any sign-in', async () => {
    const col = (await call('GET', '/api/collections', a)).body[0];
    const photo = (await call('GET', '/api/photos', a)).body.photos[0];
    await call('PUT', `/api/collections/${col.id}/photos/${photo.id}`, a);
    const s = (await call('POST', '/api/shares', a, { kind: 'collection', id: col.id })).body;
    token = s.token;
    expect(token.startsWith(`${alice.id.toString(36)}_`)).toBe(true);
    const guest = (await call('GET', `/api/s/${token}`)).body;
    expect(guest.photos.map((p: any) => p.id)).toEqual([photo.id]);
    expect(guest.name).toBe('Alice only');
  });
  it('belong only to their owner: the owner’s own shares list does not show them', async () => {
    expect((await call('GET', '/api/shares', me)).body).toHaveLength(0);
    expect((await call('GET', '/api/shares', a)).body).toHaveLength(1);
  });
  it('an unknown token is simply unknown', async () => {
    expect((await call('GET', `/api/s/${alice.id.toString(36)}_${'A'.repeat(22)}`)).status).toBe(404);
  });
});

describe('portfolios', () => {
  it('each person has their own hostname, which shows only their portfolio, and two people cannot share one', async () => {
    const photo = (await call('GET', '/api/photos', a)).body.photos[0];
    const col = (await call('GET', '/api/collections', a)).body[0];
    expect(photo && col).toBeTruthy();
    const ok = await call('PUT', '/api/portfolio', a, { host: 'gallery.alice.test', collectionId: col.id, enabled: true, photographerName: 'Alice A' });
    expect(ok.status).toBe(200);
    expect((await call('PUT', '/api/portfolio', b, { host: 'gallery.alice.test' })).status).toBe(400);
    const host = { host: 'gallery.alice.test' };
    const cfgJson = (await call('GET', '/portfolio/config.json', host)).body;
    expect(cfgJson.name ?? cfgJson.photographerName).toBe('Alice A');
    const manifest = (await call('GET', '/portfolio/images/manifest.json', host)).body;
    expect(JSON.stringify(manifest)).toContain(photo.file.replace(/\.jpg$/, ''));
    // On that hostname nothing but the portfolio is reachable.
    expect((await call('GET', '/api/photos', { ...host, ...a })).status).toBe(404);
    expect((await call('GET', '/api/me', host)).status).toBe(404);
  });
  it('the owner’s portfolio stays at /portfolio/ on the main address, and is not Alice’s', async () => {
    const colId = (await call('POST', '/api/collections', me, { name: 'Mine' })).body.id;
    const own = (await call('GET', '/api/photos', me)).body.photos[0];
    await call('PUT', `/api/collections/${colId}/photos/${own.id}`, me);
    await call('PUT', '/api/portfolio', me, { collectionId: colId, enabled: true, photographerName: 'The Owner' });
    const cfgJson = (await call('GET', '/portfolio/config.json')).body;
    expect(cfgJson.name ?? cfgJson.photographerName).toBe('The Owner');
  });
});

describe('upgrading from one library', () => {
  it('the person who tested sign-in becomes the owner, and the sign-in settings move to the system database', async () => {
    const e = makeEnv();
    try {
      const tester = { provider: 'g', sub: 'owner-sub', email: 'me@x.test', emailVerified: true, name: 'Me' };
      setSetting(e.db, 'auth', { enabled: true, providers: [{ id: 'g', type: 'google', name: 'Google', clientId: 'x' }], allow: ['me@x.test'], publicUrl: '', testedBy: tester });
      setSetting(e.db, 'secret:oauth:g', 'client-secret-value');
      setSetting(e.db, 'portfolio', { host: 'photos.example.com' });
      const s2 = (e.app as any).frames.sys as DB;
      s2.prepare("DELETE FROM settings WHERE key = 'legacyMigrated'").run();
      s2.prepare("UPDATE users SET provider = 'local', sub = 'owner' WHERE id = 1").run();
      migrateLegacy(s2, e.db);
      expect(getUser(s2, 1)).toMatchObject({ provider: 'g', sub: 'owner-sub', email: 'me@x.test', role: 'admin' });
      expect(JSON.parse((s2.prepare("SELECT value FROM settings WHERE key = 'auth'").get() as any).value).providers).toHaveLength(1);
      expect(JSON.parse((s2.prepare("SELECT value FROM settings WHERE key = 'secret:oauth:g'").get() as any).value)).toBe('client-secret-value');
      expect((s2.prepare("SELECT user_id FROM portfolio_hosts WHERE host = 'photos.example.com'").get() as any).user_id).toBe(1);
    } finally { e.app.close(); cleanup(e); }
  });
});
