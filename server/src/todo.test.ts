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
    expect(t.total).toBe(t.items.reduce((n: number, i: any) => n + i.count, 0));
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
