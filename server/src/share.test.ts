import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { isPublicPath } from './routes/share.js';
import { jpg, svg } from './testutil.js';

// The instance has a login. Guests have none: that is the point of a share link.
let tmp: string, lib: string, web: string, app: ReturnType<typeof buildApp>;
const owner = { authorization: 'Basic ' + Buffer.from('me:pw').toString('base64') };
const post = (url: string, payload: unknown, headers: Record<string, string> = owner) => app.inject({ method: 'POST', url, payload: payload as any, headers });
let tokenColl: string, tokenShoot: string, shareId: number, outsideId: number, insideIds: number[];

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-share-'));
  lib = path.join(tmp, 'lib'); web = path.join(tmp, 'web');
  fs.mkdirSync(lib); fs.mkdirSync(path.join(web, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(web, 'index.html'), '<!doctype html><title>Frames</title>');
  fs.writeFileSync(path.join(web, 'assets', 'app.js'), 'console.log(1)');
  const names = ['a', 'b', 'c', 'd'];
  for (const [i, n] of names.entries()) fs.writeFileSync(path.join(lib, `${n}.jpg`), await jpg(svg(600, 400, '#223344', '#88aacc', [0.2 + i * 0.2, 0.5], i % 2 === 0), { exif: { IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 51/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '151/1 12/1 0/1' } } }));
  app = buildApp(openDb(path.join(tmp, 'data')), { libraries: [lib], dataDir: path.join(tmp, 'data'), authUser: 'me', authPassword: 'pw', webDir: web });
  await app.inject({ method: 'POST', url: '/api/library/scan?wait=1', headers: owner });
  const photos = (await app.inject({ url: '/api/photos', headers: owner })).json().photos as any[];
  insideIds = photos.slice(0, 3).map((p) => p.id);
  outsideId = photos[3].id;
  const c = (await post('/api/collections', { name: 'For the client', description: 'Pick your favourites', photoIds: insideIds })).json();
  await app.inject({ method: 'PATCH', url: `/api/photos/${insideIds[0]}`, headers: owner, payload: { place: 'Secret cove', description: 'private note' } });
  const s = (await post('/api/shares', { kind: 'collection', id: c.id, allowDownload: true, allowReview: true, label: 'Client' })).json();
  tokenColl = s.token; shareId = s.id;
  const shootId = photos[0].shootId;
  tokenShoot = (await post('/api/shares', { kind: 'shoot', id: shootId, allowDownload: false, allowReview: false })).json().token;
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('who can reach what', () => {
  it('only the exact share addresses and their assets skip the login', () => {
    const t = 'abcdefghijklmnopqrstuv';
    for (const ok of [`/s/${t}`, `/s/${t}/`, `/api/s/${t}`, `/api/s/${t}/photos/3/thumb?x=1`, '/assets/index-abc123.js', '/icon.svg']) expect(isPublicPath(ok), ok).toBe(true);
    for (const no of ['/', '/library', '/api/photos', '/api/photos/1/original', '/s/', '/s/short', `/s/${t}/../api/photos`, '/s/../api/photos', '/api/s/', '/assets/../api/settings', '/assets/a/b.js', '/api/shares']) expect(isPublicPath(no), no).toBe(false);
  });
  it('everything else still needs the login, even when a share link exists', async () => {
    for (const url of ['/api/photos', '/api/settings', '/api/collections', '/api/shares', '/api/stats', `/api/photos/${insideIds[0]}/original`, '/s/../api/photos', `/s/${tokenColl}/../../api/photos`]) {
      expect((await app.inject(url)).statusCode, url).toBe(401);
    }
    expect((await app.inject({ method: 'POST', url: '/api/shares', payload: { kind: 'collection', id: 1 } })).statusCode).toBe(401);
  });
  it('serves the page shell and its scripts without the login, marked not for search engines', async () => {
    const page = await app.inject(`/s/${tokenColl}`);
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Frames');
    expect(page.headers['x-robots-tag']).toContain('noindex');
    expect((await app.inject('/assets/app.js')).statusCode).toBe(200);
  });
});

