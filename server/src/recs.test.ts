import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, A: ReturnType<typeof api>;
const id: Record<string, number> = {};
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const review = (photo: string, rating: number, session: number, date = new Date().toISOString()) =>
  env.db.prepare('INSERT INTO reviews(photo_id, session, run_id, date, rating) VALUES(?, ?, NULL, ?, ?)').run(id[photo], session, date, rating);
const list = async (kind: string) => ((await A.get('/api/recommendations')).body[kind] as any[]);

beforeAll(async () => {
  env = makeEnv();
  A = api(env);
  const w = async (name: string, buf: Buffer) => fs.writeFileSync(path.join(env.lib, name), await jpg(buf));
  // Three pictures of the same red scene (a set that "belongs together"), two blue ones, one green, one tan.
  await w('red1.jpg', svg(1200, 800, '#b71c1c', '#e53935', [0.3, 0.3]));
  await w('red2.jpg', svg(600, 400, '#b71c1c', '#e53935', [0.3, 0.3]));
  await w('red3.jpg', svg(900, 600, '#b71c1c', '#e53935', [0.34, 0.3]));
  await w('blue1.jpg', svg(800, 1200, '#1b4f9c', '#5dade2', [0.7, 0.7]));
  await w('blue2.jpg', svg(700, 1000, '#1b4f9c', '#5dade2', [0.7, 0.72]));
  await w('green1.jpg', svg(1000, 1000, '#145a32', '#58d68d', [0.5, 0.2], true));
  await w('tan1.jpg', svg(1000, 700, '#7e5109', '#f5cba7', [0.2, 0.8], true));
  await A.scan();
  for (const p of (await A.get('/api/photos')).body.photos as any[]) id[p.file.replace('.jpg', '')] = p.id;
  // Spread them over photoshoots.
  const s2 = (await A.post('/api/shoots', { name: 'Second', photoIds: [id.red2, id.blue2, id.tan1] })).body;
  expect(s2.count).toBe(3);
  env.db.prepare('UPDATE photos SET next_review_at = NULL').run();
});
afterAll(() => cleanup(env));

describe('recommendations from review history', () => {
  it('finds photographs whose ratings are improving, with where they started and ended', async () => {
    review('green1', 2, 1); review('green1', 3, 2); review('green1', 4, 3);
    const g = (await list('growing'))[0];
    expect(g).toMatchObject({ id: id.green1, from: 2, to: 4 });
  });
  it('finds consistently high ones that are in no collection, and drops them once collected', async () => {
    for (let s = 1; s <= 4; s++) review('blue1', 5, s);
    expect((await list('quiet')).map((p) => p.id)).toContain(id.blue1);
    const c = (await A.post('/api/collections', { name: 'Keepers', photoIds: [id.blue1] })).body;
    expect((await list('quiet')).map((p) => p.id)).not.toContain(id.blue1);
    await A.del(`/api/collections/${c.id}`);
    expect((await list('quiet')).map((p) => p.id)).toContain(id.blue1);
  });
  it('finds photographs that were loved but not seen for over a year', async () => {
    review('tan1', 5, 1, daysAgo(500)); review('tan1', 4, 2, daysAgo(400));
    expect((await list('forgotten')).map((p) => p.id)).toContain(id.tan1);
  });
  it('suggests archiving low-rated ones only when asked to', async () => {
    for (let s = 1; s <= 4; s++) review('red3', 1, s);
    expect(await list('archive')).toEqual([]);
    await A.put('/api/settings', { archiveSuggest: true });
    expect((await list('archive')).map((p) => p.id)).toEqual([id.red3]);
    await A.put('/api/settings', { archiveSuggest: false });
  });
});

