import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readInto } from './ingest.js';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** Default camera details: from the person's settings and from a photoshoot. They only fill blanks, and follow the default they came from. */
let env: Env, A: ReturnType<typeof api>, ids: number[], files: string[], shootA: number, shootB: number;
const dto = async (i: number) => (await A.get(`/api/photos/${ids[i]}`)).body;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  files = ['a.jpg', 'b.jpg', 'c.jpg'].map((n) => path.join(env.lib, n));
  for (const [i, f] of files.entries()) fs.writeFileSync(f, await jpg(svg(900, 600, `#33${i}699`, '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  const photos = (await A.get('/api/photos')).body.photos as any[];
  ids = files.map((f) => photos.find((p) => p.file === path.basename(f)).id);
  shootA = (await A.get(`/api/photos/${ids[0]}`)).body.shootId;
  shootB = (await A.post('/api/shoots', { name: 'Film roll' })).body.id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('camera defaults', () => {
  it('start empty, and are checked: only the four details, film only with film', async () => {
    expect((await A.get('/api/settings')).body.settings.gear).toEqual({ camera: '', lens: '', medium: '', film: '' });
    const r = await A.put('/api/settings', { gear: { camera: ' Pentax K1000 ', film: 'Portra 400', medium: 'digital', evil: 'x' } });
    expect(r.body.gear).toEqual({ camera: 'Pentax K1000', lens: '', medium: 'digital', film: '' });
    await A.put('/api/settings', { gear: { camera: '', lens: '', medium: '', film: '' } });
  });

  it('a personal default fills a blank in a photograph as it comes in, but never what the file says or a hand edit', async () => {
    await A.put('/api/settings', { gear: { camera: 'Pentax K1000', lens: 'SMC 50mm', medium: 'film', film: 'Kodak Gold 200' } });
    readInto(env.db, ids[0], {}, files[0]);
    expect(await dto(0)).toMatchObject({ camera: 'Pentax K1000', lens: 'SMC 50mm', medium: 'film', film: 'Kodak Gold 200' });
    readInto(env.db, ids[1], { Make: 'Canon', Model: 'R5' }, files[1]);
    expect(await dto(1)).toMatchObject({ camera: 'Canon R5', lens: 'SMC 50mm' }); // the file's camera stands, the blank lens is filled
    await A.patch(`/api/photos/${ids[2]}`, { camera: 'Handheld Phone' });
    readInto(env.db, ids[2], {}, files[2]);
    expect(await dto(2)).toMatchObject({ camera: 'Handheld Phone', medium: 'film' });
  });

  it('a default is followed when the file starts to say something, and is not a hand edit', async () => {
    readInto(env.db, ids[0], { Make: 'Nikon', Model: 'F3' }, files[0]);
    expect(await dto(0)).toMatchObject({ camera: 'Nikon F3', lens: 'SMC 50mm' });
    readInto(env.db, ids[0], {}, files[0]); // the file goes blank again: a camera the file once named is not wiped back to the default
    expect((await dto(0)).camera).toBe('Pentax K1000');
  });

  it('a photoshoot default wins over the personal one, reaches photographs already in it, and goes when it is removed', async () => {
    await A.patch(`/api/shoots/${shootA}`, { gear: { camera: 'Leica M6', medium: 'film', film: 'Ilford HP5' } });
    expect(await dto(0)).toMatchObject({ camera: 'Leica M6', film: 'Ilford HP5' }); // followed the default it had (the personal one)
    expect(await dto(1)).toMatchObject({ camera: 'Canon R5' }); // the file's camera is not replaced
    expect(await dto(2)).toMatchObject({ camera: 'Handheld Phone' }); // a hand edit is not replaced
    expect((await A.get('/api/shoots')).body.find((s: any) => s.id === shootA).gear).toMatchObject({ camera: 'Leica M6', film: 'Ilford HP5' });
    await A.patch(`/api/shoots/${shootA}`, { gear: { camera: '', medium: '', film: '' } });
    expect(await dto(0)).toMatchObject({ camera: '', medium: '', film: '' }); // gone with its default (the personal one is for new photographs only)
  });

  it('a photograph moved into a photoshoot takes its defaults', async () => {
    await A.patch(`/api/shoots/${shootB}`, { gear: { camera: 'Holga', medium: 'film', film: 'Fomapan 100' } });
    await A.patch(`/api/photos/${ids[0]}`, { shootId: shootB });
    expect(await dto(0)).toMatchObject({ camera: 'Holga', film: 'Fomapan 100', medium: 'film' });
    await A.patch(`/api/photos/${ids[0]}`, { medium: 'digital' });
    expect(await dto(0)).toMatchObject({ medium: 'digital', film: '', camera: 'Holga' }); // hand-set digital: no film stock
  });
});

describe('changing a shoot\'s place or camera for every photograph', () => {
  it('overwrites photographs that had their own value, only when asked', async () => {
    await A.post(`/api/shoots/${shootA}/move`, { photoIds: [ids[0], ids[1]] });
    await A.patch(`/api/photos/${ids[1]}`, { camera: 'Own Camera', place: 'Own Place' });
    await A.patch(`/api/shoots/${shootA}`, { place: 'Mill Market', gear: { camera: 'Noritsu', lens: '', medium: '', film: '' } });
    expect(await dto(1)).toMatchObject({ camera: 'Own Camera', place: 'Own Place' }); // without the flag a photograph's own value stays
    await A.patch(`/api/shoots/${shootA}`, { place: 'Mill Market', gear: { camera: 'Noritsu', lens: '', medium: '', film: '' }, overwrite: true });
    for (const k of [0, 1]) expect(await dto(k)).toMatchObject({ camera: 'Noritsu', place: 'Mill Market' });
  });
});
