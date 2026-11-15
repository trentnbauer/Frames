import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, makeEnv } from './testutil.js';
let env: ReturnType<typeof makeEnv>, a: ReturnType<typeof api>;
beforeEach(() => { env = makeEnv(); a = api(env); });
afterEach(async () => { await env.app.close(); cleanup(env); });
it('renames blank systems added from photo details without reverting or changing wishlist gear', async () => {
  const one = (await a.post('/api/gear/items', { name: 'Photo body', type: 'camera' })).body;
  await a.post('/api/gear/items', { name: 'Photo lens', type: 'lens' });
  await a.post('/api/gear/items', { name: 'Wishlist', kind: 'want' });
  expect((await a.post('/api/gear/systems/rename', { from: '', to: 'Minolta SR' })).body.renamed).toBe(2);
  await a.patch(`/api/gear/items/${one.id}`, { name: 'Renamed body', serial: 'example' });
  const data = (await a.get('/api/gear/items')).body;
  expect(data.own.every((item: { system: string }) => item.system === 'Minolta SR')).toBe(true);
  expect(data.want[0].system).toBe('');
  expect(data.prefs.systems).toContain('Minolta SR');
});
it('creates and renames empty systems without placeholder equipment', async () => {
  expect((await a.post('/api/gear/systems', { name: 'Leica M' })).status).toBe(200);
  expect((await a.post('/api/gear/systems', { name: 'Leica M' })).status).toBe(409);
  await a.post('/api/gear/systems/rename', { from: 'Leica M', to: 'Leica rangefinders' });
  const data = (await a.get('/api/gear/items')).body;
  expect(data.own).toEqual([]); expect(data.prefs.systems).toEqual(['Leica rangefinders']);
});
it('preserves source and destination systems after moving the last item and leaves other fields untouched', async () => {
  const gear = (await a.post('/api/gear/items', { name: 'Body', type: 'camera', system: 'Old', year: 1977 })).body;
  await a.patch(`/api/gear/items/${gear.id}`, { serial: 'sample serial' });
  await a.patch(`/api/gear/items/${gear.id}`, { system: 'New' });
  const data = (await a.get('/api/gear/items')).body;
  expect(data.own[0]).toMatchObject({ system: 'New', serial: 'sample serial', year: 1977, name: 'Body', type: 'camera' });
  expect(data.prefs.systems).toEqual(['Old', 'New']);
  expect((await a.post('/api/gear/systems', { name: '' })).status).toBe(400);
  expect((await a.post('/api/gear/systems/rename', { from: null, to: 'x' })).status).toBe(400);
});
