import { afterAll, beforeAll, expect, it } from 'vitest';
import { runtime } from './policy.js';
import { previewSpec } from './settings.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

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
