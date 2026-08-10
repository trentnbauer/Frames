import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from '../test/helpers.js';

describe('vision-providers routes', () => {
  let app: Express;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp());
  });

  afterAll(() => cleanup());

  it('creates a provider and never returns the raw api_key', async () => {
    const res = await request(app)
      .post('/api/vision-providers')
      .send({ name: 'OpenAI GPT-4o', type: 'openai', api_key: 'sk-secret', enabled: true });
    expect(res.status).toBe(201);
    expect(res.body.provider.hasApiKey).toBe(true);
    expect(res.body.provider.api_key).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('sk-secret');
  });

  it('requires base_url for self-hosted providers', async () => {
    const res = await request(app).post('/api/vision-providers').send({ name: 'Local Ollama', type: 'self_hosted' });
    expect(res.status).toBe(400);
  });

  it('rejects an invalid type', async () => {
    const res = await request(app).post('/api/vision-providers').send({ name: 'Bogus', type: 'not-a-real-type' });
    expect(res.status).toBe(400);
  });

  it('toggles enabled independently per provider', async () => {
    const a = await request(app).post('/api/vision-providers').send({ name: 'Provider A', type: 'anthropic', api_key: 'x', enabled: true });
    const b = await request(app).post('/api/vision-providers').send({ name: 'Provider B', type: 'anthropic', api_key: 'y', enabled: true });

    const toggled = await request(app).patch(`/api/vision-providers/${a.body.provider.id}`).send({ enabled: false });
    expect(toggled.body.provider.enabled).toBe(false);

    const list = await request(app).get('/api/vision-providers');
    const stillOn = list.body.providers.find((p: { id: number }) => p.id === b.body.provider.id);
    expect(stillOn.enabled).toBe(true);
  });

  it('keeps the stored api_key when PATCH sends a blank one', async () => {
    const created = await request(app).post('/api/vision-providers').send({ name: 'Keep My Key', type: 'openai', api_key: 'sk-keepme' });
    const patched = await request(app).patch(`/api/vision-providers/${created.body.provider.id}`).send({ api_key: '', name: 'Renamed' });
    expect(patched.body.provider.name).toBe('Renamed');
    expect(patched.body.provider.hasApiKey).toBe(true);
  });

  it('deletes a provider', async () => {
    const created = await request(app).post('/api/vision-providers').send({ name: 'Throwaway', type: 'openai', api_key: 'x' });
    const del = await request(app).delete(`/api/vision-providers/${created.body.provider.id}`);
    expect(del.status).toBe(204);
    const list = await request(app).get('/api/vision-providers');
    expect(list.body.providers.find((p: { id: number }) => p.id === created.body.provider.id)).toBeUndefined();
  });

  it('404s deleting an unknown provider', async () => {
    const res = await request(app).delete('/api/vision-providers/999999');
    expect(res.status).toBe(404);
  });
});
