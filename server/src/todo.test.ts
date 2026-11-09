import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** The To do list: what is waiting on the person, and nothing else. */
let env: Env, A: ReturnType<typeof api>;
const idOf = async (file: string) => ((await A.get('/api/photos')).body.photos as any[]).find((p) => p.file === file)?.id as number;
const kinds = async () => ((await A.get('/api/todo')).body.items as any[]).map((i) => i.key);

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  for (const [n, c] of [['a.jpg', '#336699'], ['b.jpg', '#993333']] as const) fs.writeFileSync(path.join(env.lib, n), await jpg(svg(900, 600, c, '#eeeeee', [0.3, 0.3])));
  await A.post('/api/library/scan?wait=1');
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('the To do list', () => {
  it('is empty with no photographs, and lists new photographs that have no subject or tag', async () => {
    const t = (await A.get('/api/todo')).body;
    expect(t.total).toBe(6); // two photographs, each needing its subjects and tags, its place, and (being on the list anyway) a description
    expect(await kinds()).toEqual(expect.arrayContaining(['subjects', 'tags']));
    expect(t.items.find((i: any) => i.key === 'subjects')).toMatchObject({ count: 2 });
  });

  it('drops a photograph from the list once it has a subject and a tag', async () => {
    const id = await idOf('a.jpg');
    await A.put(`/api/photos/${id}/tags`, { name: 'coast', kind: 'subject' });
    await A.put(`/api/photos/${id}/tags`, { name: 'moody', kind: 'tag' });
    const items = (await A.get('/api/todo')).body.items as any[];
    expect(items.find((i) => i.key === 'subjects')).toMatchObject({ count: 1 });
    expect(items.find((i) => i.key === 'subjects').photoIds).not.toContain(id);
    expect(items.find((i) => i.key === 'tags').photoIds).not.toContain(id);
  });

  it('lists the AI’s suggested tags and description until they are accepted or rejected', async () => {
    const id = await idOf('b.jpg');
    env.db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'harbour', 'ai', 0, 'subject')").run(id);
    env.db.prepare("UPDATE photos SET ai_status = 'done', ai_json = ? WHERE id = ?").run(JSON.stringify({ description: 'A boat at dawn' }), id);
    let items = (await A.get('/api/todo')).body.items as any[];
    expect(items.find((i) => i.key === 'ai-tags')).toMatchObject({ count: 1, photoIds: [id] });
    expect(items.find((i) => i.key === 'ai-description')).toMatchObject({ count: 1, photoIds: [id] });
    await A.put(`/api/photos/${id}/tags`, { name: 'harbour', action: 'accept' });
    await A.patch(`/api/photos/${id}`, { rejectAiDescription: true });
    items = (await A.get('/api/todo')).body.items as any[];
    expect(items.find((i) => i.key === 'ai-tags')).toBeUndefined();
    expect(items.find((i) => i.key === 'ai-description')).toBeUndefined();
  });

  it('does not count a photograph that is missing from the library', async () => {
    const id = await idOf('b.jpg');
    env.db.prepare('UPDATE photos SET missing = 1 WHERE id = ?').run(id);
    expect(((await A.get('/api/todo')).body.items as any[]).flatMap((i) => i.photoIds)).not.toContain(id);
  });
});

describe('accepting the AI’s suggestions in one go, and finding what has nothing set', () => {
  it('accepts every waiting AI tag and description, only those, and refuses any other kind', async () => {
    const id = await idOf('a.jpg');
    env.db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'mist', 'ai', 0, 'tag')").run(id);
    env.db.prepare("INSERT INTO tags(photo_id, name, source, accepted, kind) VALUES(?, 'noise', 'ai', -1, 'tag')").run(id); // rejected before: stays rejected
    env.db.prepare("UPDATE photos SET ai_status = 'done', ai_json = ?, description = '' WHERE id = ?").run(JSON.stringify({ description: 'Mist over water' }), id);
    expect((await A.post('/api/todo/accept-ai', { kind: 'tags' })).body.accepted).toBe(1);
    expect((await A.post('/api/todo/accept-ai', { kind: 'description' })).body.accepted).toBe(1);
    expect(env.db.prepare("SELECT accepted FROM tags WHERE photo_id = ? AND name = 'noise'").get(id)).toEqual({ accepted: -1 });
    expect(env.db.prepare('SELECT description FROM photos WHERE id = ?').get(id)).toEqual({ description: 'Mist over water' });
    expect((await A.post('/api/todo/accept-ai', { kind: 'everything' })).status).toBe(400);
  });

  it('filters the Library to photographs with no subject or no tag', async () => {
    const id = await idOf('a.jpg');
    const ids = async (q: string) => ((await A.get(`/api/photos?${q}`)).body.photos as any[]).map((p) => p.id);
    expect(await ids('missing=subject')).not.toContain(id); // it has the subject added earlier
    expect(await ids('missing=tag')).not.toContain(id);
    env.db.prepare('DELETE FROM tags WHERE photo_id = ?').run(id);
    expect(await ids('missing=subject')).toContain(id);
    expect(await ids('missing=tag')).toContain(id);
  });
});

