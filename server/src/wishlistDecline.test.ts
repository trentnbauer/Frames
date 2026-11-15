import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, makeEnv } from './testutil.js';
let env: ReturnType<typeof makeEnv>, a: ReturnType<typeof api>;
beforeEach(() => { env = makeEnv(); a = api(env); }); afterEach(async () => { await env.app.close(); cleanup(env); });
it('removes an unwanted wishlist item without adding owned gear', async () => {
  const wish = (await a.post('/api/gear/items', { kind: 'want', name: 'Not buying' })).body;
  expect((await a.del(`/api/gear/items/${wish.id}?kind=want`)).body.removed).toBe(1);
  const data = (await a.get('/api/gear/items')).body; expect(data.want).toEqual([]); expect(data.own).toEqual([]);
});
it('protects owned gear when a stale wishlist decision arrives after purchase', async () => {
  const wish = (await a.post('/api/gear/items', { kind: 'want', name: 'Purchased elsewhere' })).body;
  await a.post(`/api/gear/items/${wish.id}/bought`);
  expect((await a.del(`/api/gear/items/${wish.id}?kind=want`)).status).toBe(409);
  expect((await a.get('/api/gear/items')).body.own[0].id).toBe(wish.id);
  expect((await a.del(`/api/gear/items/${wish.id}?kind=invalid`)).status).toBe(400);
});
