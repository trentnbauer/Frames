import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from '../test/helpers.js';

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe('weather routes', () => {
  let app: Express;
  let cleanup: () => void;

  beforeAll(async () => {
    ({ app, cleanup } = await createTestApp());
  });

  afterAll(() => cleanup());
  afterEach(() => vi.unstubAllGlobals());

  it('requires a location', async () => {
    const res = await request(app).get('/api/weather/today');
    expect(res.status).toBe(400);
  });

  it('404s when geocoding finds nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [] })));
    const res = await request(app).get('/api/weather/today').query({ location: 'Nowhereville' });
    expect(res.status).toBe(404);
  });

  it('derives light conditions from live weather and returns matching active ideas', async () => {
    await request(app).post('/api/ideas').send({ title: 'Night market stalls', light_pref: 'night' });
    await request(app).post('/api/ideas').send({ title: 'Overcast portraits', light_pref: 'overcast' });
    const doneRes = await request(app).post('/api/ideas').send({ title: 'Finished night idea', light_pref: 'night' });
    await request(app).patch(`/api/ideas/${doneRes.body.idea.id}`).send({ status: 'done' });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('geocoding-api')) {
        return Promise.resolve(
          jsonResponse({ results: [{ name: 'Melbourne', country: 'Australia', latitude: -37.8, longitude: 144.9 }] })
        );
      }
      return Promise.resolve(
        jsonResponse({
          current: { temperature_2m: 12, cloud_cover: 30, precipitation: 0, is_day: 0, time: '2026-08-10T22:00' },
          daily: { sunrise: ['2026-08-10T07:00'], sunset: ['2026-08-10T18:00'] },
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app).get('/api/weather/today').query({ location: 'Melbourne' });
    expect(res.status).toBe(200);
    expect(res.body.place).toEqual({ name: 'Melbourne', country: 'Australia' });
    expect(res.body.lightConditions).toBe('night');

    const titles = res.body.ideas.map((i: { title: string }) => i.title);
    expect(titles).toContain('Night market stalls');
    expect(titles).not.toContain('Finished night idea'); // not active
  });

  it('502s when the upstream weather API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, false)));
    const res = await request(app).get('/api/weather/today').query({ location: 'Melbourne' });
    expect(res.status).toBe(502);
  });
});
