import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS } from './db.js';
import { lensKind } from './gear.js';
import { readInto } from './ingest.js';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** Camera details as tags: camera, lens, film stock, film or digital, and wide angle, regular or telephoto. */
let env: Env, A: ReturnType<typeof api>, id: number, file: string;
const gearTags = () => (env.db.prepare("SELECT name, accepted, kind FROM tags WHERE photo_id = ? AND source = 'gear' ORDER BY name").all(id) as { name: string; accepted: number; kind: string }[]);

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  file = path.join(env.lib, 'a.jpg');
  fs.writeFileSync(file, await jpg(svg(900, 600, '#336699', '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  id = (await A.get('/api/photos')).body.photos[0].id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('camera details are searched, not turned into tags', () => {
  it('say wide angle up to 35mm, regular up to 70mm and telephoto beyond', () => {
    expect([null, 0, 24, 35, 36, 50, 70, 71, 200].map((n) => lensKind(n))).toEqual(['', '', 'wide angle', 'wide angle', 'regular', 'regular', 'regular', 'telephoto', 'telephoto']);
  });

  it('leave no tags behind, so the photograph still needs tags in the To do list', async () => {
    readInto(env.db, id, { Make: 'Fuji', Model: 'X100V', LensModel: '23mm f/2', FocalLength: 23, FocalLengthIn35mmFormat: 35 }, file);
    await A.patch(`/api/photos/${id}`, { medium: 'film', film: 'Kodak Gold 200' });
    expect(gearTags()).toEqual([]);
    const todo = (await A.get('/api/todo')).body.items as { key: string; photoIds: number[] }[];
    expect(todo.find((i) => i.key === 'tags')?.photoIds).toContain(id);
  });

  it('are found by search and by the tag filter, from the details themselves', async () => {
    const found = async (q: string) => ((await A.get(`/api/photos?${q}`)).body.photos as { id: number }[]).map((p) => p.id);
    for (const q of ['q=x100v', 'q=kodak', 'q=film', 'q=wide%20angle', 'tag=film', 'tag=wide%20angle', 'tag=kodak%20gold%20200']) expect([q, await found(q)]).toEqual([q, expect.arrayContaining([id])]);
    expect(await found('q=telephoto')).not.toContain(id);
  });

  it('search also finds a photograph by the name of its shoot', async () => {
    const name = (env.db.prepare('SELECT s.name FROM shoots s JOIN photos p ON p.shoot_id = s.id WHERE p.id = ?').get(id) as { name: string }).name;
    expect(((await A.get(`/api/photos?q=${encodeURIComponent(name)}`)).body.photos as { id: number }[]).map((p) => p.id)).toContain(id);
  });

  it('are removed from photographs that had them by the migration', () => {
    env.db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'old', 'gear', 1, 'tag')").run(id);
    const last = MIGRATIONS[MIGRATIONS.length - 1];
    last(env.db);
    expect(gearTags()).toEqual([]);
  });
});
