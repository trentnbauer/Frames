import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** A composition's ranking: your ratings, guests' ratings through its share link, and a blend of the two. */
let env: Env, A: ReturnType<typeof api>;
let ids: number[], compId: number, token: string;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  for (const [n, c] of [['a.jpg', '#336699'], ['b.jpg', '#993333'], ['c.jpg', '#339966']] as const) fs.writeFileSync(path.join(env.lib, n), await jpg(svg(900, 600, c, '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  ids = ((await A.get('/api/photos')).body.photos as any[]).map((p) => p.id as number).sort((a, b) => a - b);
  compId = (await A.post('/api/collections', { name: 'Test', photoIds: ids })).body.id;
  const rate = (id: number, r: number) => env.db.prepare("INSERT INTO reviews(photo_id, session, run_id, date, rating) VALUES (?, 1, 'r', '2026-01-01T00:00:00.000Z', ?)").run(id, r);
  rate(ids[0], 5); rate(ids[1], 3); // ids[2] not rated by you
  const s = (await A.post('/api/shares', { kind: 'collection', id: compId, allowReview: true })).body;
  token = s.token;
});
afterAll(() => { env.app.close(); cleanup(env); });

const guest = (photoId: number, rating: number, reviewer: string) => env.app.inject({ method: 'POST', url: `/api/s/${token}/review`, payload: { photoId, rating, reviewer } });

describe('ranking a composition', () => {
  it('ranks by your rating alone until guests rate, and leaves out nothing', async () => {
    const r = (await A.get(`/api/collections/${compId}/ranking`)).body;
    expect(r).toMatchObject({ weight: 35, guests: 0 });
    expect(r.items.map((i: any) => i.id)).toEqual([ids[0], ids[1], ids[2]]);
    expect(r.items[0]).toMatchObject({ mine: 5, guest: null, score: 5 });
    expect(r.items[2]).toMatchObject({ mine: null, guest: null, score: 0 });
  });

  it('blends in what guests rated, by the weight, and counts the guests', async () => {
    await guest(ids[1], 5, 'Sam'); await guest(ids[1], 5, 'Ana'); await guest(ids[2], 4, 'Sam');
    const r = (await A.get(`/api/collections/${compId}/ranking`)).body;
    expect(r.guests).toBe(2);
    const b = r.items.find((i: any) => i.id === ids[1]);
    expect(b).toMatchObject({ mine: 3, guest: 5, guestN: 2 });
    expect(b.score).toBeCloseTo(3 * 0.65 + 5 * 0.35, 5);
    expect(r.items.find((i: any) => i.id === ids[2])).toMatchObject({ mine: null, guest: 4, score: 4 }); // only guests rated it
  });

  it('lets the weight be changed (0 to 60), and refuses anything else', async () => {
    expect((await A.put('/api/collections/guest-weight', { weight: 0 })).body.weight).toBe(0);
    expect(((await A.get(`/api/collections/${compId}/ranking`)).body.items as any[]).find((i) => i.id === ids[1]).score).toBe(3);
    for (const w of [61, -1, 'x', null]) expect((await A.put('/api/collections/guest-weight', { weight: w })).status).toBe(400);
    await A.put('/api/collections/guest-weight', { weight: 35 });
  });

  it('marks a composition printed, and reopening clears it', async () => {
    expect((await A.get(`/api/collections/${compId}`)).body.printedAt).toBeNull();
    expect((await A.patch(`/api/collections/${compId}`, { printed: true })).body.printedAt).toMatch(/^\d{4}-/);
    expect((await A.patch(`/api/collections/${compId}`, { printed: false })).body.printedAt).toBeNull();
    expect((await A.get('/api/collections/9999/ranking')).status).toBe(404);
  });
});
