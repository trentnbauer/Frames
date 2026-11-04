import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb } from './db.js';
import { api, cleanup, makeEnv } from './testutil.js';

let tmp: string, lib: string, app: ReturnType<typeof buildApp>, appDb: ReturnType<typeof openDb>;
const j = async (method: string, url: string, payload?: unknown) => {
  const r = await app.inject({ method: method as any, url, payload: payload as any });
  return { status: r.statusCode, body: r.headers['content-type']?.toString().includes('json') ? r.json() : r.rawPayload, headers: r.headers };
};

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  lib = path.join(tmp, 'library', 'Roll 1');
  fs.mkdirSync(lib, { recursive: true });
  const img = (w: number, h: number, c: string) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer();
  fs.writeFileSync(path.join(lib, 'a.jpg'), await img(600, 900, '#336699'));
  fs.writeFileSync(path.join(lib, 'b.jpg'), await img(900, 600, '#993333'));
  fs.writeFileSync(path.join(lib, 'dup.jpg'), fs.readFileSync(path.join(lib, 'a.jpg'))); // same bytes as a.jpg
  fs.writeFileSync(path.join(lib, 'notes.txt'), 'ignored');
  appDb = openDb(path.join(tmp, 'data'));
  app = buildApp(appDb, { libraries: [path.join(tmp, 'library')], dataDir: path.join(tmp, 'data') });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('library', () => {
  it('reports pending files, imports them once, skips exact duplicates', async () => {
    expect((await j('GET', '/api/library/pending')).body.count).toBe(3);
    const s = (await j('POST', '/api/library/scan?wait=1')).body;
    expect(s.imported).toBe(2);
    expect(s.duplicates).toBe(1);
    expect((await j('GET', '/api/library/pending')).body.count).toBe(0);
    const list = (await j('GET', '/api/photos')).body;
    expect(list.photos).toHaveLength(2);
    const a = list.photos.find((p: any) => p.file === 'a.jpg');
    expect(a.w).toBe(600);
    expect(a.h).toBe(900);
    expect(a.hasImage).toBe(true);
  });
  it('names the new photoshoot for the import date and serves thumbnails by id', async () => {
    const shoots = (await j('GET', '/api/shoots')).body;
    expect(shoots).toHaveLength(1);
    expect(shoots[0].name).toMatch(/\d{4}/);
    const t = await j('GET', '/api/photos/1/thumb');
    expect(t.status).toBe(200);
    expect(t.headers['content-type']).toBe('image/jpeg');
    expect((await j('GET', '/api/photos/999/thumb')).status).toBe(404);
  });
  it('searches filenames and tags without AI', async () => {
    await j('PUT', '/api/photos/1/tags', { name: 'Fog' });
    expect((await j('GET', '/api/photos?q=fog')).body.photos).toHaveLength(1);
    expect((await j('GET', '/api/photos?q=b.jpg')).body.photos).toHaveLength(1);
    expect((await j('GET', '/api/photos?q=nothing')).body.photos).toHaveLength(0);
  });
});

