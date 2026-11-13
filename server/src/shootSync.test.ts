import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** What a photoshoot passes down to its photographs: place, subjects and tags. */
let env: Env, A: ReturnType<typeof api>;
let a: number, b: number, c: number, shoot: number, other: number;
const tagsOf = (id: number) => env.db.prepare('SELECT name, kind, source, accepted FROM tags WHERE photo_id = ? ORDER BY name').all(id) as any[];
const placeOf = (id: number) => (env.db.prepare('SELECT place FROM photos WHERE id = ?').get(id) as any).place as string;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  for (const [n, col] of [['a.jpg', '#336699'], ['b.jpg', '#993333'], ['c.jpg', '#339966']] as const) fs.writeFileSync(path.join(env.lib, n), await jpg(svg(900, 600, col, '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
  const ids = ((await A.get('/api/photos')).body.photos as any[]).sort((x, y) => x.file.localeCompare(y.file)).map((p) => p.id as number);
  [a, b, c] = ids;
  shoot = (await A.post('/api/shoots', { name: 'Coast trip', photoIds: [a, b] })).body.id;
  other = (await A.post('/api/shoots', { name: 'Elsewhere', photoIds: [c] })).body.id;
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('the place a shoot passes down', () => {
  it('fills in photographs that have none, and leaves one that has its own', async () => {
    await A.patch(`/api/photos/${b}`, { place: 'Perth' });
    await A.patch(`/api/shoots/${shoot}`, { place: 'Fremantle' });
    expect(placeOf(a)).toBe('Fremantle');
    expect(placeOf(b)).toBe('Perth'); // its own place stays
    expect(placeOf(c)).toBe(''); // another shoot is not touched
  });
  it('changing the shoot’s place changes the ones that still had the old one, and only those', async () => {
    await A.patch(`/api/shoots/${shoot}`, { place: 'Rottnest' });
    expect(placeOf(a)).toBe('Rottnest');
    expect(placeOf(b)).toBe('Perth');
  });
});

describe('the subjects and tags a shoot passes down', () => {
  it('adds them to every photograph as its own, lower-cased, marked as coming from the shoot', async () => {
    const r = await A.patch(`/api/shoots/${shoot}`, { subjects: ['Coast', 'coast', ' Sea Wall '], tags: ['Moody'] });
    expect(r.body).toMatchObject({ subjects: ['coast', 'sea wall'], tags: ['moody'] });
    for (const id of [a, b]) expect(tagsOf(id)).toEqual([
      { name: 'coast', kind: 'subject', source: 'shoot', accepted: 1 }, { name: 'moody', kind: 'tag', source: 'shoot', accepted: 1 }, { name: 'sea wall', kind: 'subject', source: 'shoot', accepted: 1 },
    ]);
    expect(tagsOf(c)).toEqual([]);
  });
  it('takes back only what came from the shoot when one is removed, never a photograph’s own', async () => {
    await A.put(`/api/photos/${a}/tags`, { name: 'moody', kind: 'tag' }); // the person's own 'moody' on a (it already had the shoot's: kept as it is)
    env.db.prepare("UPDATE tags SET source = 'user' WHERE photo_id = ? AND name = 'moody'").run(a);
    await A.patch(`/api/shoots/${shoot}`, { tags: [] });
    expect(tagsOf(a).map((t) => t.name)).toEqual(['coast', 'moody', 'sea wall']); // a's own moody stays
    expect(tagsOf(b).map((t) => t.name)).toEqual(['coast', 'sea wall']); // b's came from the shoot, so it went
  });
  it('turns an AI suggestion that is waiting into a yes, but not one that was rejected', async () => {
    env.db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'harbour', 'ai', 0, 'subject')").run(a);
    env.db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'dull', 'ai', -1, 'tag')").run(a);
    await A.patch(`/api/shoots/${shoot}`, { subjects: ['coast', 'sea wall', 'harbour'], tags: ['dull'] });
    expect(tagsOf(a).find((t) => t.name === 'harbour')).toMatchObject({ accepted: 1, source: 'shoot' });
    expect(tagsOf(a).find((t) => t.name === 'dull')).toMatchObject({ accepted: -1 }); // rejected stays rejected
  });
  it('bad input is ignored: not a list, too long, too many', async () => {
    const r = await A.patch(`/api/shoots/${shoot}`, { subjects: 'coast', tags: ['x'.repeat(200)] });
    expect(r.body.subjects).toEqual([]); // not a list: treated as none
    expect(r.body.tags[0].length).toBe(60);
    await A.patch(`/api/shoots/${shoot}`, { subjects: ['coast', 'sea wall', 'harbour'], tags: [] });
  });
});

describe('moving photographs between shoots, and syncing again', () => {
  it('a photograph moved in takes the shoot’s place and tags; moved out, it gives back what came from the shoot', async () => {
    await A.post(`/api/shoots/${shoot}/move`, { photoIds: [c] });
    expect(placeOf(c)).toBe('Rottnest');
    expect(tagsOf(c).map((t) => t.name)).toEqual(['coast', 'harbour', 'sea wall']);
    expect((await A.get(`/api/shoots/${other}`)).status).toBe(404); // moving its last photo removed the old shoot
    other = (await A.post('/api/shoots', { name: 'Elsewhere again' })).body.id;
    expect((await A.post(`/api/shoots/${other}/move`, { photoIds: [c] })).status).toBe(200);
    expect(placeOf(c)).toBe('');
    expect(tagsOf(c)).toEqual([]);
  });
  it('sync puts them back on photographs where they were taken off one by one', async () => {
    await A.put(`/api/photos/${b}/tags`, { name: 'coast', action: 'remove' });
    expect(tagsOf(b).map((t) => t.name)).not.toContain('coast');
    expect((await A.post(`/api/shoots/${shoot}/sync`)).body.photos).toBe(2);
    expect(tagsOf(b).map((t) => t.name)).toContain('coast');
    expect((await A.post('/api/shoots/9999/sync')).status).toBe(404);
  });
});
