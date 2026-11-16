import fs from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, a: ReturnType<typeof api>, id: number, file: string;
beforeEach(async () => {
  env = makeEnv(); a = api(env);
  file = env.lib + '/bin.jpg';
  fs.writeFileSync(file, await jpg(svg(200, 140, '#345678', '#aabbcc', [0.3, 0.5])));
  await a.scan();
  id = (await a.get('/api/photos')).body.photos[0].id;
});
afterEach(async () => { await env.app.close(); cleanup(env); });

const vote = async (bin: boolean) => {
  await a.post('/api/review/start', { photoIds: [id] });
  return a.post('/api/review/rate', bin ? { photoId: id, bin: true } : { photoId: id, rating: 3 });
};

it('counts a bin vote as the lowest rating, and removes the photograph after the set number of votes (3 by default), keeping the file', async () => {
  expect(JSON.stringify((await a.get('/api/settings')).body)).toContain('"binVotes":3');
  for (let i = 0; i < 2; i++) { env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating,bin) VALUES(?,?,NULL,?,1,1)').run(id, i + 1, new Date().toISOString()); }
  expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
  expect((await vote(true)).status).toBe(200); // the third bin vote
  expect((await a.get('/api/photos')).body.photos).toEqual([]);
  expect(fs.existsSync(file)).toBe(true);
  expect((await a.get('/api/recovery')).body).toHaveLength(1); // it can be recovered
});

it('does not remove on ordinary ratings, on fewer votes, or when the setting is off', async () => {
  expect((await vote(false)).status).toBe(200);
  expect((await vote(true)).status).toBe(200); // one bin vote of three
  expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
  expect(env.db.prepare('SELECT rating, bin FROM reviews ORDER BY id').all()).toEqual([{ rating: 3, bin: 0 }, { rating: 1, bin: 1 }]); // a bin vote is stored as a 1
  await a.put('/api/settings', { binVotes: 0 });
  for (let i = 0; i < 4; i++) env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating,bin) VALUES(?,?,NULL,?,1,1)').run(id, i + 5, new Date().toISOString());
  expect((await vote(true)).status).toBe(200);
  expect((await a.get('/api/photos')).body.photos).toHaveLength(1);
});

it('only accepts a number from 0 to 10 for the setting', async () => {
  expect((await a.put('/api/settings', { binVotes: 5 })).status).toBe(200);
  expect(JSON.stringify((await a.get('/api/settings')).body)).toContain('"binVotes":5');
  for (const bad of [-1, 11, 2.5, '3', null]) expect((await a.put('/api/settings', { binVotes: bad })).status).toBe(400);
});
