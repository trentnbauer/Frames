import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** A picture of a room behind a composition: kept in the person's own data, re-encoded, scaled by a size reference, and never reachable from a share link. */
let env: Env, A: ReturnType<typeof api>, cid: number, photoId: number;
const dataUrl = async (w: number, h: number, type: 'jpeg' | 'png' = 'jpeg') => `data:image/${type};base64,${(await sharp({ create: { width: w, height: h, channels: 3, background: '#556677' } })[type]().toBuffer()).toString('base64')}`;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  fs.writeFileSync(path.join(env.lib, 'a.jpg'), await jpg(svg(900, 600, '#336699', '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  photoId = (await A.get('/api/photos')).body.photos[0].id;
  cid = (await A.post('/api/collections', { name: 'Living room', photoIds: [photoId] })).body.id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('the composition background', () => {
  it('has none to begin with', async () => {
    expect((await A.get(`/api/collections/${cid}`)).body.background ?? null).toBeNull();
    expect((await A.get(`/api/collections/${cid}/background`)).status).toBe(404);
  });

  it('keeps an uploaded picture as a smaller re-encoded JPEG and says how big it is', async () => {
    const r = await A.put(`/api/collections/${cid}/background`, { image: await dataUrl(3000, 2000, 'png') });
    expect(r.status).toBe(200);
    expect(r.body.background).toMatchObject({ w: 2000, h: 1333 }); // shrunk to fit 2000 pixels
    const got = await env.app.inject({ method: 'GET', url: `/api/collections/${cid}/background` });
    expect(got.statusCode).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect((await sharp(got.rawPayload).metadata()).format).toBe('jpeg');
    expect(fs.existsSync(path.join(env.cfg.dataDir, 'backgrounds', `${cid}.jpg`))).toBe(true);
    expect((await A.get(`/api/collections/${cid}`)).body.background).toMatchObject({ w: 2000, h: 1333 });
  });

  it('refuses what is not a picture, and a composition that does not exist', async () => {
    for (const bad of [{ image: 'nope' }, { image: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }, { image: `data:image/png;base64,${Buffer.from('not an image').toString('base64')}` }, {}]) expect((await A.put(`/api/collections/${cid}/background`, bad)).status).toBe(400);
    expect((await A.put('/api/collections/99999/background', { image: await dataUrl(50, 50) })).status).toBe(404);
  });

  it('stores a scale with the layout, only a sensible one', async () => {
    const col = (await A.get(`/api/collections/${cid}`)).body;
    const save = (bg: unknown) => A.patch(`/api/collections/${cid}`, { layout: { ...col.layout, bg } });
    expect((await save({ mmPerPx: 1.5 })).body.layout.bg).toEqual({ mmPerPx: 1.5 });
    expect((await save({ mmPerPx: -3 })).body.layout.bg).toBeUndefined();
    expect((await save({ mmPerPx: 'x' })).body.layout.bg).toBeUndefined();
    expect((await save({ mmPerPx: 9999 })).body.layout.bg).toBeUndefined();
  });

  it('is not served through a share link, and goes when it is removed or the composition is deleted', async () => {
    const token = (await A.post('/api/shares', { kind: 'collection', id: cid, allowDownload: false, allowReview: false })).body.token as string;
    expect(token).toBeTruthy();
    {
      const shared = await env.app.inject({ method: 'GET', url: `/api/s/${token}` });
      expect(JSON.stringify(shared.json())).not.toContain('"background"');
      expect((await env.app.inject({ method: 'GET', url: `/api/s/${token}/background` })).statusCode).toBe(404);
    }
    expect((await A.del(`/api/collections/${cid}/background`)).body.background).toBeNull();
    expect((await A.get(`/api/collections/${cid}/background`)).status).toBe(404);
    expect(fs.existsSync(path.join(env.cfg.dataDir, 'backgrounds', `${cid}.jpg`))).toBe(false);
    await A.put(`/api/collections/${cid}/background`, { image: await dataUrl(100, 80) });
    await A.del(`/api/collections/${cid}`);
    expect(fs.existsSync(path.join(env.cfg.dataDir, 'backgrounds', `${cid}.jpg`))).toBe(false);
  });
});
