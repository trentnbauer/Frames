import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDb, migrate } from './db.js';
import { readInto } from './ingest.js';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** Camera details: read from the file as numbers, editable by hand, kept when the file is read again. */
let env: Env, A: ReturnType<typeof api>, id: number, file: string;
const dto = async () => (await A.get(`/api/photos/${id}`)).body;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  file = path.join(env.lib, 'a.jpg');
  fs.writeFileSync(file, await jpg(svg(900, 600, '#336699', '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  id = (await A.get('/api/photos')).body.photos[0].id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('camera details', () => {
  it('are read from the file as numbers, with the shutter as a fraction, or as seconds when slow', async () => {
    readInto(env.db, id, { Make: 'Canon', Model: 'R5', LensModel: 'RF 50mm', ISO: 400, FNumber: 2.8, ExposureTime: 0.004, FocalLength: 50 }, file);
    expect(await dto()).toMatchObject({ camera: 'Canon R5', lens: 'RF 50mm', iso: 400, aperture: 2.8, shutter: '1/250', focalMm: 50, exposure: '1/250s · f/2.8 · ISO 400', medium: '', film: '' });
    readInto(env.db, id, { ISO: 100, ExposureTime: 2 }, file);
    expect(await dto()).toMatchObject({ shutter: '2', exposure: '2s · ISO 100', aperture: null });
  });

  it('can be set by hand, and refuse nonsense', async () => {
    expect((await A.patch(`/api/photos/${id}`, { camera: 'Pentax K1000', lens: 'SMC 50mm f/2', medium: 'film', film: 'Kodak Gold 200', iso: 200, aperture: 4, shutter: '1/125', focalMm: 50 })).status).toBe(200);
    expect(await dto()).toMatchObject({ camera: 'Pentax K1000', lens: 'SMC 50mm f/2', medium: 'film', film: 'Kodak Gold 200', iso: 200, aperture: 4, shutter: '1/125', focalMm: 50, exposure: '1/125s · f/4 · ISO 200' });
    for (const bad of [{ iso: 0 }, { iso: 'x' }, { aperture: 500 }, { shutter: 'fast' }, { shutter: '1/0x' }, { focalMm: -1 }, { medium: 'polaroid' }, { camera: 5 }, { film: {} }]) expect((await A.patch(`/api/photos/${id}`, bad)).status).toBe(400);
    expect(await dto()).toMatchObject({ iso: 200, medium: 'film' }); // a refused change changes nothing
  });

  it('keep what was typed when the file is read again, and a blank clears', async () => {
    readInto(env.db, id, { Make: 'Canon', Model: 'R5', ISO: 6400, FNumber: 1.4, ExposureTime: 0.001, latitude: 1, longitude: 2 }, file);
    expect(await dto()).toMatchObject({ camera: 'Pentax K1000', iso: 200, aperture: 4, shutter: '1/125', lat: 1, lon: 2 }); // the map pin was never set by hand
    await A.patch(`/api/photos/${id}`, { lat: 10, lon: 20, lens: '' });
    readInto(env.db, id, { LensModel: 'Other', latitude: 1, longitude: 2 }, file);
    expect(await dto()).toMatchObject({ lens: '', lat: 10, lon: 20 });
    await A.patch(`/api/photos/${id}`, { medium: 'digital' });
    expect(await dto()).toMatchObject({ medium: 'digital', film: '' }); // film goes when it is no longer film
  });

  it('are worked out for existing photographs from the exposure text they already have', () => {
    const db = openDb(fs.mkdtempSync(path.join(os.tmpdir(), 'frames-gear-')));
    db.prepare("INSERT INTO shoots(id, name, imported_at) VALUES(1, 's', '2026-01-01')").run();
    db.prepare("INSERT INTO photos(id, shoot_id, path, file, hash, title, file_type, size_bytes, added_at, exposure) VALUES(1, 1, 'a.jpg', 'a.jpg', 'h', 'a', 'jpg', 1, '2026-01-01', '1/250s · f/2.8 · ISO 800')").run();
    db.pragma('user_version = 18'); // the step before the numbers were stored
    migrate(db);
    expect(db.prepare('SELECT iso, aperture, shutter FROM photos WHERE id = 1').get()).toEqual({ iso: 800, aperture: 2.8, shutter: '1/250' });
    db.close();
  });

  it('lists the cameras, lenses and film stocks in use', async () => {
    await A.patch(`/api/photos/${id}`, { medium: 'film', film: 'Ilford HP5' });
    const g = (await A.get('/api/gear')).body;
    expect(g.cameras).toEqual([{ name: 'Pentax K1000', n: 1 }]);
    expect(g.films).toEqual([{ name: 'Ilford HP5', n: 1 }]);
  });
});