describe('rate limit', () => {
  it('puts a ceiling per visitor on every route, but never on the health check', async () => {
    const r = await app.inject({ url: '/api/me' });
    expect(Number(r.headers['x-ratelimit-limit'])).toBeGreaterThan(1000);
    expect((await app.inject({ url: '/api/health' })).headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('the welcome tour', () => {
  it('is for a new, empty library; a library with photographs counts as already welcomed; it can be marked done and shown again', async () => {
    const e = makeEnv();
    try {
      const A = api(e);
      expect((await A.get('/api/welcome')).body).toEqual({ done: false }); // nothing in it yet
      expect((await A.put('/api/welcome', { done: true })).body).toEqual({ done: true });
      expect((await A.get('/api/welcome')).body).toEqual({ done: true });
      expect((await A.put('/api/welcome', { done: false })).body).toEqual({ done: false }); // "show me the tour again"
    } finally { e.app.close(); cleanup(e); }
    expect((await j('GET', '/api/welcome')).body).toEqual({ done: true }); // the library of the other tests already has photographs
  });
});

describe('reviews', () => {
  it('runs a session, hides nothing it should keep, and schedules the next review', async () => {
    // A photograph that has never been reviewed counts as reviewed when it was added, so it is not due straight away: one week later.
    expect((await j('GET', '/api/review/summary')).body.due).toBe(0);
    const added = appDb.prepare('SELECT added_at a, next_review_at n FROM photos LIMIT 1').get() as { a: string; n: string };
    expect(Math.round((Date.parse(added.n) - Date.parse(added.a)) / 86_400_000)).toBe(7);
    appDb.prepare('UPDATE photos SET next_review_at = added_at').run(); // a week has gone by
    expect((await j('GET', '/api/review/summary')).body.due).toBe(2);
    const s = (await j('POST', '/api/review/start')).body;
    expect(s.queue).toHaveLength(2);
    const first = s.queue[0].id;
    const r = (await j('POST', '/api/review/rate', { photoId: first, rating: 4, note: 'nice' })).body;
    expect(r.index).toBe(1);
    const p = (await j('GET', `/api/photos/${first}`)).body;
    expect(p.reviews).toHaveLength(1);
    expect(new Date(p.nextReviewAt).getTime()).toBeGreaterThan(Date.now());
    // re-rating inside the same run edits that review, not a second one
    await j('POST', '/api/review/rate', { photoId: first, rating: 5, advance: false });
    expect((await j('GET', `/api/photos/${first}`)).body.reviews).toHaveLength(1);
    expect((await j('GET', `/api/photos/${first}`)).body.reviews[0].rating).toBe(5);
  });
  it('resumes an unfinished session and rejects out-of-range ratings', async () => {
    const s = (await j('POST', '/api/review/start')).body;
    expect(s.index).toBe(1);
    expect((await j('POST', '/api/review/rate', { photoId: s.queue[1].id, rating: 9 })).status).toBe(400);
    await j('POST', '/api/review/rate', { photoId: s.queue[1].id, rating: 2 });
    await j('DELETE', '/api/review/session');
    expect((await j('GET', '/api/review/summary')).body.due).toBe(0);
  });
});

describe('collections', () => {
  it('keeps photos in the order they were added and lets them be reordered', async () => {
    const c = (await j('POST', '/api/collections', { name: 'Test set', target: { count: 2, size: 'A3', orientation: 'portrait', ppi: 300 } })).body;
    await j('PUT', `/api/collections/${c.id}/photos/2`);
    await j('PUT', `/api/collections/${c.id}/photos/1`);
    expect((await j('GET', `/api/collections/${c.id}`)).body.photoIds).toEqual([2, 1]);
    expect((await j('PATCH', `/api/collections/${c.id}`, { order: [1, 2] })).body.photoIds).toEqual([1, 2]);
  });
  it('downloads an original byte for byte, with the order prefix in the saved name', async () => {
    const r = await j('GET', '/api/photos/1/original?n=3&pad=2');
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('filename="03_a.jpg"');
    expect((r.body as Buffer).equals(fs.readFileSync(path.join(lib, 'a.jpg')))).toBe(true);
    expect(r.headers['content-length']).toBe(String(fs.statSync(path.join(lib, 'a.jpg')).size));
  });
  it('says so when the original is missing, and when the photo does not exist', async () => {
    fs.renameSync(path.join(lib, 'b.jpg'), path.join(lib, 'b.moved'));
    expect((await j('GET', '/api/photos/2/original')).status).toBe(404);
    fs.renameSync(path.join(lib, 'b.moved'), path.join(lib, 'b.jpg'));
    expect((await j('GET', '/api/photos/999/original')).status).toBe(404);
  });
  it('cannot be tricked into serving other files through the name', async () => {
    expect((await j('GET', '/api/photos/..%2F..%2Fetc%2Fpasswd/original')).status).toBe(404);
  });
});

describe('stats and recommendations', () => {
  it('answer on a small library and remember dismissals', async () => {
    const r = await j('GET', '/api/recommendations');
    expect(r.status).toBe(200);
    expect(r.body.growing).toEqual([]);
    expect((await j('POST', '/api/recommendations/dismiss', { kind: 'quiet', photoIds: [1] })).status).toBe(200);
    expect((await j('GET', '/api/recommendations')).status).toBe(200);
    const s = (await j('GET', '/api/stats')).body;
    expect(s.photos).toBe(2);
    expect(s.dist).toHaveLength(5);
  });
});

describe('settings', () => {
  it('validates and persists', async () => {
    const s = (await j('PUT', '/api/settings', { sessions: 99, ai: 'bogus', adaptive: false })).body;
    expect(s.sessions).toBe(12);
    expect(s.ai).toBe('off');
    expect(s.adaptive).toBe(false);
  });
});
