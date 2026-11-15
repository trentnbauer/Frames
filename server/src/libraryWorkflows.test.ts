import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, cleanup, jpg, makeEnv, svg, type Env } from './testutil.js';
import { migrate } from './db.js';
let env: Env, a: ReturnType<typeof api>, ids: number[];
const row = (id: number) => env.db.prepare('SELECT * FROM photos WHERE id=?').get(id) as any;
const layout = (id: number) => ({
  mode: 'free',
  prints: [
    {
      id: 1,
      size: 'A4',
      orientation: 'landscape',
      frame: { size: 'A3', mat: 'white', color: 'oak' },
      photoId: id,
      photoId2: null,
      stack: false,
      x: 12,
      y: 34,
      crop: { zoom: 1.5, shiftX: 5, shiftY: -3 },
    },
  ],
});
beforeEach(async () => {
  env = makeEnv();
  a = api(env);
  for (const [name, color] of [
    ['a.jpg', '#225588'],
    ['b.jpg', '#bb7733'],
  ])
    fs.writeFileSync(path.join(env.lib, name), await jpg(svg(120, 80, color, '#eeeeee', [0.3, 0.3])));
  expect((await a.scan()).status).toBe(200);
  ids = (env.db.prepare('SELECT id FROM photos ORDER BY id').all() as any[]).map((p) => p.id);
});
afterEach(async () => {
  await env.app.close();
  cleanup(env);
});
describe('recoverable changes', () => {
  it('restores ratings, tags and descriptions without changing originals or reopening shares', async () => {
    const id = ids[0],
      original = fs.readFileSync(row(id).path);
    await a.patch(`/api/photos/${id}`, { description: 'My description', camera: 'Minolta XD' });
    env.db
      .prepare("INSERT INTO reviews(photo_id,session,run_id,date,rating)VALUES(?,1,'recovery-test',?,2)")
      .run(id, new Date().toISOString());
    env.db.prepare("INSERT INTO tags(photo_id,name,kind,source,accepted)VALUES(?,'car','subject','user',1)").run(id);
    await a.del(`/api/photos/${id}`);
    const recovered = (await a.get('/api/recovery')).body[0];
    expect(JSON.stringify(recovered)).not.toContain(env.lib);
    const response = await a.post(`/api/recovery/${recovered.id}/restore`);
    expect(response.status).toBe(200);
    expect(response.body.previewReady).toBe(true);
    expect(row(response.body.id)).toMatchObject({ description: 'My description', camera: 'Minolta XD' });
    expect(env.db.prepare('SELECT rating FROM reviews WHERE photo_id=?').all(response.body.id)).toEqual([{ rating: 2 }]);
    expect(env.db.prepare("SELECT name FROM tags WHERE photo_id=? AND name='car'").get(response.body.id)).toEqual({ name: 'car' });
    expect(fs.readFileSync(row(response.body.id).path)).toEqual(original);
    expect((await a.post(`/api/recovery/${recovered.id}/restore`)).status).toBe(410);
  });
  it('rejects an original replaced with another photograph and expires recovery', async () => {
    const file = row(ids[0]).path;
    await a.del(`/api/photos/${ids[0]}`);
    const recovery = (await a.get('/api/recovery')).body[0];
    fs.writeFileSync(file, await jpg(svg(120, 80, '#00ff00', '#bb00aa', [0.8, 0.6])));
    expect((await a.post(`/api/recovery/${recovery.id}/restore`)).status).toBe(409);
    env.db.prepare("UPDATE photo_recovery SET removed_at='2000-01-01T00:00:00.000Z'").run();
    expect((await a.get('/api/recovery')).body).toEqual([]);
    expect((await a.post(`/api/recovery/${recovery.id}/restore`)).status).toBe(410);
  });
  it('undoes manual edits and refuses to overwrite subsequent changes', async () => {
    const original = row(ids[0]).camera;
    const first = await a.patch(`/api/photos/${ids[0]}`, { camera: 'Minolta XD' });
    expect(first.body.operationId).toBeGreaterThan(0);
    await a.patch(`/api/photos/${ids[0]}`, { camera: 'Minolta SRT' });
    expect((await a.post(`/api/changes/${first.body.operationId}/undo`)).status).toBe(409);
    const second = (await a.get('/api/changes')).body[0];
    expect((await a.post(`/api/changes/${second.id}/undo`)).status).toBe(200);
    expect((await a.post(`/api/changes/${first.body.operationId}/undo`)).status).toBe(200);
    expect(row(ids[0]).camera).toBe(original);
  });
  it('validates a manual edit before committing any fields', async () => {
    const before = row(ids[0]);
    const response = await a.patch(`/api/photos/${ids[0]}`, { camera: 'Should roll back', lat: 999, lon: 1 });
    expect(response.status).toBe(400);
    expect(row(ids[0]).camera).toBe(before.camera);
  });
});
describe('batch edits and owned aliases', () => {
  it('previews fill-blanks changes, applies once and undoes the whole batch', async () => {
    await a.patch(`/api/photos/${ids[0]}`, { camera: 'Keep me' });
    const body = { ids, patch: { camera: 'Minolta XD', lens: 'MD 50mm', tags: ['car'] }, fillBlanks: true };
    const preview = (await a.post('/api/photos/bulk-preview', body)).body;
    expect(preview.counts).toMatchObject({ camera: 1, lens: 2, tags: 2 });
    expect(row(ids[1]).camera).toBe('');
    const applied = await a.post('/api/photos/bulk-apply', { ...body, versions: preview.versions });
    expect(applied.status).toBe(200);
    expect(row(ids[0]).camera).toBe('Keep me');
    expect(row(ids[1]).camera).toBe('Minolta XD');
    expect((await a.post(`/api/changes/${applied.body.operationId}/undo`)).status).toBe(200);
    expect(row(ids[0]).camera).toBe('Keep me');
    expect(row(ids[1]).camera).toBe('');
    expect(env.db.prepare("SELECT 1 FROM tags WHERE name='car'").get()).toBeUndefined();
  });
  it('rejects stale batch previews atomically and bounds network input', async () => {
    const body = { ids, patch: { lens: 'Test lens' }, fillBlanks: false };
    const versions = (await a.post('/api/photos/bulk-preview', body)).body.versions;
    await a.patch(`/api/photos/${ids[1]}`, { description: 'A newer edit' });
    expect((await a.post('/api/photos/bulk-apply', { ...body, versions })).status).toBe(409);
    expect(row(ids[0]).lens).toBe('');
    expect((await a.post('/api/photos/bulk-preview', { ids, patch: { path: '/tmp/example' } })).status).toBe(400);
  });
  it('maps current and future metadata to owned gear, retains raw values and lets the blocklist win', async () => {
    const gear = (await a.post('/api/gear/items', { name: 'Minolta XD', type: 'camera' })).body;
    await a.patch(`/api/photos/${ids[0]}`, { camera: 'MINOLTA XD-7' });
    expect((await a.post('/api/gear/aliases/preview', { gearId: gear.id, name: 'MINOLTA XD-7' })).body.affected).toBe(1);
    expect((await a.post('/api/gear/aliases', { gearId: gear.id, name: 'MINOLTA XD-7' })).status).toBe(200);
    expect(row(ids[0])).toMatchObject({ camera: 'Minolta XD', raw_camera: 'MINOLTA XD-7' });
    fs.writeFileSync(
      path.join(env.lib, 'future.jpg'),
      await jpg(svg(150, 100, '#ee7722', '#118833', [0.7, 0.4]), { exif: { IFD0: { Model: 'MINOLTA XD-7' } } }),
    );
    await a.scan();
    const future = env.db.prepare("SELECT * FROM photos WHERE file='future.jpg'").get() as any;
    expect(future).toMatchObject({ camera: 'Minolta XD', raw_camera: 'MINOLTA XD-7' });
    await a.post('/api/gear/blacklist', { name: 'MINOLTA XD-7' });
    expect(row(future.id).camera).toBe('');
    expect(row(ids[0]).camera).toBe('');
    expect(row(future.id).raw_camera).toBe('MINOLTA XD-7');
  });
});
describe('saved views and review scheduling', () => {
  it('stores safe live filter definitions and supports rename and deletion', async () => {
    const saved = await a.post('/api/views', { name: 'My cameras', filters: 'camera=Minolta&review=due' });
    expect(saved.status).toBe(200);
    expect((await a.post('/api/views', { name: 'my cameras', filters: '' })).status).toBe(409);
    expect((await a.post('/api/views', { name: 'Bad', filters: 'sql=SELECT' })).status).toBe(400);
    expect((await a.patch(`/api/views/${saved.body.id}`, { name: 'Renamed', filters: 'lens=MD' })).status).toBe(200);
    expect((await a.get('/api/views')).body[0]).toMatchObject({ name: 'Renamed', filters: 'lens=MD' });
    expect((await a.del(`/api/views/${saved.body.id}`)).status).toBe(200);
  });
  it('moves photos between due and upcoming using the queue dates, with undo', async () => {
    env.db.prepare("UPDATE photos SET next_review_at='2000-01-01T00:00:00.000Z'").run();
    const due = (await a.get('/api/review/schedule')).body;
    expect(due.counts.due).toBe(2);
    const next = await a.post('/api/review/reschedule', { ids: [ids[0]], due: '2099-01-01T00:00:00.000Z' });
    expect((await a.get('/api/review/schedule?status=upcoming')).body.photos.map((p: any) => p.id)).toEqual([ids[0]]);
    expect((await a.get('/api/review/schedule')).body.counts.due).toBe(1);
    await a.post(`/api/changes/${next.body.operationId}/undo`);
    expect((await a.get('/api/review/schedule')).body.counts.due).toBe(2);
    expect(JSON.stringify(due)).not.toContain('rating');
  });
});
describe('arrangements and import outcomes', () => {
  it('pins shared snapshots, protects their photos and refuses edits while Done', async () => {
    const c = (await a.post('/api/collections', { name: 'Wall', photoIds: ids, layout: layout(ids[0]) })).body;
    const version = (await a.post(`/api/collections/${c.id}/versions`, { name: 'First wall' })).body;
    const share = (await a.post('/api/shares', { kind: 'collection', id: c.id, versionId: version.id, askName: false, onlyWall: true }))
      .body;
    await a.patch(`/api/collections/${c.id}`, { layout: layout(ids[1]) });
    const guest = await a.get(`/api/s/${share.token}`);
    expect(guest.status).toBe(200);
    expect(guest.body.layout.prints[0].photoId).toBe(ids[0]);
    expect(guest.body.photos.map((p: any) => p.id)).toEqual([ids[0]]);
    expect((await a.del(`/api/collections/${c.id}/versions/${version.id}`)).status).toBe(409);
    const liveShare = (await a.post('/api/shares', { kind: 'collection', id: c.id, askName: false })).body;
    expect((await a.post(`/api/collections/${c.id}/versions/${version.id}/apply`)).status).toBe(200);
    expect((await a.get(`/api/collections/${c.id}`)).body.layout.prints[0].photoId).toBe(ids[0]);
    expect((await a.get(`/api/s/${liveShare.token}`)).body.layout.prints[0].photoId).toBe(ids[1]);
    await a.patch(`/api/collections/${c.id}`, { stage: 'done' });
    expect((await a.post(`/api/collections/${c.id}/versions/${version.id}/apply`)).status).toBe(409);
    expect((await a.get(`/api/collections/${c.id}/versions/${version.id}/print-sheet`)).headers['content-type']).toContain(
      'application/pdf',
    );
    const other = (await a.post('/api/collections', { name: 'Other' })).body;
    expect((await a.post('/api/shares', { kind: 'collection', id: other.id, versionId: version.id })).status).toBe(400);
  });
  it('records duplicates and failed previews and retries only unfinished files', async () => {
    fs.copyFileSync(path.join(env.lib, 'a.jpg'), path.join(env.lib, 'duplicate.jpg'));
    fs.writeFileSync(path.join(env.lib, 'broken.jpg'), 'not an image');
    await a.scan();
    const runs = (await a.get('/api/imports')).body;
    const detail = (await a.get(`/api/imports/${runs[0].id}`)).body;
    expect(detail.counts).toMatchObject({ duplicate: 1, failed: 1 });
    expect(JSON.stringify(detail)).not.toContain(env.lib);
    const file = detail.files.find((f: any) => f.status === 'failed');
    fs.writeFileSync(path.join(env.lib, 'broken.jpg'), await jpg(svg(140, 90, '#ffee11', '#113333', [0.7, 0.5])));
    const retried = await a.post(`/api/imports/${runs[0].id}/retry`, { fileId: file.id });
    expect(retried.body).toMatchObject({ retried: 1, failed: 0 });
    expect((await a.post(`/api/imports/${runs[0].id}/retry`)).body.retried).toBe(0);
    expect(env.db.prepare('SELECT COUNT(*) n FROM photos').get()).toEqual({ n: 3 });
  });
});
describe('wishlist decisions and migrations', () => {
  it('retains estimates, paid amounts and currency and safely restores declined or purchased wishes', async () => {
    await a.put('/api/gear/prefs', { currency: '€' });
    const wanted = (
      await a.post('/api/gear/items', { name: 'MD 50mm', kind: 'want', type: 'lens', price: 100, link: 'https://example.com/lens' })
    ).body;
    const bought = await a.post(`/api/gear/items/${wanted.id}/bought`, { price: 80 });
    expect(bought.status).toBe(200);
    const entry = (await a.get('/api/gear/history')).body.entries[0];
    expect(entry).toMatchObject({ estimated: 100, paid: 80, currency: '€' });
    await a.patch(`/api/gear/items/${wanted.id}`, { serial: 'user-edited' });
    expect((await a.post(`/api/gear/history/${entry.id}/undo`)).status).toBe(409);
    expect((await a.post(`/api/gear/history/${entry.id}/restore`)).status).toBe(200);
    const restored = (await a.get('/api/gear/items')).body.want[0];
    expect(restored.price).toBe(100);
    await a.del(`/api/gear/items/${restored.id}?kind=want`);
    const declined = (await a.get('/api/gear/history?kind=declined')).body.entries[0];
    expect(declined.name).toBe('MD 50mm');
    expect((await a.post(`/api/gear/history/${declined.id}/undo`)).status).toBe(200);
    expect((await a.post(`/api/gear/history/${declined.id}/undo`)).status).toBe(410);
  });
  it('replays appended migrations without losing records', () => {
    env.db.pragma('user_version=1');
    expect(() => migrate(env.db)).not.toThrow();
    expect(env.db.prepare('SELECT COUNT(*) n FROM photos').get()).toEqual({ n: 2 });
  });
});