describe('what a guest sees', () => {
  it('lists the shared photographs in order, with nothing private', async () => {
    const r = await app.inject(`/api/s/${tokenColl}`);
    expect(r.statusCode).toBe(200);
    const j = r.json();
    expect(j).toMatchObject({ kind: 'collection', name: 'For the client', description: 'Pick your favourites', allowDownload: true, allowReview: true });
    expect(j.photos.map((p: any) => p.id)).toEqual(insideIds);
    expect(j.photos[0]).toEqual({ id: insideIds[0], title: expect.any(String), ar: expect.any(Number), n: 1 });
    // No location, place, description, paths, camera, shoot ids.
    const body = r.body;
    for (const secret of ['Secret cove', 'private note', 'lat', 'lon', tmp, 'camera', 'path', '33.85', 'shootId']) expect(body, secret).not.toContain(secret);
    expect(r.headers['x-robots-tag']).toContain('noindex');
  });
  it('serves previews only for photographs inside the link', async () => {
    expect((await app.inject(`/api/s/${tokenColl}/photos/${insideIds[0]}/thumb`)).statusCode).toBe(200);
    expect((await app.inject(`/api/s/${tokenColl}/photos/${insideIds[1]}/preview`)).headers['content-type']).toBe('image/jpeg');
    expect((await app.inject(`/api/s/${tokenColl}/photos/${outsideId}/thumb`)).statusCode).toBe(404);
    expect((await app.inject(`/api/s/${tokenColl}/photos/${outsideId}/original`)).statusCode).toBe(404);
  });
  it('lets a photoshoot link show that whole photoshoot', async () => {
    const j = (await app.inject(`/api/s/${tokenShoot}`)).json();
    expect(j.kind).toBe('shoot');
    expect(j.photos).toHaveLength(4);
  });
  it('does not reveal whether a token is close, and says unknown links are unknown', async () => {
    expect((await app.inject('/api/s/AAAAAAAAAAAAAAAAAAAAAA')).statusCode).toBe(404);
    expect((await app.inject('/api/s/x')).statusCode).toBe(401); // too short to be a link at all, so not public
    expect((await app.inject(`/api/s/${tokenColl.slice(0, -1)}X`)).json().error).toBe('This link does not exist');
  });
});