describe('similar and complementary', () => {
  it('suggests photographs similar to the ones rated highest, not ones already liked', async () => {
    const sim = await list('similar');
    const forBlue = sim.find((b) => b.seed.id === id.blue1);
    expect(forBlue.photos[0].id).toBe(id.blue2);
    expect(forBlue.photos.map((p: any) => p.id)).not.toContain(id.blue1);
    expect(forBlue.photos[0].similarity).toBeGreaterThan(0.55);
  });
  it('suggests neighbouring or opposite colours from a different photoshoot', async () => {
    const comp = await list('complementary');
    for (const b of comp) {
      expect(['Neighbouring colours', 'Opposite colours']).toContain(b.reason);
      for (const p of b.photos) expect(p.shootId).not.toBe(b.seed.shootId);
    }
  });
});

describe('sets that belong together', () => {
  it('groups well-liked photographs from at least two photoshoots, names them, and turns into a collection', async () => {
    env.db.prepare('DELETE FROM reviews WHERE photo_id = ?').run(id.red3); // red3 is unrated again, so it can join the set
    review('red1', 4, 1); review('red2', 4, 1);
    const sets = await list('together');
    const red = sets.find((s) => s.photoIds.includes(id.red1));
    expect(red).toBeDefined();
    expect(red.photoIds).toEqual(expect.arrayContaining([id.red1, id.red2]));
    expect(red.reason).toMatch(/2 photoshoots/);
    expect((await A.get('/api/collections/suggestions')).body).toHaveLength(sets.length);
    const made = (await A.post('/api/collections', { name: red.name, photoIds: red.photoIds })).body;
    expect(made.photoIds).toEqual(red.photoIds);
  });
  it('learns: after "not for me", the set does not come back', async () => {
    const red = (await list('together')).find((s) => s.photoIds.includes(id.red1));
    await A.post('/api/recommendations/feedback', { kind: 'together', photoIds: red.photoIds, verdict: 'reject' });
    expect((await list('together')).some((s) => s.photoIds.includes(id.red1))).toBe(false);
  });
});

describe('collection insights', () => {
  it('finds repeats, alternatives that meet the target, and complementary photographs', async () => {
    const c = (await A.post('/api/collections', {
      name: 'Prints', photoIds: [id.red1, id.red2, id.tan1],
      target: { size: 'none', minWidth: 800, minHeight: 500, orientation: 'any', ppi: 300, count: 2 },
    })).body;
    const ins = (await A.get(`/api/collections/${c.id}/insights`)).body;
    // red1 and red2 are the same scene at different sizes.
    expect(ins.repetitive).toHaveLength(1);
    expect(ins.repetitive[0].photoIds.sort()).toEqual([id.red1, id.red2].sort());
    // red2 (600 px) fails the target; a similar photograph from the library does the job.
    const alt = ins.alternatives.find((a: any) => a.forId === id.red2);
    expect(alt.reason).toBe('Does not meet the target');
    expect(alt.candidates[0].id).toBe(id.red3);
    expect(alt.candidates[0].similarity).toBeGreaterThan(0.7);
    // Suggestions come from outside the collection.
    for (const p of ins.complementary) expect([id.red1, id.red2, id.tan1]).not.toContain(p.id);
    expect(ins.aiAssisted).toBe(false);
  });
});

describe('statistics', () => {
  it('reports distributions and trends', async () => {
    await A.put('/api/settings', { sessions: 6 }); // these photos have up to four sessions: with six to do, none is complete
    await A.put(`/api/photos/${id.red1}/tags`, { name: 'harbour', kind: 'subject' });
    await A.put(`/api/photos/${id.red1}/tags`, { name: 'sand' });
    const s = (await A.get('/api/stats')).body;
    expect(s.photos).toBe(7);
    expect(s.dist).toHaveLength(5);
    expect(s.dist.reduce((n: number, d: any) => n + d.n, 0)).toBeGreaterThan(10);
    expect(s.subjects).toContainEqual({ name: 'harbour', n: 1 });
    expect(s.tags.map((t: any) => t.name)).toContain('sand');
    expect(s.trend.length).toBeGreaterThan(1);
    expect(s.trend[0]).toHaveProperty('month');
    expect(s.bySession.map((b: any) => b.session)).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    expect(s.perShoot).toHaveLength(2);
    expect(s.completePct).toBe(0);
  });
});
