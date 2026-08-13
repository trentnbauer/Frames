import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createTestApp } from '../test/helpers.js';

describe('seedProvidersFromEnv', () => {
  let app: Express;
  let cleanup: () => void;

  beforeAll(async () => {
    process.env.OPENAI_API_KEY = 'sk-from-env';
    process.env.OPENAI_MODEL = 'gpt-4o-mini-env';
    process.env.SELF_HOSTED_BASE_URL = 'http://localhost:11434/v1';
    ({ app, cleanup } = await createTestApp());
  });

  afterAll(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    delete process.env.SELF_HOSTED_BASE_URL;
    cleanup();
  });

  it('creates an enabled provider for each env var set, none for unset ones', async () => {
    const res = await request(app).get('/api/vision-providers');
    const names = res.body.providers.map((p: { name: string }) => p.name);

    expect(names).toContain('OpenAI (env)');
    expect(names).toContain('Self-hosted (env)');
    expect(names).not.toContain('Anthropic (env)'); // ANTHROPIC_API_KEY was never set

    const openai = res.body.providers.find((p: { name: string }) => p.name === 'OpenAI (env)');
    expect(openai).toMatchObject({ type: 'openai', model: 'gpt-4o-mini-env', enabled: true, hasApiKey: true });
  });

  it('never exposes the raw env-sourced api_key over the API', async () => {
    const res = await request(app).get('/api/vision-providers');
    expect(JSON.stringify(res.body)).not.toContain('sk-from-env');
  });
});