describe('downloads', () => {
  it('give the untouched original, in order, when the link allows it', async () => {
    const file = ((await app.inject({ url: '/api/photos', headers: owner })).json().photos as any[]).find((p) => p.id === insideIds[1]).file as string;
    const r = await app.inject(`/api/s/${tokenColl}/photos/${insideIds[1]}/original?n=2&pad=2`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toContain(`filename="02_${file}"`);
    expect(r.rawPayload.equals(fs.readFileSync(path.join(lib, file)))).toBe(true);
  });
  it('are refused when the link does not allow them', async () => {
    const r = await app.inject(`/api/s/${tokenShoot}/photos/${insideIds[0]}/original`);
    expect(r.statusCode).toBe(403);
    expect(r.json().error).toMatch(/not allowed/);
    expect((await app.inject(`/api/s/${tokenShoot}/photos/${insideIds[0]}/preview`)).statusCode).toBe(200); // looking is allowed
  });
});

describe('guest reviews', () => {
  const rate = (payload: object, tok = tokenColl) => post(`/api/s/${tok}/review`, payload, {});
  it('are saved with a name and a note, and replace that person’s earlier rating', async () => {
    expect((await rate({ photoId: insideIds[0], rating: 4, reviewer: 'Sam', note: 'Love the light' })).statusCode).toBe(200);
    expect((await rate({ photoId: insideIds[0], rating: 5, reviewer: 'Sam' })).statusCode).toBe(200);
    expect((await rate({ photoId: insideIds[0], rating: 2, reviewer: 'Alex' })).statusCode).toBe(200);
    expect((await rate({ photoId: insideIds[1], rating: 3 })).statusCode).toBe(200);
    const r = (await app.inject({ url: `/api/shares/${shareId}/reviews`, headers: owner })).json();
    const first = r.find((p: any) => p.photoId === insideIds[0]);
    expect(first.n).toBe(2);
    expect(first.avg).toBe(3.5);
    expect(first.entries.map((e: any) => [e.reviewer, e.rating])).toEqual([['Sam', 5], ['Alex', 2]]);
    expect(r.find((p: any) => p.photoId === insideIds[1]).entries[0].reviewer).toBe('Guest');
  });
  it('never touch the owner’s own ratings or review schedule', async () => {
    const p = (await app.inject({ url: `/api/photos/${insideIds[0]}`, headers: owner })).json();
    expect(p.reviews).toEqual([]);
    expect(p.reviewCount).toBe(0);
  });
  it('are validated: rating range, photo in the link, and only where reviews are on', async () => {
    expect((await rate({ photoId: insideIds[0], rating: 9 })).statusCode).toBe(400);
    expect((await rate({ photoId: insideIds[0], rating: 0 })).statusCode).toBe(400);
    expect((await rate({ photoId: outsideId, rating: 3 })).statusCode).toBe(400);
    expect((await rate({ photoId: insideIds[0], rating: 3 }, tokenShoot)).statusCode).toBe(403);
  });
  it('cannot be sent from another website', async () => {
    const r = await post(`/api/s/${tokenColl}/review`, { photoId: insideIds[0], rating: 1 }, { origin: 'https://evil.example', host: 'frames.local' });
    expect(r.statusCode).toBe(403);
  });
  it('trim long names and notes', async () => {
    await rate({ photoId: insideIds[2], rating: 3, reviewer: 'N'.repeat(300), note: 'x'.repeat(5000) });
    const r = (await app.inject({ url: `/api/shares/${shareId}/reviews`, headers: owner })).json().find((p: any) => p.photoId === insideIds[2]);
    expect(r.entries[0].reviewer).toHaveLength(60);
    expect(r.entries[0].note).toHaveLength(1000);
  });
});

describe('managing links', () => {
  it('lists links with their status and counts', async () => {
    const list = (await app.inject({ url: '/api/shares', headers: owner })).json();
    const c = list.find((s: any) => s.id === shareId);
    expect(c).toMatchObject({ status: 'active', allowDownload: true, allowReview: true, label: 'Client' });
    expect(c.views).toBeGreaterThan(0);
    expect(c.downloads).toBeGreaterThan(0);
    expect(c.reviews).toBeGreaterThan(0);
  });
  it('makes links hard to guess and refuses a past expiry', async () => {
    expect(tokenColl).toMatch(/^1_[A-Za-z0-9_-]{22}$/);
    expect(new Set([tokenColl, tokenShoot]).size).toBe(2);
    expect((await post('/api/shares', { kind: 'collection', id: 1, expiresAt: '2001-01-01' })).statusCode).toBe(400);
    expect((await post('/api/shares', { kind: 'nonsense', id: 1 })).statusCode).toBe(400);
    expect((await post('/api/shares', { kind: 'collection', id: 9999 })).statusCode).toBe(404);
  });
  it('stops working once it expires', async () => {
    const t = (await post('/api/shares', { kind: 'collection', id: 1, expiresAt: new Date(Date.now() + 86_400_000).toISOString() })).json();
    expect((await app.inject(`/api/s/${t.token}`)).statusCode).toBe(200);
    new (await import('better-sqlite3')).default(path.join(tmp, 'data', 'frames.db')).prepare("UPDATE shares SET expires_at = '2020-01-01T00:00:00Z' WHERE id = ?").run(t.id);
    const r = await app.inject(`/api/s/${t.token}`);
    expect(r.statusCode).toBe(410);
    expect(r.json().error).toMatch(/expired/);
    expect((await app.inject({ url: '/api/shares', headers: owner })).json().find((s: any) => s.id === t.id).status).toBe('expired');
  });
  it('is switched off at once by revoking, but keeps what guests said', async () => {
    const r = await app.inject({ method: 'DELETE', url: `/api/shares/${shareId}`, headers: owner });
    expect(r.json().status).toBe('revoked');
    for (const url of [`/api/s/${tokenColl}`, `/api/s/${tokenColl}/photos/${insideIds[0]}/thumb`, `/api/s/${tokenColl}/photos/${insideIds[0]}/original`]) expect((await app.inject(url)).statusCode, url).toBe(410);
    expect((await rateAgain()).statusCode).toBe(410);
    expect(((await app.inject({ url: `/api/shares/${shareId}/reviews`, headers: owner })).json() as any[]).length).toBeGreaterThan(0);
  });
  const rateAgain = () => post(`/api/s/${tokenColl}/review`, { photoId: insideIds[0], rating: 5 }, {});
});

describe('guessing and abuse', () => {
  it('rate-limits repeated wrong guesses', async () => {
    let limited = 0;
    for (let i = 0; i < 40; i++) if ((await app.inject(`/api/s/${'Z'.repeat(21)}${i % 10}`)).statusCode === 429) limited++;
    expect(limited).toBeGreaterThan(0);
  });
});
