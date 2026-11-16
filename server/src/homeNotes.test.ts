import { afterEach, beforeEach, expect, it } from 'vitest';
import { api, cleanup, makeEnv, type Env } from './testutil.js';
let env: Env, a: ReturnType<typeof api>;
beforeEach(() => { env = makeEnv(); a = api(env); });
afterEach(async () => { await env.app.close(); cleanup(env); });

it('keeps the Home notes, and refuses anything that is not text or is too long', async () => {
  expect((await a.get('/api/home/notes')).body).toEqual({ text: '' });
  expect((await a.put('/api/home/notes', { text: 'Print the harbour set' })).status).toBe(200);
  expect((await a.get('/api/home/notes')).body).toEqual({ text: 'Print the harbour set' });
  expect((await a.put('/api/home/notes', { text: 5 })).status).toBe(400);
  expect((await a.put('/api/home/notes', { text: 'x'.repeat(5001) })).status).toBe(400);
  expect((await a.get('/api/home/notes')).body).toEqual({ text: 'Print the harbour set' });
});
