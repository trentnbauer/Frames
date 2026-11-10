import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hemisphere, monthsOf, seasonOf } from './seasons.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

describe('seasons', () => {
  it('flips between hemispheres', () => {
    expect(seasonOf(12, 'north')).toBe('winter');
    expect(seasonOf(12, 'south')).toBe('summer');
    expect(seasonOf(4, 'north')).toBe('spring');
    expect(seasonOf(4, 'south')).toBe('autumn');
    expect(monthsOf('summer', 'south')).toEqual([1, 2, 12]);
  });
  it('takes the hemisphere from the country, with an override, and no seasons near the equator', () => {
    expect(hemisphere('Australia', 'auto')).toBe('south');
    expect(hemisphere('new zealand', 'auto')).toBe('south');
    expect(hemisphere('Canada', 'auto')).toBe('north');
    expect(hemisphere('', 'auto')).toBe('north');
    expect(hemisphere('Indonesia', 'auto')).toBe('none');
    expect(hemisphere('Australia', 'north')).toBe('north');
    expect(hemisphere('Canada', 'off')).toBe('none');
  });
});

describe('a photograph’s date and the season filter', () => {
  let env: Env, A: ReturnType<typeof api>, id: number;
  beforeAll(async () => {
    env = makeEnv();
    A = api(env);
    env.db.prepare("INSERT INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
    env.db.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, w, h, file_type, size_bytes, has_derivs, added_at, captured_at) VALUES(1, 1, '/x/a.jpg', 'a.jpg', 'h1', 'a', 10, 10, 'JPG', 1, 1, '2026-07-01T00:00:00Z', '2026-07-04T10:00:00Z')").run();
    id = 1;
  });
  afterAll(() => { env.app.close(); cleanup(env); });
  it('can be edited by hand, and reset to the camera date', async () => {
    expect((await A.get(`/api/photos/${id}`)).body).toMatchObject({ capturedAt: '2026-07-04T10:00:00Z', dateEdit: null });
    expect((await A.patch(`/api/photos/${id}`, { dateEdit: '2026-12-25' })).body.dateEdit).toBe('2026-12-25');
    expect((await A.patch(`/api/photos/${id}`, { dateEdit: 'tomorrow' })).status).toBe(400);
    expect((await A.patch(`/api/photos/${id}`, { dateEdit: null })).body.dateEdit).toBeNull();
  });
  it('filters by season in the person’s hemisphere', async () => {
    await A.put('/api/profile', { country: 'Australia' });
    expect((await A.get('/api/photos?season=winter')).body.photos.map((p: any) => p.id)).toEqual([1]); // July is winter in the south
    expect((await A.get('/api/photos?season=summer')).body.photos).toHaveLength(0);
    await A.put('/api/profile', { country: 'Canada' });
    expect((await A.get('/api/photos?season=summer')).body.photos.map((p: any) => p.id)).toEqual([1]);
    await A.patch(`/api/photos/${id}`, { dateEdit: '2026-01-10' });
    expect((await A.get('/api/photos?season=winter')).body.photos.map((p: any) => p.id)).toEqual([1]); // the edited date counts
    await A.put('/api/profile', { seasons: 'off' });
    expect((await A.get('/api/photos?season=winter')).body.photos).toHaveLength(1); // no seasons: the filter is ignored
    expect((await A.put('/api/profile', { seasons: 'sideways' })).status).toBe(400);
  });
});
