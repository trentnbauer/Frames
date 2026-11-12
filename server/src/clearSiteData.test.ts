import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession } from './auth.js';
import { api, cleanup, makeEnv, type Env } from './testutil.js';

let env: Env;
beforeEach(() => { env = makeEnv(); });
afterEach(async () => { await env.app.close(); cleanup(env); });

describe('clearing this browser’s site data', () => {
  it('requests a browser reset and ends only the current session without deleting the library', async () => {
    const A = api(env), sys = (env.app as any).frames.sys;
    const current = createSession(sys, 1);
    createSession(sys, 1);
    const collection = (await A.post('/api/collections', { name: 'Keep my library' })).body;
    const r = await A.raw('POST', '/auth/logout?clearSiteData=1', {}, { cookie: `frames_session=${current}` });
    expect(r.status).toBe(200);
    expect(r.headers['clear-site-data']).toBe('"cache", "cookies", "storage"');
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['set-cookie']).toContain('Max-Age=0');
    expect(sys.prepare('SELECT COUNT(*) n FROM sessions').get()).toEqual({ n: 1 });
    expect((await A.get(`/api/collections/${collection.id}`)).body.name).toBe('Keep my library');
  });

  it('keeps ordinary sign out separate from a site-data reset', async () => {
    const r = await api(env).raw('POST', '/auth/logout', {});
    expect(r.status).toBe(200);
    expect(r.headers['clear-site-data']).toBeUndefined();
  });

  it('rejects cross-site reset requests', async () => {
    const r = await api(env).raw('POST', '/auth/logout?clearSiteData=1', {}, { origin: 'https://other.example' });
    expect(r.status).toBe(403);
    expect(r.headers['clear-site-data']).toBeUndefined();
  });
});
