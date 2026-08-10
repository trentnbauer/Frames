import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp, tinyJpeg } from '../test/helpers.js';

async function uploadPhoto(app: Express, seed: number, filename: string) {
  const jpeg = await tinyJpeg(seed);
  const res = await request(app).post('/api/photos/upload').attach('photos', jpeg, filename);
  return res.body.results[0].photo;
}

describe('ideas routes', () => {
  let app: Express;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp());
  });

  afterAll(() => cleanup());

  it('creates an idea with defaults', async () => {
    const res = await request(app).post('/api/ideas').send({ title: 'Pigeons of Melbourne' });
    expect(res.status).toBe(201);
    expect(res.body.idea).toMatchObject({ title: 'Pigeons of Melbourne', light_pref: 'any', status: 'active' });
  });

  it('rejects an idea with no title', async () => {
    const res = await request(app).post('/api/ideas').send({});
    expect(res.status).toBe(400);
  });

  it('lists ideas with a photo_count', async () => {
    const res = await request(app).get('/api/ideas');
    expect(res.status).toBe(200);
    expect(res.body.ideas).toHaveLength(1);
    expect(res.body.ideas[0].photo_count).toBe(0);
  });

  it('drops photos into an idea with a why note, and removes them', async () => {
    const ideaRes = await request(app).post('/api/ideas').send({ title: 'Waterline' });
    const ideaId = ideaRes.body.idea.id;
    const photo = await uploadPhoto(app, 10, 'boat.jpg');

    const add = await request(app)
      .post(`/api/ideas/${ideaId}/photos`)
      .send({ photoId: photo.id, why: 'the wide half of the diptych' });
    expect(add.status).toBe(201);

    const detail = await request(app).get(`/api/ideas/${ideaId}`);
    expect(detail.body.photos).toHaveLength(1);
    expect(detail.body.photos[0].why).toBe('the wide half of the diptych');

    const remove = await request(app).delete(`/api/ideas/${ideaId}/photos/${photo.id}`);
    expect(remove.status).toBe(204);

    const afterRemove = await request(app).get(`/api/ideas/${ideaId}`);
    expect(afterRemove.body.photos).toHaveLength(0);
  });

  it('updates title, notes, light_pref, and status', async () => {
    const ideaRes = await request(app).post('/api/ideas').send({ title: 'Signage Study' });
    const ideaId = ideaRes.body.idea.id;

    const patched = await request(app)
      .patch(`/api/ideas/${ideaId}`)
      .send({ notes: 'type found walking the CBD', light_pref: 'golden_hour', status: 'done' });
    expect(patched.status).toBe(200);
    expect(patched.body.idea).toMatchObject({
      title: 'Signage Study',
      notes: 'type found walking the CBD',
      light_pref: 'golden_hour',
      status: 'done',
    });
  });

  it('suggests photos sharing tags with existing members, excluding members', async () => {
    const ideaRes = await request(app).post('/api/ideas').send({ title: 'Neon nights' });
    const ideaId = ideaRes.body.idea.id;

    const member = await uploadPhoto(app, 20, 'member.jpg');
    const candidate = await uploadPhoto(app, 21, 'candidate.jpg');
    const unrelated = await uploadPhoto(app, 22, 'unrelated.jpg');

    await request(app).post(`/api/photos/${member.id}/tags`).send({ name: 'neon', source: 'user_added' });
    await request(app).post(`/api/photos/${candidate.id}/tags`).send({ name: 'neon', source: 'user_added' });
    await request(app).post(`/api/photos/${unrelated.id}/tags`).send({ name: 'daylight', source: 'user_added' });
    await request(app).post(`/api/ideas/${ideaId}/photos`).send({ photoId: member.id });

    const suggested = await request(app).get(`/api/ideas/${ideaId}/suggested-photos`);
    expect(suggested.status).toBe(200);
    const ids = suggested.body.photos.map((p: { id: number }) => p.id);
    expect(ids).toContain(candidate.id);
    expect(ids).not.toContain(member.id);
    expect(ids).not.toContain(unrelated.id);
  });

  it('returns no suggestions for an idea with no members', async () => {
    const ideaRes = await request(app).post('/api/ideas').send({ title: 'Empty project' });
    const suggested = await request(app).get(`/api/ideas/${ideaRes.body.idea.id}/suggested-photos`);
    expect(suggested.body.photos).toEqual([]);
  });

  it('exports an idea as a zip of its full-res photos', async () => {
    const ideaRes = await request(app).post('/api/ideas').send({ title: 'Export test' });
    const ideaId = ideaRes.body.idea.id;
    const photo = await uploadPhoto(app, 30, 'export-me.jpg');
    await request(app).post(`/api/ideas/${ideaId}/photos`).send({ photoId: photo.id });

    const zip = await request(app).get(`/api/ideas/${ideaId}/export`);
    expect(zip.status).toBe(200);
    expect(zip.headers['content-type']).toBe('application/zip');
    expect(zip.body.length ?? Buffer.byteLength(zip.text)).toBeGreaterThan(0);
  });

  it('400s exporting an idea with no photos', async () => {
    const ideaRes = await request(app).post('/api/ideas').send({ title: 'Empty export' });
    const zip = await request(app).get(`/api/ideas/${ideaRes.body.idea.id}/export`);
    expect(zip.status).toBe(400);
  });

  it('deletes an idea without deleting its photos', async () => {
    const ideaRes = await request(app).post('/api/ideas').send({ title: 'Throwaway' });
    const ideaId = ideaRes.body.idea.id;
    const photo = await uploadPhoto(app, 40, 'survives.jpg');
    await request(app).post(`/api/ideas/${ideaId}/photos`).send({ photoId: photo.id });

    const del = await request(app).delete(`/api/ideas/${ideaId}`);
    expect(del.status).toBe(204);

    const photoStillThere = await request(app).get(`/api/photos/${photo.id}`);
    expect(photoStillThere.status).toBe(200);
  });
});
