import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
let env: Env, A: ReturnType<typeof api>;
beforeEach(() => { env = makeEnv(); A = api(env); env.db.prepare("INSERT INTO shoots(id,name,imported_at) VALUES(1, 'One shoot', ?)").run(new Date().toISOString()); });
afterEach(async () => { await env.app.close(); cleanup(env); });
function photo(id: number, data: { tag?: string; subject?: string; colour?: string; place?: string; lat?: number; lon?: number; accepted?: number; rating?: number; missing?: boolean; parent?: number } = {}) {
  env.db.prepare('INSERT INTO photos(id,shoot_id,path,file,hash,title,file_type,size_bytes,added_at,colors,place,lat,lon,missing,parent_id) VALUES(?,1,?,?,?,?,\'jpg\',1,?,?,?,?,?,?,?)')
    .run(id, `/test/${id}.jpg`, `${id}.jpg`, String(id), `Photo ${id}`, new Date().toISOString(), data.colour ?? '', data.place ?? '', data.lat ?? null, data.lon ?? null, data.missing ? 1 : 0, data.parent ?? null);
  for (const kind of ['tag', 'subject'] as const) if (data[kind]) env.db.prepare('INSERT INTO tags(photo_id,name,kind,accepted) VALUES(?,?,?,?)').run(id, data[kind], kind, data.accepted ?? 1);
  if (data.rating) env.db.prepare('INSERT INTO reviews(photo_id,session,date,rating) VALUES(?,1,?,?)').run(id, new Date().toISOString(), data.rating);
}
const ideas = async () => (await A.get('/api/collections/suggestions')).body as { name: string; reason: string; photoIds: number[]; aiAssisted: boolean }[];
describe('composition ideas from a tagged library', () => {
  it('suggests unreviewed tagged photos in one shoot without visual analysis or AI', async () => {
    for (let i = 1; i <= 300; i++) photo(i, { tag: i <= 3 ? 'interiors' : `unique-${i}` });
    const found = (await ideas()).find(i => i.reason.includes('Shared tag: interiors'));
    expect(found).toMatchObject({ name: 'Interiors', photoIds: [1, 2, 3], aiAssisted: false });
    expect(found!.reason).toContain('1 photoshoot.');
  });
  it('includes distinct colour, location and subject ideas with explanations', async () => {
    for (let i = 1; i <= 3; i++) photo(i, { subject: 'architecture' });
    for (let i = 4; i <= 6; i++) photo(i, { colour: 'blue' });
    for (let i = 7; i <= 9; i++) photo(i, { place: 'Melbourne' });
    const found = await ideas();
    expect(found).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: expect.stringContaining('Shared subject: architecture'), photoIds: [1, 2, 3] }),
      expect.objectContaining({ name: 'Blue tones', reason: expect.stringContaining('Shared colour: blue'), photoIds: [4, 5, 6] }),
      expect.objectContaining({ name: 'Melbourne', reason: expect.stringContaining('Photographed at Melbourne'), photoIds: [7, 8, 9] }),
    ]));
  });
  it('groups nearby unnamed GPS locations and never treats absent GPS as a real place', async () => {
    for (let i = 1; i <= 3; i++) photo(i, { lat: -37.81 + i * .0001, lon: 144.96 + i * .0001 });
    for (let i = 4; i <= 6; i++) photo(i);
    const found = (await ideas()).find(i => i.reason.includes('same area'));
    expect(found!.photoIds).toEqual([1, 2, 3]);
    expect((await ideas()).filter(i => i.reason.includes('same area'))).toHaveLength(1);
  });
  it('requires three eligible photos and respects rejected/suggested tags, low ratings, missing photos and variants', async () => {
    photo(1, { tag: 'test' }); photo(2, { tag: 'test' }); photo(3, { tag: 'test', accepted: 0 }); photo(4, { tag: 'test', accepted: -1 });
    photo(5, { tag: 'test', rating: 1 }); photo(6, { tag: 'test', missing: true }); photo(7, { tag: 'test', parent: 1 });
    expect((await ideas()).some(i => i.reason.includes('Shared tag: test'))).toBe(false);
    photo(8, { tag: 'test' });
    expect((await ideas()).find(i => i.reason.includes('Shared tag: test'))!.photoIds).toEqual([1, 2, 8]);
    await A.post('/api/recommendations/feedback', { kind: 'together', verdict: 'reject', photoIds: [1, 2, 8] });
    expect((await ideas()).some(i => i.photoIds.some(id => [1, 2, 8].includes(id)))).toBe(false);
  });
  it('avoids repeated suggestions for the same photo set across tag/colour/location reasons', async () => {
    for (let i = 1; i <= 3; i++) photo(i, { tag: 'same', colour: 'green', place: 'Same place' });
    expect(await ideas()).toHaveLength(1);
  });
});

it('marks ideas based on accepted AI tags without marking manual colour or location groups', async () => {
  for (let i = 1; i <= 3; i++) photo(i, { tag: 'architecture' });
  env.db.prepare("UPDATE tags SET source = 'ai' WHERE photo_id = 1").run();
  expect((await ideas()).find(i => i.name === 'Architecture')!.aiAssisted).toBe(true);
});
