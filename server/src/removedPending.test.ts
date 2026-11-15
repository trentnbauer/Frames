import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';
import { pending } from './ingest.js';
let env: Env, a: ReturnType<typeof api>, file: string, id: number;
beforeEach(async () => {
  env = makeEnv();
  a = api(env);
  file = path.join(env.lib, 'low-rated.jpg');
  fs.writeFileSync(file, await jpg(svg(150, 100, '#336699', '#eeeeee', [0.3, 0.5])));
  await a.scan();
  id = (await a.get('/api/photos')).body.photos[0].id;
  env.db.prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating)VALUES(?,1,NULL,?,1)').run(id, new Date().toISOString());
  await a.put('/api/settings', { autoRemove: true, autoRemoveAfter: 1, autoRemoveBelow: 2 });
  expect((await a.get('/api/photos')).body.photos).toEqual([]);
});
afterEach(async () => {
  await env.app.close();
  cleanup(env);
});
it('does not advertise review-removed originals or create repeated import batches for them', async () => {
  expect(fs.existsSync(file)).toBe(true);
  expect(pending(env.db, env.cfg)).toMatchObject({ files: [], count: 0, folders: [] });
  const before = (env.db.prepare('SELECT COUNT(*) n FROM import_runs').get() as any).n;
  for (let attempt = 0; attempt < 3; attempt++) {
    expect((await a.scan()).body).toMatchObject({ imported: 0, shootId: null });
    expect((await a.get('/api/photos')).body.photos).toEqual([]);
  }
  expect((env.db.prepare('SELECT COUNT(*) n FROM import_runs').get() as any).n).toBe(before);
});
it('preserves removal at the recorded path even when the retained file bytes change', async () => {
  fs.writeFileSync(file, await jpg(svg(180, 120, '#aa7733', '#eeeeee', [0.7, 0.4])));
  expect(pending(env.db, env.cfg).count).toBe(0);
  expect((await a.scan()).body.imported).toBe(0);
  expect((await a.get('/api/photos')).body.photos).toEqual([]);
});
it('imports genuinely new files and allows deliberate restoration', async () => {
  fs.writeFileSync(path.join(env.lib, 'new.jpg'), await jpg(svg(160, 110, '#bb6633', '#eeeeee', [0.7, 0.5])));
  expect(pending(env.db, env.cfg).count).toBe(1);
  expect((await a.scan()).body.imported).toBe(1);
  const recovery = (await a.get('/api/recovery')).body[0];
  expect((await a.post(`/api/recovery/${recovery.id}/restore`)).status).toBe(200);
  expect((await a.get('/api/photos')).body.photos).toHaveLength(2);
  expect(pending(env.db, env.cfg).count).toBe(0);
});
