import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

// "Edit shoot": what the shoot says goes to every photograph in it, and to photographs added to it later, over what they had.
let env: Env, A: ReturnType<typeof api>;
const ids: Record<string, number> = {};
beforeAll(async () => {
  env = makeEnv(); A = api(env);
  const colours = [['#336699', '#eeeeee'], ['#993322', '#111111'], ['#22aa55', '#ffee00']];
  for (const [i, n] of ['a.jpg', 'b.jpg', 'later.jpg'].entries()) fs.writeFileSync(path.join(env.lib, n), await jpg(svg(600, 400, colours[i][0], colours[i][1], [0.2 + i * 0.2, 0.4])));
  await A.scan();
  for (const p of (await A.get('/api/photos')).body.photos as any[]) ids[p.file] = p.id;
});
afterAll(() => { env.app.close(); cleanup(env); });

const photo = async (f: string) => (await A.get(`/api/photos/${ids[f]}`)).body;

describe('editing a shoot', () => {
  it('gives every photograph its place, date, camera and added tags, over what each had', async () => {
    await A.patch(`/api/photos/${ids['a.jpg']}`, { camera: 'Canon AE-1', place: 'Somewhere else' });
    const s = (await A.post('/api/shoots', { name: 'Coast', photoIds: [ids['a.jpg'], ids['b.jpg']] })).body;
    const r = await A.patch(`/api/shoots/${s.id}`, { overwrite: true, name: 'Coast walk', photoDate: '2024-05-04', place: 'Fremantle', placeInfo: { lat: -32.05, lon: 115.75 }, gear: { camera: 'Pentax 67', lens: '105mm', medium: 'film', film: 'Portra 400' }, tags: ['sea'] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ name: 'Coast walk', place: 'Fremantle', tags: ['sea'] });
    for (const f of ['a.jpg', 'b.jpg']) {
      const p = await photo(f);
      expect(p, f).toMatchObject({ place: 'Fremantle', camera: 'Pentax 67', lens: '105mm', film: 'Portra 400', dateEdit: '2024-05-04' });
      expect(p.tags.some((t: any) => t.name === 'sea' && t.accepted)).toBe(true);
    }
    ids.shoot = s.id;
  });
  it('puts the shoot’s camera and lens back on a photograph that was changed, when the shoot is saved again unchanged', async () => {
    await A.patch(`/api/photos/${ids['a.jpg']}`, { camera: 'Leica M6', lens: '35mm' });
    expect(await photo('a.jpg')).toMatchObject({ camera: 'Leica M6', lens: '35mm' });
    await A.patch(`/api/shoots/${ids.shoot}`, { overwrite: true, gear: { camera: 'Pentax 67', lens: '105mm', medium: 'film', film: 'Portra 400' } });
    expect(await photo('a.jpg')).toMatchObject({ camera: 'Pentax 67', lens: '105mm', film: 'Portra 400' });
  });
  it('gives a photograph moved into it the shoot’s place and camera, over its own', async () => {
    await A.patch(`/api/photos/${ids['later.jpg']}`, { camera: 'Nikon F3', place: 'Perth' });
    await A.post(`/api/shoots/${ids.shoot}/move`, { photoIds: [ids['later.jpg']] });
    expect(await photo('later.jpg')).toMatchObject({ place: 'Fremantle', camera: 'Pentax 67', lens: '105mm' });
  });
});
