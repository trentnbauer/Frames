import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

// A large archive, inserted straight into the database (no image files needed).
let env: Env, A: ReturnType<typeof api>;
const N = 20_000;
const time = async <T>(f: () => Promise<T>) => { const t = performance.now(); const r = await f(); return { r, ms: performance.now() - t }; };

beforeAll(() => {
  env = makeEnv();
  A = api(env);
  env.db.prepare("INSERT INTO shoots(name, imported_at) VALUES('Big', '2026-01-01T00:00:00Z')").run();
  const ins = env.db.prepare(`INSERT INTO photos(shoot_id, path, file, hash, title, w, h, captured_at, file_type, size_bytes, has_derivs, added_at, dhash, palette, colors, brightness)
    VALUES(1, ?, ?, ?, ?, 6000, 4000, ?, 'JPG', 1000, 1, '2026-01-01T00:00:00Z', ?, ?, ?, 0.5)`);
  const pal = JSON.stringify([{ hex: '#336699', pct: 80, name: 'blue' }]);
  env.db.transaction(() => {
    for (let i = 0; i < N; i++) {
      const hash = (i * 2654435761 >>> 0).toString(16).padStart(8, '0') + (i * 40503 >>> 0).toString(16).padStart(8, '0');
      ins.run(`/x/${i}.jpg`, `${i}.jpg`, `h${i}`, `Photo ${i}`, `2026-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00`, hash, pal, i % 3 ? ' blue ' : ' red ');
    }
  })();
  env.db.prepare("INSERT INTO reviews(photo_id, session, date, rating) SELECT id, 1, '2026-02-01', 3 + id % 3 FROM photos WHERE id % 2 = 0").run();
}, 60_000);
afterAll(() => cleanup(env));

describe(`with ${N.toLocaleString()} photographs`, () => {
  it('lists a page quickly', async () => {
    const { r, ms } = await time(() => A.get('/api/photos?limit=200'));
    expect(r.body.photos).toHaveLength(200);
    expect(r.body.total).toBe(N);
    expect(ms).toBeLessThan(800);
  });
  it('filters by date, colour, rating and text quickly', async () => {
    for (const q of ['from=2026-03-01&to=2026-03-31', 'colour=red', 'rating=4%2B', 'q=photo%201999', 'tag=nothing']) {
      const { ms } = await time(() => A.get(`/api/photos?limit=200&${q}`));
      expect(ms, q).toBeLessThan(1500);
    }
  });
  it('answers statistics and the review summary quickly', async () => {
    expect((await time(() => A.get('/api/stats'))).ms).toBeLessThan(1500);
    expect((await time(() => A.get('/api/review/summary'))).ms).toBeLessThan(800);
  });
  it('reads one photo and its image quickly', async () => {
    expect((await time(() => A.get('/api/photos/10000'))).ms).toBeLessThan(100);
  });
});