describe('workflow safeguards', () => {
  it('supports alias Undo and a configurable recovery period', async () => {
    const gear = (await a.post('/api/gear/items', { name: 'Canonical', type: 'camera' })).body;
    await a.patch(`/api/photos/${ids[0]}`, { camera: 'Regional name' });
    const add = await a.post('/api/gear/aliases', { gearId: gear.id, name: 'Regional name' });
    expect(row(ids[0]).camera).toBe('Canonical');
    expect((await a.post(`/api/changes/${add.body.operationId}/undo`)).status).toBe(200);
    expect(row(ids[0]).camera).toBe('Regional name');
    expect((await a.put('/api/recovery/settings', { days: 60 })).status).toBe(200);
    expect((await a.get('/api/recovery/settings')).body.days).toBe(60);
    expect((await a.put('/api/recovery/settings', { days: 0 })).status).toBe(400);
    expect((await a.post('/api/photos/bulk-preview', { ids, patch: JSON.parse('{"__proto__":"bad"}') })).status).toBe(400);
  });
  it('resumes large batches at the next chunk and keeps one conflict-safe Undo', async () => {
    const original = row(ids[0]),
      fields = Object.keys(original).filter((key) => key !== 'id');
    const insert = env.db.prepare(`INSERT INTO photos(${fields.join(',')})VALUES(${fields.map(() => '?').join(',')})`);
    for (let index = 0; index < 499; index++) {
      const value = { ...original, path: original.path + index, hash: 'batch-' + index };
      ids.push(Number(insert.run(...fields.map((key) => value[key])).lastInsertRowid));
    }
    const body = { ids, patch: { description: 'Batch description' }, fillBlanks: true },
      versions: any = {};
    for (let start = 0; start < ids.length; start += 500)
      Object.assign(versions, (await a.post('/api/photos/bulk-preview', { ...body, ids: ids.slice(start, start + 500) })).body.versions);
    const job = (await a.post('/api/photos/bulk-jobs', { ...body, versions })).body;
    const first = await a.post(`/api/photos/bulk-jobs/${job.id}/advance`);
    expect(first.body.cursor).toBe(500);
    expect(row(ids[500]).description).toBe('');
    expect((await a.get('/api/photos/bulk-jobs')).body[0]).toMatchObject({ cursor: 500, status: 'pending' });
    const second = await a.post(`/api/photos/bulk-jobs/${job.id}/advance`);
    expect(second.body).toMatchObject({ cursor: 501, status: 'complete', operationId: first.body.operationId });
    expect((await a.post(`/api/changes/${second.body.operationId}/undo`)).body.undone).toBe(501);
    expect(row(ids[500]).description).toBe('');
    expect((await a.post(`/api/photos/bulk-jobs/${job.id}/advance`)).status).toBe(409);
  });
  it('retains private room backgrounds and protects photos referenced only by saved alternatives', async () => {
    const c = (await a.post('/api/collections', { name: 'Private room', photoIds: ids, layout: layout(ids[0]) })).body;
    const room = await jpg(svg(200, 140, '#336699', '#eeeeee', [0.5, 0.4]));
    await a.put(`/api/collections/${c.id}/background`, { image: `data:image/jpeg;base64,${room.toString('base64')}` });
    const version = (await a.post(`/api/collections/${c.id}/versions`, { name: 'With room' })).body;
    const background = (await a.get(`/api/collections/${c.id}/versions/${version.id}/background`)).body;
    await a.del(`/api/collections/${c.id}/background`);
    expect((await a.get(`/api/collections/${c.id}/versions/${version.id}/background`)).body).toEqual(background);
    await a.del(`/api/collections/${c.id}/photos/${ids[0]}`);
    for (let session = 1; session <= 4; session++)
      env.db
        .prepare('INSERT INTO reviews(photo_id,session,run_id,date,rating)VALUES(?,?,?,?,1)')
        .run(ids[0], session, 'saved-' + session, new Date().toISOString());
    await a.put('/api/settings', { deleteBelow: 2.5 });
    expect((await a.get('/api/photos/delete-suggestions')).body.photos.some((p: any) => p.id === ids[0])).toBe(false);
    expect((await a.post(`/api/collections/${c.id}/versions/${version.id}/apply`)).status).toBe(200);
    expect((await a.get(`/api/collections/${c.id}/background`)).body).toEqual(background);
    const share = (await a.post('/api/shares', { kind: 'collection', id: c.id, versionId: version.id, askName: false })).body;
    expect(JSON.stringify((await a.get(`/api/s/${share.token}`)).body)).not.toContain('"background"');
    await a.del(`/api/photos/${ids[0]}`);
    expect((await a.get(`/api/s/${share.token}`)).status).toBe(410);
  });
});

