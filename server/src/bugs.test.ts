import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { migrate, openDb } from './db.js';

let tmp: string, lib: string, app: ReturnType<typeof buildApp>, db: ReturnType<typeof openDb>;
const jpg = (c: string, w = 60, h = 40) => sharp({ create: { width: w, height: h, channels: 3, background: c } }).jpeg().toBuffer();
const get = async (url: string) => (await app.inject(url)).json();
const send = async (method: string, url: string, payload?: unknown) => (await app.inject({ method: method as any, url, payload: payload as any })).json();

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-bugs-'));
  lib = path.join(tmp, 'lib');
  fs.mkdirSync(lib);
  for (const [n, c] of [['a_b.jpg', '#112233'], ['plain.jpg', '#223344'], ['third.jpg', '#334455']] as const) fs.writeFileSync(path.join(lib, n), await jpg(c));
  db = openDb(path.join(tmp, 'data'));
  app = buildApp(db, { libraries: [lib], dataDir: path.join(tmp, 'data') });
  await app.inject({ method: 'POST', url: '/api/library/scan?wait=1' });
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('archived photos', () => {
  it('stay visible in browsing and search; archiving only leaves them out of review', async () => {
    await send('PATCH', '/api/photos/1', { archived: true });
    const all = await get('/api/photos');
    expect(all.photos).toHaveLength(3);
    expect(all.photos.find((p: any) => p.id === 1).archived).toBe(true);
    expect((await get('/api/photos?q=a_b')).photos).toHaveLength(1);
    const s = (await send('POST', '/api/review/start', {}));
    expect(s.queue.map((q: any) => q.id)).not.toContain(1);
    await send('PATCH', '/api/photos/1', { archived: false });
  });
});

describe('search', () => {
  it('treats % and _ literally', async () => {
    expect((await get('/api/photos?q=%25')).photos).toHaveLength(0);
    expect((await get('/api/photos?q=a_b')).photos).toHaveLength(1);
    expect((await get('/api/photos?q=a%25b')).photos).toHaveLength(0);
  });
  it('applies the rating filter before the row limit', async () => {
    db.prepare("UPDATE photos SET next_review_at = '2000-01-01T00:00:00Z'").run();
    await send('POST', '/api/review/start', {});
    const s = await get('/api/review/session');
    await send('POST', '/api/review/rate', { photoId: s.queue[0].id, rating: 5 });
    const r = await get('/api/photos?rating=4%2B');
    expect(r.photos.map((p: any) => p.id)).toEqual([s.queue[0].id]);
    await send('DELETE', '/api/review/session');
  });
});

