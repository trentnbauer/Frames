import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { derivPath } from './ingest.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

// Turning a photograph that came in the wrong way round: its previews are made again, turned, and the original is never touched.
let env: Env, A: ReturnType<typeof api>, id: number, original: Buffer;
beforeAll(async () => {
  env = makeEnv(); A = api(env);
  original = await jpg(svg(600, 400, '#336699', '#eeeeee', [0.2, 0.3]));
  fs.writeFileSync(path.join(env.lib, 'sideways.jpg'), original);
  await A.scan();
  id = (await A.get('/api/photos')).body.photos[0].id;
});
afterAll(() => { env.app.close(); cleanup(env); });

const size = async (kind: 'thumb' | 'preview') => { const m = await sharp(derivPath(env.cfg, id, kind)).metadata(); return [m.width, m.height]; };
const photo = async () => (await A.get(`/api/photos/${id}`)).body;

describe('turning a photograph', () => {
  it('turns its previews and its size a quarter at a time, and back again', async () => {
    expect(await size('thumb')).toEqual([480, 320]);
    expect((await A.post(`/api/photos/${id}/rotate`, { by: 90 })).body).toEqual({ id, rotation: 90 });
    expect(await size('thumb')).toEqual([320, 480]);
    expect(await size('preview')).toEqual([400, 600]);
    expect(await photo()).toMatchObject({ w: 400, h: 600 });
    expect((await A.post(`/api/photos/${id}/rotate`, { by: 180 })).body.rotation).toBe(270);
    expect(await size('thumb')).toEqual([320, 480]);
    expect((await A.post(`/api/photos/${id}/rotate`, { by: 90 })).body.rotation).toBe(0);
    expect(await size('thumb')).toEqual([480, 320]);
    expect(await photo()).toMatchObject({ w: 600, h: 400 });
  });
  it('never changes the original file', () => {
    expect(fs.readFileSync(path.join(env.lib, 'sideways.jpg')).equals(original)).toBe(true);
  });
  it('refuses anything but a quarter or half turn, and a photograph that does not exist', async () => {
    for (const by of [45, '90', null, 360]) expect((await A.post(`/api/photos/${id}/rotate`, { by })).status).toBe(400);
    expect((await A.post('/api/photos/999999/rotate', { by: 90 })).status).toBe(404);
  });
});
