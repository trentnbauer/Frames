import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { derivPath } from './ingest.js';
import { runtime } from './policy.js';
import { previewSpec } from './settings.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
beforeAll(() => { env = makeEnv(); A = api(env); });
afterAll(() => { cleanup(env); runtime.previewPx = 2400; runtime.previewQuality = 90; });

it('a person chooses a preview size and quality, held to what the server allows', async () => {
  await A.put('/api/admin/instance', { previewPx: 3072, previewQuality: 88 });
  expect((await A.get('/api/settings')).body.limits).toEqual({ previewPx: 3072, previewQuality: 88 });
  await A.put('/api/settings', { previewPx: 1600, previewQuality: 80 });
  expect(previewSpec(env.db)).toEqual({ px: 1600, quality: 80 });
  await A.put('/api/settings', { previewPx: 4096, previewQuality: 95 }); // above the limits: stored, but not used
  expect(previewSpec(env.db)).toEqual({ px: 3072, quality: 88 });
  await A.put('/api/admin/instance', { previewPx: 4096, previewQuality: 95 }); // the server raises its limits: the choice now holds
  expect(previewSpec(env.db)).toEqual({ px: 4096, quality: 95 });
  await A.put('/api/settings', { previewPx: 1234, previewQuality: 12 }); // not on the lists: ignored
  expect(previewSpec(env.db)).toEqual({ px: 4096, quality: 95 });
});

const settle = async (url: string) => { for (let i = 0; i < 100; i++) { const r = (await A.get(url)).body; if (!r.running) return r; await new Promise((ok) => setTimeout(ok, 50)); } throw new Error('still running'); };
const longEdge = async (id: number) => { const m = await sharp(derivPath(env.cfg, id, 'preview')).metadata(); return Math.max(m.width ?? 0, m.height ?? 0); };

it('converts existing previews to new standards, for a person and for everyone', async () => {
  await A.put('/api/admin/instance', { previewPx: 4096, previewQuality: 95 });
  await A.put('/api/settings', { previewPx: 3072, previewQuality: 90 });
  fs.writeFileSync(path.join(env.lib, 'big.jpg'), await jpg(svg(3600, 2400, '#c0392b', '#f5b041', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  const id = ((await A.get('/api/photos')).body.photos as { id: number }[])[0].id;
  expect(await longEdge(id)).toBe(3072);
  expect((await A.get('/api/library/convert/status')).body.outdated).toBe(0);

  await A.put('/api/settings', { previewPx: 1600 }); // the person lowers their size: the preview is now out of date
  expect((await A.get('/api/library/convert/status')).body.outdated).toBe(1);
  expect((await A.post('/api/library/convert')).status).toBe(202);
  expect((await settle('/api/library/convert/status')).result).toEqual({ checked: 1, converted: 1 });
  expect(await longEdge(id)).toBe(1600);
  expect((await A.get('/api/library/convert/status')).body.outdated).toBe(0);

  await A.put('/api/admin/instance', { previewPx: 1600 }); // the server lowers its limit below a later choice
  await A.put('/api/settings', { previewPx: 2400 });
  expect((await A.get('/api/library/convert/status')).body.outdated).toBe(0); // held to 1600: nothing to change
  await A.put('/api/admin/instance', { previewPx: 4096 });
  expect((await A.get('/api/admin/convert-all')).body.outdated).toBe(1);
  expect((await A.post('/api/admin/convert-all')).status).toBe(202);
  expect((await settle('/api/admin/convert-all')).converted).toBe(1);
  expect(await longEdge(id)).toBe(2400);
});
