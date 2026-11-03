import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

// Controlled data: every photo has the same colours, so the only thing that differs between them is a tag.
let env: Env, A: ReturnType<typeof api>;
const id: Record<string, number> = {};
const quiet = async () => ((await A.get('/api/recommendations')).body.quiet as any[]).map((p) => p.id);

beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  for (const [n, c] of [['x', [0.2, 0.2]], ['y', [0.8, 0.8]], ['z', [0.5, 0.5]]] as const) fs.writeFileSync(path.join(env.lib, `${n}.jpg`), await jpg(svg(800, 600, '#1b4f9c', '#5dade2', [c[0], c[1]])));
  await A.scan();
  for (const p of (await A.get('/api/photos')).body.photos as any[]) id[p.file[0]] = p.id;
  const review = (p: string, s: number) => env.db.prepare("INSERT INTO reviews(photo_id, session, date, rating) VALUES(?, ?, ?, 5)").run(id[p], s, new Date().toISOString());
  for (let s = 1; s <= 4; s++) { review('x', s); review('y', s); }
  await A.put(`/api/photos/${id.x}/tags`, { name: 'sand' });
  await A.put(`/api/photos/${id.y}/tags`, { name: 'fog' });
  await A.put(`/api/photos/${id.z}/tags`, { name: 'sand' }); // unrated: only ever used to give feedback
});
afterAll(() => cleanup(env));

describe('learning from accepted and rejected recommendations', () => {
  it('starts level: equally good photos appear in library order', async () => {
    expect(await quiet()).toEqual([id.x, id.y]);
  });
  it('ranks photos like one you rejected lower', async () => {
    await A.post('/api/recommendations/feedback', { kind: 'similar', photoIds: [id.z], verdict: 'reject' });
    expect(await quiet()).toEqual([id.y, id.x]); // "sand" now counts against x
  });
  it('and ranks photos like one you accepted higher, enough to reverse it', async () => {
    for (let i = 0; i < 3; i++) await A.post('/api/recommendations/feedback', { kind: 'similar', photoIds: [id.z], verdict: 'accept' });
    expect(await quiet()).toEqual([id.x, id.y]);
  });
});
