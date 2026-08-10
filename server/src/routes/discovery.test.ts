import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, tinyJpeg } from '../test/helpers.js';

async function uploadPhoto(app: Express, seed: number, filename: string) {
  const jpeg = await tinyJpeg(seed);
  const res = await request(app).post('/api/photos/upload').attach('photos', jpeg, filename);
  return res.body.results[0].photo;
}

describe('discovery routes', () => {
  let app: Express;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp());
  });

  afterAll(() => cleanup());

  it('returns no combos when no photo has a location set', async () => {
    await uploadPhoto(app, 50, 'no-location.jpg');
    const res = await request(app).get('/api/combo-suggestions');
    expect(res.status).toBe(200);
    expect(res.body.combos).toEqual([]);
  });

  it('surfaces tag x location and camera x location combos', async () => {
    const photo = await uploadPhoto(app, 51, 'signage.jpg');
    await request(app).patch(`/api/photos/${photo.id}`).send({ camera: 'Minolta SRT303', location: 'Melbourne CBD' });
    await request(app).post(`/api/photos/${photo.id}/tags`).send({ name: 'signage', source: 'user_added' });

    const res = await request(app).get('/api/combo-suggestions');
    const types = res.body.combos.map((c: { type: string }) => c.type);
    expect(types).toContain('tag_location');
    expect(types).toContain('camera_location');

    const tagCombo = res.body.combos.find((c: { type: string }) => c.type === 'tag_location');
    expect(tagCombo).toMatchObject({ main: 'signage', slug: 'signage', secondary: 'Melbourne CBD', count: 1 });

    const cameraCombo = res.body.combos.find((c: { type: string }) => c.type === 'camera_location');
    expect(cameraCombo).toMatchObject({ main: 'Minolta SRT303', secondary: 'Melbourne CBD', count: 1 });
  });

  it('increments count when another photo shares the same combo', async () => {
    const photo = await uploadPhoto(app, 52, 'signage-2.jpg');
    await request(app).patch(`/api/photos/${photo.id}`).send({ camera: 'Minolta SRT303', location: 'Melbourne CBD' });
    await request(app).post(`/api/photos/${photo.id}/tags`).send({ name: 'signage', source: 'user_added' });

    const res = await request(app).get('/api/combo-suggestions');
    const cameraCombo = res.body.combos.find((c: { type: string }) => c.type === 'camera_location');
    expect(cameraCombo.count).toBe(2);
  });

  it('surfaces tag x tag co-occurrence once two tags share 2+ photos', async () => {
    const a = await uploadPhoto(app, 60, 'cooc-a.jpg');
    const b = await uploadPhoto(app, 61, 'cooc-b.jpg');
    for (const p of [a, b]) {
      await request(app).post(`/api/photos/${p.id}/tags`).send({ name: 'night', source: 'user_added' });
      await request(app).post(`/api/photos/${p.id}/tags`).send({ name: 'wet', source: 'user_added' });
    }

    const res = await request(app).get('/api/combo-suggestions');
    const pair = res.body.combos.find((c: { type: string }) => c.type === 'tag_tag');
    expect(pair).toBeTruthy();
    expect([pair.main, pair.secondary].sort()).toEqual(['night', 'wet']);
    expect(pair.count).toBe(2);
  });

  it('excludes soft-deleted photos from combo suggestions', async () => {
    const photo = await uploadPhoto(app, 62, 'trashed-combo.jpg');
    await request(app).patch(`/api/photos/${photo.id}`).send({ camera: 'OnlyOnTrashed', location: 'Nowhereville' });
    await request(app).delete(`/api/photos/${photo.id}`);

    const res = await request(app).get('/api/combo-suggestions');
    const found = res.body.combos.find((c: { main: string }) => c.main === 'OnlyOnTrashed');
    expect(found).toBeUndefined();
  });
});
