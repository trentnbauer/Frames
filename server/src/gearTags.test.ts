import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('camera details as tags', () => {
  it('say wide angle up to 35mm, regular up to 70mm and telephoto beyond', () => {
    expect([null, 0, 24, 35, 36, 50, 70, 71, 200].map((n) => lensKind(n))).toEqual(['', '', 'wide angle', 'wide angle', 'regular', 'regular', 'regular', 'telephoto', 'telephoto']);
  });

  it('are made from the file, use the 35mm equivalent where the file has one, and are plain accepted tags', () => {
    readInto(env.db, id, { Make: 'Fuji', Model: 'X100V', LensModel: '23mm f/2', FocalLength: 23, FocalLengthIn35mmFormat: 35 }, file);
    expect(gearTags()).toEqual([
      { name: '23mm f/2', accepted: 1, kind: 'tag' }, { name: 'fuji x100v', accepted: 1, kind: 'tag' }, { name: 'wide angle', accepted: 1, kind: 'tag' },
    ]);
  });

  it('follow an edit: film stock and film or digital come and go, and the field of view follows a typed focal length', async () => {
    await A.patch(`/api/photos/${id}`, { medium: 'film', film: 'Kodak Gold 200', focalMm: 135 });
    const names = gearTags().map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['film', 'kodak gold 200', 'telephoto']));
    expect(names).not.toContain('wide angle');
    await A.patch(`/api/photos/${id}`, { medium: 'digital' });
    const after = gearTags().map((t) => t.name);
    expect(after).toContain('digital');
    expect(after).not.toContain('film');
    expect(after).not.toContain('kodak gold 200');
  });

  it('are not put back once a person removes one, until the detail changes', async () => {
    await A.put(`/api/photos/${id}/tags`, { name: 'telephoto', kind: 'tag', action: 'remove' });
    readInto(env.db, id, { Make: 'Fuji', Model: 'X100V' }, file); // the details are the same: it stays removed
    expect(gearTags().map((t) => t.name)).not.toContain('telephoto');
    await A.patch(`/api/photos/${id}`, { focalMm: 24 });
    expect(gearTags().map((t) => t.name)).toContain('wide angle');
    await A.patch(`/api/photos/${id}`, { focalMm: 300 });
    expect(gearTags().map((t) => t.name)).toContain('telephoto'); // a new detail makes it again
  });

  it('do not count as being tagged, so they do not hide a photograph from the To do list', async () => {
    const todo = (await A.get('/api/todo')).body.items as { key: string; photoIds: number[] }[];
    expect(todo.find((i) => i.key === 'tags')?.photoIds).toContain(id);
    expect(((await A.get('/api/photos?missing=tag')).body.photos as { id: number }[]).map((p) => p.id)).toContain(id);
  });
});
