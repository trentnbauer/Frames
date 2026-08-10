import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, tinyJpeg } from '../test/helpers.js';

describe('photos routes', () => {
  let app: Express;
  let cleanup: () => void;
  let jpeg: Buffer;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp());
    jpeg = await tinyJpeg();
  });

  afterAll(() => cleanup());

  it('starts with an empty library', async () => {
    const res = await request(app).get('/api/photos');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ photos: [], total: 0 });
  });

  it('ingests an uploaded photo with derivatives and content-hash dedupe', async () => {
    const first = await request(app).post('/api/photos/upload').attach('photos', jpeg, 'test-frame.jpg');
    expect(first.status).toBe(201);
    expect(first.body.results).toHaveLength(1);
    const photo = first.body.results[0].photo;
    expect(first.body.results[0].wasDuplicate).toBe(false);
    expect(photo.filename).toBe('test-frame.jpg');
    expect(photo.thumb_path).toBeTruthy();
    expect(photo.display_path).toBeTruthy();
    // The fixture is a solid near-black square, so ingest auto-tags it with
    // its one dominant color (see addColorTags in lib/ingest.ts).
    expect(photo.tags).toEqual([expect.objectContaining({ name: 'black', source: 'ai_suggested' })]);

    // Re-uploading identical bytes should dedupe to the same photo id.
    const second = await request(app).post('/api/photos/upload').attach('photos', jpeg, 'test-frame-again.jpg');
    expect(second.status).toBe(201);
    expect(second.body.results[0].wasDuplicate).toBe(true);
    expect(second.body.results[0].photo.id).toBe(photo.id);

    const list = await request(app).get('/api/photos');
    expect(list.body.total).toBe(1);
  });

  it('serves thumb and display derivatives', async () => {
    const list = await request(app).get('/api/photos');
    const id = list.body.photos[0].id;
    const thumb = await request(app).get(`/files/thumb/${id}`);
    expect(thumb.status).toBe(200);
    const display = await request(app).get(`/files/display/${id}`);
    expect(display.status).toBe(200);
  });

  it('adds, confirms, and removes tags on a photo (the correction path)', async () => {
    const list = await request(app).get('/api/photos');
    const id = list.body.photos[0].id;

    const added = await request(app).post(`/api/photos/${id}/tags`).send({ name: 'Neon Signage', source: 'user_added' });
    expect(added.status).toBe(201);
    expect(added.body.slug).toBe('neon-signage');

    // The photo already carries an automatic "black" color tag from ingest
    // (see addColorTags in lib/ingest.ts) — look up the new tag by name
    // rather than assuming it's the only one or at a fixed index.
    const withTag = await request(app).get(`/api/photos/${id}`);
    const neonTag = withTag.body.photo.tags.find((t: { name: string }) => t.name === 'Neon Signage');
    expect(neonTag).toMatchObject({ name: 'Neon Signage', source: 'user_added' });

    const noted = await request(app).patch(`/api/photos/${id}/tags/${neonTag.id}`).send({ note: 'the cast shadow, not paint' });
    expect(noted.status).toBe(200);

    const afterNote = await request(app).get(`/api/photos/${id}`);
    expect(afterNote.body.photo.tags.find((t: { id: number }) => t.id === neonTag.id).note).toBe('the cast shadow, not paint');

    const removed = await request(app).delete(`/api/photos/${id}/tags/${neonTag.id}`);
    expect(removed.status).toBe(204);

    const afterRemove = await request(app).get(`/api/photos/${id}`);
    expect(afterRemove.body.photo.tags).toEqual([expect.objectContaining({ name: 'black' })]);
  });

  it('updates shoot-detail fields and reflects them in shoot-options', async () => {
    const list = await request(app).get('/api/photos');
    const id = list.body.photos[0].id;

    const patched = await request(app)
      .patch(`/api/photos/${id}`)
      .send({ camera: 'Minolta SRT303', location: 'Melbourne CBD' });
    expect(patched.status).toBe(200);
    expect(patched.body.photo.camera).toBe('Minolta SRT303');
    expect(patched.body.photo.location).toBe('Melbourne CBD');

    const options = await request(app).get('/api/photos/shoot-options');
    expect(options.body.camera).toContain('Minolta SRT303');
    expect(options.body.location).toContain('Melbourne CBD');
  });

  it('filters photos by camera + location together', async () => {
    const matching = await request(app).get('/api/photos').query({ camera: 'Minolta SRT303', location: 'Melbourne CBD' });
    expect(matching.body.photos).toHaveLength(1);

    const nonMatching = await request(app).get('/api/photos').query({ camera: 'Minolta SRT303', location: 'Nowhere' });
    expect(nonMatching.body.photos).toHaveLength(0);
  });

  it('paginates with limit/offset while total reflects the full count', async () => {
    // A distinct image (different seed) so it doesn't dedupe against the first.
    const secondJpeg = await tinyJpeg(2);
    await request(app).post('/api/photos/upload').attach('photos', secondJpeg, 'second.jpg');

    const page1 = await request(app).get('/api/photos').query({ limit: 1, offset: 0 });
    expect(page1.body.photos).toHaveLength(1);
    expect(page1.body.total).toBeGreaterThanOrEqual(1);

    const unpaginated = await request(app).get('/api/photos');
    expect(unpaginated.body.photos.length).toBe(unpaginated.body.total);
  });

  it('treats a negative or non-numeric limit as unpaginated rather than passing it to SQLite', async () => {
    // Regression: SQLite treats `LIMIT -5` as "no limit" — a negative limit
    // was silently returning everything instead of erroring or clamping.
    const total = (await request(app).get('/api/photos')).body.total;
    const negative = await request(app).get('/api/photos').query({ limit: -5, offset: -10 });
    expect(negative.body.photos.length).toBe(total);
    const nonNumeric = await request(app).get('/api/photos').query({ limit: 'abc' });
    expect(nonNumeric.body.photos.length).toBe(total);
  });

  it('search filters photos by filename substring', async () => {
    const matching = await request(app).get('/api/photos').query({ q: 'second' });
    expect(matching.body.photos.length).toBeGreaterThanOrEqual(1);
    expect(matching.body.photos.every((p: { filename: string }) => p.filename.includes('second'))).toBe(true);

    const none = await request(app).get('/api/photos').query({ q: 'nonexistent-filename-xyz' });
    expect(none.body.photos).toEqual([]);
  });

  it('soft-deletes a photo: hidden from listing, still fetchable by id, restorable', async () => {
    const list = await request(app).get('/api/photos');
    const id = list.body.photos[0].id;
    const totalBefore = list.body.total;

    const del = await request(app).delete(`/api/photos/${id}`);
    expect(del.status).toBe(204);

    const afterDelete = await request(app).get('/api/photos');
    expect(afterDelete.body.total).toBe(totalBefore - 1);
    expect(afterDelete.body.photos.find((p: { id: number }) => p.id === id)).toBeUndefined();

    // Still fetchable directly (soft delete, not gone) and shows up in trash.
    const direct = await request(app).get(`/api/photos/${id}`);
    expect(direct.status).toBe(200);
    expect(direct.body.photo.deleted_at).toBeTruthy();

    const trash = await request(app).get('/api/photos').query({ trashed: 'true' });
    expect(trash.body.photos.find((p: { id: number }) => p.id === id)).toBeTruthy();

    // Deleting again is a 404 (already gone, not idempotently re-deletable).
    const delAgain = await request(app).delete(`/api/photos/${id}`);
    expect(delAgain.status).toBe(404);

    const restored = await request(app).post(`/api/photos/${id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.photo.deleted_at).toBeNull();

    const afterRestore = await request(app).get('/api/photos');
    expect(afterRestore.body.total).toBe(totalBefore);
  });

  it('permanently deletes a trashed photo, removing files from disk', async () => {
    const fresh = await tinyJpeg(9);
    const uploaded = await request(app).post('/api/photos/upload').attach('photos', fresh, 'to-purge.jpg');
    const id = uploaded.body.results[0].photo.id;

    // Can't permanently delete something that isn't trashed yet.
    const tooEarly = await request(app).delete(`/api/photos/${id}/permanent`);
    expect(tooEarly.status).toBe(404);

    await request(app).delete(`/api/photos/${id}`);
    const purge = await request(app).delete(`/api/photos/${id}/permanent`);
    expect(purge.status).toBe(204);

    const gone = await request(app).get(`/api/photos/${id}`);
    expect(gone.status).toBe(404);

    const trash = await request(app).get('/api/photos').query({ trashed: 'true' });
    expect(trash.body.photos.find((p: { id: number }) => p.id === id)).toBeUndefined();
  });

  it('retags a photo: sets pending immediately, settles to skipped with no providers enabled', async () => {
    const list = await request(app).get('/api/photos');
    const id = list.body.photos[0].id;

    const retag = await request(app).post(`/api/photos/${id}/retag`);
    expect(retag.status).toBe(202);

    // No vision providers are configured in this test app, so it should
    // settle quickly to 'skipped' rather than staying 'pending' forever.
    await new Promise((r) => setTimeout(r, 200));
    const after = await request(app).get(`/api/photos/${id}`);
    expect(after.body.photo.tagging_status).toBe('skipped');
  });

  it('404s retagging an unknown photo id', async () => {
    const res = await request(app).post('/api/photos/999999/retag');
    expect(res.status).toBe(404);
  });

  it('404s for an unknown photo id', async () => {
    const res = await request(app).get('/api/photos/999999');
    expect(res.status).toBe(404);
  });
});
