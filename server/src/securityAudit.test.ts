import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { createSession, SESSION_COOKIE } from './auth.js';
import { setSetting, type DB } from './db.js';
import { setMfaPolicy } from './mfa.js';
import { resolveUser, type User } from './users.js';
import { api, cleanup, makeEnv, jpg, svg, type Env } from './testutil.js';
let env: Env, sys: DB, admin: User, member: User, guest: User;
const cookie = (u: User) => ({ cookie: `${SESSION_COOKIE}=${createSession(sys, u.id)}` });
beforeEach(() => {
  env = makeEnv();
  sys = (env.app as any).frames.sys;
  setSetting(sys, 'auth', { enabled: true, providers: [], email: true, allow: ['@audit.test'], publicUrl: '', testedBy: null });
  const person = (name: string, visitor = false) =>
    resolveUser(sys, { provider: 'email', sub: name, email: `${name}@audit.test`, emailVerified: true, name }, true, visitor)!;
  admin = person('owner');
  member = person('member');
  guest = person('guest', true);
});
afterEach(async () => {
  await env.app.close();
  cleanup(env);
});
it('checks administrator permissions against the matched route, including encoded static segments', async () => {
  const headers = cookie(member);
  for (const url of [
    '/api/admin/instance',
    '/api/%61dmin/instance',
    '/%61pi/admin/instance',
    '/api/%61uth/config',
    '/api/%74unnel',
    '/api/%61dmin/prefs',
  ]) {
    const response = await env.app.inject({ url, headers });
    expect(response.statusCode, url).toBe(403);
  }
  const response = await env.app.inject({ method: 'PUT', url: '/api/%61dmin/instance', headers, payload: { membersSeeShoots: true } });
  expect(response.statusCode).toBe(403);
  expect((await env.app.inject({ url: '/api/admin/instance', headers: cookie(admin) })).json().membersSeeShoots).toBe(false);
});
it('requires second-factor verification on encoded API paths', async () => {
  setMfaPolicy(sys, 'members');
  const headers = cookie(member);
  for (const url of ['/api/photos', '/%61pi/photos', '/a%70i/photos', '/%61pi/admin/instance'])
    expect((await env.app.inject({ url, headers })).statusCode, url).toBe(403);
  expect((await env.app.inject({ method: 'POST', url: '/%61pi/collections', headers, payload: { name: 'Blocked' } })).statusCode).toBe(403);
  expect((await env.app.inject({ url: '/%61pi/me', headers })).statusCode).toBe(200);
});
it('keeps guest accounts out of encoded library routes', async () => {
  const headers = cookie(guest);
  for (const url of ['/api/photos', '/%61pi/photos', '/a%70i/photos'])
    expect((await env.app.inject({ url, headers })).statusCode, url).toBe(403);
  expect((await env.app.inject({ url: '/%61pi/me', headers })).statusCode).toBe(200);
});
it('shows no candidates through a wall-only link when the wall has no selected photos', async () => {
  setSetting(sys, 'auth', { enabled: false, providers: [], allow: [], publicUrl: '', testedBy: null });
  const a = api(env);
  fs.writeFileSync(path.join(env.lib, 'candidate.jpg'), await jpg(svg(150, 100, '#336699', '#eeeeee', [0.5, 0.3])));
  await a.scan();
  const photo = (await a.get('/api/photos')).body.photos[0];
  const col = (await a.post('/api/collections', { name: 'Private candidates', photoIds: [photo.id] })).body;
  const print = { id: 1, size: 'A4', orientation: 'landscape', photoId: null, frame: null, x: 0, y: 0 };
  await a.patch(`/api/collections/${col.id}`, { layout: { mode: 'free', prints: [print] } });
  const share = (await a.post('/api/shares', { kind: 'collection', id: col.id, onlyWall: true, allowDownload: true, allowReview: true }))
    .body;
  expect((await a.get(`/api/s/${share.token}`)).body.photos).toEqual([]);
  for (const kind of ['thumb', 'preview', 'original'])
    expect((await a.get(`/api/s/${share.token}/photos/${photo.id}/${kind}`)).status).toBe(404);
  expect((await a.post(`/api/s/${share.token}/review`, { photoId: photo.id, rating: 5 })).status).toBe(400);
});
