import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from '../test/helpers.js';

describe('config route', () => {
  it('returns null for all when no env vars are set', async () => {
    const { app, cleanup } = await createTestApp();
    const res = await request(app).get('/api/config');
    expect(res.body).toEqual({ googleDrive: null, dropbox: null, socialHandles: null });
    cleanup();
  });

  describe('with env vars set', () => {
    let app: Express;
    let cleanup: () => void;

    beforeAll(async () => {
      process.env.FRAMES_GOOGLE_API_KEY = 'AIza-env';
      process.env.FRAMES_GOOGLE_CLIENT_ID = 'client.apps.googleusercontent.com';
      process.env.FRAMES_DROPBOX_APP_KEY = 'dbx-env';
      process.env.FRAMES_SOCIAL_HANDLES = '@yourhandle, yoursite.com ,,@another';
      ({ app, cleanup } = await createTestApp());
    });

    afterAll(() => {
      delete process.env.FRAMES_GOOGLE_API_KEY;
      delete process.env.FRAMES_GOOGLE_CLIENT_ID;
      delete process.env.FRAMES_DROPBOX_APP_KEY;
      delete process.env.FRAMES_SOCIAL_HANDLES;
      cleanup();
    });

    it('exposes the env-sourced defaults', async () => {
      const res = await request(app).get('/api/config');
      expect(res.body).toEqual({
        googleDrive: { apiKey: 'AIza-env', clientId: 'client.apps.googleusercontent.com' },
        dropbox: { appKey: 'dbx-env' },
        socialHandles: ['@yourhandle', 'yoursite.com', '@another'],
      });
    });
  });
});
