import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './db.js';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';

let env: Env, a: ReturnType<typeof api>, ids: number[];
const print = (photoId: number | null, photoId2: number | null = null, stack = false) => ({ id: 1, x: 0, y: 0, size: 'A3', orientation: 'portrait', frame: null, photoId, photoId2, stack });
const layout = (photoId: number | null, photoId2: number | null = null, stack = false) => ({ mode: 'free', prints: [print(photoId, photoId2, stack)] });
const create = async (raw = layout(ids[0])) => (await a.post('/api/collections', { name: 'Stage test', photoIds: ids, layout: raw })).body;
const patch = (id: number, body: object) => a.patch(`/api/collections/${id}`, body);

beforeAll(async () => {
  env = makeEnv(); a = api(env);
  for (let i = 0; i < 2; i++) fs.writeFileSync(`${env.lib}/${i}.jpg`, await jpg(svg(900, 600, '#645080', '#ae5050', [i / 2, .5])));
  await a.scan(); ids = (await a.get('/api/photos')).body.photos.map((p: { id: number }) => p.id);
});
afterAll(() => cleanup(env));

describe('explicit composition stages', () => {
  it('starts in Progress even with every artwork filled, then persists Review and Done', async () => {
    const c = await create(); expect(c.stage).toBe('progress');
    expect((await patch(c.id, { stage: 'review' })).body.stage).toBe('review');
    expect((await patch(c.id, { stage: 'done' })).body.stage).toBe('done');
    expect((await a.get(`/api/collections/${c.id}`)).body.stage).toBe('done');
    expect((await a.get('/api/collections')).body.find((x: { id: number }) => x.id === c.id).stage).toBe('done');
  });
  it('refuses empty artwork, including an empty second half of a stacked print', async () => {
    for (const raw of [layout(null), layout(ids[0], null, true)]) {
      const c = await create(raw);
      for (const stage of ['review', 'done']) expect((await patch(c.id, { stage })).status).toBe(409);
      expect((await a.get(`/api/collections/${c.id}`)).body.stage).toBe('progress');
    }
    const stacked = await create(layout(ids[0], ids[1], true));
    expect((await patch(stacked.id, { stage: 'review' })).status).toBe(200);
    const empty = (await a.post('/api/collections', { name: 'Nothing on the wall' })).body;
    expect((await patch(empty.id, { stage: 'review' })).status).toBe(409);
  });
  it('validates stage changes before any content is updated', async () => {
    const c = await create();
    for (const stage of ['', null, 2, {}, [], 'finished']) expect((await patch(c.id, { stage })).status).toBe(400);
    expect((await patch(c.id, { stage: 'done', name: 'Unexpected rename' })).status).toBe(400);
    expect((await a.get(`/api/collections/${c.id}`)).body).toMatchObject({ name: 'Stage test', stage: 'progress' });
  });
  it('locks every collection content endpoint in Done, including background and candidate changes', async () => {
    const c = await create(); await patch(c.id, { stage: 'done' });
    for (const body of [{ name: 'Changed' }, { layout: layout(null) }, { chosenIds: [] }, { order: [] }, { target: null }, { description: 'changed' }, { stage: 'review', layout: layout(null) }]) {
      expect((await patch(c.id, body)).status).toBe(409);
    }
    expect((await a.put(`/api/collections/${c.id}/photos/${ids[1]}`, {})).status).toBe(409);
    expect((await a.del(`/api/collections/${c.id}/photos/${ids[0]}`)).status).toBe(409);
    expect((await a.put(`/api/collections/${c.id}/background`, { data: 'invalid' })).status).toBe(409);
    expect((await a.del(`/api/collections/${c.id}/background`)).status).toBe(409);
    expect((await a.del(`/api/collections/${c.id}`)).status).toBe(409);
    expect((await a.patch(`/api/collections/${String(c.id).split('').map((n) => `%${n.charCodeAt(0).toString(16)}`).join('')}`, { name: 'Encoded bypass' })).status).toBe(409);
    expect((await a.get(`/api/collections/${c.id}`)).body).toMatchObject({ name: 'Stage test', stage: 'done', layout: layout(ids[0]) });
  });
  it('reopens into Review or Progress before permitting edits; clearing a Review slot returns to Progress', async () => {
    const c = await create(); await patch(c.id, { stage: 'done' });
    expect((await patch(c.id, { stage: 'review' })).body.stage).toBe('review');
    expect((await patch(c.id, { name: 'Renamed' })).body.name).toBe('Renamed');
    expect((await patch(c.id, { layout: layout(null) })).body.stage).toBe('progress');
    await patch(c.id, { layout: layout(ids[0]) }); await patch(c.id, { stage: 'review' });
    expect((await a.del(`/api/collections/${c.id}/photos/${ids[0]}`)).body.stage).toBe('progress');
    const second = await create(); await patch(second.id, { stage: 'done' });
    expect((await patch(second.id, { stage: 'progress' })).body.stage).toBe('progress');
    expect((await patch(second.id, { name: 'Editable again' })).status).toBe(200);
  });
  it('maps old printed/reopen requests to the explicit stages', async () => {
    const c = await create();
    expect((await patch(c.id, { printed: true })).body).toMatchObject({ stage: 'done', printedAt: expect.any(String) });
    expect((await patch(c.id, { printed: false })).body).toMatchObject({ stage: 'progress', printedAt: null });
  });
  it('prevents portfolio shortcuts from altering candidates of a Done composition', async () => {
    const c = await create(); await a.put('/api/portfolio', { collectionId: c.id }); await patch(c.id, { stage: 'done' });
    expect((await a.post(`/api/portfolio/photos/${ids[0]}`, { on: false })).status).toBe(409);
    expect((await a.post(`/api/portfolio/photos/${ids[1]}`, { on: true })).status).toBe(409);
  });
});

it('migrates previously printed compositions to Done and other compositions to Progress without resetting reopened work', () => {
  const e = makeEnv();
  try {
    const version = Number(e.db.pragma('user_version', { simple: true }));
    e.db.prepare("INSERT INTO collections(name, printed_at) VALUES('Printed', '2026-01-01')").run();
    e.db.prepare("INSERT INTO collections(name) VALUES('Draft')").run();
    e.db.exec('ALTER TABLE collections DROP COLUMN stage');
    e.db.pragma(`user_version = ${version - 1}`); migrate(e.db);
    expect(e.db.prepare('SELECT name, stage FROM collections ORDER BY id').all()).toEqual([{ name: 'Printed', stage: 'done' }, { name: 'Draft', stage: 'progress' }]);
    e.db.prepare("UPDATE collections SET stage = 'review', printed_at = NULL WHERE name = 'Printed'").run(); migrate(e.db);
    expect((e.db.prepare("SELECT stage FROM collections WHERE name = 'Printed'").get() as { stage: string }).stage).toBe('review');
  } finally { cleanup(e); }
});