it('guards saved-version original exports and detaches removed photos from import history', async () => {
  const c = (await a.post('/api/collections', { name: 'Export wall', photoIds: ids, layout: layout(ids[0]) })).body;
  const version = (await a.post(`/api/collections/${c.id}/versions`, { name: 'Export version' })).body;
  const url = `/api/collections/${c.id}/versions/${version.id}/photos/${ids[0]}/original`;
  expect((await a.get(url)).status).toBe(302);
  expect((await a.get(`/api/collections/${c.id}/versions/${version.id}/photos/${ids[1]}/original`)).status).toBe(404);
  await a.del(`/api/photos/${ids[0]}`);
  expect((await a.get(url)).status).toBe(409);
  expect((await a.get(`/api/collections/${c.id}/versions`)).body[0].available).toBe(false);
  expect(env.db.prepare('SELECT COUNT(*) n FROM import_files WHERE photo_id=?').get(ids[0])).toEqual({ n: 0 });
});

it('restores into a new photo ID when a later import reused the old number', async () => {
  const oldId = ids[1],
    oldFile = row(oldId).file;
  await a.patch(`/api/photos/${oldId}`, { description: 'Retained description' });
  await a.del(`/api/photos/${oldId}`);
  const recovery = (await a.get('/api/recovery')).body[0];
  fs.writeFileSync(path.join(env.lib, 'new.jpg'), await jpg(svg(160, 110, '#229944', '#aabb77', [0.7, 0.6])));
  await a.scan();
  expect(row(oldId).file).toBe('new.jpg');
  const restored = await a.post(`/api/recovery/${recovery.id}/restore`);
  expect(restored.status).toBe(200);
  expect(restored.body.id).not.toBe(oldId);
  expect(row(restored.body.id)).toMatchObject({ file: oldFile, description: 'Retained description' });
  expect(row(oldId).file).toBe('new.jpg');
});
