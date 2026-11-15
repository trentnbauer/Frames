import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, makeEnv } from './testutil.js';
let env: ReturnType<typeof makeEnv>, a: ReturnType<typeof api>;
beforeEach(() => { env = makeEnv(); a = api(env); }); afterEach(async () => { await env.app.close(); cleanup(env); });
it('saves edited URL, decimal price, notes, name and priority together', async () => {
  const first = (await a.post('/api/gear/items', { kind: 'want', name: 'First' })).body;
  const second = (await a.post('/api/gear/items', { kind: 'want', name: 'Second' })).body;
  expect((await a.patch(`/api/gear/items/${second.id}`, { name: 'Edited', link: 'https://listing.example/item', price: 420.25, why: 'Portraits', priority: 1 })).status).toBe(200);
  let list = (await a.get('/api/gear/items')).body.want;
  expect(list.map((item: { id: number }) => item.id)).toEqual([second.id, first.id]);
  expect(list[0]).toMatchObject({ name: 'Edited', price: 420.25, link: 'https://listing.example/item', why: 'Portraits' });
  await a.patch(`/api/gear/items/${second.id}`, { link: '', price: null });
  list = (await a.get('/api/gear/items')).body.want; expect(list[0]).toMatchObject({ link: '', price: null });
});
it('rejects bad priority before saving fields and does not create duplicate items on a rejected request', async () => {
  const item = (await a.post('/api/gear/items', { kind: 'want', name: 'Original', price: 10 })).body;
  for (const priority of [0, 99, -1, 1.5, null, '1']) expect((await a.patch(`/api/gear/items/${item.id}`, { name: 'Changed', price: 99, priority })).status).toBe(400);
  expect((await a.get('/api/gear/items')).body.want[0]).toMatchObject({ name: 'Original', price: 10 });
  expect((await a.post('/api/gear/items', { kind: 'want', name: 'Bad', priority: 99 })).status).toBe(400);
  expect((await a.get('/api/gear/items')).body.want).toHaveLength(1);
  const created = (await a.post('/api/gear/items', { kind: 'want', name: 'New first', priority: 1 })).body;
  expect((await a.get('/api/gear/items')).body.want.map((value: { id: number }) => value.id)).toEqual([created.id, item.id]);
});

it('rolls back item edits if updating priority fails inside the save transaction', async () => {
  const item = (await a.post('/api/gear/items', { kind: 'want', name: 'Original', price: 10 })).body;
  env.db.exec("CREATE TRIGGER fail_wish_rank BEFORE UPDATE OF rank ON gear_items BEGIN SELECT RAISE(ABORT, 'test rank failure'); END");
  expect((await a.patch(`/api/gear/items/${item.id}`, { name: 'Changed', price: 99, priority: 1 })).status).toBe(500);
  expect((await a.get('/api/gear/items')).body.want[0]).toMatchObject({ name: 'Original', price: 10 });
});
