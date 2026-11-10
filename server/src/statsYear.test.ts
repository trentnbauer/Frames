import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => {
  env = makeEnv(); A = api(env);
  env.db.prepare("INSERT INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
  const ins = env.db.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, w, h, file_type, size_bytes, has_derivs, added_at, captured_at) VALUES(?, 1, ?, ?, ?, 't', 10, 10, 'JPG', 1000, 1, ?, ?)");
  ins.run(1, '/x/a', 'a', 'h1', '2026-02-01T00:00:00Z', '2025-03-01T00:00:00Z');
  ins.run(2, '/x/b', 'b', 'h2', '2026-02-01T00:00:00Z', '2026-03-01T00:00:00Z');
  const rv = env.db.prepare("INSERT INTO reviews(photo_id, session, date, rating) VALUES(?, 1, ?, ?)");
  rv.run(1, '2025-04-01', 2); rv.run(2, '2026-04-01', 5);
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('stats by year', () => {
  it('covers everything for all time, and one year when asked', async () => {
    const all = (await A.get('/api/stats')).body;
    expect(all).toMatchObject({ photos: 2, years: ['2026', '2025'], year: '' });
    expect(all.avgRating).toBe(3.5);
    const y26 = (await A.get('/api/stats?year=2026')).body;
    expect(y26).toMatchObject({ photos: 1, year: '2026', avgRating: 5 });
    expect(y26.dist.find((d: any) => d.value === 5).n).toBe(1);
    expect(y26.trend).toEqual([{ month: '2026-04', avg: 5, n: 1 }]);
    expect((await A.get('/api/stats?year=1999')).body).toMatchObject({ photos: 0, avgRating: 0 });
    expect((await A.get('/api/stats?year=abc')).body.photos).toBe(2); // not a year: ignored
  });
});
