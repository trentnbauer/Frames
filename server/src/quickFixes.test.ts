import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
import { searchWords } from './searchWords.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => {
  env = makeEnv(); A = api(env);
  env.db.exec("INSERT INTO shoots(id,name,imported_at) VALUES(1,'Coast','2026-01-01'),(2,'Elsewhere','2026-01-01')");
  const insert = env.db.prepare("INSERT INTO photos(id,shoot_id,path,file,hash,title,w,h,file_type,size_bytes,added_at,captured_at,place) VALUES(?,?,?,?,?, ?,1200,800,'JPEG',1,'2026-01-01','2026-01-01T12:00:00Z',?)");
  insert.run(1, 1, '/one.jpg', 'one.jpg', 'one', 'First', 'Cape Schanck');
  insert.run(2, 1, '/two.jpg', 'two.jpg', 'two', 'Second', 'Elsewhere');
  insert.run(3, 2, '/three.jpg', 'three.jpg', 'three', 'Third', 'Cape Schanck');
  env.db.exec("INSERT INTO tags(photo_id,name,kind,source,accepted) VALUES(1,'milky way','tag','user',1),(2,'milky way','tag','user',1),(3,'milky way','tag','ai',0)");
});
afterAll(async () => { await env.app.close(); cleanup(env); });

describe('subject at place searches', () => {
  it('combines accepted tags and multiword places without requiring the connector in the photo', async () => {
    for (const query of ['milky way at cape schanck', 'Milky Way at the Cape Schanck', 'milky way in cape schanck']) {
      const r = await A.get(`/api/photos?q=${encodeURIComponent(query)}`);
      expect(r.body.photos.map((p: { id: number }) => p.id)).toEqual([1]);
    }
  });
  it('keeps standalone words and ordinary keyword queries literal', () => {
    expect(searchWords('at')).toEqual(['at']);
    expect(searchWords('atlantis')).toEqual(['atlantis']);
    expect(searchWords('fujifilm x-t5')).toEqual(['fujifilm', 'x-t5']);
  });
});

describe('photoshoot date propagation', () => {
  it('sets all photos in the selected shoot, preserves camera dates, and leaves other shoots untouched', async () => {
    const r = await A.patch('/api/shoots/1', { photoDate: '2025-06-02' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ dateFrom: '2025-06-02', dateTo: '2025-06-02' });
    expect(env.db.prepare('SELECT id,date_edit,captured_at FROM photos ORDER BY id').all()).toEqual([
      { id: 1, date_edit: '2025-06-02', captured_at: '2026-01-01T12:00:00Z' },
      { id: 2, date_edit: '2025-06-02', captured_at: '2026-01-01T12:00:00Z' },
      { id: 3, date_edit: null, captured_at: '2026-01-01T12:00:00Z' },
    ]);
    const repeat = await A.patch('/api/shoots/1', { photoDate: '2025-06-02' });
    expect(repeat.status).toBe(200);
  });
  it('rejects invalid dates before applying any other requested edits', async () => {
    for (const photoDate of ['2025-02-30', '2025-13-01', '', null, {}, '2025-01-01T12:00:00Z']) {
      expect((await A.patch('/api/shoots/1', { photoDate, name: 'Should not change' })).status).toBe(400);
    }
    expect((await A.get('/api/shoots/1')).body.name).toBe('Coast');
  });
});

describe('the manual portfolio selection', () => {
  it('keeps the automatic backing list out of compositions and exposes its photos in portfolio settings', async () => {
    const add = await A.post('/api/portfolio/photos/1', { on: true });
    expect(add.status).toBe(200);
    const portfolioId = add.body.collectionId;
    expect((await A.get('/api/portfolio/marks')).body.hand).toContain(1);
    expect((await A.get('/api/collections')).body.some((c: { id: number }) => c.id === portfolioId)).toBe(false);
    // Existing bookmarks still work and normal compositions are not hidden just because they supply the portfolio.
    expect((await A.get(`/api/collections/${portfolioId}`)).status).toBe(200);
    await A.patch(`/api/collections/${portfolioId}`, { layout: { mode: 'free', prints: [{ id: 1, size: 'A3', orientation: 'landscape', frame: null, photoId: 1, stack: false, photoId2: null, x: 0, y: 0 }] } });
    expect((await A.get('/api/collections')).body.some((c: { id: number }) => c.id === portfolioId)).toBe(false);
    const normal = (await A.post('/api/collections', { name: 'A real wall' })).body;
    await A.put('/api/portfolio', { collectionId: normal.id });
    expect((await A.get('/api/collections')).body.some((c: { id: number }) => c.id === normal.id)).toBe(true);
  });
});
