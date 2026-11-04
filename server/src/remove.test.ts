import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, jpg, makeEnv, svg, api, type Env } from './testutil.js';

/** Taking photographs and photoshoots out of Frames. */
let env: Env, A: ReturnType<typeof api>;
const put = async (name: string, colour: string) => { const f = path.join(env.lib, name); fs.writeFileSync(f, await jpg(svg(900, 600, colour, '#eeeeee', [0.3, 0.3]))); return f; };
const ids = async () => ((await A.get('/api/photos')).body.photos as any[]).map((p) => p.id as number).sort((a, b) => a - b);
const idOf = async (file: string) => ((await A.get('/api/photos')).body.photos as any[]).find((p) => p.file === file)?.id as number;

beforeAll(async () => {
  env = makeEnv(); A = api(env);
  (env.cfg as any).libraries = [env.lib];
  for (const [n, c] of [['keep.jpg', '#336699'], ['low.jpg', '#993333'], ['mid.jpg', '#339966'], ['gone.jpg', '#996633']] as const) await put(n, c);
  await A.post('/api/library/scan?wait=1');
});
afterAll(() => { env.app.close(); cleanup(env); });

describe('taking a photograph out of Frames', () => {
  it('removes its record, reviews and previews, leaves the file in the library alone, and a scan does not bring it back', async () => {
    const id = await idOf('gone.jpg');
    env.db.prepare("INSERT INTO reviews(photo_id, session, run_id, date, rating) VALUES (?, 1, 'r', '2026-01-01T00:00:00.000Z', 2)").run(id);
    expect(fs.existsSync(path.join(env.data, 'derivatives', String(id)))).toBe(true);
    expect((await A.del(`/api/photos/${id}`)).body).toMatchObject({ removed: 1, filesDeleted: 0, kept: 1 });
    expect((await A.get(`/api/photos/${id}`)).status).toBe(404);
    expect(env.db.prepare('SELECT COUNT(*) n FROM reviews WHERE photo_id = ?').get(id)).toEqual({ n: 0 });
    expect(fs.existsSync(path.join(env.data, 'derivatives', String(id)))).toBe(false);
    expect(fs.existsSync(path.join(env.lib, 'gone.jpg'))).toBe(true); // a file in a library folder is never touched
    await A.post('/api/library/scan?wait=1');
    expect(await idOf('gone.jpg')).toBeUndefined(); // not imported again
    expect((await A.get('/api/removed')).body.count).toBe(1);
    // Bringing them back: the next scan imports whatever is still there.
    expect((await A.post('/api/removed/restore')).body.cleared).toBe(1);
    await A.post('/api/library/scan?wait=1');
    expect(await idOf('gone.jpg')).toBeDefined();
  });
  it('deletes the copy Frames holds itself (an upload), but only that', async () => {
    const up = path.join(env.data, 'originals', 'uploaded.jpg');
    fs.mkdirSync(path.dirname(up), { recursive: true });
    fs.writeFileSync(up, await jpg(svg(900, 600, '#112233', '#eeeeee', [0.3, 0.3])));
    (env.cfg as any).libraries = [env.lib, path.join(env.data, 'originals')];
    await A.post('/api/library/scan?wait=1');
    const id = await idOf('uploaded.jpg');
    expect(id).toBeDefined();
    expect((await A.del(`/api/photos/${id}`)).body).toMatchObject({ removed: 1, filesDeleted: 1 });
    expect(fs.existsSync(up)).toBe(false);
  });
  it('removes a whole photoshoot with its photographs and share links, and refuses nonsense', async () => {
    const shoot = (await A.get('/api/photos')).body.photos[0].shootId;
    await A.post('/api/shares', { kind: 'shoot', id: shoot, allowDownload: false, allowReview: false });
    const r = await A.del(`/api/shoots/${shoot}`);
    expect(r.status).toBe(200);
    expect(r.body.removed).toBeGreaterThan(0);
    expect((await A.get(`/api/shoots/${shoot}`)).status).toBe(404);
    expect(env.db.prepare("SELECT COUNT(*) n FROM shares WHERE kind = 'shoot' AND target_id = ?").get(shoot)).toEqual({ n: 0 });
    expect((await A.del('/api/shoots/999999')).status).toBe(404);
    expect((await A.del('/api/photos/999999')).status).toBe(404);
    expect((await A.post('/api/photos/remove', { ids: 'x' })).status).toBe(400);
    expect((await A.post('/api/photos/remove', { ids: [] })).status).toBe(400);
  });
});

describe('suggesting what to delete by its review score', () => {
  it('is off until a score is chosen, then lists only photographs whose average, after every session, is below it, lowest first', async () => {
    // The photoshoot test above emptied the library: three new photographs with different ratings.
    await put('x1.jpg', '#101010'); await put('x2.jpg', '#202020'); await put('x3.jpg', '#303030');
    await A.post('/api/library/scan?wait=1');
    const list = ((await A.get('/api/photos')).body.photos as any[]).map((p) => p.id as number).slice(0, 3);
    env.db.prepare('DELETE FROM reviews').run();
    const rate = (id: number, ratings: number[]) => ratings.forEach((r, i) => env.db.prepare("INSERT INTO reviews(photo_id, session, run_id, date, rating) VALUES (?, ?, ?, '2026-01-01T00:00:00.000Z', ?)").run(id, i + 1, `r${id}${i}`, r));
    await A.put('/api/settings', { sessions: 4 });
    rate(list[0], [1, 1, 2, 1]);       // average 1.25, all sessions done
    rate(list[1], [2, 2, 2, 3]);       // average 2.25
    rate(list[2], [1, 1]);             // very low, but only two of four sessions: not yet
    expect((await A.get('/api/photos/delete-suggestions')).body.photos).toEqual([]); // off by default
    expect((await A.put('/api/settings', { deleteBelow: 2 })).body.deleteBelow).toBe(2);
    let s = (await A.get('/api/photos/delete-suggestions')).body;
    expect(s.photos.map((p: any) => p.id)).toEqual([list[0]]);
    expect(s.photos[0]).toMatchObject({ avg: 1.25, reviews: 4 });
    await A.put('/api/settings', { deleteBelow: 2.5 });
    s = (await A.get('/api/photos/delete-suggestions')).body;
    expect(s.photos.map((p: any) => p.id)).toEqual([list[0], list[1]]); // lowest first
    expect((await A.put('/api/settings', { deleteBelow: 2.26 })).body.deleteBelow).toBe(2.5); // half-point steps
    expect((await A.put('/api/settings', { deleteBelow: 99 })).body.deleteBelow).toBe(4.5);
    expect((await A.put('/api/settings', { deleteBelow: -3 })).body.deleteBelow).toBe(0);
  });
});
