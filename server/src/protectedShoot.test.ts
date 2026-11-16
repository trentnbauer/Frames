import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** A photoshoot can be protected from deletion. */
let env: Env, A: ReturnType<typeof api>;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  fs.writeFileSync(path.join(env.lib, 'one.jpg'), await jpg(svg(900, 600, '#336699', '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('protecting a photoshoot from deletion', () => {
  it('shows the setting, refuses to remove a protected shoot, and allows it again once protection is off', async () => {
    const made = (await A.post('/api/shoots', { name: 'Keep me' })).body;
    expect(made.protected).toBe(false);
    expect((await A.patch(`/api/shoots/${made.id}`, { protected: true })).status).toBe(200);
    expect((await A.get(`/api/shoots/${made.id}`)).body.protected).toBe(true);
    const refused = await A.del(`/api/shoots/${made.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/protected/i);
    expect((await A.get(`/api/shoots/${made.id}`)).status).toBe(200);
    await A.patch(`/api/shoots/${made.id}`, { protected: false });
    expect((await A.del(`/api/shoots/${made.id}`)).status).toBe(200);
  });

  it('keeps the photographs of a protected shoot out of removal suggestions', async () => {
    const photo = ((await A.get('/api/photos')).body.photos as any[])[0];
    const shoot = (await A.post('/api/shoots', { name: 'Protected', photoIds: [photo.id] })).body;
    for (const session of [1, 2, 3, 4, 5]) env.db.prepare("INSERT INTO reviews(photo_id, session, run_id, date, rating) VALUES (?, ?, 'r', '2026-01-01T00:00:00.000Z', 1)").run(photo.id, session);
    await A.put('/api/settings', { deleteBelow: 3, archiveSuggest: true });
    expect(((await A.get('/api/photos/delete-suggestions')).body.photos as any[]).map((p) => p.id)).toContain(photo.id);
    await A.patch(`/api/shoots/${shoot.id}`, { protected: true });
    expect(((await A.get('/api/photos/delete-suggestions')).body.photos as any[]).map((p) => p.id)).not.toContain(photo.id);
  });
});
