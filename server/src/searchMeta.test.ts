import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => {
  env = makeEnv(); A = api(env);
  env.db.prepare("INSERT INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
  const ins = env.db.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, w, h, file_type, size_bytes, has_derivs, added_at, camera, lens, film, aperture, iso, shutter, place) VALUES(?, 1, ?, ?, ?, ?, 10, 10, 'RAF', 1, 1, '2026-01-01T00:00:00Z', ?, ?, ?, ?, ?, ?, ?)");
  ins.run(1, '/x/DSCF4182.RAF', 'DSCF4182.RAF', 'h1', 'one', 'Fujifilm X-T5', 'XF35mmF1.4 R', '', 1.2, 400, '1/250', 'Geelong');
  ins.run(2, '/x/DSCF4190.RAF', 'DSCF4190.RAF', 'h2', 'two', 'Fujifilm X-T5', 'XF16mmF2.8', '', 2.8, 800, '1/500', 'Fremantle');
  ins.run(3, '/x/IMG_0001.JPG', 'IMG_0001.JPG', 'h3', 'three', 'Canon EOS R6', 'RF50mm F1.2', 'Kodak Gold 200', 1.2, 100, '1/125', 'Fremantle');
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('metadata search', () => {
  it('reads cameras, lenses, film, settings and places out of a query, ignoring case and punctuation', async () => {
    const r = (await A.get('/api/search/meta?q=xt5')).body;
    expect(r.chips).toContainEqual(expect.objectContaining({ kind: 'Camera', label: 'Camera: Fujifilm X-T5', param: 'camera' }));
    expect((await A.get('/api/search/meta?q=f/1.2')).body.chips).toContainEqual(expect.objectContaining({ kind: 'Aperture', label: 'Aperture: f/1.2' }));
    expect((await A.get('/api/search/meta?q=1/250')).body.chips).toContainEqual(expect.objectContaining({ kind: 'Shutter', param: 'shutter', value: '1/250' }));
    expect((await A.get('/api/search/meta?q=iso%20800')).body.chips).toContainEqual(expect.objectContaining({ kind: 'ISO', value: '800' }));
    expect((await A.get('/api/search/meta?q=kodak')).body.chips).toContainEqual(expect.objectContaining({ kind: 'Film', label: 'Film: Kodak Gold 200' }));
    expect((await A.get('/api/search/meta?q=fremantle')).body.chips).toContainEqual(expect.objectContaining({ kind: 'Place', value: 'Fremantle' }));
  });
  it('lists files whose names match partly, and nothing for a short query', async () => {
    expect((await A.get('/api/search/meta?q=dscf418')).body.files).toEqual([{ id: 1, file: 'DSCF4182.RAF', camera: 'Fujifilm X-T5', date: '2026-01-01' }]);
    expect((await A.get('/api/search/meta?q=DSCF')).body.files).toHaveLength(2);
    expect((await A.get('/api/search/meta?q=ab')).body.files).toEqual([]);
  });
  it('turns chips into filters that combine with AND', async () => {
    const ids = async (qs: string) => ((await A.get(`/api/photos?${qs}`)).body.photos as { id: number }[]).map((p) => p.id).sort();
    expect(await ids('camera=xt5')).toEqual([1, 2]);
    expect(await ids('camera=Fujifilm%20X-T5&aperture=1.2')).toEqual([1]);
    expect(await ids('aperture=1.2')).toEqual([1, 3]);
    expect(await ids('lens=rf50&iso=100')).toEqual([3]);
    expect(await ids('shutter=1/500')).toEqual([2]);
    expect(await ids('file=dscf418')).toEqual([1]);
    expect(await ids('camera=xt5&iso=100')).toEqual([]);
  });
});
