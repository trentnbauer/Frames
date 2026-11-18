import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

// The Library's Camera, Lens and Location filters each have a "None": photographs with nothing recorded.
let env: Env, A: ReturnType<typeof api>;
const ids: Record<string, number> = {};
beforeAll(async () => {
  env = makeEnv(); A = api(env);
  fs.writeFileSync(path.join(env.lib, 'known.jpg'), await jpg(svg(600, 400, '#336699', '#eeeeee', [0.3, 0.3])));
  fs.writeFileSync(path.join(env.lib, 'blank.jpg'), await jpg(svg(600, 400, '#993322', '#111111', [0.7, 0.6])));
  await A.scan();
  for (const p of (await A.get('/api/photos')).body.photos as any[]) ids[p.file] = p.id;
  env.db.prepare("UPDATE photos SET camera = 'Pentax 67', lens = '105mm', place = 'Fremantle' WHERE id = ?").run(ids['known.jpg']);
  env.db.prepare("UPDATE photos SET camera = '', lens = '', place = '', lat = NULL, lon = NULL WHERE id = ?").run(ids['blank.jpg']);
  env.db.prepare("UPDATE shoots SET place = ''").run();
});
afterAll(() => { env.app.close(); cleanup(env); });

const files = async (qs: string) => ((await A.get(`/api/photos?${qs}`)).body.photos as { file: string }[]).map((p) => p.file);

describe('filtering for nothing recorded', () => {
  it('has two photographs to tell apart', () => expect(Object.keys(ids).sort()).toEqual(['blank.jpg', 'known.jpg']));
  it('finds the photographs with no camera, no lens or no location, alone or together', async () => {
    for (const k of ['camera', 'lens', 'place']) expect(await files(`missing=${k}`), k).toEqual(['blank.jpg']);
    expect(await files('missing=camera,lens,place')).toEqual(['blank.jpg']);
  });
});