describe('the one-at-a-time list', () => {
  it('lists each photograph that needs something, newest first, with what it needs', async () => {
    env.db.prepare('UPDATE photos SET missing = 0').run();
    const walk = (await A.get('/api/todo/walk')).body;
    expect(walk.photos.length).toBeGreaterThan(0);
    const first = walk.photos[0];
    expect(first).toMatchObject({ need: { tags: true, place: true, desc: true }, shoot: expect.any(String) });
    expect(first.ar).toBeGreaterThan(0);
    expect(walk.photos.map((p: any) => p.id)).toEqual([...walk.photos.map((p: any) => p.id)].sort((a: number, b: number) => b - a));
    expect(walk.things).toBe(walk.photos.reduce((n: number, p: any) => n + +p.need.tags + +p.need.place + +p.need.desc, 0));
  });

  it('drops a photograph once it has a subject, a tag and a place, and does not ask for a description on its own', async () => {
    const id = (await A.get('/api/todo/walk')).body.photos[0].id as number;
    await A.put(`/api/photos/${id}/tags`, { name: 'harbour', kind: 'subject' });
    await A.put(`/api/photos/${id}/tags`, { name: 'dawn', kind: 'tag' });
    await A.patch(`/api/photos/${id}`, { place: 'Fremantle' });
    expect(((await A.get('/api/todo/walk')).body.photos as any[]).some((p) => p.id === id)).toBe(false); // no description, but nothing else is outstanding
    expect(((await A.get('/api/todo')).body.items as any[]).find((i) => i.key === 'place')?.photoIds ?? []).not.toContain(id);
  });

  it('asks for a description when the AI has suggested one, even if everything else is done', async () => {
    const id = (await A.get('/api/photos')).body.photos.find((p: any) => p.place === 'Fremantle').id as number;
    env.db.prepare("UPDATE photos SET ai_status = 'done', ai_json = ? WHERE id = ?").run(JSON.stringify({ description: 'Boats at dawn' }), id);
    const got = ((await A.get('/api/todo/walk')).body.photos as any[]).find((p) => p.id === id);
    expect(got.need).toEqual({ tags: false, place: false, desc: true });
  });

  it('lists every place in use, so it can be offered like a tag', async () => {
    const id = (await A.get('/api/photos')).body.photos[0].id as number;
    await A.patch(`/api/photos/${id}`, { place: 'Geelong' });
    const places = (await A.get('/api/places')).body as { name: string; n: number }[];
    expect(places.find((p) => p.name === 'Geelong')).toMatchObject({ n: 1 });
  });

  it('library search finds a photograph by its exposure (ISO, aperture, shutter)', async () => {
    const id = (await A.get('/api/photos')).body.photos[0].id as number;
    env.db.prepare("UPDATE photos SET exposure = '1/250s · f/2.8 · ISO 800' WHERE id = ?").run(id);
    for (const q of ['iso 800', 'f/2.8', '1/250s']) expect(((await A.get(`/api/photos?q=${encodeURIComponent(q)}`)).body.photos as any[]).map((p) => p.id)).toEqual([id]);
  });

  it('re-checking with the AI says the AI is off when it is, and a missing photograph is not found', async () => {
    expect((await A.post('/api/photos/1/recheck')).body).toMatchObject({ ai: false, added: [] });
    expect((await A.post('/api/photos/99999/recheck')).status).toBe(404);
  });
});
