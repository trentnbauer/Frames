import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

/** Photographs that are in no photoshoot. */
let env: Env, a: ReturnType<typeof api>, ids: number[];
const photos = async (q = '') => ((await a.get(`/api/photos${q}`)).body.photos as any[]);

beforeAll(async () => {
  env = makeEnv(); a = api(env);
  for (let i = 0; i < 4; i++) fs.writeFileSync(`${env.lib}/${i}.jpg`, await jpg(svg(300, 200, `#33${i}699`, '#eeeeee', [0.2 + i * 0.1, 0.4])));
  await a.post('/api/library/scan?wait=1'); // a raw scan: the photographs arrive in no shoot
  ids = (await photos()).map((p) => p.id);
});
afterAll(async () => { await env.app.close(); cleanup(env); });

describe('photographs in no photoshoot', () => {
  it('are what an import brings in: no shoot is listed, every photograph is marked, and a filter finds them', async () => {
    expect((await a.get('/api/shoots')).body).toEqual([]);
    expect((await photos()).every((p) => p.orphaned)).toBe(true);
    expect(await photos('?orphaned=1')).toHaveLength(4);
    const item = ((await a.get('/api/todo')).body.items as any[]).find((i) => i.key === 'orphaned');
    expect(item.count).toBe(4);
    // Unticking "Shoot" under To do keeps them off the list; ticking it brings them back.
    const reasons = (await a.get('/api/settings')).body.settings.todoReasons as string[];
    await a.put('/api/settings', { todoReasons: reasons.filter((r) => r !== 'shoot') });
    expect(((await a.get('/api/todo')).body.items as any[]).some((i) => i.key === 'orphaned')).toBe(false);
    await a.put('/api/settings', { todoReasons: reasons });
    expect(((await a.get('/api/todo')).body.items as any[]).some((i) => i.key === 'orphaned')).toBe(true);
  });
  it('cannot be treated as a photoshoot: not found, not editable, not deletable, not shareable', async () => {
    const hidden = (await photos())[0].shootId;
    expect((await a.get(`/api/shoots/${hidden}`)).status).toBe(404);
    expect((await a.patch(`/api/shoots/${hidden}`, { name: 'x' })).status).toBe(404);
    expect((await a.del(`/api/shoots/${hidden}`)).status).toBe(404);
    expect((await a.post('/api/shares', { kind: 'shoot', id: hidden })).status).toBe(404);
    expect((await a.post(`/api/shoots/${hidden}/move`, { photoIds: [ids[0]] })).status).toBe(404);
  });
  it('leave the list when they are put in a shoot, and the list is empty when none are left', async () => {
    const made = (await a.post('/api/shoots', { name: 'Coast', photoIds: [ids[0], ids[1]] })).body;
    expect(await photos('?orphaned=1')).toHaveLength(2);
    expect((await photos()).find((p) => p.id === ids[0]).orphaned).toBe(false);
    await a.post(`/api/shoots/${made.id}/move`, { photoIds: [ids[2], ids[3]] });
    expect(await photos('?orphaned=1')).toHaveLength(0);
    expect(((await a.get('/api/todo')).body.items as any[]).some((i) => i.key === 'orphaned')).toBe(false);
  });
  it('can be left in place when their shoot is deleted, or go with it', async () => {
    const keep = (await a.post('/api/shoots', { name: 'Keep the photos', photoIds: [ids[0]] })).body;
    const r = await a.del(`/api/shoots/${keep.id}?photos=orphan`);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ orphaned: 1 });
    expect((await a.get(`/api/shoots/${keep.id}`)).status).toBe(404);
    expect((await photos('?orphaned=1')).map((p) => p.id)).toEqual([ids[0]]);
    const drop = (await a.post('/api/shoots', { name: 'Remove everything', photoIds: [ids[1]] })).body;
    expect((await a.del(`/api/shoots/${drop.id}`)).status).toBe(200);
    expect((await photos()).map((p) => p.id)).not.toContain(ids[1]);
  });
  it('can be made from photographs already in a shoot, which empties and removes that shoot', async () => {
    const only = (await a.post('/api/shoots', { name: 'Only one', photoIds: [ids[2]] })).body;
    expect((await a.post('/api/photos/orphan', { photoIds: [ids[2]] })).body).toEqual({ orphaned: 1 });
    expect((await a.get(`/api/shoots/${only.id}`)).status).toBe(404);
    expect((await photos('?orphaned=1')).map((p) => p.id).sort()).toEqual([ids[0], ids[2]].sort());
  });
});