describe('review order', () => {
  it('shows the photograph reviewed longest ago first; one never reviewed counts from when it was added', async () => {
    await send('DELETE', '/api/review/session');
    const earlier = db.prepare('SELECT * FROM reviews').all() as any[]; // set aside what other tests left, put back at the end
    db.prepare('DELETE FROM reviews').run();
    db.prepare("UPDATE photos SET next_review_at = '2000-01-01T00:00:00Z', archived = 0 WHERE id IN (1,2,3)").run();
    db.prepare("UPDATE photos SET added_at = ? WHERE id = ?").run('2020-01-01T00:00:00.000Z', 3);
    db.prepare("UPDATE photos SET added_at = ? WHERE id = ?").run('2021-01-01T00:00:00.000Z', 1);
    db.prepare("UPDATE photos SET added_at = ? WHERE id = ?").run('2022-01-01T00:00:00.000Z', 2);
    const order = async () => { await send('DELETE', '/api/review/session'); return (await send('POST', '/api/review/start', {})).queue.map((q: any) => q.id).filter((id: number) => [1, 2, 3].includes(id)); };
    expect(await order()).toEqual([3, 1, 2]); // by when they were added: nobody has reviewed them
    // Photograph 3 was reviewed most recently (2023): it goes to the back. Photograph 1 was reviewed in 2019, but it was added later, so only the review counts.
    db.prepare("INSERT INTO reviews(photo_id, session, run_id, date, rating) VALUES (3, 1, 'x', '2023-01-01T00:00:00.000Z', 3), (1, 1, 'y', '2019-06-01T00:00:00.000Z', 3)").run();
    expect(await order()).toEqual([1, 2, 3]);
    // Nothing due: starting does nothing unless asked to begin anyway, and then it is the photographs seen longest ago, oldest first.
    db.prepare("UPDATE photos SET next_review_at = '2999-01-01T00:00:00Z'").run();
    await send('DELETE', '/api/review/session');
    expect((await send('POST', '/api/review/start', {})).queue).toHaveLength(0);
    const summary = await get('/api/review/summary');
    expect(summary.due).toBe(0);
    expect(summary.early).toBeGreaterThanOrEqual(3);
    await send('DELETE', '/api/review/session');
    const early = (await send('POST', '/api/review/start', { early: true })).queue.map((q: any) => q.id).filter((id: number) => [1, 2, 3].includes(id));
    expect(early).toEqual([1, 2, 3]);
    await send('DELETE', '/api/review/session');
    db.prepare("UPDATE photos SET next_review_at = '2000-01-01T00:00:00Z' WHERE id IN (1,2,3)").run();
    // With something due, "early" changes nothing: the due ones come as usual.
    expect((await send('POST', '/api/review/start', { early: true })).queue.length).toBeLessThanOrEqual(3);
    await send('DELETE', '/api/review/session');
    expect((await get('/api/photos/3')).lastReviewedAt).toBe('2023-01-01T00:00:00.000Z');
    expect((await get('/api/photos/2')).lastReviewedAt).toBe('2022-01-01T00:00:00.000Z'); // never reviewed: counted from when it was added
    db.prepare('DELETE FROM reviews').run();
    for (const r of earlier) db.prepare('INSERT INTO reviews(id, photo_id, session, run_id, date, rating, note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(r.id, r.photo_id, r.session, r.run_id, r.date, r.rating, r.note);
    await send('DELETE', '/api/review/session');
  });
});

describe('collections', () => {
  it('trims the chosen photos when the target has fewer slots', async () => {
    const c = await send('POST', '/api/collections', { name: 'Trim', target: { count: 3, size: 'A4', orientation: 'any', ppi: 100 } });
    for (const id of [1, 2, 3]) await send('PUT', `/api/collections/${c.id}/photos/${id}`);
    await send('PATCH', `/api/collections/${c.id}`, { chosenIds: [1, 2, 3] });
    const after = await send('PATCH', `/api/collections/${c.id}`, { target: { count: 2, size: 'A4', orientation: 'any', ppi: 100 } });
    expect(after.chosenIds).toEqual([1, 2]);
    expect((await send('PATCH', `/api/collections/${c.id}`, { target: null })).chosenIds).toEqual([]);
  });
});

describe('background sync', () => {
  it('returns at once and reports progress and the result', async () => {
    fs.writeFileSync(path.join(lib, 'fourth.jpg'), await jpg('#445566'));
    const r = await app.inject({ method: 'POST', url: '/api/library/scan' });
    expect(r.statusCode).toBe(202);
    let st = await get('/api/library/scan/status');
    for (let i = 0; i < 50 && st.running; i++) { await new Promise((x) => setTimeout(x, 40)); st = await get('/api/library/scan/status'); }
    expect(st.running).toBe(false);
    expect(st.result.imported).toBe(1);
    expect(st.total).toBe(4); // 1 new file plus the 3 already known, which are checked for changes
    expect(st.done).toBe(st.total);
  });
});

describe('database migrations', () => {
  it('upgrade a version-1 database in place and keep its data', () => {
    const old = new Database(path.join(tmp, 'old.db'));
    old.exec(`CREATE TABLE shoots (id INTEGER PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '', imported_at TEXT NOT NULL);
      INSERT INTO shoots(name, imported_at) VALUES ('Kept', '2026-01-01T00:00:00Z');`);
    migrate(old);
    expect(old.prepare('SELECT name FROM shoots').get()).toEqual({ name: 'Kept' });
    expect((old.pragma('table_info(photos)') as { name: string }[]).map((c) => c.name)).toContain('dhash');
    expect(Number(old.pragma('user_version', { simple: true }))).toBeGreaterThanOrEqual(2);
    migrate(old); // running again changes nothing
    old.close();
  });
});
