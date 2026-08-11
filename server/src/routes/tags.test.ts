import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, tinyJpeg } from '../test/helpers.js';

async function uploadPhoto(app: Express, seed: number, filename: string) {
  const jpeg = await tinyJpeg(seed);
  const res = await request(app).post('/api/photos/upload').attach('photos', jpeg, filename);
  return res.body.results[0].photo;
}

describe('tags routes', () => {
  let app: Express;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp());
  });

  afterAll(() => cleanup());

  it('renames a tag in place', async () => {
    const photo = await uploadPhoto(app, 1, 'a.jpg');
    await request(app).post(`/api/photos/${photo.id}/tags`).send({ name: 'Neon Signage', source: 'user_added' });
    const tagId = (await request(app).get('/api/tags')).body.tags.find((t: { name: string }) => t.name === 'Neon Signage').id;

    const res = await request(app).patch(`/api/tags/${tagId}`).send({ name: 'Signage' });
    expect(res.status).toBe(200);
    expect(res.body.tag).toMatchObject({ name: 'Signage', slug: 'signage', photo_count: 1 });

    const photoAfter = await request(app).get(`/api/photos/${photo.id}`);
    expect(photoAfter.body.photo.tags.map((t: { name: string }) => t.name)).toContain('Signage');
  });

  it('rejects a rename that collides with an existing tag, pointing at merge instead', async () => {
    const photo = await uploadPhoto(app, 2, 'b.jpg');
    await request(app).post(`/api/photos/${photo.id}/tags`).send({ name: 'Portrait', source: 'user_added' });
    const tags = (await request(app).get('/api/tags')).body.tags;
    const signage = tags.find((t: { name: string }) => t.name === 'Signage');
    const portrait = tags.find((t: { name: string }) => t.name === 'Portrait');

    const res = await request(app).patch(`/api/tags/${portrait.id}`).send({ name: 'Signage' });
    expect(res.status).toBe(409);
    expect(res.body.conflictTagId).toBe(signage.id);

    // Unchanged — the rename was rejected, not partially applied.
    const stillPortrait = (await request(app).get('/api/tags')).body.tags.find((t: { id: number }) => t.id === portrait.id);
    expect(stillPortrait.name).toBe('Portrait');
  });

  it('merges one tag into another, moving every photo link and deleting the source tag', async () => {
    const photoA = await uploadPhoto(app, 3, 'c.jpg');
    const photoB = await uploadPhoto(app, 4, 'd.jpg');
    await request(app).post(`/api/photos/${photoA.id}/tags`).send({ name: 'Portraits', source: 'user_added' });
    await request(app).post(`/api/photos/${photoB.id}/tags`).send({ name: 'Portrait', source: 'user_added' });

    const tags = (await request(app).get('/api/tags')).body.tags;
    const portrait = tags.find((t: { name: string }) => t.name === 'Portrait');
    const portraits = tags.find((t: { name: string }) => t.name === 'Portraits');

    const res = await request(app).post('/api/tags/merge').send({ fromId: portraits.id, intoId: portrait.id });
    expect(res.status).toBe(200);
    expect(res.body.tag.id).toBe(portrait.id);
    expect(res.body.tag.photo_count).toBeGreaterThanOrEqual(2);

    const afterA = await request(app).get(`/api/photos/${photoA.id}`);
    expect(afterA.body.photo.tags.map((t: { name: string }) => t.name)).toContain('Portrait');
    expect(afterA.body.photo.tags.map((t: { name: string }) => t.name)).not.toContain('Portraits');

    const remainingTags = (await request(app).get('/api/tags')).body.tags;
    expect(remainingTags.find((t: { id: number }) => t.id === portraits.id)).toBeUndefined();
  });

  it('a photo already carrying the surviving tag keeps a single link after merging in a duplicate', async () => {
    const photo = await uploadPhoto(app, 5, 'e.jpg');
    await request(app).post(`/api/photos/${photo.id}/tags`).send({ name: 'Wet', source: 'user_added' });
    await request(app).post(`/api/photos/${photo.id}/tags`).send({ name: 'wet-street', source: 'user_added' });

    const tags = (await request(app).get('/api/tags')).body.tags;
    const wet = tags.find((t: { name: string }) => t.name === 'Wet');
    const wetStreet = tags.find((t: { name: string }) => t.name === 'wet-street');

    const res = await request(app).post('/api/tags/merge').send({ fromId: wetStreet.id, intoId: wet.id });
    expect(res.status).toBe(200);

    const afterPhoto = await request(app).get(`/api/photos/${photo.id}`);
    const wetLinks = afterPhoto.body.photo.tags.filter((t: { slug: string }) => t.slug === 'wet');
    expect(wetLinks).toHaveLength(1);
  });

  it('deletes a tag entirely, removing it from every photo', async () => {
    const photo = await uploadPhoto(app, 6, 'f.jpg');
    await request(app).post(`/api/photos/${photo.id}/tags`).send({ name: 'Temporary', source: 'user_added' });
    const tagId = (await request(app).get('/api/tags')).body.tags.find((t: { name: string }) => t.name === 'Temporary').id;

    const res = await request(app).delete(`/api/tags/${tagId}`);
    expect(res.status).toBe(204);

    const afterPhoto = await request(app).get(`/api/photos/${photo.id}`);
    expect(afterPhoto.body.photo.tags.map((t: { name: string }) => t.name)).not.toContain('Temporary');

    const missing = await request(app).delete(`/api/tags/${tagId}`);
    expect(missing.status).toBe(404);
  });
});
