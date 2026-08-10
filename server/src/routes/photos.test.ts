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
    expect(photo.tags).toEqual([]);

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

    const withTag = await request(app).get(`/api/photos/${id}`);
    expect(withTag.body.photo.tags).toHaveLength(1);
    expect(withTag.body.photo.tags[0]).toMatchObject({ name: 'Neon Signage', source: 'user_added' });

    const noted = await request(app)
      .patch(`/api/photos/${id}/tags/${withTag.body.photo.tags[0].id}`)
      .send({ note: 'the cast shadow, not paint' });
    expect(noted.status).toBe(200);

    const afterNote = await request(app).get(`/api/photos/${id}`);
    expect(afterNote.body.photo.tags[0].note).toBe('the cast shadow, not paint');

    const removed = await request(app).delete(`/api/photos/${id}/tags/${withTag.body.photo.tags[0].id}`);
    expect(removed.status).toBe(204);

    const afterRemove = await request(app).get(`/api/photos/${id}`);
    expect(afterRemove.body.photo.tags).toEqual([]);
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

  it('deletes a photo', async () => {
    const list = await request(app).get('/api/photos');
    const id = list.body.photos[0].id;
    const del = await request(app).delete(`/api/photos/${id}`);
    expect(del.status).toBe(204);
    const missing = await request(app).get(`/api/photos/${id}`);
    expect(missing.status).toBe(404);
  });

  it('404s for an unknown photo id', async () => {
    const res = await request(app).get('/api/photos/999999');
    expect(res.status).toBe(404);
  });
});
