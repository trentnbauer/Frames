import fs from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, a: ReturnType<typeof api>, id: number, shootId: number, file: string;
beforeEach(async () => {
  env = makeEnv(); a = api(env);
  file = env.lib + '/keep.jpg';
  fs.writeFileSync(file, await jpg(svg(200, 140, '#345678', '#aabbcc', [0.3, 0.5])));
  await a.scan();
  const photo = (await a.get('/api/photos')).body.photos[0];
  id = photo.id; shootId = photo.shootId;
});
afterEach(async () => { await env.app.close(); cleanup(env); });

const protect = (on: boolean) => a.patch(`/api/shoots/${shootId}`, { protected: on });
const shoot = async () => ((await a.get('/api/shoots')).body as any[]).find((s) => s.id === shootId);

it('shows the flag in the shoot API, and only accepts true or false', async () => {
  expect((await shoot()).protected).toBe(false);
  expect((await protect(true)).status).toBe(200);
  expect((await shoot()).protected).toBe(true);
  expect((await a.patch(`/api/shoots/${shootId}`, { protected: 'yes' })).status).toBe(400);
  expect((await protect(false)).status).toBe(200);
  expect((await shoot()).protected).toBe(false);
});

it('refuses to remove a protected shoot until it is unprotected', async () => {
  await protect(true);
  expect((await a.del(`/api/shoots/${shootId}`)).status).toBe(409);
  expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
  await protect(false);
  expect((await a.del(`/api/shoots/${shootId}`)).status).toBe(200);
});

it('skips the photographs of a protected shoot when removing photographs directly', async () => {
  await protect(true);
  const r = await a.post('/api/photos/remove', { ids: [id], originals: 'keep' });
  expect(r.status).toBe(200);
  expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
  await protect(false);
  await a.post('/api/photos/remove', { ids: [id], originals: 'keep' });
  expect((await a.get('/api/photos')).body.photos).toEqual([]);
  expect(fs.existsSync(file)).toBe(true);
});

it('leaves a protected shoot out of low-rating suggestions, automatic removal and bin votes', async () => {
  await a.put('/api/settings', { sessions: 2, archiveSuggest: true, autoRemoveAfter: 1, autoRemoveBelow: 2, deleteBelow: 2, binVotes: 1 });
  for (let i = 0; i < 2; i++) env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating) VALUES(?,?,NULL,?,1)').run(id, i + 1, new Date().toISOString());
  expect((await a.get('/api/photos/delete-suggestions')).body.photos).toHaveLength(1);
  await protect(true);
  expect((await a.get('/api/photos/delete-suggestions')).body.photos).toEqual([]);
  await a.put('/api/settings', { autoRemove: true });
  await a.post('/api/review/start', { photoIds: [id] });
  expect((await a.post('/api/review/rate', { photoId: id, bin: true })).status).toBe(200);
  expect((await a.get('/api/photos')).body.photos).toHaveLength(1); // not removed by the bin vote or by automatic removal
});

it('takes a bin-voted photograph in a protected shoot out of review instead of scheduling it again', async () => {
  await a.put('/api/settings', { sessions: 5, binVotes: 1 });
  await protect(true);
  await a.post('/api/review/start', { photoIds: [id] });
  expect((await a.post('/api/review/rate', { photoId: id, bin: true })).status).toBe(200);
  expect((await a.get('/api/photos')).body.photos).toHaveLength(1); // protection kept it
  expect((await a.get('/api/review/session')).body.queue).toEqual([]);
  expect((env.db.prepare('SELECT next_review_at n FROM photos WHERE id = ?').get(id) as { n: string | null }).n).toBeNull();
});
