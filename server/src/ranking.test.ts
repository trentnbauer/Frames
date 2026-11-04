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

  it('reports what guests thought of one photograph', async () => {
    expect((await A.get(`/api/photos/${ids[1]}/guests`)).body).toEqual({ avg: 5, n: 2 });
    expect((await A.get(`/api/photos/${ids[0]}/guests`)).body).toEqual({ avg: null, n: 0 });
    expect((await A.get('/api/photos/9999/guests')).status).toBe(404);
  });

  it('lets the weight be changed (0 to 60), and refuses anything else', async () => {
    expect((await A.put('/api/collections/guest-weight', { weight: 0 })).body.weight).toBe(0);
    expect(((await A.get(`/api/collections/${compId}/ranking`)).body.items as any[]).find((i) => i.id === ids[1]).score).toBe(3);
    for (const w of [61, -1, 'x', null]) expect((await A.put('/api/collections/guest-weight', { weight: w })).status).toBe(400);
    await A.put('/api/collections/guest-weight', { weight: 35 });
  });

  it('starts a review session of just chosen photographs, replacing an unfinished one, and ignores ones that do not exist', async () => {
    const s = (await A.post('/api/review/start', { photoIds: [ids[2], ids[0], 9999, ids[2]] })).body;
    expect(s.queue.map((q: any) => q.id)).toEqual([ids[2], ids[0]]);
    const t = (await A.post('/api/review/start', { photoIds: [ids[1]] })).body;
    expect(t.queue.map((q: any) => q.id)).toEqual([ids[1]]);
    expect(t.runId).not.toBe(s.runId);
    expect((await A.post('/api/review/rate', { photoId: ids[1], rating: 4 })).status).toBe(200);
  });

  it('lets a guest suggest another candidate for a chosen print, and shows the owner what was suggested', async () => {
    await A.patch(`/api/collections/${compId}`, { chosenIds: [ids[0]] });
    const page = (await env.app.inject(`/api/s/${token}`)).json();
    expect(page.chosenIds).toEqual([ids[0]]); // the guest sees which are the prints
    const sug = (payload: object) => env.app.inject({ method: 'POST', url: `/api/s/${token}/suggest`, payload });
    expect((await sug({ forId: ids[0], photoId: ids[2], reviewer: 'Sam', note: 'warmer' })).statusCode).toBe(200);
    expect((await sug({ forId: ids[0], photoId: ids[2], reviewer: 'Ana' })).statusCode).toBe(200);
    expect((await sug({ forId: ids[0], photoId: ids[1], reviewer: 'Ana' })).statusCode).toBe(200); // Ana changes her mind: replaced, not added
    expect((await sug({ forId: ids[1], photoId: ids[2], reviewer: 'Sam' })).statusCode).toBe(400); // not a chosen print
    expect((await sug({ forId: ids[0], photoId: ids[0], reviewer: 'Sam' })).statusCode).toBe(400); // already chosen
    expect((await sug({ forId: ids[0], photoId: 99999, reviewer: 'Sam' })).statusCode).toBe(400);
    const got = (await A.get(`/api/collections/${compId}/suggestions`)).body.suggestions;
    expect(got).toEqual([{ forId: ids[0], photoId: ids[2], by: ['Sam'], notes: ['warmer'] }, { forId: ids[0], photoId: ids[1], by: ['Ana'], notes: [] }]);
    expect((await sug({ forId: ids[0], photoId: null, reviewer: 'Sam' })).statusCode).toBe(200); // takes it back
    expect((await A.get(`/api/collections/${compId}/suggestions`)).body.suggestions).toHaveLength(1);
    expect((await A.del(`/api/collections/${compId}/suggestions?forId=${ids[0]}&photoId=${ids[1]}`)).body.removed).toBe(1);
    expect((await A.get(`/api/collections/${compId}/suggestions`)).body.suggestions).toEqual([]);
  });

  it('refuses suggestions when the link does not allow review', async () => {
    const closed = (await A.post('/api/shares', { kind: 'collection', id: compId, allowReview: false })).body.token;
    expect((await env.app.inject({ method: 'POST', url: `/api/s/${closed}/suggest`, payload: { forId: ids[0], photoId: ids[1] } })).statusCode).toBe(403);
  });

  it('marks a composition printed, and reopening clears it', async () => {
    expect((await A.get(`/api/collections/${compId}`)).body.printedAt).toBeNull();
    expect((await A.patch(`/api/collections/${compId}`, { printed: true })).body.printedAt).toMatch(/^\d{4}-/);
    expect((await A.patch(`/api/collections/${compId}`, { printed: false })).body.printedAt).toBeNull();
    expect((await A.get('/api/collections/9999/ranking')).status).toBe(404);
  });
});
